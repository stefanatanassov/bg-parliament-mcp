# 🇧🇬 Bulgarian Parliament MCP Server · MCP сървър за Народно събрание

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)
[![MCP](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)

---

## 🇧🇬 Български

**MCP сървър с 55 инструмента за достъп до публичните данни на Народното събрание** — законодателство, народни представители, парламентарен контрол, комисии, пленарни заседания, обществени поръчки и новини. Проектиран за AI агенти (OpenCode, Claude, Cursor, Codex), които искат да работят с официални парламентарни данни.

### Какво прави този сървър уникален

REST API-то на parliament.bg връща **само метаданни** (заглавия, дати, сигнатури). Този MCP сървър може да **изтегли и извлече пълния текст на законопроектите** от PDF и RTF файловете — включително мотиви, оценка на въздействието и всеки отделен параграф. Това става чрез headless браузър (Playwright), който взима сесийни cookie-та от parliament.bg, изтегля файла и извлича текста с Python/PyPDF2.

### Бърз старт (30 секунди)

```bash
git clone https://github.com/stefanatanassov/bg-parliament-mcp.git
cd bg-parliament-mcp
npm install
npx playwright install chromium   # еднократно за извличане на текстове
```

### 🤖 Инсталационен prompt — дай на AI-то да го направи

**Копирай този текст и го пейстни директно в твоя AI harness (OpenCode, Claude, Cursor, Codex).** AI-то ще изпълни всички стъпки вместо теб.

```
Clone and install the Bulgarian Parliament MCP server:

1. Run:
   git clone https://github.com/stefanatanassov/bg-parliament-mcp.git /tmp/bg-parliament-mcp
   cd /tmp/bg-parliament-mcp && npm install
   npx playwright install chromium

2. Read /tmp/bg-parliament-mcp/AGENT.md to understand the agent configuration.

3. Detect which MCP harness I am running in (OpenCode, Claude Desktop, Cursor, Windsurf, or Codex).

4. Configure this MCP server in the correct config file for my harness:
   - OpenCode / Codex: add "bg-parliament" to the "mcp" section in ~/.config/opencode/opencode.json
   - Claude Desktop: add "bg-parliament" to "mcpServers" in the claude_desktop_config.json
   - Cursor / Windsurf: add "bg-parliament" to "mcpServers" in the project's .cursor/mcp.json

5. Also create the civic-parliament agent from AGENT.md so I can invoke it.

6. After configuration, restart the harness and verify by asking me to list available parliament tools.

7. When done, tell me "Готово — парламентът е свързан. Попитай ме нещо за законите."
```

След като AI-то приключи, попитай нещо от рода на:

> *"Колко народни представители има в 52-рото Народно събрание и кои са парламентарните групи?"*

Ако видиш отговор с реални данни (240 депутати, 6 групи), значи всичко работи.

---

### Инсталация с една команда (копирай → пейстни → готово)

След като си клонирал repo-то и си пуснал `npm install`, остава само да кажеш на твоя MCP harness къде се намира сървърът. **Това става с един JSON блок**, който добавяш в конфигурационния файл на съответния инструмент.

#### Къде да сложа конфигурацията?

| Harness | Файл за редакция | Къде се намира |
|---|---|---|
| **OpenCode** | `opencode.json` | `~/.config/opencode/opencode.json` |
| **Claude Desktop** | `claude_desktop_config.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Cursor** | `mcp.json` | `.cursor/mcp.json` в корена на проекта |
| **Windsurf** | `mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |
| **Codex** | `opencode.json` | `~/.config/opencode/opencode.json` (същият като OpenCode) |

#### ⚠️ Важно: замени пътя

Във всеки пример по-долу **трябва да замениш** `/absolute/path/to/bg-parliament-mcp` с реалния път до директорията на твоята машина. За да намериш пътя:

```bash
cd bg-parliament-mcp && pwd
# Примерен изход: /Users/ivan/Code/bg-parliament-mcp
```

#### OpenCode / Codex — добави в `opencode.json`

Влез в секцията `"mcp"` и добави нов запис:

```json
{
  "mcp": {
    "bg-parliament": {
      "type": "local",
      "command": ["node", "/absolute/path/to/bg-parliament-mcp/index.js"],
      "enabled": true,
      "timeout": 45000
    }
  }
}
```

Ако файлът вече има други MCP сървъри (като `"github"`, `"playwright"` и т.н.), просто добави `"bg-parliament"` като нов ключ в същия `"mcp"` обект — **не** създавай нов `"mcp"` блок.

#### Claude Desktop — добави в `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bg-parliament": {
      "command": "node",
      "args": ["/absolute/path/to/bg-parliament-mcp/index.js"],
      "env": {
        "PARLIAMENT_TIMEOUT_MS": "30000",
        "PARLIAMENT_RETRIES": "2"
      }
    }
  }
}
```

#### Cursor / Windsurf — добави в `mcp.json`

```json
{
  "mcpServers": {
    "bg-parliament": {
      "command": "node",
      "args": ["/absolute/path/to/bg-parliament-mcp/index.js"]
    }
  }
}
```

#### Проверка, че работи

След като си добавил конфигурацията, рестартирай harness-а и попитай:

> *"Какви инструменти са достъпни от parliament MCP сървъра?"*

Ако видиш списък с 55 инструмента (започващи с `parliament_`), значи всичко е наред.

#### 🧠 Бонус: добави и agent дефиницията (flying start)

За да получиш максимална стойност веднага, **копирай съдържанието на [`AGENT.md`](AGENT.md)** като нов агент в твоя harness. Това дава на AI-то контекст как да използва правилно инструментите — да проверява факти, да кръстосва данни, да не превежда имена, да цитира източници.

- **OpenCode:** създай файл `~/.config/opencode/agents/civic-parliament.md` със съдържанието на `AGENT.md`
- **Claude Desktop:** добави съдържанието като custom system prompt
- **Cursor:** добави като `.cursorrules` или project rule

---

### Какво можеш да питаш (примери)

След като MCP сървърът е свързан, можеш да задаваш въпроси като:

- *"Анализирай законопроект 167155 — бюджетът на НЗОК за 2026. Извлечи пълния текст, обясни всеки параграф и маркирай проблемните неща за обикновените хора."*
- *"Покажи ми пълния профил на народния представител Михаела Доцова — какви закони е внасяла, в кои комисии участва, какви въпроси е задавала."*
- *"Проследи всичко, което се случва в парламента по темата 'горива' — законопроекти, въпроси, обществени поръчки."*
- *"Направи одит на обществените поръчки на парламента за последните 6 месеца — маркирай директните възлагания без конкурс."*
- *"Сравни двата законопроекта за училищно образование (167433 и 167218) — какви са разликите и какво означават за родителите."*

### Инструменти по категории

| Категория | Брой | Какво включва |
|---|---|---|
| **Законодателство** | 10 | Търсене и профили на закони, законопроекти, проекто-актове, обществени консултации |
| **Народно събрание и депутати** | 10 | Състави, сесии, структури, 240 депутата, профили, отсъствия, наказания |
| **Парламентарен контрол** | 14 | Въпроси, питания, изслушвания, блиц-контрол, разисквания, вотове на доверие/недоверие |
| **Комисии и пленарни заседания** | 13 | Информация, документи, заседания, становища, стенограми, програми |
| **Обществени поръчки** | 4 | Типове, статуси, търсене, профили |
| **Новини и пресцентър** | 4 | Заглавна страница, търсене, профили на новини, календар на живо |

### Ключови файлове в repository-то

| Файл | Описание |
|---|---|
| `README.md` | Този файл — пълна документация (BG + EN) |
| `AGENT.md` | Дефиниция на AI агент — сложи го в OpenCode/Claude/Cursor за flying start |
| `PROMPTS.md` | 20+ готови prompt-а за анализ на закони, депутати, поръчки, кръстосани разследвания |
| `index.js` | Самият MCP сървър (55 инструмента, stdio транспорт) |
| `lib/client.js` | HTTP клиент с retry логика и error handling |
| `lib/download-bill.js` | Изтегляне на PDF/RTF файлове през Playwright |
| `lib/extract-text.py` | Python скрипт за извличане на текст от PDF и RTF |

### Изисквания

- **Node.js** >= 18
- **Python 3** (само за `parliament_get_bill_text`)
- **PyPDF2** (`pip3 install PyPDF2`)
- **Playwright** (`npx playwright install chromium`)
- **Без API ключове** — API-то на parliament.bg е напълно публично

### Лиценз

MIT — свободно ползване, модифициране и разпространение. Данните са от публичното API на Народното събрание.

### 🌐 Remote сървър (за ChatGPT, Claude mobile, телефон)

Сървърът поддържа и HTTP транспорт — качи го веднъж на хостинг и го ползвай от **всяко устройство**, включително телефон.

```bash
npm run remote
# → http://localhost:3000/mcp
```

**Deploy:** Railway, Render, Hostinger, VPS — стандартно Express.js приложение. Подробни инструкции в [английската секция](#-remote-deployment-use-from-chatgpt-claude-mobile-phone) по-долу.

**Свързване от ChatGPT/Claude mobile:**

```json
{
  "mcpServers": {
    "bg-parliament": {
      "type": "url",
      "url": "https://your-host.com/mcp"
    }
  }
}
```

---

## 🇬🇧 English

Read-only MCP server wrapping the [Bulgarian Parliament public REST API](https://www.parliament.bg/pub/api.html). Provides **55 structured tools** for AI agents to query official parliamentary data — legislation, MPs, parliamentary control, committees, plenary sessions, public procurement, and news.

> **What's unique:** Unlike the upstream REST API (which only returns metadata), this server can **extract full bill text** from PDF/RTF files using browser automation + Python, giving you the actual legal paragraphs, motives, and impact assessments.

---

## Quick Start (30 seconds)

```bash
git clone https://github.com/stefanatanassov/bg-parliament-mcp.git
cd bg-parliament-mcp
npm install
npx playwright install chromium   # one-time setup for bill text extraction
```

### 🤖 Installation Prompt — Let Your AI Do It

**Copy this text and paste it directly into your AI harness (OpenCode, Claude, Cursor, Codex).** The AI will run all installation steps for you.

```
Clone and install the Bulgarian Parliament MCP server:

