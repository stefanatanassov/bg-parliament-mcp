# Evergreen Prompts for Bulgarian Parliament MCP

Save these prompts in your MCP client (OpenCode, Claude, Cursor, Codex) as custom commands or bookmarks. Each prompt is self-contained — just fill in the bracketed values.

---

## 📋 Legislative Deep Dives

### "Analyze Bill [ID]"
```
Use parliament_get_bill_text for bill [ID]. Extract the full text.
For every § that changes existing law:
1. State what the rule was before
2. State what the new text says (translate from legalese to plain language)
3. Who benefits?
4. Who is disadvantaged?
5. Give a concrete practical example.

Then check parliament_get_bill for metadata: who proposed it, which
committees it went through, status. Check parliament_search_questions
with keywords from the bill title to find related parliamentary questions.
Summarize: is this bill actively debated or quietly moving through?
```

### "Compare Bills [ID1] vs [ID2]"
```
Get full text for both bills using parliament_get_bill_text.
Create a side-by-side comparison table:
| Aspect | Bill [ID1] | Bill [ID2] |
|--------|-----------|-----------|
| Sponsor | | |
| Scope | | |
| Key changes | | |
| Committee support | | |
| Status | | |

Then analyze: which is more ambitious? Which has better chances?
What's the practical difference for ordinary people if one passes
vs the other? Which parliamentary groups support each?
```

### "Track Law Evolution [TOPIC]"
```
Search for all legislation about [TOPIC] using parliament_search_legislative_acts,
parliament_search_bills, and parliament_search_draft_acts with keyword [TOPIC].
Sort by date, newest first. For each item:
- Get the profile via parliament_get_bill or parliament_get_legislative_act
- Check if it was enacted, rejected, or stalled
- Note which assembly and session handled it

Build a timeline showing how the legal framework around [TOPIC] has evolved
over time. Identify which assembly was most active on this topic.
```

---

## 👤 MP & Political Analysis

### "Profile MP [NAME]"
```
Use parliament_list_mps to find [NAME] and get their ID.
Then parliament_get_mp_profile with that ID.
Report:
- Personal: name, birth date, constituency, education, languages
- Political: parliamentary group, position, previous assemblies
- Legislative activity: count of bills they've authored (importActList)
- Committee work: all committees they serve on (mshipList)
- Oversight: questions they've asked the government (controlList)
- Discipline: any absences or penalties
- Photo URL and canonical profile link

Then use parliament_search_questions with their mp_id to find
all questions they've asked. Analyze patterns: what topics do they
focus on? Are they mostly asking about local constituency issues
or national policy?
```

### "Audit Parliamentary Group [GROUP NAME]"
```
Use parliament_list_mps to identify all MPs in [GROUP NAME].
For each MP, get their profile and count:
1. Bills authored
2. Questions asked
3. Committee seats held
4. Absences/penalties

Compute group totals and per-MP averages. Compare to other groups.
Identify the most active and least active MPs in the group.
Check if the group's legislative focus matches their stated platform:
what topics do their bills and questions cluster around?
```

### "MP Absence Report [DATE RANGE]"
```
Use parliament_list_mp_absences with date_from [START] and date_to [END].
Group absences by parliamentary group. Compute:
- Total absences per group
- Absences per MP per group
- Which MPs have the most absences?
- Are there patterns (e.g., certain days, certain committees)?

Cross-reference with parliament_list_mps to add group affiliation
and position. Flag any MP with more than [N] absences in the period.
```

---

## 🏛️ Parliamentary Control & Oversight

### "Government Oversight on [TOPIC]"
```
Search for all parliamentary questions and enquiries about [TOPIC]:
- parliament_search_questions with keyword [TOPIC]
- parliament_search_enquiries with keyword [TOPIC]
Also search hearings and blitz control items.

For each question found:
- Who asked it? (get MP profile)
- Which minister was asked?
- When was it asked?
- Use parliament_get_question_or_enquiry to check if it was answered

Compute the response rate. Flag unanswered questions older than 30 days.
Analyze: which ministers are most responsive? Which MPs ask the most questions?
```

