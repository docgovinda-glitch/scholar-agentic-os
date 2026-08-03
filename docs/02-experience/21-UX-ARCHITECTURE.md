# UX Architecture — Scholar OS

> **Doc ID:** 21 · **Status:** Design · **Depends on:** `01`, `20`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

The interaction principles, AI affordance rules, and design system that hold
across every surface. Surface-specific detail lives in `22` and `23`.

---

## 1. Design thesis

Scholar OS is a **professional instrument for anxious people**.

Both halves matter. *Professional instrument*: it is used for hours, by users who
will become expert in it, on work that matters more than almost anything else
they do that year. That argues for density, keyboard control, and no
hand-holding.

*Anxious people*: the user is often a student who does not know the conventions,
is afraid of being accused of cheating, and is working close to a deadline. That
argues for guidance, reassurance, and never making them feel stupid.

The resolution is **progressive disclosure with an expert path**: the surface is
calm and explains itself, and every explanation collapses. Amara reads the
guidance. Marcus never sees it. Neither is designed for at the other's expense.

---

## 2. Interaction principles

### UX1 — The system proposes; the human disposes

Every AI output arrives as a *proposal* with an obvious accept, reject, and edit.
Nothing lands in the user's document, corpus, or configuration without an
affirmative action.

**Applies to:** suggestions, drafts, extracted rules, discovered sources,
inferred defaults, structure proposals.

**Anti-pattern:** auto-applied changes with an undo. Undo is a recovery
mechanism, not a consent mechanism.

### UX2 — Show the work

Every AI output can be traced: which agent, which model, what inputs, what
confidence, what it cost. One interaction away, never buried.

**Applies to:** every generated span, summary, extracted rule, and ranking.

### UX3 — Friction where it belongs

Deliberate friction at consequential decisions; zero friction everywhere else.

| Deliberately effortful | Deliberately frictionless |
|---|---|
| Approving a source | Navigating between sections |
| Advancing a gate | Toggling a panel |
| Overriding the export block | Accepting a spelling fix |
| Enabling sync | Switching model binding |
| Deleting a project | Saving (automatic) |
| First egress to a provider | Search |

A confirmation dialog on a frictionless action is a design defect. So is a
one-click path through a consequential one.

### UX4 — State is always visible

The user never wonders whether something is running, saved, synced, or blocked.
See `20` §8.

### UX5 — Explain the block

Every blocked action states what is blocking it and what would unblock it, with a
route to fix. "This action is unavailable" alone is a defect.

### UX6 — Progressive disclosure with an expert path

Three levels everywhere: **surface** (what to do), **detail** (why, on
expansion), **depth** (full context, one navigation away). Users who dismiss
guidance do not see it again for that concept; users who want it can always
retrieve it from Help.

### UX7 — Errors are actionable

Error messages state what happened, what it means, and what to do. Provider
errors name the provider. Parse errors name the file and the reason. Never a
code alone, never "something went wrong."

### UX8 — The tool never implies dishonesty

The user is assumed honest. Integrity features are framed as *support* and
*evidence*, never as *surveillance*. The authorship panel says "how this document
was written", not "AI content detected". Yusuf must not feel watched by the tool
that is meant to protect him.

### UX9 — Nothing is lost

Autosave, snapshots at gates, recoverable deletion, preserved conflicts, undo
that restores provenance alongside text.

### UX10 — Respect the deadline

The user is often short of time. The system never wastes their attention:
no dismissable marketing, no feature announcements mid-session, no upgrade
prompts inside a workflow. Announcements appear in the notification centre and
nowhere else.

---

## 3. AI affordance rules

The most important interaction design in the product. AI appears in exactly four
forms (`11` §6.1); each has a fixed visual and behavioural contract.

### 3.1 The four forms