1. Run:
   git clone https://github.com/stefanatanassov/bg-parliament-mcp.git /tmp/bg-parliament-mcp
   cd /tmp/bg-parliament-mcp && npm install
   npx playwright install chromium

2. Read /tmp/bg-parliament-mcp/AGENT.md to understand the agent configuration.

3. Detect which MCP harness I am running in: OpenCode, Claude Desktop, Cursor, Windsurf, or Codex.

4. Configure this MCP server in the correct config file:
   - OpenCode / Codex: add "bg-parliament" to the "mcp" section in ~/.config/opencode/opencode.json
   - Claude Desktop: add "bg-parliament" to "mcpServers" in claude_desktop_config.json
   - Cursor / Windsurf: add "bg-parliament" to "mcpServers" in .cursor/mcp.json

5. Also create the civic-parliament agent from AGENT.md so I can invoke it directly.

6. Restart and verify: ask me to list the available parliament tools.

7. Confirm: "Ready — parliament is connected. Try asking me about Bulgarian laws."
```

After the AI finishes, test it:

> *"How many MPs are in the 52nd National Assembly and what are the parliamentary groups?"*

If you get real data back (240 MPs, 6 groups), everything works.

Now pick your harness below, copy the JSON block, replace the path, and you're done.

## Installation: One JSON Block, Drop It In

After cloning and `npm install`, all you need is **one JSON block** added to your MCP harness config file. No API keys. No environment setup. No accounts.

### Where to put the config

| Harness | Config File | Location |
|---|---|---|
| **OpenCode** | `opencode.json` | `~/.config/opencode/opencode.json` |
| **Claude Desktop** | `claude_desktop_config.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) |
| **Cursor** | `mcp.json` | `.cursor/mcp.json` in your project root |
| **Windsurf** | `mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |
| **Codex** | `opencode.json` | `~/.config/opencode/opencode.json` (same as OpenCode) |

### ⚠️ Replace the path

Every example below uses `/absolute/path/to/bg-parliament-mcp`. **Replace this** with the actual path to your cloned repository. Find it with:

```bash
cd bg-parliament-mcp && pwd
# Example output: /Users/ivan/Code/bg-parliament-mcp
```

### OpenCode / Codex — add to `opencode.json`

Find the `"mcp"` section in your config and add a new entry. If you already have other MCP servers, add `"bg-parliament"` as a new key inside the existing `"mcp"` object — do **not** create a second `"mcp"` block.

```json
{
  "mcp": {
    "bg-parliament": {
      "type": "local",
      "command": ["node", "/absolute/path/to/bg-parliament-mcp/index.js"],
      "enabled": true,
      "timeout": 45000
    }
  }
}
```

### Claude Desktop — add to `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bg-parliament": {
      "command": "node",
      "args": ["/absolute/path/to/bg-parliament-mcp/index.js"],
      "env": {
        "PARLIAMENT_TIMEOUT_MS": "30000",
        "PARLIAMENT_RETRIES": "2"
      }
    }
  }
}
```

### Cursor / Windsurf — add to `mcp.json`

```json
{
  "mcpServers": {
    "bg-parliament": {
      "command": "node",
      "args": ["/absolute/path/to/bg-parliament-mcp/index.js"]
    }
  }
}
```

### Verify it worked

Restart your harness and ask:

> *"What tools are available from the parliament MCP server?"*

You should see a list of 55 tools, all prefixed with `parliament_`.

### 🧠 Bonus: Agent definition (flying start)

For maximum value immediately, **copy the contents of [`AGENT.md`](AGENT.md)** as a custom agent in your harness. This teaches the AI how to use the tools correctly — cross-reference data, verify facts, preserve Bulgarian names, and cite sources.

- **OpenCode:** create `~/.config/opencode/agents/civic-parliament.md` with the contents of `AGENT.md`
- **Claude Desktop:** add as a custom system prompt
- **Cursor:** add as a `.cursorrules` or project rule

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PARLIAMENT_BASE_URL` | `https://www.parliament.bg` | API base URL |
| `PARLIAMENT_TIMEOUT_MS` | `30000` | HTTP timeout per request |
| `PARLIAMENT_RETRIES` | `2` | Retries on transient failures |

