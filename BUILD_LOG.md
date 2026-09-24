# Owambe Desk: build log

A running, honest record of how this was built for the DEV x Sanity Challenge (Path Two). Each phase records what was built, what I decided and why, what went wrong, and what I could not verify. Nothing is marked as working unless it was run.

- Sanity project ID: `qyn1i646`
- Content dataset: `production` (public, read without a token)
- Workflow engine dataset: `workflows` (private, created for Phase 2)

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

### Not verified yet

- **Studio UI and the console inside the Dashboard.** The browser I can drive can't sign in to Sanity, so I have not seen either one rendered with a logged-in user. They build, typecheck and serve, but a person has to open `http://localhost:3333` and `https://www.sanity.io/@oH7TaXCA4?dev=http%3A%2F%2Flocalhost%3A3334` and confirm. I'll check both as soon as a signed-in session is available.

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
