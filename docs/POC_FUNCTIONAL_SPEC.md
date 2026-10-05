# POVO – AI Guidance: functional spec extracted from the POC

Source: `POVO_AI_Guidance_Step3_37.html` (finalized POC, kept at the repo root as the reference).
The file was built up iteration by iteration (Steps 3_26 to 3_34) and many functions are declared
twice. **Only the last declaration is live.** When you port behaviour, read the final definition of:
`kpiRow`, `renderPerf`, `chartDonut`, `tipDonut`, `chartDecile`, `tipDecile`, `chartStack`,
`renderPre`, `planTg`, `shownTg`, `tableRows`, `theadHtml`, `hcpTable`, `refreshTable`, `getTP`,
`qList`, `hCard`, `histFilters`, `applyRevision`, `segOf`, `tgLast`, `compTag`, `catLen`.

Rules that differ from the POC for the full build (user decisions, 2026-09-30):

- The POC hardcodes 10/13/2026 as today. The full build uses **the real current date** (America/New_York).
- The POC uses one territory (Portland, ME) with a few impersonation variants. The full build has **8 Northeast territories**, each at POC volume.
- Show **3** talking points per category (`TP_SHOW=3`). Do not build "show 2 more".
- **Out of scope for now:** the OCE "Call Prep Review Completed" modal, adverse-event alerts to Pharmacovigilance, a manager roll-up view, the launch strip, QBANK profiling questions, "Load sample", the Specialty filter, the "Edit Note" button, and the notes compliance meter. Client feedback on these is still pending.
- Keep as in the POC: the writers chart split is JAK vs non-JAK, and managers get impersonation only.

---

## 1. Domain and personas

POVO is Incyte's oral selective JAK1 inhibitor for moderate-to-severe **Hidradenitis Suppurativa (HS)**
(STOP-HS1/STOP-HS2, HiSCR50 at week 12, 45 mg / 75 mg). The app is the field-sales guidance tool.

- **POVO Sales Representative** (primary user), e.g. Vince Turano, "POVO Sales Representative · Portland, ME territory · Northeast".
- **Manager, Field Sales Enablement** (e.g. Barbara Drake). Can **impersonate** any rep and sees exactly that rep's data.
- Call targets have one of three roles: **HCP** (physician, MD or DO), **NP**, **PA**. Each NP or PA is affiliated with a parent physician.
- Other teams appear only as interaction sources: POVO Sales (rep), ADFA, Opz Sales, MSL, Speaker programs, PR.

## 2. Shell

- **Header** (46px, `#115088`). Left: "POVO – AI Guidance" and today's date written out in full ("October 13, 2026"). Right: the rep's name, "role · territory · region", an avatar with initials, and a chevron that opens the account menu.
- **Account menu:** name, role, "territory · region", a "Signed in as X" badge while impersonating, and the buttons **Impersonate user** / **Exit impersonation**.
- **Impersonation bar** (amber): "Viewing as **{name}** ({BU} · Team). Every figure on this page is theirs. You are **{signed-in name}**", with an **Exit impersonation** button.
- **Impersonate modal:**
  - Intro text: "See the app exactly as another employee does: their territory, their goal position, their targets. Type a rep name, an Employee ID or a Network ID, pick a match, then switch".
  - Placeholder: "e.g. Dana Whitaker, p250544 or 3351".
  - Typeahead rows show "role · territory · Employee ID". While searching, show "Looking up…".
  - Error: `No employee found for "x". Check the name, Employee ID or Network ID and try again`.
  - Result card: IDs, Role, Access, Regions, Home territory, and a **View as {name}** button.
  - Matching covers employee ID, network ID, username, part of the name, or part of the territory.
- **Tabs:** `Territory Performance` | `Pre-Call Planning` | `Post-Call Assessment`. Tab 3 is disabled until a target is selected.
- Max content width is 1860px. Tab 1 fits the viewport without scrolling on desktop. Escape closes modals and menus.

## 3. Tab 1: Territory Performance

**Period toggle:** `Current Month` | `Current Quarter` | `Year to Date`.

**KPI cards:**

| Card | Unit |
|---|---|
| `Patient Enrollment Forms` | PEFs |
| `NRx` | new scripts |
| `New POVO Patients` | patients |

