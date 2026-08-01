# 22 — Assisted Local Setup

Covers the requirement that where a user must download something for better
output — local models, local agents, runtimes — the guidance is clear and the
integration is seamless.

`[RECOMMENDATION]` **Governing principle: the system never tells a user to "go
install Ollama."** It detects what the machine can run, explains the benefit in
the user's terms, performs what it can, and verifies the result. A user who
does not know what a model is should still be able to end up running one.

`[INFERRED]` This matters most for exactly the users least able to self-serve.
The audience now spans undergraduates ([C-01](./11-requirements-conflicts.md#c-01--audience-narrow-segment-vs-all-degree-levels)),
and local inference is what makes the product free and private — the two
properties a cost-constrained student cares about most. A setup flow that loses
them forfeits both.

---

## 1. When local setup is offered

`[RECOMMENDATION]` Proactively, but never as a blocker, at four moments:

| Trigger | Framing |
|---|---|
| AI Setup Wizard, on desktop | *"Run AI privately on this computer — free, works offline"* |
| Managed trial allowance nearing exhaustion | *"Your free allowance is nearly used. Run locally at no cost →"* |
| A confidentiality-sensitive action | *"This dataset would be sent to \<provider\>. Run locally to keep it on this device →"* |
| Capable hardware detected, cloud in use | Passive, dismissible: *"This machine can run models locally"* |

`[RECOMMENDATION]` Never blocking, never repeated after dismissal in the same
project. `[INFERRED]` A nag that reappears reads as an upsell, which inverts
the intent.

---

## 2. Capability detection before any recommendation

`[RECOMMENDATION]` The system inspects the machine **before** naming a model:
available RAM and VRAM, GPU presence and family, CPU cores, free disk, OS and
architecture, and whether a runtime is already installed.

`[OBSERVED]` `src/ai/hardware` exists in the unreachable `src/ai` subsystem —
a concrete candidate for adoption if that module is kept
([09](./09-technical-debt-register.md) TD-05).

`[RECOMMENDATION]` Recommendations are honest about the trade:

> **This machine can comfortably run:**
> · *Llama 3.1 8B* — 4.7 GB — good for drafting and summarising
> · *Qwen 2.5 14B* — 8.2 GB — better reasoning, ~2× slower
>
> **Not recommended on this machine:** 70B models — needs ~40 GB, you have 16 GB
>
> Disk available: 210 GB · Estimated speed: ~25 words/sec

`[RECOMMENDATION]` If the machine cannot usefully run anything, **say so and
stop.** `[INFERRED]` Walking a user through a 20-minute install that produces
unusably slow output is worse than not offering it — they lose the time and
conclude the product is broken.

---

## 3. Seamless integration

`[RECOMMENDATION]` Four levels, by descending automation. The desktop client
should reach level 1 wherever the platform permits.

**Level 1 — bundled runtime (desktop, preferred).** The runtime ships with the
application. No separate install, no terminal, no version mismatch. The user
picks a model; the app downloads it with a progress indicator and verifies it.

`[INFERRED]` This is the only level that is genuinely seamless. Every level
below it introduces a step where users are lost.

**Level 2 — managed install.** The app downloads and runs the official
installer, detects completion, and configures the connection itself. One
consent prompt, then automatic.

**Level 3 — guided install.** Where OS policy forbids automation: a
platform-specific, step-numbered walkthrough with a verify button that reports
the real result. `[OBSERVED]` `healthCheckProvider` already performs real
checks and is reused here.

**Level 4 — manual.** Documented fallback for locked-down or unusual
environments. Every value the user must supply is named, with an example.

`[RECOMMENDATION]` The client always attempts the highest available level and
states which it is using. `[INFERRED]` A user told "we can set this up for you"
who then hits a terminal command has been misled.

---

## 4. Model download

`[RECOMMENDATION]` Handled inside the application:

- Size, disk impact, and time estimate shown **before** download starts
- Resumable; survives sleep and network interruption
- Integrity verified; a corrupt download is re-fetched, not silently used
- Progress in the app, not a terminal
- Cancellable, with disk reclaimed
- Multiple models managed in one place, with usage and last-used date

`[RECOMMENDATION]` The model library is a first-class surface: what is
installed, what each is good for, disk used, and one-click removal.
`[INFERRED]` Models are large; a user who cannot see or reclaim that space will
eventually be surprised by a full disk and will blame the application.

---

## 5. Verification

`[RECOMMENDATION]` Setup is not complete when files exist. It is complete when
a real generation succeeds:

```
1  Runtime reachable
2  Model loaded
3  Test generation returns coherent output
4  Measured speed reported honestly
5  Fallback confirmed if it fails
```

`[RECOMMENDATION]` Report the measured result, not a success banner:

> ✓ **Llama 3.1 8B is running** — ~28 words/sec on your GPU
> Drafting a 500-word section will take about 20 seconds.

`[INFERRED]` A speed figure sets a correct expectation. Without it, a user on
CPU-only inference will assume the app has frozen.

---

## 6. Failure and fallback

`[RECOMMENDATION]` Local setup can fail for reasons outside the product's
control — insufficient permissions, antivirus interference, disk exhaustion,
unsupported drivers. In every case:

- The user is **not** left without working AI. Their previous mode remains
  active.
- The failure is named specifically, not as "setup failed".
- A next action is offered — retry, a smaller model, guided install, or cloud.
- Partial downloads are cleaned up.

`[RECOMMENDATION]` If local inference fails **mid-task**, `[OBSERVED]` the
existing error-kind-classified failover applies — but the user is told the
task completed on a different backend. `[INFERRED]` Silent substitution would
make the ledger wrong about which model produced the text, which corrupts the
provenance record.

---

## 7. Local agents and skill packs

`[RECOMMENDATION]` The same flow governs any downloadable capability —
specialised local agents, discipline-specific skill packs, citation-style
extensions, venue rule-pack bundles.

Each declares: purpose, size, what it improves, whether it needs a model, and
whether it runs entirely locally. `[RECOMMENDATION]` Installation is
transactional — an interrupted install leaves no partial state — and every
pack is individually removable.

`[RECOMMENDATION]` Rule-pack and skill-pack distribution is administrator-
curated ([20](./20-admin-platform.md)); users install from a signed catalogue
rather than arbitrary URLs. `[INFERRED]` These execute against manuscript
content, so unrestricted third-party installation would be the supply-chain
exposure that
[C-06](./11-requirements-conflicts.md#c-06--output-quality-and-disclosure-control--resolved-by-owner-decision)
declines elsewhere.

---

## 8. Web client

`[OBSERVED]` Browsers cannot reliably reach a local runtime under CSP, and this
codebase already carries a fix for that class of problem.

`[RECOMMENDATION]` The web client therefore does **not** offer local setup. Where
a user would benefit, it explains the option and points to the desktop app —
once, dismissibly, without implying the web experience is degraded.

`[INFERRED]` This is a real capability difference and belongs in the register
in [12](./12-client-strategy.md) §4, not hidden behind an error message.