### "Vote of No Confidence Analysis"
```
Use parliament_list_votes_no_confidence to get all no-confidence votes.
For each, use parliament_get_vote_no_confidence for the full profile.
Report:
- Who initiated it? Which parliamentary group?
- What was the topic?
- When was it held?
- What was the outcome?

Compare across assemblies: which assembly had the most no-confidence votes?
Is there a pattern in the topics that trigger them?
```

---

## 💰 Public Procurement

### "Procurement Audit [TIMEFRAME]"
```
Use parliament_list_procurement_types and parliament_list_procurement_statuses
to understand the codes. Then parliament_search_procurements with date
range [START] to [END].

For each procurement found, get the full profile via parliament_get_procurement.
Create a report categorizing:
1. Procedure type (open, direct award, competitive dialogue, etc.)
2. Status (open, closed, awarded, terminated)
3. Estimated value (if available)

FLAG for special scrutiny:
- Direct awards ("Договаряне без обявление", type 5)
- Single-bidder open procedures
- Terminated or suspended procedures
- Procedures with unusually short deadlines
- Any procurement exceeding [THRESHOLD] in estimated value
```

### "Procurement by Contractor [COMPANY NAME]"
```
Search all procurements and filter for contracts mentioning [COMPANY NAME].
Use parliament_get_procurement for each match.
Build a company profile:
- Total value of contracts won
- Types of goods/services provided
- Procedure types used (are they winning open competitions or direct awards?)
- Timeline of contracts (sudden spike in awards?)
- Any terminated or problematic contracts?
```

---

## 📰 News & Current Events

### "This Week in Parliament"
```
Use parliament_list_front_news with page 1 for the latest news.
Use parliament_search_legislative_acts with date_from [MONDAY] and
date_to [FRIDAY] for this week's legislation.
Use parliament_list_upcoming_sittings for scheduled events.

Compile a briefing:
- Key bills introduced or voted on this week
- Upcoming committee hearings and plenary sessions
- Notable parliamentary questions asked
- Press centre announcements
```

### "Media Coverage vs. Parliamentary Record on [TOPIC]"
```
Search parliament news for [TOPIC] using parliament_search_news.
Count how many press releases/announcements exist.

Then search the actual parliamentary record:
- Bills and acts about [TOPIC]
- Questions and enquiries about [TOPIC]
- Committee documents about [TOPIC]

Compare: is the parliament doing as much as the press releases suggest?
Quantify the gap between announcements and legislative action.
```

---

## 🔗 Cross-Reference Prompts

### "Follow the Money: [TOPIC]"
```
This is a comprehensive cross-domain investigation about [TOPIC].

Phase 1 — Legislation:
Search all bills and acts about [TOPIC]. For each, identify the sponsor
(MP or Council of Ministers). Use parliament_get_bill_text for the
actual legal text.

Phase 2 — Parliamentary Control:
Search all questions, enquiries, and hearings about [TOPIC]. Which
MPs are scrutinizing this? Are they from opposition or ruling party?

Phase 3 — Procurement:
Search procurements related to [TOPIC]. Do any contracts align with
the legislation being passed? Are companies that benefit from the
legislation also winning procurement contracts?

Phase 4 — MPs:
For MPs most active on [TOPIC] legislation, check their committee
memberships. Are they on committees that oversee the relevant sector?
Do they have declared conflicts of interest?

Synthesize: does the legislative activity around [TOPIC] appear to
serve public interest or particular private interests?
```

### "Constituency Report: [REGION NAME]"
```
Use parliament_list_mps to find all MPs whose constituency contains
[REGION NAME]. For each MP:
- Get their profile
- List all bills they've authored (from _raw.importActList)
- List all questions they've asked (from _raw.controlList)

Then search questions with keyword [REGION NAME] to find questions
from other MPs about this region.

Compile a report: how well is [REGION NAME] represented in parliament?
Are local issues being raised? Which MPs are most active on regional
matters? Are there regional problems that no MP is addressing?
```
