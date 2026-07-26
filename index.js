#!/usr/bin/env node
/**
 * Bulgarian Parliament MCP Server — read-only tools for civic data access.
 *
 * Exposes ~45 MCP tools across 6 domains:
 *   legislation  — acts, bills, draft acts, public consultations
 *   parliament   — assemblies, sessions, MPs, structures, absences
 *   control      — questions, enquiries, hearings, blitz, debates, votes
 *   committees   — info, documents, meetings, opinions, stenograms
 *   procurement  — types, statuses, search, profiles
 *   news         — front page, search, profiles, live calendar
 *
 * All data is sourced exclusively from https://www.parliament.bg public REST API.
 * Bulgarian text fields are preserved as-is; no translation is applied.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parliamentApi, ParliamentApiError } from "./lib/client.js";
import { getBillText } from "./lib/download-bill.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const SERVER_NAME = "bg-parliament-mcp";
const SERVER_VERSION = "1.0.0";
const BASE_WEB = "https://www.parliament.bg";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wrap an upstream call with standardized error handling.
 * Returns { result } or { error }.
 */
async function safeCall(fn, label) {
  try {
    const data = await fn();
    if (data === null || data === undefined) {
      return { result: [] };
    }
    return { result: data };
  } catch (err) {
    if (err instanceof ParliamentApiError) {
      return {
        error: {
          type: err.type,
          message: err.message,
          details: { status: err.status, path: err.path },
        },
      };
    }
    return {
      error: {
        type: "internal_error",
        message: `[${label}] ${err.message}`,
      },
    };
  }
}

/**
 * Build a canonical web URL for a resource.
 * The API itself returns IDs but the website uses a path scheme.
 */
function webUrl(type, id) {
  return `${BASE_WEB}/bg/${type}/${id}`;
}

/**
 * Strip empty / undefined values from a form-data object.
 */
function cleanForm(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k] = String(v);
    }
  }
  return out;
}

