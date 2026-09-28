# Owambe Desk

Planning and live coordination for a big Nigerian wedding, built on Sanity. The couple, both families, the coordinator, vendors and an AI agent all work on the same content. The approvals that already exist in real life (both families agreeing the program, guests paying for aso ebi before it goes to the tailor) are modelled as Sanity Workflows.

Demo event (fictional): the wedding reception of Tolu Adeyemi and Emeka Okafor, Asaba, Delta State.

- **Sanity project ID:** `qyn1i646`
- **Public dataset:** `production`. Try it without a token:
  `https://qyn1i646.apicdn.sanity.io/v2026-09-24/data/query/production?query=*[_type=="event"][0]{title,date,city}`

## Live

| What | Where |
| --- | --- |
| Public site | https://owambe-desk.netlify.app — start at [How it works](https://owambe-desk.netlify.app/how-it-works) |
| A guest's invite | https://owambe-desk.netlify.app/i/kzfr2r |
| Live program | https://owambe-desk.netlify.app/program |
| Studio | https://owambe-desk.sanity.studio (needs a project login) |
| Coordinator console | Sanity Dashboard app "Owambe Desk Console" (needs an organization login) |
| Source | https://github.com/dev-lawrence/owambe-deskt |

Judges can't sign in to our Dashboard, so the public site is built to show the system working without a login: How it works reads the real workflow definitions and every run's history.

See [BUILD_LOG.md](./BUILD_LOG.md) for how it was built, including what didn't work.

## Repo

| Path | What |
| --- | --- |
| `studio/` | Sanity Studio: schema, Workflows plugin |
| `web/` | Next.js public site |
| `console/` | App SDK coordinator console (runs in the Sanity Dashboard) |
| `packages/shared/` | Shared vocabularies, money helpers, GROQ queries, generated types |
| `packages/workflows/` | Workflow definitions, tests (official test bench), deploy config |
| `scripts/` | Seed script, agent runner, rehearsal script |

## Setup

Requires Node 22.12+ and pnpm 11.

```sh
pnpm install
cp scripts/.env.example scripts/.env.local   # add an Editor token
cp web/.env.example web/.env.local           # add Viewer/Editor tokens
pnpm dlx sanity@6.16.0 login                 # for the Studio and console CLIs
```

### Environment variables

| App | Variable | Notes |
| --- | --- | --- |
| scripts | `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_VERSION` | project, dataset, pinned API date |
| scripts | `SANITY_API_WRITE_TOKEN` | Editor token, server only |
| scripts | `SANITY_AGENT_TOKEN` | Robot token used only by the agent, so its moves are attributed to it |
| scripts | `SANITY_SCHEMA_ID` | Deployed schema id for Agent Actions (`sanity schema list`) |
| web | `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION` | publishable |
| web | `SANITY_API_READ_TOKEN` | Viewer token, server only |
| web | `SANITY_API_WRITE_TOKEN` | Editor token, server only (RSVPs, orders) |
| web | `BACHS_SECRET_KEY`, `BACHS_WEBHOOK_SECRET` | Bachs sandbox keys, server only (Phase 3) |
| web | `NEXT_PUBLIC_SITE_URL` | used for checkout redirects |
| studio | `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET` | optional overrides |
| console | none | authenticates as the signed-in Dashboard user |

## Run

```sh
pnpm seed             # seed the demo wedding (add --reset to replace existing data)
pnpm dev:studio       # http://localhost:3333
pnpm dev:web          # http://localhost:3002 (pinned: CORS and Bachs redirects expect it)
pnpm dev:console      # opens in the Sanity Dashboard (the CLI prints the URL)
pnpm typecheck        # all workspaces
pnpm test             # all test suites
pnpm agent draft      # the agent drafts (or redrafts after a rejection) and submits to both families
pnpm agent status     # where the program's approval is, and its history
pnpm agent translate  # translate the invite into Yoruba, Igbo and Pidgin (unchecked until a person reviews)
pnpm agent preview-redraft "reason"   # how the agent would redraft; writes nothing
pnpm agent serve      # run the agent's live-adjustment effect runtime (needed for "Ask agent" in the console)
pnpm agent drain      # one pass over waiting live-adjustment work, then exit
pnpm rehearse start [minutes]   # shift the program to start [minutes] from now, so the live program and live adjustments can be tried outside 12 December
pnpm rehearse reset   # restore the real plan
pnpm --filter @owambe/workflows deploy   # deploy workflow definitions (sanity-workflows deploy)
pnpm --filter @owambe/studio typegen   # regenerate query types after schema/query changes
```

