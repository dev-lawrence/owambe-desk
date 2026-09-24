# Owambe Desk

Planning and live coordination for a big Nigerian wedding, built on Sanity. The couple, both families, the coordinator, vendors and an AI agent all work on the same content. The approvals that already exist in real life (both families agreeing the program, guests paying for aso ebi before it goes to the tailor) are modelled as Sanity Workflows.

Demo event (fictional): the wedding reception of Tolu Adeyemi and Emeka Okafor, Asaba, Delta State.

- **Sanity project ID:** `qyn1i646`
- **Public dataset:** `production`. Try it without a token:
  `https://qyn1i646.apicdn.sanity.io/v2026-09-24/data/query/production?query=*[_type=="event"][0]{title,date,city}`

See [BUILD_LOG.md](./BUILD_LOG.md) for how it was built, including what didn't work.

## Repo

| Path | What |
| --- | --- |
| `studio/` | Sanity Studio: schema, (later) workflow definitions |
| `web/` | Next.js public site |
| `console/` | App SDK coordinator console (runs in the Sanity Dashboard) |
| `packages/shared/` | Shared vocabularies, money helpers, GROQ queries, generated types |
| `scripts/` | Seed script, (later) agent runner |

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
pnpm dev:web          # http://localhost:3000
pnpm dev:console      # opens in the Sanity Dashboard (the CLI prints the URL)
pnpm typecheck        # all workspaces
pnpm --filter @owambe/studio typegen   # regenerate query types after schema/query changes
```

Demo invite codes from the seed: `/i/kzfr2r` (Femi Adeyemi), `/i/h5xfne` (Mrs Yetunde Balogun). The invite page comes in Phase 5.
