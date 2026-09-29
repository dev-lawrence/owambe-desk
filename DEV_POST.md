---
title: Owambe Desk: running a Nigerian wedding on Sanity Workflows
published: false
tags: devchallenge, sanitychallenge, sanity, nextjs
---

*This is a submission for the DEV x Sanity Challenge, Path Two: Vibe-Code Something Strange.*

## What I built

**Owambe Desk is a tool for planning and running a big Nigerian wedding.**

In Nigeria, a big wedding party is called an owambe. Often hundreds of guests come, and a lot of people have to agree on things before the day. Owambe Desk handles the three that cause the most trouble.

**1. Both families must agree on the program.**
The program is the order of the day: who speaks, when the food comes, when the couple dances. In a union between two tribes, each family has traditions it will not bend on. The groom's family may want the kola nut broken before anyone eats. The bride's family may want their prayer before the cake is cut. Here, an AI agent writes the first draft from the couple's brief and both families' rules. Each family then approves it or rejects it with a reason. If one rejects, the agent rewrites it using that reason. The program is only ready to print when both families have approved the same version.

**2. Guests must pay for their aso ebi before it goes to the tailor.**
Aso ebi is the matching outfit fabric that guests wear. A guest picks a fabric on the website and pays online. The moment the payment provider confirms it, the order is marked as paid by itself. Nobody clicks "paid" by hand. Then the coordinator sends the fabric to the tailor.

**3. The coordinator runs the day live, and the day runs late.**
The coordinator taps Start and End as each part happens. The public website shows what is on now and what is next, and it updates by itself, so a guest in the car park can check. If the day falls more than 10 minutes behind, the coordinator can ask the agent to suggest a new timing. The agent only suggests. The coordinator decides.

**One rule runs through all of it: the AI agent can help, but only people can approve.**
The agent can draft, rewrite and suggest. It cannot approve a program, and it cannot mark an order paid. This is not just hidden in the buttons. It is written into the rules of each process, and tests check it.

**How it is built, in one paragraph.**
Each process above is a Sanity Workflow, which is a set of steps and rules that lives in the same database as the content. The public website is Next.js. The coordinator's screen is a custom app inside the Sanity Dashboard. Payments go through Bachs. The full technical story is further down.

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