Each card shows:

- The title, followed by the period label: "(October)", "(Oct – Dec)", or "(Jan – Dec)". YTD uses the full-year goal and ends 12/31.
- "Achieved: **x** out of y {unit}" and "Yet to Achieve: z {unit}".
- "Remaining working days: N" with an "ends MM/DD/YYYY" chip.
- A progress bar with "NN% of goal achieved".
- A status chip: **On Track** or **At Risk**. On Track means actual ≥ round(sum of goals for fully elapsed months + current month's goal × fraction of its working days elapsed).
- Working days are weekdays minus US holidays.

**AI Guidance panel** (sparkle icon, purple accent), in three columns:

- **Missed opportunities:**
  - Up to 2 Super High or Medium targets that have been called before but not for more than 21 days: "**Name** · N days, no call".
  - "**N Super High** not writing".
- **Strong performance:**
  - The segment with the best trial %: "**Immediate** trial at **NN%**".
  - The HCP with the most POVO patients: "**Dr. X** · N POVO patients".
  - "Super High reach **NN%**".
- **Recommended focus:** 3 clickable targets (role chip, name, arrow). Clicking one opens Tab 2 with that target selected.
  - Score = `hs × (povo>0 ? 1 : 1.6) × (1 + daysSinceLastCall/30)`. A target that has never been called counts as 60 days.
  - Only Super High and Medium HCPs are candidates.
- Every item has a hover title with the details.

**Charts.** Tooltips sit beside the chart, never on top of it. Charts animate in.

1. **Target Segmentation** (donut). Covers all POVO targets (D1–D10 universe, 142 per territory), with the total in the centre labelled "POVO Targets".
   - The legend shows each segment's name and %.
   - Tooltip:
     - "{Immediate|Conversion|Expansion} Opportunity", with N HCPs and % of total.
     - **Trial %:** targets who wrote POVO.
     - **Penetration %:** POVO patients ÷ HS patients.
     - **Adoption %:** writers with 3 or more POVO patients.
     - **Reach %:** in-plan targets called.
     - The segment description.
   - Caption: "▼ {n} of {N} POVO Targets yet to write POVO".
2. **POVO Targets by Decile.** Horizontal bars for D10 → D2 (D1 excluded).
   - Bars are overlaid: green `#2FA84F` = "Writing POVO", amber `#F2B45C` = "Yet to write POVO". Each bar is labelled "w of t HCPs".
   - Background bands mark the tiers, each with a rotated label: Super High (D10–7), Medium (D6–5), Low (D4–2).
   - Tooltip:
     - Counts of writing and yet-to-write.
     - "{Tier} (D..–D..) · {40|28|20} calls a year · {95|95|75}% reach goal".
     - HCP count and HS patients (the opportunity).
     - **Execution %:** calls ÷ planned calls to date.
     - **Reach %:** plus "N in the first 60 days" for Super High.
     - **Productivity:** NRx per 10 calls.
   - Caption: "▼ {n} of {N} Super High HCPs yet to write POVO".
3. **New POVO Writers by Segment.** Stacked columns with a **Weekly | Monthly** toggle.
   - Monthly runs from Jan to the current month. Weekly shows the last 12 weeks, each ending on a Friday.
   - Series:
     - **JAK Inhibitor Utilizers (POVO + JAK Inhibitor)**, `#156CB4`.
     - **Non-JAK Inhibitor Utilizers (POVO alone)**, `#7C6BD6`.
   - The last (partial) bar is drawn at 60% opacity and labelled "to date".
   - Header: "N new POVO writers · Jan–Oct 2026" or "· last 12 weeks".
   - Axis titles: "# of new POVO writers" and "Month, 2026" / "Week ending Friday, 2026".
   - Tooltip: count per series, plus "N POVO Targets wrote POVO for the first time".

## 4. Tab 2: Pre-Call Planning

Two columns in a 0.8 : 1.6 ratio, with Call Prep below both.

### A. Must-Wins (subtitle: territory name)

Two lists:

- "Top HCPs based on HS Volume": the top 5 by HS volume with JAK = 0.
- "Top HCPs based on HS Volume & JAK Inhibitor Users": the top 5 with JAK > 0.

**Columns:**

- `#`, role chip, and name.
- **Competitive Focus**.
- **Decile** (tier-coloured "D" chip).
- **HS Patients** (the JAK list adds "(n JAK Inhibitors)").
- **Last Call** (a date, or a "Not called" chip).

The hover tooltip shows the full name, account · city ZIP, decile, HS patients, JAK status and POVO patients. Clicking a row selects the target.

### B. Call Plan Targets

Sub-tabs: `Full Call Plan (n)` | `Accounts (n)`.

**Filters:**

- Competitive-focus pills (multi-select, each with a count): `Cosentyx`, `Bimzelx`, `Humira`, `JAK`, `Conventional therapy`.
- Multi-select checkbox dropdowns:
  - **Segment**
  - **Target Type** (the tier: Super High / Medium / Low; check the POC `planTg`/filter code)
  - **Account** (includes claims-only accounts)
- A **Clear** button.

**Full Call Plan table.** Covers all in-plan targets (D10–D2) that are not Must-Wins, 10 per page. The pager reads "Showing a–b of n targets", with prev, next and page buttons. Columns:

| Column | Notes |
|---|---|
| Name | Funnel filter by role (HCP / NP / PA, each with a count). The cell shows a role chip and the name. |
| Account | |
| Location | City, State |
| Competitive Focus | Coloured tag |
| ZIP Code | |
| Decile | Sortable |
| HS Volume | Sortable; the default sort, descending |
| Last Call Date | Sortable; shows a "Not called" chip when empty |

Empty state: "No targets match the selected filters".

**Accounts table.** Columns:

- Account, with an expand caret.
- Location (city and ZIP).
- HS Patients.
- POVO Patients.
- Targets: "N · M in plan", or the chip "No affiliations".
- Main Focus: the focus with the highest HS sum.

Expanding a row shows a sub-table (Name | Competitive Focus | Decile | HS Patients | Last Call Date).

A claims-only account shows: "Account-level claims show **N HS patients** here, but no treating HCP is affiliated yet. Ask the ADFA to confirm the prescribers at this site".

Before any selection, show the placeholder: "Select a target in Must-Wins or the Call Plan Targets to see the call prep".

### C. Call Prep

Appears once a target is selected, and scrolls into view.

**Header.** "Call Prep · Dr. {Last, First}, {MD|DO}", plus **Meeting participants** toggles:

- The HCP is always on.
- The HCP's affiliated NP and PA can each be toggled.
- Selecting an NP or PA row from a list adds both that person and their parent physician.

**Card 1: Call Participant History.** Avatar, name, and "account · city ZIP", with one role tab per participant.

- **5 stat tiles.** For an HCP:
  - "HS patients, last 12 months"
  - "POVO patients"
  - "D{n}", with "{Tier} · #{rank} of {N} POVO Targets"
  - "POVO discussions"
  - "Last call" (MM/DD with the year below, or "Not called yet")

  For an NP or PA:
  - "HS patients seen, last 12 months"
  - "POVO patients"
  - "D{n}", with "Decile · {role}"
  - "POVO discussions"
  - "Last call"
- **5 bullets.** For an HCP:
  - "Decile Dx · #rank of N POVO Targets · about N HS visits a month".
  - "{Segment} Opportunity · primary focus: {Comp} (off label in HS if JAK) · discuss patients like Tara/Marcus". Tara = "losing control on a biologic" (Immediate). Marcus = "stuck on conventional therapy" (Conversion).
  - POVO patients vs HS patients not yet on POVO, or "No POVO scripts yet…".
  - "N POVO discussions (last: …)", or "No direct POVO Sales call yet".
  - IncyteCARES enrollment status.

  For an NP or PA:
  - "Works with Dr. X at {account}".
  - Decile and HS follow-ups.
  - PA: "Handles prior authorizations for new HS starts". NP: "Leads patient education and refill calls".
  - POVO status.
  - Discussions.
- **"Interactions with {name}".** Filter chips with counts: `All`, `POVO Sales`, `ADFA`, `Opz Sales`, `MSL`, `Speaker`, `PR`. Cards sit in a 3-column grid.
  - Card types: "Direct call", "ADFA visit", "Opz Sales call", "MSL visit", "PR visit", "Speaker program".
  - Each card shows a team tag, "Interaction Date" as a long date, and a summary. The summary is "POVO discussed" in the POC; real data may carry a real summary.

**Card 2: Call Preparation.**

- A toggle: `Suggested Messaging` | `Potential Objections` | `Suggested Closing Statements`.
- An AI status chip ("AI generating" with a spinner, then "AI generated") and one role tab per participant.
- The first time each participant × category × revision is opened, an **AI activity box** appears: "AI is preparing {category}". It reveals 3 steps, then the points appear one by one.
  - Messaging: "Analyzing {name}'s profile, decile and HS volume", "Applying the Core Claims order for POVO data", "Generating suggested messaging".
  - Objections: "Analyzing {name}'s profile, decile and HS volume", "Selecting objections from the POVO objection handler", "Generating potential objections".
  - Closings: "Analyzing {name}'s profile and call history", "Matching suggested closes to the call goals", "Generating suggested closing statements".
  - Revision: "Reading the {date} post-call assessment for {name}", "Checking which points stayed open" (for objections: "Reordering objections by what is still open"), "Generating next-call {category}".
- Heading: "{Next-call }{Category} for {name} ({role})". **Top 3 points only.**
- Messaging points carry a pillar label (`Efficacy`, `Safety` in pink, `{Segment} segment`, `Mechanism`, `Lesions and pain`; NP/PA also get `Access` and `Dosing`) and a "↳ Insight:" line.
- Objection points carry a "↳ Response:" line.

## 5. Tab 3: Post-Call Assessment

- **Header:** "Call Assessment", with the chip "AI checks every note for compliance".
- **Call participants:** pills showing role, name and "answered/total".
- **Category tabs:** the same 3 categories as Call Prep, each with "x of 3 selected".
- **Point rows** (the 3 points shown in prep):
  - A checkbox marks the point as raised on the call, and the row expands.
  - Messaging and Closing get a **3-stop reception slider**: `Not Well Received` | `Moderately Received` | `Well Received`. It supports pointer drag, clicking a label, and the arrow keys, and starts unset.
  - A **Notes** input, max 200 characters. The placeholder is "Notes", or "Notes: how the HCP responded to this objection" for objections.
  - When collapsed, a row shows a response chip: the rating, a snippet of the note, "Selected", or a red compliance chip with a hover tooltip.
  - An AI icon: a purple spinner while the check runs, then a red pulsing button if the note is flagged. Clicking the button reopens the compliance report.
- **Additional notes:** "Additional Notes or Questions discussed outside of the above points". Textarea, max 600 characters.
  - Placeholder: "What else was discussed, how the office responded and the agreed next step".
  - Shows either a red "… View AI suggestion" link or "AI compliance check passed".
- **Footer:** progress dots, "n of 9 selected for {name}", and "N compliance flags".
- **CTA "AI Suggestions for Next Call"** (purple, pulsing).
  - Disabled until at least one point is answered and no flags remain. The hint reads "Clear N compliance flags to enable AI Suggestions for Next Call".
  - Running it shows a 3-step stepper: "Reading the post-call assessment", "Running the AI compliance check on N notes", "Drafting next-call talking points".
  - It then applies the revision, returns to Tab 2, and scrolls to Call Prep. This is the "second loop".

**Second-loop visuals (Tab 2):**

- A pill: "Revised after the {date} call".
- A purple banner: "Updated from the {date} post-call assessment: {summary}", plus "**Next best action:** …".
- Point tags: `Retained · well received`, `Changed`, `Reordered`, `New · replaces a removed message`, `Still open · address first`, `Resolved last call`, `▲ was #n` / `▼ was #n`, `New`, and `New AI suggestion`. Old text is shown struck through.
- A new "Direct call" interaction card with the chip "New" and the summary "Call assessed".
- The discussions tile goes up by one and is highlighted.
- The last-call tile shows the call date.
- Bullet 5 becomes "Post-call {date}: X of 3 messages well received, N objections still open, N closings well received".

## 6. AI compliance check

The check runs:

- on Enter, blur or change;
- when switching point, participant or category;
- on every note before "AI Suggestions for Next Call".

Modal steps: "Reading your note", "Checking against 14 compliance rules", "Drafting a rewrite". The modal can be dragged by its header. Buttons: **Close**, **Use Suggestion**.

| id | Chip | Title | Severity | Deduction |
|---|---|---|---|---|
| off | Off-label | Off-label or unapproved use | high | 35 |
| claim | Claim | Unbalanced or comparative claim | med | 20 |
| ae | Adverse event | Possible adverse event (report to Pharmacovigilance within 24 h) | high | 35 |
| phi | Patient ID | Patient identifier | high | 35 |
| vulgar | Vulgar | Vulgar language | high | 30 |
| lang | Unprofessional | Unprofessional wording | med | 15 |
| price | Pricing | Pricing, samples or incentives | med | 20 |
| sens | Personal | Sensitive or personal information | med | 20 |
| irr | Off topic | Information unrelated to the call | low | 25 |
| fill | Filler | Filler wording | low | 10 |
| gib | Not readable | Text is not readable | high | 100 |
| vague | Too vague | Note is too vague (< 3 words or a generic phrase) | med | 60 |
| ph | Incomplete | Note is incomplete (unfilled `[brackets]`, or cut off mid-sentence) | med | 40 |
| rel | Unrelated | Not related to this point (no content word shared with the point or the HS/POVO vocabulary) | med | 50 |

- **Suppressions:** "medical information" suppresses `off`; "reported to pharmacovigilance" suppresses `ae`.
- **Score:** 100 − deductions, capped at 75 when any issue is found. Labels: ≥80 Compliant, ≥60 Needs review, otherwise Non-compliant.
- **Modal label:** comes from the highest severity: high = "Non-compliant", med = "Needs review", low = "Minor issue".
- **Rewrite (`compFix`):**
  - Keeps the rep's clauses and strips the offending words.
  - Replaces off-label, AE and pricing clauses with "Off-label question sent to Medical Information", "Safety information reported to Pharmacovigilance" and "Access questions referred to IncyteCARES".
  - Otherwise falls back to a template with `[placeholders]`.
- The regex rules are the guaranteed floor. The LLM adds a second pass (see ARCHITECTURE.md).

## 7. Next-call revision (`applyRevision`)

**Messaging:**

| Rating | Result |
|---|---|
| Well received | `Retained` |
| Moderately received | `Changed`: swapped to the next-call variant, and the note becomes the insight "From the {date} call: …" |
| Not well received | The first one is `Removed` and replaced by the peer message "HS can progress to irreversible damage; treat the ongoing disease, not each flare" (pillar "Disease progression"). Later ones are `Changed`. |

After tagging, messaging is reordered: Removed/New first, then Changed, then Retained, then untouched. Each moved point gets a ▲/▼ marker.

**Objections:**

- A note means "open" if it matches not resolved / still concerned / push back / concerns.
- It means "res" if it matches resolved / agreed / addressed / comfortable.
- Open objections go first, resolved ones last.

**Closings:**

- A rated closing is replaced by its well-received or other variant (`New`).
- Up to 2 untouched closings in the top 3 become `New AI suggestion`, taken from the extra closings.

**Next best action:** "Open with safety" or "Lead with {pillar}", plus "clear the open objection first", plus "confirm the agreed next step".

## 8. Business numbers (POC base territory, Portland)

**Monthly goals and actuals (new patients):**

- Goal (new patients) per month: [8,9,10,11,12,13,14,15,16,17,18,19], total 162.
- Actual: [6,8,9,11,10,12,13,14,13,5,…], where October is month-to-date.
- PEF goal = new-patient goal × 1.4.
- NRx goal = new-patient goal × 1.25.
- Enrollments ≈ 1.36 × new patients.
- NRx ≈ 1.2 × new patients.

**Targets and writers by decile, D10 → D1:**

| | D10 | D9 | D8 | D7 | D6 | D5 | D4 | D3 | D2 | D1 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Targets | 1 | 2 | 4 | 5 | 8 | 10 | 13 | 19 | 21 | 59 | 142 |
| Writers | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 7 | 7 | 2 | 44 |
| Avg HS patients | 133 | 64 | 39 | 31 | 24 | 19 | 16 | 12 | 10 | 6 | |

JAK writers 28, non-JAK 16.

**Tiers:**

| Tier | Deciles | Calls/yr | Reach goal | Attainment factor | Reach factor |
|---|---|---|---|---|---|
| Super High | D10–7 | 40 | 95% | 0.94 | 0.92 |
| Medium | D6–5 | 28 | 95% | 0.82 | 0.83 |
| Low | D4–2 | 20 | 75% | 0.68 | 0.64 |

- D1 is not in the plan, so the plan holds 83 targets.
- Planned calls to date = targets × calls/yr × fraction of the working year elapsed.

**Segments:**

| Code | Short name | Full name | Description | Colour |
|---|---|---|---|---|
| imm | Immediate | HS Biologic and HS JAK Prescribers | Treating HS patients with biologics and/or oral JAK inhibitors | `#156CB4` |
| conv | Conversion | Advanced Therapy Naïve HS Treaters | Managing HS patients with no prior biologic or oral JAK inhibitor use for HS | `#0E8A8A` |
| exp | Expansion | Broader JAK Prescribers | Prescribing oral JAK inhibitors in non-HS indications | `#7C6BD6` |

**Competitive focus colours:** Cosentyx `#0E8A8A`, Bimzelx `#C2410C`, Humira `#7C3AED`, JAK `#156CB4`, Conventional therapy `#64748B`.

**Objection selection** (POC objection ids 1–24; 6, 8 and 18 are unused):

| Audience | Writer | Non-writer |
|---|---|---|
| HCP, Immediate | [3,19,13,14,22] | [2,4,13,14,20] |
| HCP, decile ≥ 5 | [5,9,11,16,17] | [10,12,1,16,17] |
| HCP, lower decile | [5,9,10,16,17] | [10,11,12,24,17] |
| PA | [17,15,20,23,21] | [17,15,20,23,21] |
| NP | [16,9,13,15,17] | [16,9,13,15,17] |

Objection openers: "Expect N to", "Be ready for N to", "Be advised that N may", "Prepare for N to", "Watch for N to".

## 9. Design tokens

**Font:** Heebo (400–900). **Icons:** Material Symbols Rounded, including the AI "sparkle" icon (an inline SVG, `SPARK`).

**Base colours:**

| Group | Tokens |
|---|---|
| Page and ink | `--bg #D9E2EC`, `--ink #0F1F33`, `--ink2 #1E3350`, `--ink3 #334155` |
| Blue | `--blue #156CB4`, `--blued #115088` (header), `--navy #12406E`, `--sky #2388D4`, `--bluet #EAF3FB`, `--bluet2 #C7DDF0` |
| Lines | `--line #C4CFDC`, `--line2 #D5DEE8` |
| Warning | `--warn #B45309`, `--warnb #F59E0B`, `--warnbg #FEF3C7`, `--warnbd #F0C26B` |
| Green | `--green #15803D`, `--greenb #2FA84F`, `--greenbg #E9F5EE`, `--greenbd #BFE0CB` |
| Purple (AI accent) | `--purple #6D5BD0`, `--purple2 #5A48B8`, `--purplel #7C6BD6` |
| Teal | `--teal #0E8A8A` |
| Compliance red | `#DC2626`, `#B91C1C` |

**Chips:**

| Chip | Background / text |
|---|---|
| Super High tier | `#C9EFC9` / `#1B5E20` |
| Medium tier | `#F8E6A6` / `#7A5200` |
| Low tier | `#F6CDD9` / `#8E2447` |
| HCP role | `#12406E` |
| PA role | `#5A48B8` |
| NP role | `#0B6B57` |

**Shadows:** `0 1px 3px rgba(16,40,80,.10)` and `0 4px 14px rgba(16,40,80,.12)`.

**Shape:** card radius 12–13px, pills 999px. Base font size is 15.7px, with uppercase letter-spaced labels.

**Breakpoints:** 1700, 1500, 1400, 1180, 900, 760, 640 (width) and 820, 800 (height), with compact modes on short screens.

**Copy rule:** always write "HCPs" with a lowercase "s", even inside uppercase-styled labels.