---

## Tool Catalogue

### 1. Legislation (Законотворчество) — 10 tools

| Tool | Description |
|---|---|
| `parliament_search_legislative_acts` | Search acts by keyword, assembly, session, commission, date range |
| `parliament_get_legislative_act` | Full profile of an act by ID |
| `parliament_search_bills` | Search bills (законопроекти) |
| `parliament_get_bill` | Full profile + metadata of a bill |
| `parliament_search_draft_acts` | Search draft acts |
| `parliament_get_draft_act` | Full profile of a draft act |
| `parliament_search_public_consultations` | Search public consultations |
| `parliament_get_public_consultation` | Full profile of a consultation |
| `parliament_list_legislation_front` | Front-page featured legislation |
| **`parliament_get_bill_text`** | **Download & extract full bill text (motives + paragraphs) from PDF/RTF** |

### 2. Parliament, MPs & Structures — 10 tools

| Tool | Description |
|---|---|
| `parliament_list_assemblies` | All National Assemblies with IDs |
| `parliament_list_sessions` | Sessions for an assembly |
| `parliament_list_structures` | Structures by type (groups, committees, delegations) |
| `parliament_list_mps` | All 240 MPs with normalized fields |
| `parliament_get_mp_profile` | Full MP profile: bio, committees, legislative activity |
| `parliament_list_mp_absences` | MP absences by date range |
| `parliament_list_mp_penalties` | MP penalties by assembly |
| `parliament_list_archive` | Parliament archives |
| `parliament_get_archive_assembly` | Archive details |
| `parliament_list_leadership` | Current leadership |