| Form | Visual signature | Consent model | Can write to draft |
|---|---|---|---|
| **Chat** | Right-dock panel, conversational | User initiates each turn | No — insertion is a separate explicit action |
| **Inline suggestion** | Ghosted text or margin card at the location | Explicit accept per suggestion | Only on accept |
| **Agent run** | Progress card in Agent Monitor + notification | User triggers, or Conductor proposes and user confirms | Only into a review surface |
| **Background analysis** | Annotation, underline, or finding | Ambient; user configures categories | **Never** |

### 3.2 Universal AI rules

| Rule | Statement |
|---|---|
| AI-1 | AI-produced content is **always** visually distinguishable from human content before acceptance |
| AI-2 | AI never modifies existing text without showing a diff |
| AI-3 | Every AI surface names the model that produced it, on hover or expansion |
| AI-4 | Confidence is shown where the system has it; absence of confidence is stated, not implied by silence |
| AI-5 | Every AI action is interruptible |
| AI-6 | Cost is visible before an expensive action and recorded after |
| AI-7 | Background analysis annotates; it does not write |
| AI-8 | Refusals explain the reason and offer an alternative |
| AI-9 | Citations offered by AI resolve to approved sources or the suggestion is not offered |
| AI-10 | The user can disable any AI category without disabling the product |

### 3.3 Pending-content treatment

Agent-produced text that has arrived in the document but has not yet been
accepted by the user carries a distinct treatment: a left margin rule and a
subtle tint, until the user accepts, edits, or rejects it.

**Revision 2:** this is a *pending-review* state, not a permanent provenance
mark. Once the user has acted on it, the treatment clears and nothing further is
recorded in the document's appearance. The mandatory provenance overlay is
withdrawn (`32` §8.2).

### 3.4 Suggestion presentation

