# Sponsored Placements — Unified System Design

**Status: PENDING ARCHITECTURE DECISION — NOT APPROVED, NOT IMPLEMENTED.** Depends on `hosting-and-topology.md`'s BaaS decision (the admin-config store described here lives wherever that document lands — Supabase is the current recommendation).

This replaces the earlier "generic AdSense everywhere" framing with curated, directly-relevant, manually-entered placements: academic conferences, university admission programs, academic book publishers, and the AI Gateway's Tier 4 affiliate subscription (`ai-gateway.md` §Tier 4). **One mechanism covers all four categories** — there is deliberately no separate system for "ads" versus "the tier-4 affiliate slot."

---

## 1. Placement Categories

| Category | Example content | Source of the "why this, not generic ads" reasoning |
|---|---|---|
| Academic conferences | "Submit to [Conference Name] — CFP closes [date]" | Directly relevant to a researcher's actual workflow, unlike arbitrary ad-network inventory |
| University admission programs | "[University] PhD program — applications open" | Same audience, same relevance logic |
| Academic book publishers | "[Publisher] — new titles in [field]" | Same |
| AI Gateway Tier 4 affiliate | "Get [AI Subscription] — sign up here" | Functionally identical mechanism to the other three: a curated link with display content and an on/off toggle |

All four are **curated and manually entered by an admin**, not programmatically matched by a third-party ad network. This is a deliberate, current-pass constraint — see §4 for why a generic ad network isn't ruled out *later*.

---

## 2. Reusable Placement Component

**One component, one slot design**, used consistently wherever a placement is shown — not a bespoke component per category.

### Placement rules
- **Never inside manuscript or citation content areas.** The whole point of a curated, non-disruptive placement is that it doesn't interrupt research/writing work — this rules out `ManuscriptDraftingWorkspace.tsx`, `ManuscriptEditorWorkspace.tsx`, `ThesisReader.tsx`'s content pane, and the citation-formatting displays.
- **Consistent locations across page types** — candidates (to be finalized when this moves to implementation, not decided here): dashboard/landing views, sidebar or footer regions of workflow panels, and between-phase transition points where a brief pause in the workflow already exists naturally. The unifying principle is "shown where a glance doesn't cost the user their place in a document," not a specific fixed list of components.
- **Empty by default.** If no active placement matches the current context (or admin has disabled all placements), the slot renders nothing — not a fallback house ad, not an empty box that reserves visual space unnecessarily.

### Component shape (conceptual, not a finished interface)
A single `<SponsoredPlacement>`-style component that:
- Accepts a `context`/`category` hint (e.g., "which page region is asking") so placement selection logic can prefer relevant categories for that context if useful, without hardcoding category-to-page-mapping into the component itself.
- Fetches (or receives, if hoisted to a parent) the current active placement(s) from the admin-config store.
- Renders the admin-entered display text/image as a link to the admin-entered URL.
- Renders nothing if no active placement applies — no loading skeleton flash, no empty frame.

**Forward compatibility with a future generic ad network** (not built now, see §4): the component's external contract — "render whatever content source is configured for this slot" — should not assume the content is always a curated link. Internally, today, that means "look up the curated placement." The same slot could later be told to render a network ad script instead, without changing how the rest of the app invokes the component. This is a design constraint on the component's boundary, not a reason to build any ad-network integration now.

---

## 3. Admin Config: One System for All Four Categories

**Single table/collection, single admin surface** — no separate "ads" system and "tier 4 affiliate" system.

### Schema (conceptual)
One `sponsored_placements` table (Postgres, under the Supabase recommendation in `hosting-and-topology.md`) with:
- `id`
- `category` — one of: conference / admission / book / ai-affiliate (an enum or constrained text field, extensible if a fifth category ever shows up)
- `title` / `display_text` — what the user sees
- `image_url` (optional — some placements may be text-only)
- `link_url` — where the placement sends the user
- `is_active` — the on/off toggle
- `sort_order` (optional, if multiple active placements in a category need a manual priority order)
- `created_at` / `updated_at`

This is a small, flat schema — deliberately mirroring how simple the existing `admin_approvals`/`model_preferences` tables already are (see `hosting-and-topology.md` §3), not introducing new structural complexity into the data model.

### Admin UI: two real options, not one mandated design
The requirement is "a REAL, non-coder-friendly admin config slot," and there are two legitimate ways to satisfy that, worth naming explicitly rather than picking silently:

1. **Supabase's own dashboard Table Editor**, used directly against the `sponsored_placements` table. Zero extra code to build. Genuinely usable by a non-coder in the sense that it's a spreadsheet-like grid, not a SQL console — but it does still expose raw column types and the general Supabase dashboard chrome, which is a step more technical than a purpose-built form.
2. **A minimal custom admin screen inside the app itself**, gated behind an `is_admin` flag on the admin's own profile — a simple add/edit/remove form matching the schema above, with real labeled fields ("Link URL," "Display Text," "Category" as a dropdown, "Active" as a toggle) rather than a raw table view. More work to build, meaningfully friendlier for a genuinely non-technical admin.

**Recommendation, matching the phased spirit of `hosting-and-topology.md` §7**: start with option 1 (it costs nothing beyond the schema itself, and unblocks Tier 4 and the other three categories immediately once the BaaS exists), and build option 2 later if the admin experience of raw table editing proves to be a real friction point in practice. Not a decision made here — a sequencing suggestion for when this moves to implementation.

---

## 4. Explicitly Not Ruled Out: Generic Ad Network, Later

This pass does not build or plan detailed integration for a third-party ad network (AdSense or similar) — only the curated-placement system above. But the component boundary in §2 is deliberately designed so that door isn't closed:

- **If added later**, the two AdSense-specific footnotes to revisit at that time: an `ads.txt` file at the domain root (a static-hosting-compatible requirement — trivial to add to a static site, just noted here so it isn't forgotten), and AdSense's content-policy review process (which academic/research content should generally satisfy, but is worth confirming against AdSense's current policies when that decision is actually made).
- **Not a task now** — this is a footnote for a future discussion, not scoped work in this pass.
