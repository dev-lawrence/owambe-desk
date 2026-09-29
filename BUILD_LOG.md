# Owambe Desk: build log

A running, honest record of how this was built for the DEV x Sanity Challenge (Path Two). Each phase records what was built, what I decided and why, what went wrong, and what I could not verify. Nothing is marked as working unless it was run.

- Sanity project ID: `qyn1i646`
- Content dataset: `production` (public, read without a token)
- Workflow engine documents: also in `production` under tag `owambe`, and not readable anonymously (Phase 2). The `workflows` dataset created in Phase 1 is unused.

---

## Phase 1: scaffold, schema, seed (2026-09-24)

### What was built

- pnpm workspace: `studio`, `web`, `console`, `packages/shared`, `scripts`.
- Sanity project `qyn1i646` in the existing organisation, with a public `production` dataset and a private `workflows` dataset for the engine (see Phase 2 notes below).
- Standalone Studio with the full content model: 9 document types and 5 object types. Every field has a description saying why it exists.
- `packages/shared`: the fixed vocabularies (sides, roles, RSVP states, fabric types…), Naira money helpers, invite codes, GROQ queries and TypeGen output. The Studio schema, the seed and the apps all import the vocabularies from here, so a value cannot drift between the model and the code that reads it.
- Seed script (`pnpm seed`) that creates 93 documents: the event, 45 people, both family sides with their non-negotiables, the program shell with the couple's brief, 8 vendors, 5 aso ebi lots and 31 guests.
- Next.js site with the design tokens (light and dark), Bricolage Grotesque, and a home page that reads the event through `defineLive`.
- App SDK console that boots and reads live counts with `useDocuments`.

### Verified (commands actually run)

| Check | Result |
| --- | --- |
| `sanity schema validate` | 0 errors, 0 warnings |
| `sanity build` (studio) | builds |
| `sanity schemas deploy` | deployed 1/1 |
| `pnpm seed` | 93 documents created; a second run without `--reset` refuses and exits 1 |
| Anonymous GROQ over HTTP (`apicdn.sanity.io`, no token) | returns the event, couple, colours, counts and the groom's side non-negotiables |
| `pnpm -r typecheck` | all 5 workspaces pass (strict mode) |
| `vitest` in `packages/shared` | 7 tests pass (money arithmetic, formatting, invite codes) |
| `next build` | builds; `/` renders live data (checked in a browser, dark mode) |
| `sanity dev` for studio (:3333) and console (:3334) | both serve HTTP 200 |
| `sanity build` (console) | builds |

### Checked by a person (after my first report)

The Studio and the console inside the Dashboard were checked by the project owner in a signed-in browser. Both render. Live Studio → console updates work (changing an RSVP moves the counts), and the schema validation rules fire as intended.

### Bug found in review: the website was not live

**Symptom:** a change published in the Studio did not appear on the site, not even after a refresh.

**Two causes:**

1. **CORS (my mistake).** Port 3000 was taken on the dev machine, so `next dev` moved to **3002**, and I had only added `localhost:3000` to the project's CORS origins. The browser console showed `Sanity Live is unable to connect … localhost:3002 is not in the list of allowed CORS origins`. `defineLive` caches queries and relies on that live connection to invalidate them, so a blocked connection also made a refresh serve stale data. I missed it because I only checked that the page rendered, not that the live connection opened.
2. **The test itself.** The edit was to the event **title**, which the home page doesn't display (the heading is built from the couple's first names). That field couldn't have changed on screen anyway.

**Fix:** added `http://localhost:3002` to CORS. **Verified:** I changed `venue.name` through the API while the page was open, and the page updated with no reload. The browser logged `<SanityLive> is connected`, and the server log shows `revalidateSyncTagsAction` refetching the changed tags. I then reverted the name.

**Lesson:** "it renders" is not "it's live". Every live page must be checked with a real edit while the page is open, and the check must include the browser console.

### Schema decisions

- **No `decision` document type.** The brief asked for one only if it adds something the engine does not. The Workflows engine writes a `history` array on every instance, in the same transaction as the state change: `actionFired`, `transitionFired` and `stageEntered` entries with the actor, timestamp and reason (docs: "History and audit trail"). A `decision` document would be a second copy that can disagree with the first. The engine is the source of truth, and the How it works page reads its history.
- **No `order` field on `programItem`.** The brief listed both `programItem.order` and "ordered programItem refs" on `programOfEvents`. That is two sources of truth for one fact. The array order on the program is canonical, and reordering is one edit.
- **No stage or status field on `programOfEvents` or `asoEbiOrder`.** The workflow stage lives in the engine. Copying it onto content would drift.
- **`asoEbiOrder.paidAt` and `bachsPaymentId` are facts, not state.** The webhook writes them when Bachs confirms payment, at the same moment it moves the workflow to Paid. The public success page watches `paidAt` live. `bachsPaymentId` also makes webhook handling idempotent.
- **`amount` on the order is a snapshot.** It is computed on the server at order time and kept, so a later price change doesn't rewrite what a guest already agreed to pay.
- **Money is `{amount: "45000.00", currency: "NGN"}`.** It is stored as a decimal string and never a float, with arithmetic in BigInt kobo. The brief says Bachs wants decimal strings at currency precision. I have not confirmed that against docs.bachs.io yet (Phase 3).
- **`guest` is separate from `person`.** The same aunt can be invited to many weddings, each with its own table, seats and RSVP. People are event-agnostic and referenced everywhere.
- **`vendor` carries an `event` reference.** It is really a booking: `arrivedAt` only makes sense for one event.
- **Added `seats` on `guest`.** "Admits two" is on most Nigerian invitation cards, and the caterer counts plates from it.
- **Added `side` on each aso ebi palette colour.** Each family usually picks its own aso ebi. The lot's colour name must match a palette entry (async validation), so the lot inherits the side without a second field to keep in sync.
- **Non-negotiables are structured** as `{requirement, reason}`, one rule per entry, instead of a notes blob. The agent reads each one separately, and the reason lets it make sensible trade-offs. The free-text `notes` field stays for preferences.
- **Added a `celebrant` role.** The brief's role list (parent, elder, coordinator, MC, vendor contact, guest) had no role for the couple themselves.
- **Invite translations live on the event** as `{language, text, reviewed, reviewedBy}`. Guests only see a translation after a person switches `reviewed` on and names who checked it.
- **`programOfEvents.version` starts at 0**, meaning "not drafted yet". The seed does not invent a program: the agent writes the first draft in Phase 2. (I first had `min(1)` and changed it for this reason.)
- **Changed my mind: no phone numbers in the seed.** The first seed had made-up `+234…` numbers. The dataset is public, and invented Nigerian numbers could belong to real people. I removed them and reseeded. The `phone` field stays in the schema, optional. For a real event, phone numbers should not be in a public dataset at all. Moving personal data to a private dataset is future work.
- **Timezone.** All datetimes are stored in UTC and shown in `Africa/Lagos` (WAT, no daylight saving). There is no timezone field; Nigeria has one zone.
- **Studio icons are Hugeicons** (wrapped for the `icon` property), to keep to one icon library. Sanity UI's own internal icons still render inside Studio and the console; that is outside our control.

### Limitations and surprises

- **Workflow engine data is not public, even in a public dataset (expected, not yet verified).** Engine documents have dotted IDs (for example `dev.wf-instance.…`), and Sanity treats documents with a `.` in the ID as non-public. The How it works page will therefore read workflow history on the server with a read token, then render it publicly. I'll confirm this in Phase 2 when real instances exist.
- **TypeScript 7 is `latest` on npm.** It is the native (Go) port. I pinned **6.0.3**, the last JavaScript-based release, because Next.js, Sanity TypeGen and tsx load the JS compiler API. I haven't tested TS 7 with these tools.
- **Sanity UI 4 renamed props** (`space` became `gap`, `columns` became `gridTemplateColumns`, `ToastProvider` moved to `@sanity/ui/toast`). The CLI's own `app-sanity-ui` template (in `@sanity/cli` 8.12.0) still uses the old import. I found this by reading the v4 type definitions after the typecheck failed.
- **TypeGen augmentation.** The generated `sanity.types.ts` augments `@sanity/client`. When it lives in a workspace package, TypeScript only resolves that augmentation if the program imports `@sanity/client` somewhere, so `queries.ts` has an `import type {} from '@sanity/client'`.
- **pnpm 11 defaults.** Dependency build scripts are blocked until approved (`allowBuilds: esbuild: true`). A release-age policy made pnpm add `minimumReleaseAgeExclude` entries for three very recent Sanity releases on its own; I kept them and they are visible in `pnpm-workspace.yaml`.
- **Next.js 16 writes `AGENTS.md`/`CLAUDE.md`** into the app on `next dev`. I disabled that with `agentRules: false`.
- **The Studio and console both default to port 3333**, so the console is on 3334. Both origins are added to CORS with credentials.

