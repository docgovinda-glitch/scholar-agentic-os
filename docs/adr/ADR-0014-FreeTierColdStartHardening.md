# ADR-0014: Hardening the Deployment for Render's Free Plan

## Status

Accepted (2026-08-02). Implements Phase 1 of the hosting work, following the
stack decision recorded in `render.yaml` and `DEPLOYMENT_README.md`
(Render + Cloudflare + Supabase + Resend).

## Context

Phase 0 finished with the stack chosen and the infrastructure already live.
Reviewing what was actually deployed against the stated constraint —
*Render free tier only* — turned up a set of defects that all trace back to
one root cause: **the deployment had been configured as though the instance
were always on, and on the free plan it is not.**

Render's free web-service plan idles an instance out after roughly 15 minutes
without traffic. The next request then blocks for tens of seconds while the
image is pulled and the container boots. Because this app serves its own
frontend from the same instance that serves `/api/*`, the visitor who triggers
the wake is by definition the one who waits.

Six concrete problems followed from that, each verified against the code
rather than assumed:

1. **`render.yaml` declared `plan: starter`.** That is Render's paid
   ($7/month) always-on plan, not the free one. A blueprint sync would have
   silently provisioned a billable service — and the file's own comments
   described free-tier behaviour, so the contradiction was invisible to a
   reader who trusted the prose.

2. **No `.dockerignore` existed at all.** With `COPY . .`, the build context
   included the host's `node_modules`, the entire `.git` history, every doc,
   and — most seriously — any local `.env`, meaning secrets could be baked
   into an image layer.

3. **The image was single-stage.** It shipped the whole build toolchain
   (vite, vitest, typescript, esbuild, tailwind) and the full source tree in
   the running image. Cold-start time scales with image size, so this was
   paid on every single wake.

4. **`server.ts` imported `vite` at module top level.** With esbuild's
   `--packages=external`, that became an unconditional `require("vite")` in
   `dist/server.cjs`, loading a bundler into the production process that only
   the dev-middleware branch ever uses.

5. **`callServerProxy` had no timeout whatsoever**, and no concept of "the
   server is starting". A cold start therefore surfaced either as an
   indefinite hang or, once something upstream gave up, as
   `network_unreachable` — which tells the user to go check their connection
   and API keys when nothing is wrong with either.

6. **Body limits were `50mb` on a 512 MB instance.** Express buffers the raw
   body, then the decoded string, and `/api/parse-file` additionally
   base64-decodes it into a Buffer, so a couple of concurrent uploads could
   OOM-kill the container — which restarts it, which makes the next visitor
   pay a fresh cold start.

A seventh was found while verifying the others: **`PORT` was hardcoded to
3000**, ignoring the `$PORT` Render assigns. It worked only because
`render.yaml` happened to pin `PORT=3000` to match.

## Decision

Treat the cold start as a permanent property of the chosen plan — something to
be **moved off the interaction path and explained honestly**, not something to
be eliminated or hidden.

### Shrink the image (reduce how long a cold start takes)

- Added `.dockerignore`, with `.env*` excluded so secrets cannot reach a layer.
- Rebuilt `Dockerfile` as two stages: a builder holding the full toolchain, and
  a runtime carrying only `dist/` plus production dependencies. Runs as the
  non-root `node` user.
- Made the `vite` import in `server.ts` dynamic, inside the existing
  `NODE_ENV !== "production"` branch, so production never resolves it.
- Moved `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` from
  `dependencies` to `devDependencies`; all three are build-time only, each
  confirmed to appear solely in `vite.config.ts` or the dev branch.

Measured result: the runtime install drops from **542 packages to 225**.

### Move the wait off the interaction path

`src/services/serverWarmup.ts` probes `/api/health` once at app boot
(`src/main.tsx`), so the container starts booting while the user is still
reading the page. This does not shorten the cold start; it relocates it to
where nobody is waiting on it.

### Tell the truth when a request does hit a sleeping instance

Added a `server_waking` kind to `AIErrorKind`, with
`retryable: true, failoverWorthwhile: false`.

That combination is the substantive part. Every cloud provider reaches its API
through the same `/api/generate` proxy on the same instance, so while that
instance is booting, the next provider in the failover chain cannot succeed
either. Classifying a cold start as a generic network error made one
unavoidable wait get multiplied by the number of configured providers, and
then blamed on whichever provider happened to be last in the list. Retrying
the *same* provider, by contrast, is exactly the right move — the container is
on its way up.

`callServerProxy` now also bounds itself with `PROXY_TIMEOUT_MS` (150s, sized
to outlast a cold start plus a real generation), and treats a 502/503/504 —
what Render's router returns mid-boot — as a wake rather than an outage, after
confirming with a health probe.

### Size memory to the plan

`MAX_UPLOAD_MB` (default 25) replaces the hardcoded `50mb`. Made configurable
rather than merely smaller, so moving to a larger plan is an env change rather
than a code change.

## Consequences

**Gained.** Materially faster cold starts; no secrets in image layers; a
non-root runtime; an honest "server is starting up" message in place of advice
to debug a healthy connection; one cold start no longer burning the whole
provider chain; requests that can no longer hang unbounded; a platform-assigned
port now works.

**Given up.** Default upload ceiling falls from ~37 MB to ~18 MB of actual
file. This is a deliberate trade against OOM kills on a 512 MB instance, and is
reversible per-deployment via `MAX_UPLOAD_MB` without touching code.

**Accepted risk.** A non-streaming generation legitimately exceeding 150s now
fails where it previously hung indefinitely. Failing with a retryable,
correctly-classified error is the better of those two outcomes.

**Deliberately not done.** Streaming calls (`callServerProxyStream`) are *not*
given a total-duration cap: a long healthy stream is indistinguishable from a
hang by elapsed time alone, and cutting one off would be a regression. The boot
warmup already absorbs cold starts for that path too.

**Not verified here.** The Docker image was not built during this work — no
Docker daemon was available in the environment. The changes were instead
verified by: a successful `npm run build`; inspecting `dist/server.cjs` to
confirm `vite` appears only as a lazy `import("vite")` while `xlsx`, `mammoth`,
and `pdf-parse` remain correctly lazy-required; `npm ci --omit=dev --dry-run`
resolving cleanly; and booting the built server with `NODE_ENV=production` on a
non-default `$PORT` and getting a healthy `/api/health`. The image build itself
happens first on Render.

## Alternatives considered

**Serve the frontend from Cloudflare Pages, leaving Render for `/api/*` only.**
Technically the strongest fix — static assets would be CDN-served and always
instant, so a cold start would only ever delay an AI call rather than the whole
page. Rejected for Phase 1 because the stated constraint names Render as the
host, and this would be a topology change rather than a hardening of the chosen
one. Recorded here as the natural first candidate should cold starts remain
unacceptable.

**Keep-alive pings to prevent idling.** Rejected: it works against the plan's
intent, and 24/7 pinging consumes essentially the entire 750 instance-hour
monthly free allowance, leaving nothing for any other free service on the
account.

**Upgrade to the paid `starter` plan.** Rejected: directly contradicts the
free-tier-only constraint. It is, however, the one-line change
(`plan: free` → `plan: starter`) that removes cold starts entirely, should the
constraint ever be relaxed.