// ─── Tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LEGISLATION (Законотворчество)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_search_legislative_acts",
    description:
      "Search Bulgarian legislative acts by keyword, assembly, session, commission, signature, or date range. Returns summaries with IDs, titles, dates, and canonical URLs.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword (maps to L_Act_string)" },
        assembly_id: { type: "integer", description: "National Assembly ID (A_ns_id[id])" },
        session_id: { type: "integer", description: "Session ID (L_Ses_id[id])" },
        commission_id: { type: "integer", description: "Commission ID (A_ns_C_id[id])" },
        signature: { type: "string", description: "Act signature (L_Act_sign)" },
        date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "parliament_get_legislative_act",
    description:
      "Get full profile of a legislative act by ID, including metadata, related committees, sessions, and document links.",
    inputSchema: {
      type: "object",
      properties: { act_id: { type: "integer", description: "Legislative act ID" } },
      required: ["act_id"],
    },
  },
  {
    name: "parliament_search_bills",
    description:
      "Search bills (законопроекти) by keyword, assembly, commission, signature, or date range.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        commission_id: { type: "integer" },
        signature: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_bill",
    description: "Get full profile of a bill by ID.",
    inputSchema: {
      type: "object",
      properties: { bill_id: { type: "integer" } },
      required: ["bill_id"],
    },
  },
  {
    name: "parliament_search_draft_acts",
    description: "Search draft acts (проекти на законодателни актове).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_draft_act",
    description: "Get full profile of a draft act by ID.",
    inputSchema: {
      type: "object",
      properties: { draft_id: { type: "integer" } },
      required: ["draft_id"],
    },
  },
  {
    name: "parliament_search_public_consultations",
    description: "Search public consultations (публични консултации).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_public_consultation",
    description: "Get full profile of a public consultation by ID.",
    inputSchema: {
      type: "object",
      properties: { consult_id: { type: "integer" } },
      required: ["consult_id"],
    },
  },
  {
    name: "parliament_list_legislation_front",
    description: "List the front page of legislative acts — latest/featured acts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_get_bill_text",
    description:
      "Download and extract the full text of a bill (motives + legal paragraphs) from its PDF or RTF file. Uses browser automation to access files that require session cookies. Returns the complete bill text in Bulgarian.",
    inputSchema: {
      type: "object",
      properties: { bill_id: { type: "integer", description: "Bill ID" } },
      required: ["bill_id"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PARLIAMENT, MPs & STRUCTURES (Народно събрание, номенклатури)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_list_assemblies",
    description:
      "List all Bulgarian National Assemblies (Народни събрания) with IDs and names.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_list_sessions",
    description: "List parliamentary sessions for a given assembly.",
    inputSchema: {
      type: "object",
      properties: { assembly_id: { type: "integer" } },
      required: ["assembly_id"],
    },
  },
  {
    name: "parliament_list_structures",
    description:
      "List parliamentary structures (committees, parliamentary groups, delegations) by type.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "integer",
          description:
            "Structure type: 1=parliamentary groups, 2=standing committees, 3=ad-hoc committees, 4=delegations, 5=friendship groups",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "parliament_list_mps",
    description:
      "List all MPs for the current National Assembly, including their parliamentary group, constituency, and positions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_get_mp_profile",
    description:
      "Get full profile of an MP: bio, birth date, constituency, parliamentary group, email, photo URL.",
    inputSchema: {
      type: "object",
      properties: { mp_id: { type: "integer" } },
      required: ["mp_id"],
    },
  },
  {
    name: "parliament_list_mp_absences",
    description: "List MP absences for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        assembly_id: { type: "integer", description: "Optional assembly filter" },
      },
      required: ["date_from", "date_to"],
    },
  },
  {
    name: "parliament_list_mp_penalties",
    description: "List MP penalties for a given assembly.",
    inputSchema: {
      type: "object",
      properties: { assembly_id: { type: "integer" } },
    },
  },
  {
    name: "parliament_list_archive",
    description: "List parliament archives (past assemblies).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_get_archive_assembly",
    description: "Get archive details for a specific past assembly.",
    inputSchema: {
      type: "object",
      properties: { archive_id: { type: "integer" } },
      required: ["archive_id"],
    },
  },
  {
    name: "parliament_list_leadership",
    description: "List current parliamentary leadership (ръководство).",
    inputSchema: { type: "object", properties: {} },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PARLIAMENTARY CONTROL (Парламентарен контрол)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_search_questions",
    description:
      "Search parliamentary questions (въпроси). Filter by keyword, assembly, MP, minister, date range, or document number.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword (fnString)" },
        assembly_id: { type: "integer" },
        mp_id: { type: "integer", description: "MP who asked (A_ns_MP_id[id])" },
        minister_id: { type: "integer", description: "Minister/recipient (A_ns_MP_min_id[id])" },
        doc_number: { type: "string", description: "Document number (RN_DOC)" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_search_enquiries",
    description: "Search parliamentary enquiries (питания) with the same filters as questions.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        mp_id: { type: "integer" },
        minister_id: { type: "integer" },
        doc_number: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_question_or_enquiry",
    description:
      "Get full profile of a question or enquiry. kind='question' or kind='enquiry'.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["question", "enquiry"] },
        id: { type: "integer" },
      },
      required: ["kind", "id"],
    },
  },
  {
    name: "parliament_search_hearings",
    description: "Search parliamentary hearings (изслушвания).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_hearing",
    description: "Get full profile of a hearing by ID.",
    inputSchema: {
      type: "object",
      properties: { hearing_id: { type: "integer" } },
      required: ["hearing_id"],
    },
  },
  {
    name: "parliament_search_blitz_control",
    description: "Search blitz parliamentary control (блиц контрол).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_blitz_control",
    description: "Get full profile of a blitz control item by ID.",
    inputSchema: {
      type: "object",
      properties: { blitz_id: { type: "integer" } },
      required: ["blitz_id"],
    },
  },
  {
    name: "parliament_search_debates",
    description: "Search parliamentary debates (разисквания по питания).",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        assembly_id: { type: "integer" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_debate",
    description: "Get full profile of a debate by ID.",
    inputSchema: {
      type: "object",
      properties: { debate_id: { type: "integer" } },
      required: ["debate_id"],
    },
  },
  {
    name: "parliament_list_votes_confidence",
    description: "List all votes of confidence (вотове на доверие).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_list_votes_no_confidence",
    description: "List all votes of no confidence (вотове на недоверие).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_get_vote_confidence",
    description: "Get full profile of a confidence vote by ID.",
    inputSchema: {
      type: "object",
      properties: { vote_id: { type: "integer" } },
      required: ["vote_id"],
    },
  },
  {
    name: "parliament_get_vote_no_confidence",
    description: "Get full profile of a no-confidence vote by ID.",
    inputSchema: {
      type: "object",
      properties: { vote_id: { type: "integer" } },
      required: ["vote_id"],
    },
  },
  {
    name: "parliament_get_control_program",
    description: "Get parliamentary control program by ID.",
    inputSchema: {
      type: "object",
      properties: { program_id: { type: "integer" } },
      required: ["program_id"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. COMMITTEES & PLENARY (Парламентарни комисии и пленарни заседания)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_get_committee_info",
    description: "Get committee info/profile by ID.",
    inputSchema: {
      type: "object",
      properties: { committee_id: { type: "integer" } },
      required: ["committee_id"],
    },
  },
  {
    name: "parliament_list_committee_documents",
    description: "List documents from a specific committee.",
    inputSchema: {
      type: "object",
      properties: { committee_id: { type: "integer" } },
      required: ["committee_id"],
    },
  },
  {
    name: "parliament_list_committee_acts",
    description: "List legislative acts related to a specific committee.",
    inputSchema: {
      type: "object",
      properties: { committee_id: { type: "integer" } },
      required: ["committee_id"],
    },
  },
  {
    name: "parliament_list_committee_meetings",
    description: "List meetings for a specific committee.",
    inputSchema: {
      type: "object",
      properties: { committee_id: { type: "integer" } },
      required: ["committee_id"],
    },
  },
  {
    name: "parliament_list_committee_news",
    description: "List news from a specific committee.",
    inputSchema: {
      type: "object",
      properties: { committee_id: { type: "integer" } },
      required: ["committee_id"],
    },
  },
  {
    name: "parliament_get_committee_opinion",
    description: "Get a committee's opinion (становище) on a bill.",
    inputSchema: {
      type: "object",
      properties: { opinion_id: { type: "integer" } },
      required: ["opinion_id"],
    },
  },
  {
    name: "parliament_get_committee_stenogram",
    description: "Get a committee sitting stenogram.",
    inputSchema: {
      type: "object",
      properties: { stenogram_id: { type: "integer" } },
      required: ["stenogram_id"],
    },
  },
  {
    name: "parliament_list_upcoming_sittings",
    description: "List upcoming committee and plenary sittings.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_list_plenary_documents",
    description: "List plenary session documents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_get_plenary_document",
    description: "Get a single plenary document by ID.",
    inputSchema: {
      type: "object",
      properties: { doc_id: { type: "integer" } },
      required: ["doc_id"],
    },
  },
  {
    name: "parliament_list_plenary_documents_by_period",
    description: "List plenary documents by year and month (e.g., 2026-07).",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Year (e.g., 2026)" },
        month: { type: "integer", description: "Month 1-12" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "parliament_get_plenary_program",
    description: "Get plenary session program by ID.",
    inputSchema: {
      type: "object",
      properties: { program_id: { type: "integer" } },
      required: ["program_id"],
    },
  },
  {
    name: "parliament_get_plenary_stenogram",
    description: "Get a plenary sitting stenogram by ID.",
    inputSchema: {
      type: "object",
      properties: { stenogram_id: { type: "integer" } },
      required: ["stenogram_id"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PUBLIC PROCUREMENT (Обществени поръчки)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_list_procurement_types",
    description: "List all public procurement type codes (e.g., open procedure, competitive dialogue).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_list_procurement_statuses",
    description: "List all procurement status codes (open, closed, awarded, etc.).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parliament_search_procurements",
    description:
      "Search parliament-side public procurements. Supports filtering by keyword, type, status, date range.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        type_id: { type: "integer", description: "Procurement type (OP_PrT_id)" },
        status_id: { type: "integer", description: "Procurement status (OP_S_id)" },
        date_from: { type: "string" },
        date_to: { type: "string" },
      },
    },
  },
  {
    name: "parliament_get_procurement",
    description: "Get full profile of a public procurement by ID.",
    inputSchema: {
      type: "object",
      properties: { procurement_id: { type: "integer" } },
      required: ["procurement_id"],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. NEWS & PRESS CENTRE (Пресцентър, Новини)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: "parliament_list_front_news",
    description: "List front-page news from the parliament press centre.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", description: "Page number (default 1)", default: 1 },
      },
    },
  },
  {
    name: "parliament_search_news",
    description: "Search parliament news articles by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "parliament_get_news_article",
    description: "Get full profile of a news article by ID.",
    inputSchema: {
      type: "object",
      properties: { article_id: { type: "integer" } },
      required: ["article_id"],
    },
  },
  {
    name: "parliament_list_live_calendar",
    description: "List live broadcast calendar events.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── Tool handler map ──────────────────────────────────────────────────────

const HANDLERS = {
  // ═══════════════════════════════════════════════════════════════════════════
  // LEGISLATION
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_search_legislative_acts: async (args) => {
    const form = cleanForm({
      L_Act_string: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      "L_Ses_id[id]": args.session_id,
      "A_ns_C_id[id]": args.commission_id,
      L_Act_sign: args.signature,
      date1: args.date_from,
      date2: args.date_to,
      search: "1",
    });
    const data = await parliamentApi.postForm("/api/v1/fn-acts/1", form);
    return Array.isArray(data) ? data : data?.items || data?.acts || [];
  },

  parliament_get_legislative_act: async (args) => {
    const data = await parliamentApi.get(`/api/v1/act/${args.act_id}`);
    data._canonicalUrl = webUrl("acts", args.act_id);
    return data;
  },

  parliament_search_bills: async (args) => {
    const form = cleanForm({
      L_Act_string: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      "A_ns_C_id[id]": args.commission_id,
      L_Act_sign: args.signature,
      date1: args.date_from,
      date2: args.date_to,
      search: "1",
    });
    const data = await parliamentApi.postForm("/api/v1/fn-bills", form);
    return Array.isArray(data) ? data : data?.items || data?.bills || [];
  },

  parliament_get_bill: async (args) => {
    const data = await parliamentApi.get(`/api/v1/bill/${args.bill_id}`);
    data._canonicalUrl = webUrl("bills", args.bill_id);
    return data;
  },

  parliament_search_draft_acts: async (args) => {
    const form = cleanForm({
      L_Act_string: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      date1: args.date_from,
      date2: args.date_to,
      search: "1",
    });
    const data = await parliamentApi.postForm("/api/v1/fn-act-pr", form);
    return Array.isArray(data) ? data : data?.items || data?.drafts || [];
  },

  parliament_get_draft_act: async (args) => {
    const data = await parliamentApi.get(`/api/v1/act-pr/${args.draft_id}`);
    data._canonicalUrl = webUrl("draft-acts", args.draft_id);
    return data;
  },

  parliament_search_public_consultations: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/public-consult-list", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_public_consultation: async (args) => {
    const data = await parliamentApi.get(`/api/v1/public-consult/${args.consult_id}`);
    data._canonicalUrl = webUrl("public-consultations", args.consult_id);
    return data;
  },

  parliament_list_legislation_front: async () => {
    const data = await parliamentApi.get("/api/v1/front-act-list");
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_bill_text: async (args) => {
    // First get bill metadata to find the file references
    const billData = await parliamentApi.get(`/api/v1/bill/${args.bill_id}`);
    const result = await getBillText(billData);
    if (result.success) {
      return {
        bill_id: args.bill_id,
        title: billData.L_ActL_title,
        signature: billData.L_Act_sign,
        date: billData.L_Act_date,
        format: result.format,
        text: result.text,
        _canonicalUrl: webUrl("bills", args.bill_id),
      };
    }
    throw new ParliamentApiError(result.error || "Failed to extract bill text", {
      status: 502,
      path: `/api/v1/bill/${args.bill_id}`,
      body: result.error,
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARLIAMENT, MPs & STRUCTURES
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_list_assemblies: async () => {
    const data = await parliamentApi.get("/api/v1/fn-assembly/bg");
    return Array.isArray(data)
      ? data.map((a) => ({
          assembly_id: a.A_ns_id,
          name: a.A_nsL_value,
        }))
      : data;
  },

  parliament_list_sessions: async (args) => {
    const data = await parliamentApi.get(`/api/v1/fn-session/bg/${args.assembly_id}`);
    return Array.isArray(data)
      ? data.map((s) => ({
          session_id: s.L_Ses_id,
          name: s.L_SesL_value,
          assembly_id: s.A_ns_id,
        }))
      : data;
  },

  parliament_list_structures: async (args) => {
    const data = await parliamentApi.get(`/api/v1/fn-coll/bg/${args.type}/0`);
    return Array.isArray(data)
      ? data.map((s) => ({
          structure_id: s.A_ns_C_id,
          name: s.A_ns_CL_value,
          short_name: s.A_ns_CL_value_short,
        }))
      : data;
  },

  parliament_list_mps: async () => {
    const data = await parliamentApi.get("/api/v1/coll-list-ns/bg");
    if (!data?.colListMP) return [];
    return data.colListMP.map((mp) => ({
      mp_id: mp.A_ns_MP_id,
      first_name: mp.A_ns_MPL_Name1,
      last_name: mp.A_ns_MPL_Name2,
      family_name: mp.A_ns_MPL_Name3,
      parliamentary_group: mp.A_ns_CL_value,
      position: mp.A_ns_MP_PosL_value,
      constituency: mp.A_ns_Va_name,
      photo_url: mp.A_ns_MP_img
        ? `${BASE_WEB}/pub/MP/${mp.A_ns_MP_img}`
        : null,
    }));
  },

  parliament_get_mp_profile: async (args) => {
    const data = await parliamentApi.get(`/api/v1/mp-profile/bg/${args.mp_id}`);
    return {
      mp_id: data.A_ns_MP_id,
      first_name: data.A_ns_MPL_Name1,
      last_name: data.A_ns_MPL_Name2,
      family_name: data.A_ns_MPL_Name3,
      birth_date: data.A_ns_MP_BDate,
      birth_country: data.A_ns_B_Country,
      birth_city: data.A_ns_B_City,
      email: data.A_ns_MP_Email,
      assembly_id: data.A_ns_id,
      photo_url: data.A_ns_MP_img
        ? `${BASE_WEB}/pub/MP/${data.A_ns_MP_img}`
        : null,
      _canonicalUrl: webUrl("mp", args.mp_id),
      _raw: data,
    };
  },

  parliament_list_mp_absences: async (args) => {
    const form = cleanForm({
      date1: args.date_from,
      date2: args.date_to,
      "A_ns_id[id]": args.assembly_id,
    });
    const data = await parliamentApi.postForm("/api/v1/mp-absense/bg", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_mp_penalties: async (args) => {
    const form = cleanForm({ "A_ns_id[id]": args.assembly_id });
    const data = await parliamentApi.postForm("/api/v1/mp-penalty", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_archive: async () => {
    const data = await parliamentApi.get("/api/v1/archive/bg");
    return Array.isArray(data) ? data : [];
  },

  parliament_get_archive_assembly: async (args) => {
    return parliamentApi.get(`/api/v1/archive/bg/${args.archive_id}`);
  },

  parliament_list_leadership: async () => {
    return parliamentApi.get("/api/v1/leadership/bg");
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARLIAMENTARY CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_search_questions: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      "A_ns_MP_id[id]": args.mp_id,
      "A_ns_MP_min_id[id]": args.minister_id,
      RN_DOC: args.doc_number,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/pl-enquiry/61", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_search_enquiries: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      "A_ns_MP_id[id]": args.mp_id,
      "A_ns_MP_min_id[id]": args.minister_id,
      RN_DOC: args.doc_number,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/pl-enquiry/62", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_question_or_enquiry: async (args) => {
    const type = args.kind === "question" ? 61 : 62;
    const data = await parliamentApi.get(`/api/v1/pl-enquiry/${type}/${args.id}`);
    data._canonicalUrl = webUrl(
      args.kind === "question" ? "questions" : "enquiries",
      args.id
    );
    return data;
  },

  parliament_search_hearings: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/pl-hearing", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_hearing: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-hearing/${args.hearing_id}`);
    data._canonicalUrl = webUrl("hearings", args.hearing_id);
    return data;
  },

  parliament_search_blitz_control: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/pl-blic", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_blitz_control: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-blic/${args.blitz_id}`);
    data._canonicalUrl = webUrl("blitz-control", args.blitz_id);
    return data;
  },

  parliament_search_debates: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "A_ns_id[id]": args.assembly_id,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/pl-debate", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_debate: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-debate/${args.debate_id}`);
    data._canonicalUrl = webUrl("debates", args.debate_id);
    return data;
  },

  parliament_list_votes_confidence: async () => {
    const data = await parliamentApi.get("/api/v1/vote-list");
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_votes_no_confidence: async () => {
    const data = await parliamentApi.get("/api/v1/vote-noc-list");
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_vote_confidence: async (args) => {
    const data = await parliamentApi.get(`/api/v1/vote/${args.vote_id}`);
    data._canonicalUrl = webUrl("votes-confidence", args.vote_id);
    return data;
  },

  parliament_get_vote_no_confidence: async (args) => {
    const data = await parliamentApi.get(`/api/v1/vote-noc/${args.vote_id}`);
    data._canonicalUrl = webUrl("votes-no-confidence", args.vote_id);
    return data;
  },

  parliament_get_control_program: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-control/${args.program_id}`);
    data._canonicalUrl = webUrl("control-program", args.program_id);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMITTEES & PLENARY
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_get_committee_info: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-info/bg/${args.committee_id}`);
    data._canonicalUrl = webUrl("committees", args.committee_id);
    return data;
  },

  parliament_list_committee_documents: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-docs/bg/${args.committee_id}`);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_committee_acts: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-acts/bg/${args.committee_id}/2`);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_committee_meetings: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-meeting/bg/${args.committee_id}`);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_committee_news: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-news/bg/${args.committee_id}`);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_committee_opinion: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-stan/bg/${args.opinion_id}`);
    data._canonicalUrl = webUrl("committee-opinions", args.opinion_id);
    return data;
  },

  parliament_get_committee_stenogram: async (args) => {
    const data = await parliamentApi.get(`/api/v1/com-steno/bg/${args.stenogram_id}`);
    data._canonicalUrl = webUrl("committee-stenograms", args.stenogram_id);
    return data;
  },

  parliament_list_upcoming_sittings: async () => {
    const data = await parliamentApi.get("/api/v1/upcoming-sittings/bg");
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_list_plenary_documents: async () => {
    const data = await parliamentApi.get("/api/v1/pl-doc");
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_plenary_document: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-doc/${args.doc_id}`);
    data._canonicalUrl = webUrl("plenary-documents", args.doc_id);
    return data;
  },

  parliament_list_plenary_documents_by_period: async (args) => {
    const data = await parliamentApi.get(
      `/api/v1/pl-doc-period/${args.year}/${args.month}`
    );
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_plenary_program: async (args) => {
    const data = await parliamentApi.get(
      `/api/v1/plenaryprogram/bg/${args.program_id}`
    );
    data._canonicalUrl = webUrl("plenary-programs", args.program_id);
    return data;
  },

  parliament_get_plenary_stenogram: async (args) => {
    const data = await parliamentApi.get(`/api/v1/pl-sten/${args.stenogram_id}`);
    // Stenograms often return HTML; normalize
    if (data?._html) {
      return { _html: data._html, _canonicalUrl: webUrl("plenary-stenograms", args.stenogram_id) };
    }
    data._canonicalUrl = webUrl("plenary-stenograms", args.stenogram_id);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC PROCUREMENT
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_list_procurement_types: async () => {
    const data = await parliamentApi.get("/api/v1/proc-type");
    return Array.isArray(data)
      ? data.map((t) => ({ type_id: t.OP_PrT_id, name: t.OP_PrT_name }))
      : data;
  },

  parliament_list_procurement_statuses: async () => {
    const data = await parliamentApi.get("/api/v1/proc-status");
    return Array.isArray(data)
      ? data.map((s) => ({ status_id: s.OP_S_id, name: s.OP_S_name }))
      : data;
  },

  parliament_search_procurements: async (args) => {
    const form = cleanForm({
      fnString: args.keyword,
      "OP_PrT_id[id]": args.type_id,
      "OP_S_id[id]": args.status_id,
      date1: args.date_from,
      date2: args.date_to,
    });
    const data = await parliamentApi.postForm("/api/v1/fn-proc", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_procurement: async (args) => {
    const data = await parliamentApi.get(`/api/v1/proc/${args.procurement_id}`);
    data._canonicalUrl = webUrl("procurements", args.procurement_id);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEWS & PRESS CENTRE
  // ═══════════════════════════════════════════════════════════════════════════
  parliament_list_front_news: async (args) => {
    const page = args.page || 1;
    const data = await parliamentApi.get(`/api/v1/front-news/bg/${page}`);
    // Upstream returns a single object (not array) for front news
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && !Array.isArray(data)) return [data];
    return [];
  },

  parliament_search_news: async (args) => {
    const form = cleanForm({ fnString: args.keyword });
    const data = await parliamentApi.postForm("/api/v1/fn-news/bg", form);
    return Array.isArray(data) ? data : data?.items || [];
  },

  parliament_get_news_article: async (args) => {
    const data = await parliamentApi.get(`/api/v1/news/bg/${args.article_id}`);
    data._canonicalUrl = webUrl("news", args.article_id);
    return data;
  },

  parliament_list_live_calendar: async () => {
    const data = await parliamentApi.get("/api/v1/calendar-live/bg");
    return Array.isArray(data) ? data : data?.items || [];
  },
};

// ─── Server Setup ──────────────────────────────────────────────────────────

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const handler = HANDLERS[name];

  if (!handler) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              type: "unknown_tool",
              message: `Tool '${name}' not found. Available tools: ${Object.keys(HANDLERS).join(", ")}`,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const { result, error } = await safeCall(() => handler(args), name);

  if (error) {
    return {
      content: [{ type: "text", text: JSON.stringify(error, null, 2) }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] v${SERVER_VERSION} started (stdio transport)`);
}

// Only auto-start when run directly (not when imported for tests)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^\.\//, ""))) {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}

// Exports for testing
export { server, TOOLS, HANDLERS, safeCall };
