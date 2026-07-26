#!/usr/bin/env python3
"""Extract text from Bulgarian Parliament bill files (PDF or RTF).

Usage: python3 extract-text.py <file_path>

Outputs JSON to stdout:
  { "success": true, "text": "...", "pages": N, "format": "pdf"|"rtf" }
  { "success": false, "error": "..." }
"""

import json
import re
import sys
import os


def extract_rtf(filepath):
    """Extract text from RTF files with cp1251 Bulgarian Cyrillic encoding."""
    with open(filepath, 'rb') as f:
        data = f.read()

    # Decode with cp1251 (Windows Cyrillic)
    text = data.decode('cp1251', errors='replace')

    # Step 1: Strip the RTF header (font table, color table, stylesheet)
    # These are enclosed in {\fonttbl ...}, {\colortbl ...}, {\stylesheet ...}
    text = re.sub(r'\{\\fonttbl[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\colortbl[^}]*\}', ' ', text)
    text = re.sub(r'\{\\\*\\generator[^}]*\}', ' ', text)
    text = re.sub(r'\{\\stylesheet[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\listtable[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\listoverridetable[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\revtbl[^}]*\}', ' ', text)
    text = re.sub(r'\{\\\*\\rsidtbl[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\info[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)

    # Remove RTF groups with binary/object data
    text = re.sub(r'\{\\\*\\shppict[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\pict[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\xmlnstbl[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\datastore[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)
    text = re.sub(r'\{\\\*\\themedata[^}]*(\{[^}]*\})*[^}]*\}', ' ', text, flags=re.DOTALL)

    # Step 2: Handle RTF escaped hex characters (\'xx) - cp1251 bytes
    def hex_replace(m):
        try:
            return bytes([int(m.group(1), 16)]).decode('cp1251')
        except (ValueError, UnicodeDecodeError):
            return ' '
    text = re.sub(r"\\'([0-9a-fA-F]{2})", hex_replace, text)

    # Step 3: Handle RTF Unicode escapes (\uNNNN)
    def unicode_replace(m):
        try:
            cp = int(m.group(1))
            if cp >= 0:
                # Remove the trailing '?' that RTF uses as fallback
                return chr(cp)
            return ' '
        except (ValueError, OverflowError):
            return ' '
    text = re.sub(r'\\u(-?\d{1,6})\s*\?', unicode_replace, text)
    text = re.sub(r'\\u(-?\d{1,6})', unicode_replace, text)

    # Step 4: Remove remaining RTF control words
    text = re.sub(r'\\[a-zA-Z]+\d*', ' ', text)

    # Step 5: Remove group braces
    text = re.sub(r'[{}]', ' ', text)

    # Step 6: Clean up escape sequences
    text = re.sub(r'\\.', ' ', text)

    # Step 7: Remove leading font/stylename noise (words before actual content)
    # Find where actual Bulgarian content starts
    patterns = [
        r'(?:ЗАКОН|ПРОЕКТ)\s*(?:за|на)\s', r'МОТИВИ\s*(?:към|КЪМ)\s',
        r'ДО\s+(?:Г-Н|Г-ЖА|ПРЕДСЕДАТЕЛЯ)\s', r'§\s*\d+[\.\s]',
        r'НАРОДНО\s+СЪБРАНИЕ', r'РЕПУБЛИКА\s+БЪЛГАРИЯ',
        r'РЕШЕНИЕ\s*(?:№|N)\s*\d+',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m and m.start() > 100:
            start = max(0, m.start() - 100)
            text = text[start:]
            break

    # Step 8: Clean up whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r';\s*;', '', text)
    text = text.strip()

    # Step 9: Remove large binary blobs between the cover letter and legal text.
    # Find the last good content marker (end of motives/cover letter) and
    # the first legal paragraph marker (§), then keep only a small gap.
    para_match = re.search(r'(?:§\s*1[\.\s])', text)
    if para_match and para_match.start() > 5000:
        # There's a large gap - find where cover letter ends
        # Look for attachment list / signature line patterns
        cover_end = 0
        cover_patterns = [
            r'Приложения\s*:', r'МИНИСТЪР-ПРЕДСЕДАТЕЛ', r'ПРЕДСЕДАТЕЛ\s*:',
            r'С\s*УВАЖЕНИЕ', r'С\s*уважение',
        ]
        for pat in cover_patterns:
            m = re.search(pat, text[:para_match.start()])
            if m:
                cover_end = max(cover_end, m.end())

        if cover_end > 200:
            # Keep cover letter and add a separator before legal text
            cover = text[:cover_end].strip()
            legal = text[para_match.start():].strip()
            # Clean up legal text: remove lingering binary fragments
            legal = re.sub(r'[0-9a-fA-F]{8,}(?:\s+[0-9a-fA-F]{8,})*', ' ', legal)
            legal = re.sub(r'fFlipH.*?(?=\n\n|§|\Z)', ' ', legal, flags=re.DOTALL)
            text = cover + "\n\n" + "=" * 60 + "\n\n" + legal

    return text


def extract_pdf(filepath):
    """Extract text from PDF files using PyPDF2."""
    try:
        import PyPDF2
    except ImportError:
        return {"error": "PyPDF2 not installed", "scanned": False}

    reader = PyPDF2.PdfReader(filepath)
    pages = len(reader.pages)

    all_text = []
    has_text = False

    for i, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text and page_text.strip():
            has_text = True
            all_text.append(f"\n--- Страница {i+1} ---\n")
            all_text.append(page_text.strip())

    if not has_text:
        return {"error": "PDF appears to be scanned (no text layer). OCR required.", "scanned": True, "pages": pages}

    return "\n".join(all_text).strip()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: extract-text.py <file_path>"}, ensure_ascii=False))
        sys.exit(1)

    filepath = sys.argv[1]
    if not os.path.exists(filepath):
        print(json.dumps({"success": False, "error": f"File not found: {filepath}"}, ensure_ascii=False))
        sys.exit(1)

    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext == '.rtf':
            text = extract_rtf(filepath)
            result = {"success": True, "text": text, "pages": 1, "format": "rtf"}
        elif ext == '.pdf':
            extracted = extract_pdf(filepath)
            if isinstance(extracted, dict):
                result = {"success": False, **extracted}
            else:
                result = {"success": True, "text": extracted, "pages": "n/a", "format": "pdf"}
        else:
            result = {"success": False, "error": f"Unsupported format: {ext}"}

    except Exception as e:
        result = {"success": False, "error": str(e)}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