### Prompts

No Agent Actions prompts yet; the agent arrives in Phase 2. The only prompt this phase was the project brief itself.

### Exact package versions

All pinned exactly (no `^`).

| Package | Version | Where |
| --- | --- | --- |
| node (local) | 24.18.0 | |
| pnpm | 11.9.0 | root `packageManager` |
| typescript | 6.0.3 | all |
| sanity | 6.16.0 | studio, console (CLI) |
| @sanity/vision | 6.16.0 | studio |
| @sanity/cli (transitive) | 8.12.0 | via sanity |
| next | 16.3.6 | web |
| next-sanity | 13.3.4 | web |
| @sanity/image-url | 2.1.1 | web |
| server-only | 0.0.1 | web |
| react / react-dom | 19.3.0 | all apps |
| tailwindcss / @tailwindcss/postcss | 4.3.3 | web |
| @hugeicons/react | 1.1.10 | all apps |
| @hugeicons/core-free-icons | 4.3.5 | all apps |
| @sanity/sdk / @sanity/sdk-react | 3.5.0 | console |
| @sanity/ui | 4.2.3 | console |
| styled-components | 6.5.3 | studio, console |
| @sanity/mutate (override) | 0.18.2 | forced for `@sanity/sdk@3`, per the Workflows App SDK docs |
| @sanity/client | 8.7.0 | scripts, shared (types) |
| groq | 6.16.0 | shared |
| tsx | 4.23.15 | scripts |
| vitest | 5.0.1 | shared |
| @types/node | 26.6.2 | |
| @types/react / @types/react-dom | 19.3.0 | |

Planned for Phase 2 and later, all at **0.35.0** (Workflows packages release in lockstep and must match): `@sanity/workflow-engine`, `@sanity/workflow-engine-test`, `@sanity/workflow-cli`, `@sanity/workflow-sdk`, `@sanity/workflow-react`, `@sanity/workflow-components`, `@sanity/workflow-studio`, `@sanity/workflow-studio-plugin`. The Studio plugin requires Studio ≥ 6.15 (we have 6.16.0) and `@sanity/sdk` ≥ 3.1 (we have 3.5.0).

---

## Phase 2: Workflow 1 (program of events approval) and the agent (2026-09-25)

### What was built

- **`packages/workflows`**: the `program-approval` definition, its test suite and `sanity.workflow.ts`.
- **Stages:** `drafting → family-review → ready-for-print → locked`, and `locked` can go back to `drafting` through **Reopen**.
  - Family review runs two parallel activities, `bride-approval` and `groom-approval`. Each has **Approve** and **Reject with reason**.
  - A rejection from either side sends the program back to drafting. Only both approvals reach ready for print.
  - The coordinator **locks** it. Changing a locked program means **reopening** it with a reason, which sends it back through both families.
- **Guards** freeze the program document during family review, ready for print and locked. Program items stay editable, because the coordinator writes actual times into them on the day.
- **Deployed:** `program-approval` v1, then v2 (see the mistake below), with `sanity-workflows deploy` into `qyn1i646.production`, tag `owambe`. Definition sharing with Sanity is on (their default).
- **Studio:** the Workflows plugin is registered, so families can approve and reject from the program's Workflows view.
- **Agent (`scripts/agent`), on its own robot token:**
  - `pnpm agent draft` drafts or redrafts, writes the program, and fires the same `submit` action a person would.
  - `pnpm agent translate` translates the invite.
  - `pnpm agent status` shows where the approval is.
  - `pnpm agent preview-redraft "reason"` shows how it would redraft, and writes nothing.

### Verified (commands actually run)

| Check | Result |
| --- | --- |
| `vitest` in `packages/workflows` (official test bench, `@sanity/workflow-engine-test`) | 18 pass |
| Weaken the people-only gate to `'true'` and rerun | the 3 "agent cannot act" tests fail, so the tests really guard the rule |
| Put back the v1 gate that has the hole and rerun | the same 3 tests fail |
| `vitest` for the agent's output validator | 5 pass |
| `sanity-workflows deploy --check`, `--dry-run`, then `deploy` | v1 created, then v2 created |
| Anonymous GROQ for `sanity.workflow.*` in the public dataset | **0** documents; with a token, 1. Engine documents are not public. |
| `pnpm agent draft` (live) | started an instance as the agent, drafted 22 segments in one Prompt call, wrote version 2, fired `submit`, now in `family-review` |
| Agent's token calls `evaluate` and then `fireAction(approve)` on the live v2 instance | all four family actions `allowed=false` (`filter-failed`); approve throws `ActionDisabledError`; stage unchanged |
| Human login, `sanity-workflows fire-action <id>` in list-only mode (fires nothing) | all four family actions allowed |
| `pnpm agent translate` (live) | Yoruba, Igbo and Pidgin written with `reviewed=false` |
| `pnpm agent preview-redraft "…"` (live) | the redraft prompt answered the reason with a new segment and shifted the rest; nothing written |
| `pnpm -r typecheck`, `pnpm -r test` | all workspaces pass; 30 tests total |

### Not verified yet

- **A real family rejection followed by a live redraft.** Approving and rejecting is for a person to do, not me (see "Who approves" below). The engine side of the loop is covered by bench tests, and the redraft prompt by `preview-redraft`. The full live loop waits for a person to reject in the Studio.
- **The Studio plugin UI.** It builds and typechecks, but I can't sign in to see it.
- **Translation quality.** I can't judge the Yoruba or Igbo. That's why every translation is stored unchecked until a fluent person reviews it.

### A mistake I made, and how it was caught

The brief says the agent can never approve. The engine's actor model has `kind: person | agent | system`, so the obvious gate is `$actor.kind == "person"`.

**Finding 1: the kind is always "person".** In `@sanity/workflow-engine` 0.35.0, the engine resolves the actor from the token via `/users/me`, and `identityFromUsers` always returns `kind: "person"`, robot tokens included. I read that in `dist/index.js`, and the bench confirmed it: a test that passed an actor with `kind: 'agent'` still got `kind: "person"` in history. So a kind check alone would stop nothing.

**My first fix had a hole.** I read the engine's id classifier (`p-` means a robot namespace) and gated on "id starts with `g`", meaning human account ids. The bench tests passed, because I had invented `p-…` ids for the agent. Then the first live draft showed the agent's real id in history: **`g-wR8d7ewDOtYd`**. Tokens created with the current CLI are global robots with `g-` ids. I ran `evaluate` against the live v1 instance with the agent's token: approve and reject were `allowed=true` for both families. The hole was real. I didn't exploit it.

**The fix:**
- The gate now also refuses `g-` ids: `$actor.kind == "person" && string::startsWith($actor.id, "g") && !string::startsWith($actor.id, "g-")`. Human ids look like `gX5n5nsYB`; robot ids are `g-…` or `p-…`.
- The tests now use the real `g-` robot form, plus a legacy `p-` robot. With the v1 gate put back, those tests fail.
- I deployed v2. The v1 instance was aborted with the human's CLI login, with the reason recorded in its history, and a fresh v2 instance started. Running instances stay pinned to their version, so there was no way to move v1 onto v2.
- On the live v2 instance, the agent's approve attempt is refused.

**Still true, and important:**
- The gate relies on Sanity's id format, which I observed but which isn't documented.
- Every engine check is advisory: a client holding a write token can bypass the engine entirely. The docs say this plainly.
- The hard fix would be dataset access control or a custom role for family approvers. **This project's plan has no custom roles.** The `/projects/qyn1i646/features` endpoint lists no custom-role feature, and the role catalogue is only built-in roles.
- So "only people approve" is enforced by the engine for anyone who goes through it, not by the Content Lake.
- A test pins the engine behaviour (`engine 0.35.0 stamps the agent as kind "person"`). If Sanity starts stamping `agent`, that test fails and we update the UI and this log.

### Who approves in the demo, and on whose behalf

The families in the seed are content documents (`person`), not Sanity accounts. The demo has one human login.
- Approve and reject take a required **`onBehalfOf`** parameter (for example "Chief Ikechukwu Okafor"), stored in the decision row with the real actor. The history shows both who clicked and whom they spoke for.
- That's an honest record, not an identity check.
- A real deployment would invite each approver as a Sanity user and gate each family's activity with an assignment field (`assignee`) or a role. Both need real accounts; role-scoped approvals also need custom roles, which this plan lacks.

**I won't click approve with the owner's login.** The rule is that people approve, not the AI. Using a human's session to approve would break exactly that rule, so the live approvals are left for a person to do.

### Schema and design decisions