### 3. Parliamentary Control — 14 tools

Questions, enquiries, hearings, blitz control, debates, confidence/no-confidence votes, control programs.

### 4. Committees & Plenary — 13 tools

Committee info, documents, acts, meetings, opinions, stenograms. Plenary documents, programs, stenograms.

### 5. Public Procurement — 4 tools

Types, statuses, search, profiles.

### 6. News & Press Centre — 4 tools

Front-page news, search, article profiles, live broadcast calendar.

> Full tool list with input/output schemas is auto-discoverable via `tools/list`.

---

## Bill Text Extraction

The `parliament_get_bill_text` tool is the key differentiator. The upstream API only returns metadata (titles, dates, signatures). This tool:

1. Launches a headless Chromium browser via Playwright
2. Obtains session cookies from `parliament.bg`
3. Downloads the attached PDF or RTF file
4. Extracts text via Python/PyPDF2 (for PDFs) or custom cp1251 RTF parser
5. Returns the complete bill text — cover letters, motives, impact assessments, and every § paragraph

| Format | Status | Example |
|---|---|---|
| RTF (govt bills) | ✅ Full text | Health budget: 101K chars |
| PDF with text layer | ✅ PyPDF2 extraction | Various |
| PDF scanned | ❌ Returns clear error | MP-submitted bills |
| DOCX | ⏳ Coming soon | State budget, social security |

---

## 🌐 Remote Deployment (use from ChatGPT, Claude mobile, phone)

The server also runs over HTTP — deploy it once and connect from **any device** through any remote MCP client.

### Start the remote server

```bash
npm run remote
# → http://localhost:3000/mcp
```

The `/mcp` endpoint speaks the MCP Streamable HTTP protocol (SSE). It's **stateless** — no sessions, no database, no Redis. Each request is independent.

### Deploy to a public host

The remote server is a standard Express.js app. Deploy it anywhere:

**Option A: Railway / Render / Fly.io (free tiers)**

```bash
# These platforms auto-detect Node.js. Just push the repo:
git push
# Set start command: npm run remote
# Set PORT env var if needed (they provide it automatically)
```

**Option B: Hostinger (Agency Plan, Node.js hosting)**

```bash
# Create a deployment archive (exclude node_modules)
zip -r deploy.zip . -x "node_modules/*" ".git/*" "tests/*"
# Upload via hPanel or the Hostinger MCP API, then trigger the Node.js build
```