Demo invite codes from the seed: `/i/kzfr2r` (Femi Adeyemi), `/i/h5xfne` (Mrs Yetunde Balogun). Open either one to see the invite and reply.

## Try the program approval (Workflow 1)

1. `pnpm agent status` shows the running approval and its history. The agent has already drafted and submitted, so it is in **family review**.
2. Open the Studio, go to **Programs of events**, open the program and select the **Workflows** view.
3. As the bride's family, **Approve** (give the approver's name in "On behalf of"). The program stays in family review: one family is not enough.
4. As the groom's family, **Reject with reason**. The program goes back to drafting with the reason attached.
5. `pnpm agent draft`: the agent redrafts against the reason and resubmits through the same transition.
6. Approve as both families, then **Lock**. To change a locked program, **Reopen** it with a reason.

The agent can't approve, reject, lock or reopen. The definition refuses its token, and `packages/workflows` has tests for that.

## Try aso ebi payments (Workflow 2)

**With Bachs sandbox (the real thing):**
1. In the Bachs dashboard, switch to **Sandbox** and create a secret key (`sk_sandbox_...`) with the payments scope. Put it in `web/.env.local` as `BACHS_SECRET_KEY`.
2. Install the Bachs CLI and forward webhooks to the site: `bachs listen --forward-to localhost:3002/api/webhooks/bachs --events collection.succeeded,collection.failed,checkout.expired`. Copy the `whsec_...` it prints into `BACHS_WEBHOOK_SECRET`, then restart `pnpm dev:web`.
3. Open http://localhost:3002/aso-ebi, enter an invite code (for example `kzfr2r`), choose a fabric, and pay on the Bachs sandbox checkout.
4. The order page switches to **Paid** by itself when Bachs's signed webhook arrives.

**Without Bachs (local simulator: real route, signature check, workflow and dataset; simulated Bachs):**
```sh
pnpm --filter @owambe/web simulate order kzfr2r      # prints an order id and its page URL; open it
pnpm --filter @owambe/web simulate forged <id>       # unsigned "payment": refused with 401
pnpm --filter @owambe/web simulate pay <id>          # signed payment: the open page turns to Paid
pnpm --filter @owambe/web simulate expire <id>       # (on another order) back to ordered, "Pay now"
```

## Try the coordinator console (App SDK)

`pnpm dev:console` opens the console in the Sanity Dashboard, signed in as your own Sanity account. It has four tabs:

- **Live program.** Every segment, planned vs actual, with a drift indicator. Start and End buttons write the actual times. The event is 12 December, so to see drift with today's date: `pnpm rehearse start` shifts the program to start two minutes from now (restore the real plan afterwards with `pnpm rehearse reset`).
- **Approvals.** Every workflow instance — the program approval, aso ebi orders, live adjustments — with who it's waiting on and its full history.
- **Aso ebi.** Orders by stage, totals collected per lot.
- **Arrivals.** Guest check-in by name or invite code, vendor arrival.

To try **Ask agent** (the live program running more than 10 minutes late):
1. `pnpm rehearse start` (or wait for the program to fall behind on its own).
2. In another terminal, `pnpm agent serve` — this has to be running for the agent to pick up the request; the console button only queues it.
3. In the console's Live program tab, start a couple of segments late so the drift passes 10 minutes, then click **Ask agent**.
4. The agent's proposal appears on the card within a few seconds — what it re-timed, what it protected, and its summary.
5. **Approve** (as yourself) and the agent applies the new times to the real program items, or **Reject with reason** and nothing changes.

The agent can never approve, reject or withdraw — same rule as the program approval, enforced in the workflow definition (`packages/workflows/src/live-adjustment.ts`), not just the UI.

## Deploy

- **Public site (Netlify):** from the repo root, `npx netlify-cli deploy --build --prod --filter @owambe/web`. Config is in `netlify.toml` (base `web`). Every variable in `web/.env.example` is set in Netlify, with `NEXT_PUBLIC_SITE_URL=https://owambe-desk.netlify.app`.
- **Bachs webhook:** a registered endpoint at `https://owambe-desk.netlify.app/api/webhooks/bachs` (events `collection.succeeded`, `collection.failed`, `checkout.expired`). Its signing secret, from the Bachs Developer Portal, is `BACHS_WEBHOOK_SECRET` in Netlify.
- **Studio:** `cd studio && npx sanity deploy`.
- **Console:** `cd console && npx sanity deploy`.
- **Local payment testing:** Bachs refuses `localhost` redirect URLs. Put the site behind a public tunnel, set `NEXT_PUBLIC_SITE_URL` to it, and run `bachs listen --forward-to localhost:3002/api/webhooks/bachs` for the webhook.