- **No `decision` document (confirmed).** The engine's `history` records every action with actor, time and execution context. The definition adds a `decisions` array field and a `lastRejection` field *on the workflow instance*, written by the approve, reject, lock and reopen actions in the same engine transaction. The rejection reason the agent redrafts against lives there. Nothing is copied into content.
- **Decisions reset each round.** Each side's decision (`brideDecision`, `groomDecision`) is scoped to the stage, so every visit to family review starts clean. An approval of version 1 does not carry over to version 2. A test pins this.
- **The routing transition reads fields; the actions read the caller.** Transitions can't read who is calling; that's by design, and deploy rejects it. So approve and reject write the decision into a field, and the transition reads the field.
- **Rejection needs a reason, enforced in the definition.** `reason` is a required string param with `validation: {min: 10, max: 1000}`, so the engine refuses a rejection without one. Reopen uses the same rule.
- **Submitting an empty program is blocked.** The `draft` activity has a requirement, `count($fields.subject.items) > 0`.
- **One approval per program.** `singleSubject` start requirement.
- **Changed my mind: engine documents live in `production`, not in a separate `workflows` dataset.**
  - Guards are written beside the content. Writing to a second dataset would need `resourceClients` wiring on every engine: the agent, the Studio, the web server and the console.
  - The docs allow one resource ("A single-dataset setup never notices any of this").
  - Engine document ids contain dots, and the anonymous-read check above shows they stay private.
  - The empty `workflows` dataset from Phase 1 is now unused. I left it for the owner to delete.
- **Definitions live in `packages/workflows`, not `studio/`.** The brief put them in `/studio`, but four places need them: the tests, the CLI deploy, the agent and (in Phase 3) the web webhook. The Studio plugin reads the *deployed* definitions and doesn't import the source.
- **Changed from the brief: Prompt instead of Generate and Transform for drafting.**
  - The program is a list of references to separate `programItem` documents; the console and the live page need one document per segment.
  - Generate writes one document, and filling reference fields from Generate is documented as experimental and depends on the deprecated Embeddings Index API.
  - Transform rewrites one document in place, but a redraft reorders segments across many documents.
  - So both draft and redraft use **Prompt**, the Agent Action that returns JSON. The runner treats the answer as untrusted: it validates the times, overlaps, owners and sides, retries with the problems listed, and writes all new items, the program patch and the removal of the old items in **one transaction**.
  - **Translate** is used as the brief intended, with `noWrite`, targeting `inviteMessage`.
- **Agent identity.** The agent uses a robot token created only for it (`sanity tokens add "Owambe agent" --role=editor`), so every agent move is attributed to its own id. Its engine declares `executionContext: {kind: 'script', id: 'owambe-agent'}`, which history stamps next to the actor. History of the live submit: `actor {id: g-wR8d7ewDOtYd}`, `executionContext {kind: script, id: owambe-agent}`.
- **The agent respects the stage before writing.** It only writes the program when the instance is in `drafting`. Guards aren't enforced by the Content Lake yet, so this is the agent keeping the rule itself.

### Prompts

