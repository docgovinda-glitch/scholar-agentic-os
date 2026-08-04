# Access Model — Institutionally Gated, With Local Inference

> **Doc ID:** 63 · **Status:** Accepted · **Date:** 2026-08-04
> **Supersedes:** `25` §1.2's account-less path
> **Depends on:** `01`, `25`, `46`

---

## 1. Decision

**Scholar is institutionally gated. Every user holds an account, and an
administrator approves it before it works.**

**Inference may be local.** The AI Setup stage offers on-device model runners
as peers to cloud providers, so a user who wants nothing sent to a third party
gets that guarantee without needing to escape the account system.

---

## 2. What prompted it

`25` §1.2 specified an account-less path — "No account, no email, no network"
— and required it to be "visible on first launch". Building onboarding raised
the question of whether to implement it.

It turned out to be a revision-1 artifact. The text describes a user who
"**downloads** the Desk" and a "**first launch**": a desktop application.
Revision 2 opens with "Website only. No desktop application" (`01` §1). The
section survived the terminology pass without being reconciled with the
platform change — which the index already recorded, marking `25` as `1†`
("surface and architecture passages still need a full pass") even while that
document's own header claimed "Revision: 2".

## 3. Why gated, and not open self-serve

The question is not what the documents say. Both readings have some support in
prose. It is what the system already is, and the implementation is one-sided:

| Evidence | Where |
|---|---|
| Registration requires an institutional ID | `supabaseAuthService.signUp`, `25` §2 |
| `is_approved` defaults to **false** | `supabase/schema.sql` |
| An administrator is emailed on every registration | `functions/send-approval-email` |
| An administrator approves each account | `functions/approve-registration` |
| Even password resets require administrator sign-off | `functions/approve-password-reset`, `pending_password_resets` |
| An admin console route exists to do the approving | `server/routes/admin.ts` |
| `ADMIN_EMAIL` is a deployment variable | `render.yaml` |

Nobody builds five pieces of approval machinery by accident. An institutional
ID field is only meaningful if a human checks it, and a password-reset flow
that waits on an administrator is a deliberate, costly choice — it is slower
and more support-intensive than self-service, and it was chosen anyway.

Two further arguments, one practical and one about reversibility:

**Cost.** This project runs entirely within free tiers, and the deployment
holds a server-side model credential. Open registration on that footing means
the first person to find the signup form can spend the whole quota. The gate is
what makes a shared credential survivable.

**Direction of travel.** A gated product can be opened later by relaxing one
default. An open product cannot be un-opened: by the time it matters, accounts
exist, work exists under them, and retro-fitting approval means telling
existing users their access is now provisional.

## 4. Why local inference is kept

`P3`/`P4` are about where a user's prose goes. That is a question about
inference, not about identity — and the account-less path conflated them.

A user signed in with an approved account, sending passages to a model on
`localhost`, has exactly the property the privacy principle promises: the text
never leaves their machine. Losing that guarantee because the delivery vehicle
changed from a desktop app to a website would be a real regression. Keeping it
costs nothing conceptually — `src/config/localRunnerCatalog.ts` already
describes eleven runners with install steps, CORS guidance, and difficulty
ratings.

So the AI Setup stage presents local runners as **peers** to cloud providers,
not as an advanced option behind a disclosure. Doing otherwise would make the
privacy-preserving choice the harder one to find, which inverts the point.

## 5. Consequences

**Positive**

- The onboarding flow matches the access control the code already enforces.
- The privacy promise survives the platform change, in the form that actually
  carries it.
- No second, local-only storage backend has to be built or maintained.

**Negative / accepted**

- A user who wants no account cannot use Scholar. Accepted: that user is not
  who this deployment is for, and the approval gate says so.
- Registration is slower than self-service, and an administrator is a
  dependency for both signup and password reset. Accepted, and pre-existing.

**Reversible**

- Opening registration is one default (`is_approved`) and one flow change.
  Doing it would need the server-side model credential reconsidered first —
  see §3.

## 6. Related

- `01` §1 — website-only, the platform decision this reconciles against
- `25` §1.2 — rewritten; the withdrawn text is quoted there
- `61-CLIENT-CONSOLIDATION.md` — the authentication this gate sits on
- `src/config/localRunnerCatalog.ts` — the eleven runners offered