**Option C: Any VPS (DigitalOcean, Hetzner, Linode)**

```bash
ssh your-vps
git clone https://github.com/stefanatanassov/bg-parliament-mcp.git
cd bg-parliament-mcp && npm install --production
# Optional: install Playwright for bill text extraction
npx playwright install chromium
# Run with PM2 for persistence
npm install -g pm2
pm2 start remote.js --name bg-parliament
```

### Connect from a remote MCP client

Once deployed, point any remote MCP client to `https://your-host.com/mcp`:

```json
{
  "mcpServers": {
    "bg-parliament": {
      "type": "url",
      "url": "https://your-host.com/mcp"
    }
  }
}
```

This works from **ChatGPT desktop, Claude mobile, Cursor, Windsurf** — anything that supports remote MCP servers. No local Node.js needed. No Playwright needed (bill text extraction degrades gracefully).

### Without Playwright (serverless-friendly)

If your hosting doesn't support headless Chromium (serverless, shared hosting), the bill text extraction tool returns a clear message instead of failing:

> *"Bill text extraction requires Playwright. Install with: npx playwright install chromium"*

All 54 other tools work perfectly without it.

## Evergreen Prompts

Save these as custom prompts in your MCP client for instant high-value queries:

### "What has MP [NAME] been doing?"

```
Use parliament_list_mps to find [NAME], then parliament_get_mp_profile with their ID.
Examine _raw.importActList for legislation they authored, _raw.controlList for questions
they asked, and _raw.mshipList for committee work. Summarize their activity.
```

### "Analyze the impact of [BILL_ID] on ordinary Bulgarians"

```
Use parliament_get_bill_text for the bill. Read the legal text carefully.
Identify every § that changes existing law. For each change, explain:
1. What was the rule before?
2. What does the new text say?
3. Who benefits and who loses?
4. Give a concrete practical example.
```

### "Track a topic through parliament"

```
Topic: [TOPIC]. Use parliament_search_legislative_acts, parliament_search_bills,
parliament_search_questions, and parliament_search_enquiries with keyword [TOPIC].
Cross-reference results: which MPs are active on this topic? Which committees
handle it? Are there related procurement contracts? Build a timeline.
```

### "Audit procurement around [TOPIC]"

```
Use parliament_list_procurement_types and parliament_list_procurement_statuses
to understand codes. Then parliament_search_procurements with keyword [TOPIC].
For each result, use parliament_get_procurement for details. Flag:
- Single-bidder contracts
- "Договаряне без обявление" (direct award, type 5)
- Contracts with suspiciously short deadlines
```

### "Compare MP group voting on [ISSUE]"

```
Use parliament_list_mps to identify parliamentary groups. For each group,
search questions and enquiries by MPs from that group about [ISSUE].
Compare: which groups ask questions vs which groups propose legislation?
Are opposition questions being answered? Is there a pattern of avoiding scrutiny?
```

---

## Project Structure

```
bg-parliament-mcp/
├── index.js              # MCP server (55 tools, stdio transport)
├── package.json
├── lib/
│   ├── client.js         # ParliamentClient — HTTP abstraction + retries
│   ├── download-bill.js  # Playwright-based bill file downloader
│   └── extract-text.py   # Python PDF/RTF text extraction script
├── tests/
│   └── unit.test.js      # 11 unit tests (mocked HTTP)
├── AGENT.md              # Universal agent definition for MCP hosts
├── PROMPTS.md            # Curated high-value prompts
├── README.md             # This file
└── LICENSE               # MIT
```

---

## Requirements

- **Node.js** >= 18
- **Python 3** (for PDF/RTF extraction — only needed for `parliament_get_bill_text`)
- **PyPDF2** (`pip3 install PyPDF2` — only needed for PDF extraction)
- **Playwright** (`npx playwright install chromium` — only needed for bill text extraction)
- No API keys, no authentication — the Parliament API is fully public

---

## Design Principles

- **Strictly read-only** — all tools are GET or POST-search; zero mutations
- **Official data only** — every response originates from `parliament.bg`
- **Bulgarian text preserved** — no translation at this layer; names, titles, laws remain in original Bulgarian
- **Stable schemas** — normalized field names, canonical URLs, `_raw` fallback for full upstream data
- **Graceful degradation** — scanned PDFs return clear errors; empty results return `[]`; HTTP errors are structured

---

## Testing

```bash
npm test                 # 11 unit tests (no network required)
```

---

## License

MIT — use, modify, distribute freely. Data sourced from the public Bulgarian Parliament API.