```
┌─ Inline, at the point of relevance ───────────────────┐
│  …the sample comprised 240 participants               │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ✎  Suggested                                     │ │
│  │    "…the sample comprised 240 participants        │ │
│  │     (Chen et al., 2021)."                         │ │
│  │                                                   │ │
│  │    Adds a citation. Chen et al. reports this      │ │
│  │    figure on p. 14.                               │ │
│  │                                                   │ │
│  │    [Accept]  [Edit]  [Dismiss]   ⓘ gpt-4o · $0.001│ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

Four elements are mandatory: the proposed text, the *reason*, the actions, and
the provenance. A suggestion without a reason is a suggestion the user cannot
evaluate.

---

## 4. Guidance system

The mechanism by which the product teaches (`REQ-OUT-5`).

### 4.1 Guidance levels

| Level | Trigger | Dismissible | Example |
|---|---|---|---|
| **Label** | Always visible | No | Field name |
| **Hint** | Always visible, small | No | "Usually 200–350 words" |
| **Explain** | User expands | Yes, per concept | Four-part field guidance |
| **Teach** | First encounter with a concept | Yes, permanently | "What is a research question?" |
| **Deep** | Help navigation | n/a | Full article |

### 4.2 Guidance voice

| Do | Don't |
|---|---|
| "A research question is the single question your work answers." | "Simply define your research question." |
| "Most theses in your field cite 50–100 sources." | "You should have enough sources." |
| "Not sure yet? That's normal at this stage — we'll sharpen it later." | "This field is required." |
| "This is Harvard style, which your department uses." | "Configure citation style." |

Banned words in guidance: *just*, *simply*, *obviously*, *of course*, *easy*.
They are all ways of telling an anxious user that their confusion is unusual.

### 4.3 Adaptive guidance

Guidance density adapts to observed behaviour, never to a self-reported "expert"
toggle:

- A user who dismisses guidance for a concept does not see it again.
- A user who completes three projects of a type gets condensed guidance for it.
- A user who hesitates (long dwell, no input) is offered help — once, quietly.
- All guidance is retrievable from Help at any time.

---

## 5. Design system

### 5.1 Typography

Documents are the product. Reading comfort over brand expression.

| Role | Family | Notes |
|---|---|---|
| Document text | Serif (user-selectable: Charter, Source Serif, Georgia) | Matches the printed target |
| UI | System sans (SF, Segoe, Inter) | Native feel, no webfont load |
| Code and identifiers | Monospace | DOIs, IDs, formulae |

Document text scales independently of UI scale — a user can enlarge their prose
without inflating the chrome.

| Scale | Size / line-height |
|---|---|
| Document | 16–20 px / 1.7 (user-set) |
| UI body | 14 px / 1.5 |
| UI small | 12 px / 1.4 |
| Panel title | 13 px / 1.3, medium weight |

### 5.2 Colour semantics

Colour carries meaning; meaning is never carried by colour alone (`NFR-A11Y-1`).

| Token | Meaning | Also indicated by |
|---|---|---|
| `neutral` | Default content | — |
| `accent` | Interactive, selected | Underline, weight |
| `success` | Passed, approved, verified | ✓ icon |
| `warning` | Needs attention, unreviewed | ⚠ icon, margin rule |
| `danger` | Blocking, error, retracted | ✕ icon, bold label |
| `info` | Advisory, informational | ⓘ icon |
| `ai` | AI-origin content | Margin rule, texture |
| `human` | Human-origin content | Default treatment |

**Provenance colour scale** (used only when the provenance overlay is on):

| Origin | Treatment |
|---|---|
| `human_typed`, `human_edited` | No tint — the default state is human |
| `ai_suggested_accepted`, `ai_refined_accepted` | Light `ai` tint |
| `ai_generated_unreviewed` | Strong `warning` tint + margin rule, **always on** |
| `quoted_source` | `info` tint + quotation bracket |
| `imported_own_work` | Neutral tint + import mark |

That human text is *untinted* is deliberate: the default reading experience is of
one's own writing, with AI as the marked case.

### 5.3 Density

| Mode | Row height | Use |
|---|---|---|
| Comfortable | 40 px | Default; Pocket; onboarding |
| Compact | 32 px | Desk default for lists |
| Dense | 26 px | Power users; long corpus lists |

Desk users may set density globally. Document text is never affected.

### 5.4 Motion

Motion communicates causality and nothing else.

| Purpose | Duration | Easing |
|---|---|---|
| State change | 120 ms | ease-out |
| Panel open/close | 180 ms | ease-in-out |
| Docking preview | 100 ms | linear |
| Long-run progress | continuous | linear |

No decorative animation. `prefers-reduced-motion` removes all non-essential
motion; progress indicators become discrete step counters.

### 5.5 Iconography

Outline icons, 20 px UI / 16 px inline. Every icon-only control has an accessible
label and a tooltip. Icons never carry meaning alone in a data context.

---

## 6. Accessibility

WCAG 2.2 AA across all surfaces (`NFR-A11Y-1`), with these specifics.

| Area | Requirement |
|---|---|
| Keyboard | Every Desk function reachable without a mouse, including docking, splitting, and panel focus |
| Focus | Visible focus indicator at 3:1 contrast against adjacent colours |
| Screen readers | Editor exposes document structure, provenance state, and findings as accessible annotations |
| Contrast | 4.5:1 body, 3:1 large text and UI components |
| Motion | `prefers-reduced-motion` honoured |
| Text scaling | UI usable at 200% zoom without loss of function |
| Colour independence | No information by colour alone |
| Timing | No time limits on any user action |
| Targets | 44 × 44 px minimum on touch surfaces |
| Language | Document language declared for correct pronunciation |

### 6.1 Provenance accessibility

The provenance overlay is a visual mechanism carrying integrity-critical
information. It MUST have non-visual equivalents:

- Screen readers announce origin when entering a span of non-human origin.
- A text-mode provenance view lists spans by origin with locations.
- The unreviewed-span count is available as text in the status bar, not only as a
  visual treatment.

### 6.2 Cognitive accessibility

Under-specified in most products and directly relevant to our users, many of whom
are working under stress, in a second language, or with dyslexia or ADHD.

- Consistent placement: a control does not move between contexts.
- No hidden state: modes are labelled, not implied.
- Chunked tasks: intake and review are divisible; progress is preserved.
- Plain-language mode for all guidance, available globally.
- Distraction-free editing that hides everything but the text.

---

## 7. Content and voice

### 7.1 Voice attributes

Precise · calm · candid · respectful of expertise · never salesy.

### 7.2 Message patterns

| Situation | Pattern | Example |
|---|---|---|
| Blocking | What · why · how to resolve | "Export blocked: 12 spans of AI text haven't been reviewed. Review them, or export anyway and we'll record that you chose to." |
| Warning | What might happen · what to consider | "This source has been retracted. You can still cite it — some work cites retractions deliberately — but check that's what you mean." |
| Success | What happened · what's next | "Chapter 2 exported. Chapter 3 is ready to draft when you are." |
| Error | What failed · why · what to do | "Couldn't reach OpenAI (network timeout). Retrying with Ollama, or wait and retry." |
| Empty | What this is · why it's empty · what to do | See `20` §9 |

### 7.3 Numbers

Always absolute, never vague. "3 blocking issues", not "several issues". "68% of
this document is your writing", not "mostly yours". Precision is reassurance.

---

## 8. Loading, latency, and long operations

| Duration | Treatment |
|---|---|
| < 100 ms | Nothing |
| 100–400 ms | Subtle inline indicator |
| 400 ms – 3 s | Skeleton or spinner with a label |
| 3–30 s | Progress with a stage description |
| > 30 s | Background task; user continues working; notification on completion |

Every operation over three seconds is cancellable and reports what it is doing —
"Embedding 240 documents (48/240)", not "Loading".

**Cold local model load** is the notable case: first inference after launch can
take 20+ seconds. This is surfaced honestly as "Starting local model — first run
takes about 30 seconds", with the option to use a cloud provider instead.

---

## 9. Notification design

| Class | Delivery | Interruptive |
|---|---|---|
| Blocking finding | Inline + status bar | No |
| Run complete | Notification centre; push if long-running and opted in | No |
| Gate ready | Notification centre + gate indicator | No |
| Security event | Notification centre + email | Yes, once |
| Sync conflict | Notification centre + status bar | No |
| Backup reminder | Notification centre; modal at defined milestones only | Milestone only |
| Announcement | Notification centre only | Never |

**Nothing interrupts a writing session except a security event.** Backup
reminders — the one thing users most need to be nagged about — appear at gate
transitions, which are natural pauses, never mid-paragraph.

---

## 10. Error and edge-case inventory

| Case | Treatment |
|---|---|
| Offline | Persistent status; features requiring network labelled; queued actions listed |
| Provider down | Failover with disclosure; if none available, queue and explain |
| Disk full | Warn at 90%, block writes at 98% with space needed stated |
| Local model too large | Blocked at selection with the specific limit, before download |
| Corrupt project | Read-only, recovery offered from the last good snapshot, loss stated exactly |
| Sync conflict | Side-by-side, both preserved, human chooses |
| Plugin crash | Contained; plugin disabled; offer to report; core unaffected |
| Very long document | Virtualised; performance warning; chapter split suggested |
| Very large corpus | Paginated; index-backed search; no full enumeration in the UI |
| Session expired | Local work continues; cloud features pause; re-auth without losing state |

---

## 11. Design principles for the panel system

Detailed in `22`; the principles that govern it belong here:

1. **Panels are movable, never mandatory.** Any panel can be closed. The product
   works with only an editor.
2. **Layout is per-workspace and persistent.** It survives restart and follows
   the user across projects in that workspace.
3. **Presets are starting points, not modes.** Applying a preset is undoable and
   never discards a customised layout without asking.
4. **A panel owns one job.** A panel doing two things is two panels.
5. **Panels degrade gracefully.** Below its minimum width a panel shows a
   condensed view, never a broken layout.
