---
title: Owambe Desk: running a Nigerian wedding on Sanity Workflows
published: false
tags: devchallenge, sanitychallenge, sanity, nextjs
---

*This is a submission for the DEV x Sanity Challenge, Path Two: Vibe-Code Something Strange.*

## What I built

A big Nigerian wedding, an owambe, already runs on approvals. Nobody calls them that, but they are.

Both families have to agree on the program of events before it goes to the printer. In a Yoruba and Igbo union that is a real negotiation. The groom's family wants the kola nut broken before anyone eats. The bride's family wants their prayer before the cake is cut. Guests buy aso ebi, the matching fabric each side wears, and they have to pay before it goes to the tailor. Then on the day the coordinator runs the program live, and it always runs late.

Owambe Desk writes those processes down as Sanity Workflows, stored in the same dataset as the content they move. An AI agent drafts the program from the couple's brief and both families' non-negotiables. People approve or reject it. A payment webhook confirms aso ebi money. When the day runs late, the agent proposes a re-timing and the coordinator decides. They all move work through the same transitions, and the definition itself says who may fire each one. The agent cannot approve anything. The tests check that, and when I deliberately weakened the rule, they failed.

The demo wedding is fictional: Tolu Adeyemi and Emeka Okafor, Asaba, Delta State, 12 December 2026.

## Demo

- Public site: https://owambe-desk.netlify.app
- Start here, it was built for judges: https://owambe-desk.netlify.app/how-it-works
- A guest's invite: https://owambe-desk.netlify.app/i/kzfr2r
- Live program: https://owambe-desk.netlify.app/program
- Code: https://github.com/dev-lawrence/owambe-desk
- Build log: https://github.com/dev-lawrence/owambe-desk/blob/main/BUILD_LOG.md
- Sanity project ID: `qyn1i646`
- Public dataset: `production`. Try it with no token:
  `https://qyn1i646.apicdn.sanity.io/v2026-09-24/data/query/production?query=*[_type=="event"][0]{title,date,city}`

![How it works: the deployed workflow, then a real run's history](https://raw.githubusercontent.com/dev-lawrence/owambe-desk/main/docs/demo/how-it-works.gif)
![The live program page following the coordinator, with no reload](https://raw.githubusercontent.com/dev-lawrence/owambe-desk/main/docs/demo/live-program.gif)

You can't sign in to our Sanity Dashboard, so the public site has to prove the system works without a login. How it works reads the deployed workflow definitions and draws each stage, each action, and who is allowed to fire it. That "who" comes from the definition's real filter, not from text I typed. Under that is every run with its full history: what the agent submitted and why, which family rejected and their reason, and which payment the webhook confirmed.

## How I built it

It's a pnpm monorepo with four parts.

**Studio.** 9 document types and 5 object types. Every field has a description saying why it exists. Family non-negotiables live on a `familySide` document, because the agent has to read them every time it drafts. The brief asked for a `decision` document type. I dropped it, because the Workflows engine already stores every decision with its actor, and a second copy could only drift from the first.

**Three workflows.**

1. *Program approval.* Drafting, then family review as two parallel activities, one per family, then ready for print, then locked. It only reaches ready for print when both sides approve the same version. A rejection needs a reason and sends the program back to drafting, and the agent redrafts against that reason. Guards freeze the program while families review it, so nobody can edit the version they are voting on.
2. *Aso ebi order.* Ordered, awaiting payment, paid, with tailor, ready, collected. Only a robot token can confirm payment, and only after verified payment facts are written to the order. A person can't click an order to paid.
3. *Live adjustment.* The coordinator asks for a re-timing from the console. The agent proposes one, the coordinator approves or rejects, and only then does the agent apply it.

**The agent.** A small TypeScript runner using Agent Actions. Generate drafts the program. Transform redrafts it after a rejection. Translate turns the invite into Yoruba, Igbo and Nigerian Pidgin. I can't judge Yoruba or Igbo, so every translation is stored unchecked. Guests only see a language after a fluent person switches it on and names who checked it. A validator checks every answer the model gives: no overlapping segments, nothing before noon or after 22:00, and a written rules check showing how each family non-negotiable is met. On a bad answer the agent retries with the validator's exact complaints.

**Coordinator console.** An App SDK app in the Sanity Dashboard, built with Sanity UI. It has four views: live program with drift, approvals, an aso ebi board, and arrivals. Presence is wired in so two coordinators on the same guest can see each other. I only tested it against the dataset, not with two people signed in at once.

**Public site.** Next.js with next-sanity live content, Tailwind v4 and Bricolage Grotesque. Payments go through Bachs hosted checkout, in sandbox. The webhook verifies the signature, is idempotent, and moves the order's workflow itself.

## What went wrong

The build log is honest about this, so here are the parts I'd want to know as a judge.

- The first Netlify deploy "succeeded" and served a 404 on every page. In a monorepo the CLI uploaded zero files and said nothing was wrong.
- Bachs refuses localhost redirect URLs. So during development a real payment went through, and the order sat on "Waiting for Bachs" because the webhook had nowhere to land. The fix was a public tunnel for the redirect and `bachs listen` for the webhook.
- A rehearsal tool I wrote to demo the live program "restored" test timestamps as if they were real data. I fixed the data by hand twice before fixing the script.
- My plan has no custom roles, so "only the bride's family can approve for the bride's family" is recorded, not enforced. Each approval stores the account that clicked and whom they spoke for. A real deployment needs a Sanity account per approver.
- The agent's first live re-timing tried twice to lengthen the dance floor to make up time elsewhere. The validator caught it both times, and I added a rule that it may only cut as much time as the day is late.

## What I'd do next

Give each family approver their own account, run the agent on a Sanity Function instead of a process someone has to start, and try it on a real wedding with a real coordinator who will tell me everything that's wrong with it.

Built with Claude Code as my pair. Every limitation and every "not verified" is in the [build log](https://github.com/dev-lawrence/owambe-desk/blob/main/BUILD_LOG.md).