The agent sends these verbatim (`scripts/agent/prompts.ts`). `$names` are Agent Actions instruction params. Context goes in as data (the brief, each family's rules and notes, the people who may own a segment under short keys), never pasted into the prompt text.

**Draft (Prompt, `format: 'json'`, temperature 0.2)**

```text
You are the planning assistant for a Nigerian wedding reception coordinator.
Draft the running order ("program of events") for the reception described below.

The couple's brief, in their own words:
$brief

The event:
$event

The bride's family (Yoruba) must be able to accept this program. Their non-negotiables:
$brideRules

The groom's family (Igbo) must be able to accept this program. Their non-negotiables:
$groomRules

People you may name as the owner of a segment (use the key, e.g. "P3"; use null if nobody fits):
$owners

Rules for the draft:
- Every non-negotiable of BOTH families must be satisfied. If two rules pull against each other, find an order that satisfies both; do not drop either.
- Follow the couple's brief unless it conflicts with a family non-negotiable; the families' rules win.
- Use 24-hour West Africa Time, "HH:MM". Segments are in running order, do not overlap, and each starts at or after the previous one ends.
- Be realistic about Nigerian receptions: guests arrive before the formal program starts, and food service takes time.
- Titles are what the MC will announce: short, plain, respectful. Use the proper names of customs (for example "Breaking of kola nut (Oji)").
- sideOfInterest is "bride", "groom" or "both": whose tradition or stake the segment carries.
- Notes are short cues for the MC, band or DJ. Do not invent song titles or people who are not listed.

Respond in JSON only, with exactly this shape:
{
  "summary": "Two or three sentences on how this draft satisfies both families and the brief.",
  "items": [
    {"title": "Guests arrive and are seated", "start": "14:00", "durationMinutes": 60, "sideOfInterest": "both", "ownerKey": "P5", "notes": "Ushers seat elders first."}
  ],
  "rulesCheck": [
    {"side": "groom", "requirement": "the non-negotiable, as given", "howSatisfied": "which segment and why"}
  ]
}
```

**Redraft after a rejection or reopen**

```text
You are the planning assistant for a Nigerian wedding reception coordinator.
One family has rejected the current draft of the program of events. Redraft it so that it answers their reason, while still satisfying everything else.

The rejection:
$rejection

The current draft that was rejected:
$currentDraft

The couple's brief, in their own words:
$brief

The event:
$event

The bride's family (Yoruba) non-negotiables:
$brideRules

The groom's family (Igbo) non-negotiables:
$groomRules

People you may name as the owner of a segment (use the key, e.g. "P3"; use null if nobody fits):
$owners

Rules for the redraft:
- The rejection reason must be fully addressed. Say how in the summary.
- Change as little as possible otherwise: the other family already saw the rest of this draft.
- Every non-negotiable of BOTH families must still be satisfied.
- Use 24-hour West Africa Time, "HH:MM". Segments are in running order, do not overlap, and each starts at or after the previous one ends.
- sideOfInterest is "bride", "groom" or "both". Do not invent song titles or people who are not listed.

Respond in JSON only, with exactly this shape:
{
  "summary": "What changed and how it answers the rejection, in two or three sentences.",
  "items": [
    {"title": "…", "start": "HH:MM", "durationMinutes": 30, "sideOfInterest": "both", "ownerKey": "P1", "notes": "…"}
  ],
  "rulesCheck": [
    {"side": "bride", "requirement": "…", "howSatisfied": "…"}
  ]
}
```

**Appended when the validator rejects an answer (up to 3 attempts)**

```text
Your previous answer was rejected by the validator for these reasons. Fix all of them and answer again in the same JSON shape:
$problems
```

**Translate style guide (Translate, `noWrite`, target `inviteMessage`)**

```text
This is a wedding invitation from two Nigerian families to their guests. Keep it warm, respectful and natural, the way a family would actually write it in $language.
Keep people's names, the venue name ("Oshimili Grand Hall"), "Nnebisi Road", "Asaba" and "aso ebi" exactly as they are. Keep the date and time meaning exact.
For Nigerian Pidgin, write the way people in Lagos and Asaba actually speak it; do not write English with a few Pidgin words.
```

**How the prompts did:**
- **Draft:** accepted on the first attempt in both live runs (21 segments, then 22). The retry path has not been needed live yet.
- **What the draft got right, checked against every rule:**
  - kola is broken before any food or drink;
  - elders are served before the entrance;
  - talking drummers lead the entrance with no DJ;
  - the Adeyemi prayer comes before the cake;
  - the highlife band plays the parents' dance;
  - the umunna are acknowledged;
  - there are three speeches;
  - the formal program ends by 19:20 (the limit is 19:30);
  - the hall is clear by 22:00.
- **Weakness seen:** version 1 had both a "Welcome and family introductions" and a later "Opening welcome", which a coordinator would merge.
- **Redraft preview:** answered "palm wine right after kola, its own segment" with a new 10-minute segment and shifted everything after it. Its summary called the program "approved", which is wrong; it was only submitted.
- **Why "JSON only, with exactly this shape":** Prompt's docs require the word JSON in the instruction when `format: 'json'`, and recommend an example shape.

### Limitations and surprises

- **The engine stamps every token as kind "person"**, including the agent (above).
- **Guards aren't enforced by the Content Lake** during early access. The freeze guard stops engine-aware tools, including the Studio plugin, but not a raw write. The bench simulates enforcement, so the guard tests prove the definition, not the lake.
- **The deploy config needs `@sanity/workflow-blueprint`** at the same version as the engine and CLI.
- **Guard names are unique per definition**, so the freeze guard is named per stage. `defineWorkflow` caught this.
- **Action `semantics` are strings** (`'decision.accept'`), not objects. Typecheck caught this.
- **`engine.query` takes `{groq, params}`**, not positional arguments. Typecheck caught this.
- **zsh expands `workspace:*`**, so pnpm commands need it quoted.

### Package versions added in Phase 2

All Workflows packages pinned exactly at **0.35.0**, in lockstep:

| Package | Where |
| --- | --- |
| @sanity/workflow-engine | packages/workflows, scripts, studio |
| @sanity/workflow-engine-test | packages/workflows (dev) |
| @sanity/workflow-cli | packages/workflows (dev) |
| @sanity/workflow-blueprint | packages/workflows (dev) |
| @sanity/workflow-studio-plugin, -components, -diagram, -react, -sdk, -studio | studio |

Also: `@sanity/sdk` 3.5.0 in studio (the plugin requires it directly); `vitest` 5.0.1 in scripts. `@sanity/mutate` still resolves to 0.18.2 only.

---

## Phase 3: Workflow 2 (aso ebi order) and Bachs payments (2026-09-26)

### What was built

- **`aso-ebi-order` workflow** (deployed v1): `ordered → awaiting-payment → paid → with-tailor → ready → collected`.
  - A failed charge, or an expired checkout, sends the order back to `ordered` with the reason recorded.
  - From `paid` the coordinator either sends the fabric to the event tailor or hands it to the guest to sew themselves ("fabric only" skips the tailor). That's how aso ebi actually works: plenty of guests use their own tailor.
- **Who may do what (in the definition, not the UI):**
  - Only a **robot** identity may open a checkout, confirm a payment or record a failure. No person can click "paid".
  - Only a **person** may hand off, mark ready or mark collected.
  - Confirming a payment also needs a readiness requirement: the order must already carry `paidAt` and `bachsPaymentId`, which only the verified webhook writes. So even a robot can't confirm a payment that isn't recorded on the order.
- **Guards:** during `awaiting-payment` the order's lot, guest, quantity, amount and checkout id are frozen. From `paid` on, the payment facts are frozen too. Measurements stay editable, because tailors often take them after payment.
- **Three identities, three robot tokens:** "Owambe web server" (creates orders, opens checkouts), "Owambe payments webhook" (confirms or fails payments) and "Owambe agent" (Phase 2). The history names each one.
- **Checkout (`web/src/lib/bachs/checkout.server.ts`), per the Bachs guide "Charge a raw amount":**
  - `POST /v1/checkout-sessions` with `pricing: {currency: 'NGN', amount: '<decimal string>'}`, `payment_method_types: ['NGN_CARD', 'NGN_BANK_TRANSFER']` and `metadata.orderId`.
  - A unique `reference`, an `Idempotency-Key` per attempt, and `expires_in_minutes: 60`.
  - The session id is saved on the order before the workflow moves, because the order freezes once it's awaiting payment.
  - Live (`sk_live_`) keys are refused unless `BACHS_ALLOW_LIVE=true`.
- **Webhook (`/api/webhooks/bachs`):**
  - Verifies `X-Bachs-Signature-V2` exactly as docs.bachs.io specifies: HMAC-SHA256 of `"{timestamp}.{raw_body}"`, accepting any `v1` so secret rotation works, with a 300-second tolerance. It falls back to `X-Bachs-Timestamp` plus `X-Bachs-Signature`, and reads the raw body before any parsing.
  - Handling:
    - A verified `collection.succeeded` writes `bachsPaymentId` and `paidAt` onto the order, conditional on the order's revision, then fires `confirm-payment` as the webhook robot with `idempotencyKey: bachs:<event id>`.
    - `collection.failed` and `checkout.expired` fire `payment-failed` with the reason.
  - Responses: 401 for a bad signature, 400 for a body that isn't a Bachs event, 200 once handled or deliberately ignored, 500 on an error so Bachs retries.
- **Pages** (functional; the design pass is Phase 5):
  - `/aso-ebi` lists lots with remaining stock and an order form (invite code, fabric, quantity).
  - `/aso-ebi/orders/[id]` shows the order's status, updating **live**. It flips to "Paid" when the webhook writes `paidAt`, with no refresh, and offers **Pay now** after a failure.
- **`pnpm --filter @owambe/web simulate …`:** a local stand-in for Bachs (see "Not verified yet").

### Rules the webhook applies, and why

| Case | What happens | Why |
| --- | --- | --- |
| Status `SUCCEEDED`, or `OVERPAID` measured against `expected_amount` | paid | These are the states the Bachs docs define as collected in full. |
| Status `ACCEPTED` | `needs-review`, not paid | The docs describe it as "accepted on terms other than the exact amount requested", so a person should decide. |
| Amount or currency differs from the order | `needs-review` | The amount is computed on the server from Sanity, and a mismatch is never silently accepted. |
| `charge_id` is null | `needs-review` | The docs say it's null for test webhooks, legacy and manual reconciliation, so there's no real charge to record. |
| A second, different charge for an already paid order | `needs-review`, not applied | Never double-apply, never overwrite. |
| Redelivered event | no second write, no second fire | Bachs guarantees at-least-once delivery. `bachsPaymentId` is already set, and the engine's idempotency key dedupes for 24 hours. |
| A failure for an older checkout of the same order | ignored | A late failure must not undo a newer attempt. |
| Payment arrives after the order was already sent back to `ordered` | recorded on the order, `needs-review` | The money is real, so the coordinator reconciles it. The workflow isn't forced. |

### Verified (commands actually run)

| Check | Result |
| --- | --- |
| Bench tests for `aso-ebi-order` | 13 pass. Includes: no person can confirm a payment; a robot can't confirm one that isn't recorded on the order; a failure needs a reason; a retry works; the webhook can't hand off; the guards freeze the order. |
| Mutation checks | ROBOTS_ONLY set to `true`: 3 tests fail. The `payment-recorded` requirement set to `true`: the "no verified webhook" test fails. Both restored. |
| Web tests (`vitest`) | 25 pass. Signature: V2, legacy, rotation, unsigned, wrong secret, tampered body, stale timestamp, missing secret. Handler: every row in the table above. Route: unsigned, wrong secret or tampered all return **401 and nothing is looked up or written**; a signed payment returns 200 and confirms; a handler error returns 500. |
| `sanity-workflows deploy` | `aso-ebi-order v1` created; `program-approval v2` unchanged |
| **Live, against the real dataset and the running site** (simulated Bachs, see below) | Order created in `awaiting-payment`, page open in a browser showing "Waiting for Bachs". Unsigned "payment": **HTTP 401**, order unchanged. Payment signed with the wrong secret: **HTTP 401**, order unchanged. Correctly signed payment: HTTP 200, order `paid`. The open page switched to "Paid, confirmed at 16:47" **without reloading** (page loaded 15:47:17Z, payment at 15:47:51Z, one navigation). |
| Live history of that order | `start-checkout` by the web server robot (`g-q3noLfp9qlsG`, context `bachs-simulator`); `confirm-payment` by the **payment webhook robot** (`g-a0gl00qSRg0m`, context `bachs-webhook`) |
| Live expiry | a second order was expired, returned to `ordered` with the reason, and its page shows "Payment did not go through" and **Pay now** |
| Live duplicate | a second, different payment for the paid order returned `needs-review`; the first payment is untouched |
| Live form, unknown invite code | "We could not find that invite code…" |
| Live form, real invite code, no Bachs key yet | order saved; lands on its page with "We could not open the payment page just now…" instead of crashing (this fallback was added after I noticed the crash path) |
| `pnpm -r typecheck`, `pnpm -r test`, `next build` | all pass; 68 tests in total |

### Verified against the real Bachs sandbox (2026-09-27, after the owner added a real key)

Everything in the table above used a local simulator. Once the owner created a real `sk_sandbox_...` key (scoped to Payments: Write) and logged the Bachs CLI in, the same path was run for real:

1. `bachs login --sandbox` (owner approved the pairing code in their browser).
2. `bachs listen --forward-to localhost:3002/api/webhooks/bachs --events collection.succeeded,collection.failed,checkout.expired` — a real signing secret (`whsec_...`), put in `BACHS_WEBHOOK_SECRET`.
3. A real order (`b6bbbbea-ba0c-419d-a963-b16c287690eb`) created the same way the server action does, opening a **real** Bachs sandbox checkout (`chk_1Ek8J3yCSFWfg6gN`) via `POST /v1/checkout-sessions`.
4. Paid on the real hosted checkout page with Bachs's own "Success" sandbox test card (`5531 8866 5214 2950`).
5. Bachs delivered a genuine, signed `collection.succeeded` webhook to `/api/webhooks/bachs` (`evt_44adce13456b60919f210f0c6ba04cb0`, delivered in ~26s after a couple of retries — real network latency, not instant like the simulator). Our handler verified the signature, matched the order by metadata, and confirmed it.
6. Confirmed in the dataset: `bachsPaymentId` on the order (`ch_b5489306f43e40cca69acbf4840c83d4`) is the exact charge id Bachs returned. Confirmed in the workflow history: `confirm-payment` and the `awaiting-payment → paid` transition are both attributed to the payments-webhook robot (`g-a0gl00qSRg0m`, execution context `bachs-webhook`), not to a person or the web server.

**A real problem found and worked around, not a bug in our code:** Bachs rejects `success_url`/`cancel_url` values on `localhost` (`VALIDATION_ERROR`). There's no way to complete a real sandbox checkout redirect against a purely local dev server. For this verification only, `NEXT_PUBLIC_SITE_URL` was pointed at a placeholder public domain so checkout creation would succeed; the redirect itself was never exercised (paying was done directly on the hosted page, not via our redirect). Reverted to `http://localhost:3002` afterwards. This isn't a problem in production: Netlify gives the deployed site a real public URL.

**A real account-hygiene finding, not an Owambe Desk problem:** the Bachs account the owner's key belongs to already had three webhook endpoints registered from the owner's other projects (`werb-creative-dev`, `subtrack-dev`, one unnamed), all subscribed to `collection.succeeded`. The two API-created test payments during this verification fanned out to those endpoints too (visible as failed/retried attempts in `bachs events list`, since those apps don't recognize our metadata). The owner confirmed all three are their own other projects, so this is noise, not a leak to a third party — but it's why a dedicated Bachs organization per project is worth doing before a real event.

Also worth recording: `bachs trigger <event>` fans out to every currently-registered destination, including an active `bachs listen` session — useful for confirming the forwarding session itself is alive independent of any real payment.

Two real orders exist in the dataset from this: `b6bbbbea…` (paid for real) and `dcc17d22…`/`bdf6b06f…` (earlier real attempts, abandoned once `success_url` needed the placeholder domain). Plus the three simulator orders from the table above (`bee4cb22…`, `26d12958…`, `e3fa82dc…`). All six are test data and should be cleaned up or re-seeded before the demo.

### Decisions and limitations

- **The workflow stage stays in the engine; payment facts go on the order.** `paidAt` and `bachsPaymentId` are facts Bachs told us, so they belong on the content. They also make the success page live through Sanity Live, because engine documents are private.
- **The robots-only gate can't tell the webhook from the web server or the agent.** They're all robot tokens with the same role, and the definition can't name a deployment-specific id. The `payment-recorded` requirement narrows it: a robot has to write verified payment facts first. Pinning the exact webhook identity would need custom roles, and this plan has none (Phase 2).
- **Unpaid orders don't reserve stock.** Remaining stock is the lot's stock minus *paid* quantities, checked when the order is placed. Two guests could both start checkouts for the last unit; the coordinator would see it. A reservation with expiry is future work.
- **No personal details stored.** The Bachs hosted page collects the guest's email and name; we don't. Orders reference the guest record; the order page is reachable only by its unguessable id.
- **The dataset is public, so orders are readable.** Anyone with GROQ access can list orders (guest reference, amount, paid time). Fine for a fictional demo; a real event would put orders under private ids or in a private dataset. Measurements, if entered in the Studio, would also be public. The web form doesn't collect them for this reason.
- **Refund requested: not built.** The brief made it optional. Bachs supports refunds (`POST /v1/refunds`, `refund.*` events), but I chose to finish the core path and test it properly instead.
- **The dev server is pinned to port 3002.** Port 3000 was busy on one run and free on the next, so the port moved and broke both CORS and the Bachs redirect URLs. Pinned in `web/package.json`.
- **Guard names must be unique**, and **requirements live on activities, not actions**, so confirming and failing a payment are two activities. `defineWorkflow` caught both.
- **A GROQ scoping mistake I made:** my first colour lookup for lots, `*[_type=="event" && _id == ^.^.event._ref]…`, returned `null`. I tested it against the API before using it and replaced it with `event->colours[name == ^.colourName][0]`.

### Package versions added in Phase 3

| Package | Version | Where |
| --- | --- | --- |
| @sanity/workflow-engine | 0.35.0 | web |
| @owambe/workflows | workspace | web |
| vitest | 5.0.1 | web (dev) |
| tsx | 4.23.15 | web (dev, simulator) |

No Bachs SDK: the API is plain HTTPS and `fetch` is enough.

---

## Phase 4: the Coordinator Console (2026-09-28)

### What was built

- **`console/`, the App SDK Dashboard app**, with four views, tabbed:
  - **Live program.** Planned vs actual times for every segment, a running drift indicator, and Start/End buttons that write `actualStart`/`actualEnd`. Past 10 minutes late, an **Ask agent** button opens a dialog, starts a new `live-adjustment` workflow instance, and shows the proposal live as the agent writes it, with Approve/Reject buttons rendered straight from the engine's evaluation.
  - **Approvals.** Every workflow instance (program approval, live adjustments, aso ebi orders), grouped by kind, with who it's waiting on and its full history, resolved to names where the actor is a person.
  - **Aso ebi.** A board by stage (ordered → … → collected), totals collected per lot, and a flag on any order where Bachs recorded a payment the workflow hasn't taken (see "Rules the webhook applies" in Phase 3 — that state is real and needs a human to reconcile it).
  - **Arrivals.** Guest search by name or invite code with one-tap check-in, and vendor arrival.
  - Presence (`usePresenceForDocument`/`useReportPresence`) shows avatars of other coordinators looking at the same segment, order or guest.
- **A fourth workflow, `live-adjustment`** (`packages/workflows/src/live-adjustment.ts`, deployed v1): `proposing → awaiting-coordinator → applying → applied`, with `rejected`, `withdrawn` and `not-applied` off-ramps. Runs on a new document type, `programAdjustment`.
  - **Two effects**, not caller-fired actions: `propose-adjustment` (agent reads what's run, what's on, what's left and both families' rules, and writes a proposal) and `apply-adjustment` (writes the approved times to the real program items). Effects, not a direct API call from the button, because *something* has to run the agent's side asynchronously — the engine is a library that queues work and does nothing until a runtime drains it (docs: "Effects and runtimes"). A caller-fired action can't do async LLM work inline.
  - **Only a person can approve, reject or withdraw** (`PEOPLE_ONLY`, reused from Phase 2). The agent's propose and apply steps are `when: 'true'` effects, which the docs call "cascade-fired": "the engine fires it on truth… a consumer must not render it as a button." So there is no action the agent could be given even by mistake — it's structurally not caller-fired.
  - **The proposal is frozen** (a guard) between propose and apply, so what the coordinator approved is exactly what gets written.
  - **`packages/shared/src/live.ts`**: pure functions (`liveState`, `describeDrift`, `watTime`/`watDate`/`fromWat`) computing drift, what's running, what's next, and the projected finish from the program's items and the current time. Shared by the console and (in Phase 5) the public live program page, so both agree on what "running late" means. 11 tests, including an overrun, a gap, a skipped segment, and a segment that finished early.
- **`scripts/agent/adjust.ts`**: the two effect handlers, and everything around them — `buildContext` (what to tell the model: what's done, what's on, what's left, the earliest a segment can start, the program's own planned end), `validateAdjustment` (the model's answer is untrusted; checked against every rule below), and `planApply` (revision-checked writes, so applying twice, or applying after someone else moved a segment, does nothing or fails loudly instead of overwriting).
  - **Rules enforced in the validator, not just asked for in the prompt:** every segment still to come must appear, in order, once (no drop, no add, no reorder); no segment may run longer than planned or lose more than half its planned length; no segment may start earlier than its current planned start; the total cut may not exceed the lateness plus ten minutes of slack; the last segment must still end by the program's own planned finish.
  - **`scripts/agent/serve.ts`**: `pnpm agent serve` listens on the dataset (a Realtime API `listen` query, with a 30-second poll as a backstop) and drains newly-queued effects within about a second; `pnpm agent drain` does one pass and exits. This is the runtime the docs describe as something "you build around" the engine — there's no Sanity-hosted drainer without deploying a Sanity Function (see "Not built" below).
- **`scripts/rehearse.ts`**: `pnpm rehearse start [minutes]` shifts every segment's planned start by a fixed offset so the program starts a few minutes from now (the event is 12 December; the live program can't be demoed running on any other date) and clears actual times; `pnpm rehearse reset` restores the exact backup. Needed to demo or test the live program and live adjustments at all outside December.

### Schema decisions

- **`programAdjustment` is a document, not just workflow fields**, because the console, the agent and (potentially) a future public page all need to read the proposal without opening a workflow session, and because the segment changes are naturally an array of `{item, fromStart, fromDuration, toStart, toDuration}` — read comfortably with GROQ, same reasoning as Phase 2's "no `decision` document" but the other way: here the *content* (what changed) is what other surfaces need to read, and the *process* (who asked, who approved) is what the engine's history already owns. Nothing is duplicated: `programAdjustment` never stores a stage or a decision; those stay in the engine.
- **`segmentChange` keeps both the before and after.** Not required for `apply` to work (it re-reads current items anyway), but it's what makes the proposal readable after the fact, and what makes `apply` idempotent: writing a segment already at its proposed time is a no-op, so a retried effect (the docs promise at-least-once delivery) does nothing the second time.
- **`programAdjustment` is `readOnly` in the Studio.** It's written only by the console (create) and the agent (effects); a person editing it by hand would bypass the guard and the revision checks `planApply` relies on.

### Prompts

**Ask the agent to re-time (Prompt, `format: 'json'`, temperature 0.2), `scripts/agent/prompts.ts`:**

```text
You are the planning assistant for a Nigerian wedding reception coordinator. The reception is happening right now and is running late.
Re-time the segments that have not started yet so the day gets back on track.

It is now $now (West Africa Time). The program is running $drift.

What has already happened:
$done

On stage now:
$running

Still to come, in running order (key, planned start, planned minutes, whose tradition, notes):
$upcoming

The first segment still to come cannot start before $earliest.
The last segment must end by $finishBy, when the program was always planned to end.

The bride's family (Yoruba) non-negotiables:
$brideRules

The groom's family (Igbo) non-negotiables:
$groomRules

The coordinator's note: $note

Rules:
- Keep every segment still to come, in the same order. Both families approved this running order; you may not drop, add or reorder segments.
- You may shorten segments and move their start times. Never make a segment longer than planned, and never cut one below half its planned length.
- Cut only as much as the lateness needs: at most $maxCut minutes in total. Once the program is back on its planned times, leave the remaining segments exactly as planned.
- Never start a segment earlier than its planned start. Guests, vendors and the MC are working to those times.
- Protect segments that carry a family non-negotiable or a family's tradition; take time from general segments first (open dance floor, refreshments, photographs, announcements).
- Segments run back to back with no overlaps, in 24-hour West Africa Time "HH:MM".

Respond in JSON only, with exactly this shape:
{
  "summary": "Two or three sentences for the coordinator: what you shortened, what you protected, and when the program now ends.",
  "items": [
    {"key": "S1", "start": "HH:MM", "durationMinutes": 20}
  ]
}
List every segment still to come, by key, in order.
```

Retries reuse Phase 2's `RETRY_SUFFIX`, appending the validator's problems verbatim.

**How it did, on three real live runs (against a rehearsed program, real drift, real content):**
- **Run 1** (12 min late, before the cut-cap and no-earlier rules existed): accepted on attempt 3, having twice tried to lengthen the open dance floor beyond its planned length to make up time elsewhere — exactly the failure the validator exists to catch, and exactly why the cut-cap rule was added afterward.
- **Run 2** (14 min late, with the new rules): accepted on attempt 1. Cut exactly 14 minutes across four general segments (refreshments, meal service, photographs, closing announcements), left everything else untouched, and protected kola, the elders' service, the talking-drummer entrance, the family prayer and the parents' dance by name in its summary.
- **Run 3** (17 min late, full pipeline including approval): accepted on attempt 1, cut 17 minutes across four segments including the open dance floor, protected the same five family-tradition segments, and its summary stated the correct new end time. Approved by a real human CLI login, applied by the agent; the real program items now carry the new times until the coordinator (or `pnpm rehearse reset`) changes them again.

### Verified (commands actually run)

| Check | Result |
| --- | --- |
| `vitest` for `live-adjustment` (official test bench) | 10 pass. Includes: the agent cannot approve, reject or withdraw; the coordinator can withdraw while the agent works; the proposal is frozen once written; an empty proposal cannot be approved; a rejection needs a reason and changes nothing; approval queues the apply step and only then do segments move; a program that moved on before apply runs fails cleanly with the reason on the record. |
| Mutation checks | `PEOPLE_ONLY` weakened to `'true'`: 2 tests fail. The `has-changes` requirement weakened to `'true'`: 1 test fails. Both restored. |
| `vitest` for `packages/shared/src/live.ts` | 11 pass: on-time, late start carried forward, overrun, early finish, a gap before the next segment, a skipped segment, the projected and actual finish, midnight-crossing `fromWat`. |
| `vitest` for `scripts/agent/adjust.ts` | 20 pass, including three tests that run the **real handlers** (not stubs) through the bench with a scripted model: retries on a bad answer then succeeds; three bad answers in a row end the instance `not-applied` with the reason recorded; a segment starting between approval and apply blocks the write and the reason names which segment. |
| `vitest` for the console's read helpers (`lib/workflow.ts`, `lib/board.ts`) | 6 pass, against **real instance documents produced by the real definitions** on the bench (not hand-built fixtures): stage title, "waiting on", timeline text and actor attribution for a program mid family-review and an order awaiting payment; lot totals from a mix of paid and unpaid orders; the "needs review" flag. |
| `pnpm -r typecheck`, `pnpm -r test` | all 6 workspaces pass; 112 tests total |
| `sanity-workflows deploy --check`, `--dry-run`, then `deploy` | `live-adjustment v1` created; `program-approval v2` and `aso-ebi-order v1` unchanged |
| `sanity schemas deploy`, `sanity schemas extract && sanity typegen generate` | deployed; types regenerated (`ProgramAdjustment`, `SegmentChange` now in `sanity.types.ts`) |
| `sanity build` (studio, console) | both build |
| `sanity dev` for console (:3335) | serves HTTP 200 |
| **Live, against the real dataset** — first run | Rehearsed the program 45 minutes out. Ran the real propose effect with the real Agent Actions Prompt call (not a stub): drift 12 min, agent produced a valid re-timing on attempt 3 after twice trying to lengthen a segment (see Prompts, Run 1). |
| **Live — second run**, after adding the cut-cap and no-earlier rules | Fresh rehearsal, drift 14 min, accepted on attempt 1 (Run 2 above). |
| **Live — third run, the full pipeline** | `pnpm agent serve` started and confirmed listening. A real drift (17 min) and a real `programAdjustment` were created exactly as the console's "Ask agent" dialog does. `serve`'s **Realtime listener**, not a manual `drain` call, picked up the queued `propose-adjustment` effect within seconds and the agent produced a valid proposal (Run 3 above). `sanity-workflows fire-action` was used with the **already-authenticated human CLI login** (`sanity login`, done in Phase 1) to list the available actions — confirming only `approve`/`reject` are offered, never anything the agent's token could fire — then to fire `approve`. `serve` picked up the resulting `apply-adjustment` effect within seconds and applied it. |
| Live history of that run | `propose-adjustment` completed by actor `g-wR8d7ewDOtYd` (the agent's robot id), execution context `owambe-agent`/`drainer`. `approve` fired by actor `gX5n5nsYB` — a **human account id**, the same person who did the Phase 2 approvals — execution context `workflow-cli`/`cli`. `apply-adjustment` completed by the agent again. Final stage `applied`; the adjustment's `appliedAt` and the real program item's new `plannedStart`/`plannedDuration` are both written. |
| Cleanup after all of the above | Every test order (9, not the 6 the task note expected — see "A discrepancy found" below), every test `programAdjustment` and their workflow instances were deleted; `pnpm rehearse reset` restored the real program; two program items were left with stale actual times from a rehearsal-backup ordering mistake (see below) and were cleared by hand. Final state matches the original seed exactly (checked field by field) plus the two pre-existing `program-approval` instances from Phase 2. |

### A discrepancy found, and a mistake made and caught

- **The task note said six leftover `asoEbiOrder` test documents; the dataset had nine.** The extra three (`810fb76c…`, `8e71fd6d…`, `d7a52b65…`) aren't mentioned anywhere in this log's Phase 3 section, so they predate what was recorded there. Not investigated further — all nine were test artifacts (the seed script never creates `asoEbiOrder` documents; every order in the dataset came from live testing), so all nine and their workflow instances were deleted.
- **My own mistake: chaining two rehearsals without a full reset in between polluted the rehearsal backup.** The first live-adjustment test used `pnpm rehearse start`, which was correct. A later one-off verification script set `actualStart`/`actualEnd` directly on two program items (bypassing `rehearse.ts`) while the plan was back on its real December dates, producing a nonsensical multi-month "drift" (caught immediately: the number was obviously wrong, not silently accepted). Fixing that forward with `pnpm rehearse start` again captured those bad September timestamps into the *new* backup, because `rehearse.ts start()` backs up "whatever is there right now" — correct behavior for a backup tool, but "right now" was already dirty. The final `pnpm rehearse reset` therefore restored the plan correctly but also restored the two bad timestamps. Caught by re-querying the dataset after cleanup instead of trusting the reset had worked, and fixed by hand. **Lesson, added to how I'll run rehearsals going forward: verify the dataset is clean before trusting a `rehearse start`, not just after a `rehearse reset`.**

### Limitations and surprises

- **No Sanity Function deployed; `pnpm agent serve` is the effect runtime.** The docs' recommended production shape is a Document Function (drains effects the moment they're queued) plus a Scheduled Function (ticks instances and sweeps stale claims on a cron). Both need a Blueprint, a robot token defined through Blueprints, and — for the scheduled half — an organization-scoped stack; Scheduled Functions on the free plan run at most daily, which would make the "ask agent" flow wait up to a day if the polling backstop were the only recovery path. Since this is a demo, not a production deployment, `pnpm agent serve`'s Realtime listener plus a 30-second backstop poll is the honest substitute: it drains within about a second when running, same as a Document Function would, but it's a process someone has to start, not infrastructure Sanity hosts. **This has to be running for "Ask agent" to do anything** — the console's dialog and the workflow instance it starts work with or without it, but the proposal never arrives until something drains the effect.
- **The App SDK client used by `useWorkflowEngine` authenticates as the signed-in Dashboard user**, so every action a coordinator fires in the console is attributed to them by their real Sanity account — there is no separate "coordinator" robot identity, unlike the agent, the web server and the payments webhook. This is correct per the brief ("only people approve") and was proven with a real human CLI login in the live run above, not assumed.
- **The Studio's own presence and the console's presence share one room** (the docs say so explicitly), so a person with the Studio open and a coordinator in the console watching the same guest or segment see each other. Not independently verified — would need two signed-in sessions open at once, which needs the project owner.
- **The Workflows App SDK docs' own example uses a separate `workflows` dataset** (`ENGINE_DATASET = 'workflows'`); this project's engine lives in `production` (Phase 2 decision, unchanged), so `WORKFLOW_RESOURCE` in `console/src/config.ts` points at `production`, not a second dataset.
- **`Sanity UI`'s `Grid` component's `gridTemplateColumns` prop only accepts a column *count* (`number | number[]`), not a CSS template string**, despite the name — found by a typecheck failure, not by reading the source first. The three places needing an asymmetric layout (the approvals list-plus-detail split, the arrivals two-column layout, the aso ebi board's per-stage columns) use a plain `Box` with an inline `style={{display: 'grid', gridTemplateColumns: '…'}}` instead.
- **Presence, live edits (`liveEdit: true`) and the `useDocuments`/`useQuery` hooks were not tested against two simultaneous browser sessions** — only against the dataset directly and against `sanity dev`'s HTTP response. Visual confirmation that the four views render correctly inside the Dashboard, and that two coordinators actually see each other, needs the project owner signed in, exactly as Phase 1's console check did.
- **The board's "needs review" flag and the order-payment mismatch table from Phase 3 were not re-exercised live** in this phase; the flag's logic (`lib/board.ts`) is unit-tested but the phase 3 webhook edge cases it reads (a payment recorded after the order moved on) weren't re-triggered here.

### Package versions added in Phase 4

| Package | Version | Where |
| --- | --- | --- |
| @sanity/workflow-sdk | 0.35.0 | console |
| @sanity/workflow-react | 0.35.0 | console |
| @sanity/workflow-components | 0.35.0 | console |
| @sanity/workflow-diagram | 0.35.0 | console |
| @sanity/workflow-engine-test | 0.35.0 | console, scripts (dev) |
| @owambe/workflows | workspace | console, scripts |
| vitest | 5.0.1 | console (dev) |

No new environment variables: the console still authenticates as the signed-in Dashboard user (no token), and the agent's `serve`/`drain` commands reuse `SANITY_AGENT_TOKEN` from Phase 2.

### A real bug found after handoff, in `rehearse.ts`, and fixed

The project owner tried the console after this phase's report, found the drift number was nonsense (they'd clicked Start on a segment before ever running a rehearsal — the December-dated demo event will always do that outside a rehearsal, expected), then hit `pnpm rehearse start` refusing to run ("A rehearsal is already running") because an earlier attempt had left a backup file behind, and after `pnpm rehearse reset` the actual times were *still* wrong.

That last part was a genuine bug in the tool, not user error: `rehearse.ts` backed up and restored `actualStart`/`actualEnd` alongside `plannedStart`/`plannedDuration`, on the theory that `reset` should put back "exactly what was there before." But "what was there before" could itself already be test data — if anyone clicks Start/End on a segment before ever running `rehearse start`, those timestamps get captured into the backup as if they were the real original state, and `reset` faithfully restores them. This is precisely the mistake logged above under "A mistake made and caught" during this phase's own live verification — I hand-patched the *data* each time it happened, but never fixed the *script*, so the same failure was waiting for the next person to hit it. It did, within minutes of handoff.

**The fix:** `rehearse.ts` no longer tracks `actualStart`/`actualEnd` at all. A rehearsal is explicitly a sandbox for trying Start/End freely, so both `start` and `reset` now unset them unconditionally, regardless of what existed before. Only `plannedStart`/`plannedDuration` — the fields a human actually edits deliberately, not the ones a coordinator clicks through while testing — are backed up and restored. Verified live: started a rehearsal, simulated a Start click mid-rehearsal (an `actualStart` with no matching `actualEnd`, the messiest case), ran `reset`, and confirmed by querying the dataset directly that both fields came back `null` and `plannedStart` was exactly the original December value. Also cleared three items left over from the pre-fix bug (found the same way: querying for any `programItem` with a defined `actualStart` or `actualEnd`).

**Lesson:** "restore exactly what was there before" is only a safe design when "before" is known to be clean. A tool whose job is to let someone experiment freely should reset to a *known-good* state, not to whatever the database happened to contain at the moment it was invoked.

## Phase 5: the public site (2026-09-28)

### What was built

- **Shared header and footer** on every page (Program, Aso ebi, How it works). Existing tokens in `globals.css` kept: warm paper, near-black ink, hairline `line`, one emerald accent, dark mode, Bricolage Grotesque, `tabular` for times and Naira.
- **`/program`**: the live program. Server-fetched through `sanityFetch` (next-sanity live), so it refetches when the coordinator presses Start or End in the console. The drift, "on now", "next" and projected finish come from the same `liveState` in `packages/shared/src/live.ts` the console uses, so the two can't disagree. The clock only starts in the browser (every 30 s), so the server render never shows a time that differs from the guest's phone.
- **`/i/[code]`**: the personal invite. Invalid codes 404 before any query. The language switcher shows only translations a person has marked reviewed; today none are, so guests see English only, which is the intended behaviour, not a gap in the page. RSVP is a server action using `SANITY_API_WRITE_TOKEN`; the invite code is the only credential, as on the printed card.
- **`/how-it-works`**: every deployed workflow definition (latest version) drawn as stages with each action, who may fire it (read from the definition's actual `filter`, not written by hand), and each transition; then every run with its real history. Each run is read against its own pinned `definitionSnapshot`, so older runs keep their own stage and action titles.
  - Workflow documents are **not** publicly readable (confirmed: an anonymous query for `sanity.workflow.instance` returns 0), so this page reads them server-side with `SANITY_API_READ_TOKEN` and `revalidate = 60`. It is the one page that is not live-updating.
  - No account ids are published. Actors are shown as "The agent", "The website server", "The Bachs payment webhook", or "A signed-in person, for <name they gave>". The agent is recognised by its execution context (`owambe-agent`), not a hard-coded id.
- **Home** links to the three pages. **Aso ebi** pages got the header; their layout is unchanged from Phase 3.
- `PROGRAM_QUERY` and `INVITE_QUERY` added to `packages/shared/src/queries.ts`; types regenerated.

### Verified (commands actually run)

| Check | Result |
| --- | --- |
| `pnpm --filter @owambe/web typecheck` | passes |
| `pnpm --filter @owambe/web test` | 29 pass, including 4 new for `lib/workflow/history.ts`: agent named with its note, a rejection reason kept once with who it was for and no account id, transitions shown, `whoCanAct` reading the real deployed filter strings |
| HTTP against the dev server, real dataset | `/`, `/program`, `/i/kzfr2r`, `/how-it-works`, `/aso-ebi` all 200; `/i/zzzzzz` 404. Invite shows Femi Adeyemi, 2 seats, table 3. How it works shows definition v2 of the program approval, 2 runs, and the agent's real "Version 2" drafting note. |

### Not verified yet

- **Not looked at in a browser by me.** Checked by server HTML only; the layout, dark mode, the live update on `/program` while someone presses Start in the console, and the RSVP round trip need a person to click through.
- **The RSVP server action has not been fired.** It would change seed data (a real guest's reply), so I left it for the owner to try.

### Limitations and things to decide

- **Test data is visible on How it works.** The real history includes Phase 2's test rejection "they are not fit for each other", made on behalf of "lawrence", and a second, older program-approval run. It is real history, so the page shows it as is; whether to leave it, or clear it and re-run the approval with in-character reasons before submitting, is the owner's call.
- **"Submit to both families" shows as "Anyone with access"** because that action has no filter: the agent and people deliberately use the same transition. Accurate, just worth knowing.

### Found after handoff: paying locally failed again, for the Phase 3 reason

The owner tried to pay and got "We could not open the payment page". Called Bachs directly with the same request: `400 VALIDATION_ERROR, success_url must be a publicly accessible URL (localhost is not allowed)`. The same limitation as Phase 3, where a placeholder domain was used and the redirect never tested. This time the fix is a real one for local testing: a public tunnel in front of the local dev server, with `NEXT_PUBLIC_SITE_URL` set to its address and a matching entry in `allowedDevOrigins` in `web/next.config.ts` so Next dev serves through it. First tried with a Cloudflare quick tunnel; the owner then switched to Outray (`https://unemotional-false.outray.app`), which needed the same two changes. Verified against both: Bachs returned `201`, status `open`, for a checkout using each tunnel's URL. The tunnel's address changes each time it starts (or, for Outray, whenever a new one is created), so `.env.local` must be updated with it; the deployed site (Phase 6) won't need any of this.

The owner then paid for real through the Outray URL and the order sat on "Waiting for Bachs". Bachs showed the checkout `completed` and the charge `succeeded`; the order had no `paidAt`. Cause: `bachs listen` was not running (the CLI had been installed under `/tmp`, which had since been cleared), so the signed `collection.succeeded` event had nowhere to go on this machine. Reinstalled `@bachs/cli` there, started `bachs listen` (it issued a new signing secret, put into `BACHS_WEBHOOK_SECRET`), and replayed the missed event with `bachs events replay`. Verified in the dataset: the order got `paidAt`, and its workflow moved `awaiting-payment → paid`, with the transition attributed to execution context `bachs-webhook`. **`bachs listen` must be running during any local payment test or demo recording**; the deployed site will use a registered webhook endpoint instead.

## Phase 6: clean data, deploy, README (2026-09-28)

### Test data cleared, one clean run started

- `pnpm rehearse reset` restored the program's saved plan and cleared every actual time.
- Deleted every `asoEbiOrder`, `programAdjustment` and `sanity.workflow.instance` (8 documents): all were test runs, including Phase 2's test rejection ("they are not fit for each other"), Phase 4's live adjustment and the owner's paid test order. Checked afterwards: none left, no program item with an actual time.
- `pnpm agent draft` started a fresh program approval. The agent drafted version 4 (20 segments, accepted on the first attempt) and submitted it; it waits in family review. Approving or rejecting is left to people, as the workflow requires.
- **Open question, not changed by me:** the event's `date` was set to `2026-10-07` in Studio on 2026-09-28, while the English invite message still says Saturday 12 December 2026. The agent drafted version 4 against the event's date, so the program runs on 7 October. One of the two needs to change before submission.

### Deployed

| What | Where | How |
| --- | --- | --- |
| Public site | https://owambe-desk.netlify.app | `npx netlify-cli deploy --build --prod --filter @owambe/web` from the repo root |
| Studio | https://owambe-desk.sanity.studio | `npx sanity deploy` (appId saved in `studio/sanity.cli.ts`) |
| Coordinator console | Sanity Dashboard, "Owambe Desk Console" | `npx sanity deploy` (title and appId saved in `console/sanity.cli.ts`) |
| Bachs webhook | `https://owambe-desk.netlify.app/api/webhooks/bachs`, endpoint `whe_d6c0df0f…` | `bachs endpoints create`, sandbox |

All ten variables from `web/.env.example` are set in Netlify, with `NEXT_PUBLIC_SITE_URL` set to the Netlify address. Bachs stays on sandbox keys on purpose (the owner's decision): it is a demo.

### Problems hit while deploying

- **The first Netlify deploy "succeeded" and served 404 on every page.** With `netlify.toml` inside `web/`, the CLI treated the repo root as the project and uploaded no functions ("requesting 0 files"). Fixed with `netlify.toml` at the root (`base = "web"`, `publish = "web/.next"`) and `--filter @owambe/web`. `publish` resolves from the repo root in this setup, not from `base` (`.next` alone failed with "publish directory not found").
- **The first build failed with a 403 fetching Netlify extensions**, straight after `netlify login`. The identical command worked on retry.
- **`netlify env:set` silently did nothing the first time.** In a monorepo it stops at an interactive "which project?" prompt. It reported nothing useful, and `env:get` showed the value was never saved. Rerun with `--filter @owambe/web`, then checked the stored value.
- **The webhook signing secret can't be read through the API** (our key lacks `webhooks:read`; Bachs shows it only in the Developer Portal). The owner copied it from the portal; the first deploy had the local `bachs listen` secret, which would have rejected every real delivery to the live site.

### Verified on the live site

| Check | Result |
| --- | --- |
| `/`, `/program`, `/i/kzfr2r`, `/how-it-works`, `/aso-ebi` | all 200; the invite shows Femi Adeyemi; `/i/zzzzzz` is 404 |
| How it works | reads workflow history with the server token: shows the fresh "Program of events, version 4" run |
| Webhook, unsigned | 401 `Invalid signature` |
| Webhook, signed with the portal secret (a deliberately fake event) | passes the signature check, then 400 `Not a Bachs event`: proves the stored secret matches |

### Not verified yet

- **The deployed console opened in the Dashboard.** Deployed successfully; needs the owner signed in to look at it.

### Settled after the owner's review

- **Event date: 12 December 2026.** The owner had set 7 October while testing. The contest closes on 4 October, but judges review after that, and a date during judging would make the live program page look stale. December matches the invite message, all three translations and the seed. Set the date back, deleted the approval run drafted against 7 October, and had the agent redraft: version 5, 20 segments, accepted on the first attempt, now in family review. The first segment is at 14:00 WAT on 12 December; no orphaned program items.
- **A real payment on the live site: done by the owner.** Sandbox checkout on `owambe-desk.netlify.app`, paid, and the order reached Paid through the registered endpoint with nothing running locally. That order and its run are kept on purpose: it is genuine history for How it works (a payment moved by the webhook, not a person).
- **Deployed console opened by the owner in the Dashboard:** loads and works.

### Found while recording the demo: the live program was not live in production

Recording a GIF of `/program` following the coordinator, the deployed page never changed. Two separate causes, both invisible locally:

1. **CORS.** Sanity's live-events connection failed in the browser (`TypeError: Failed to fetch`) because `https://owambe-desk.netlify.app` was not in the project's CORS origins (only localhost ones were). Added the origin without credentials (the public site never needs them). Checked: the browser now gets `200 text/event-stream`, and events arrive when a document changes.
2. **A stale prerendered page.** `/program`, `/aso-ebi` and `/` were prerendered at build time. `/program` was serving HTML about 7.7 hours old, and the tag-based refresh did not replace it. Set `dynamic = 'force-dynamic'` on those three pages so they render on each request. Checked: the served HTML then showed current data, and with the page open a segment change moved "On now" without a reload.

The Phase 5 entry said `/program` was live-updating. That was only true on the developer machine until this fix. Recorded here rather than edited out. `/how-it-works` stays cached for 60 seconds on purpose (`revalidate = 60`, it reads private workflow documents), and `/i/[code]` and the order page were already dynamic.

The demo GIFs (`docs/demo/`) were recorded from the deployed site using `pnpm rehearse` and reset afterwards. Checked: no program item has an actual time, and the plan is back on 12 December.

### The demo approval loop, run end to end (2026-09-29)

Run by the owner through Studio, with the agent run from the CLI. Real history on the live dataset:

1. Version 5 drafted by the agent. Both families approved it, by mistake, so it reached **Ready for print**. Approvals can't be withdrawn one at a time, so the way back was the designed one: the coordinator **locked** it and **reopened it with a reason** (the palm wine request), which sent it to Drafting. That is the brief's "edits after the lock go through a transition" rule, used for real.
2. Version 6 drafted. Bride's family approved; groom's family **rejected** it with the reason: palm wine for the elders must be its own line, straight after the kola.
3. `pnpm agent draft` redrafted against that reason. **Version 7** (21 segments, accepted on the first attempt) has "Palm wine for the elders" as its own 10-minute segment directly after "Breaking of kola nut (Oji)", before the elders' food service. Checked in the dataset, not assumed.

Two small things: the rejection reason shows a leading "> " because it was pasted from a quoted block; and the console's home text still said the views "arrive in the next phases", a leftover from Phase 1. Fixed and redeployed.
