/**
 * Who may fire an action, expressed over the identity the engine resolves from the caller's token.
 *
 * `$actor.kind` is the engine's intended signal, but in @sanity/workflow-engine 0.35.0 every real
 * token resolves to kind "person", robot tokens included (see BUILD_LOG.md, Phase 2). So we also
 * look at the id: human accounts resolve to ids like "gX5n5nsYB", while robot tokens resolve to
 * "g-…" (tokens created by the current Sanity CLI) or "p-…" (older project robots). This relies on
 * Sanity's id format, which is observed, not documented; the tests pin all three forms.
 *
 * Like every engine check, these are advisory: they stop anything that goes through the engine,
 * not a client that writes to the Content Lake directly.
 */

/** A signed-in person. Refuses the agent, the web server and the payment webhook. */
export const PEOPLE_ONLY =
  '$actor.kind == "person" && string::startsWith($actor.id, "g") && !string::startsWith($actor.id, "g-")'

/** A robot token: the web server or the payment webhook. No person can click these. */
export const ROBOTS_ONLY = '(string::startsWith($actor.id, "g-") || string::startsWith($actor.id, "p-"))'
