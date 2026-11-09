# UI and UX

Design tokens, themes, shell, and accessibility rules as implemented. Tokens live in `src/index.css`; do not copy values from this file, read them there.

## 1. Stack and conventions

- React 19, Tailwind CSS v4 through `@tailwindcss/vite`. There is no `tailwind.config`; theme tokens are in `src/index.css` (`@theme` block and `:root`).
- Icons: `lucide-react`. Animation: `motion`. Rich text: TipTap.
- Use semantic tokens (`--bg-*`, `--surface-*`, `--text-*`, `--border-*`, `--accent*`, `--state-*`, `--theme-*`) rather than raw colours. `npm run lint` fails on pure `#000000`/`#000` in `src` and `index.html` (`scripts/verify-no-pure-black.mjs`; Tailwind's `black` is mapped to `#171717`) and on raw hex Tailwind classes such as `bg-[#1C1C1E]` in `src/desk`, `src/components` and `src/layouts` (`scripts/verify-no-raw-hex-classes.mjs`; add a named `--color-*` in `@theme` instead). Slide themes under `src/features/slides` carry their own colours as data and are exempt.
- Typography: a single geometric sans stack (Plus Jakarta Sans, Inter and system fallbacks, `--font-sans`); `--font-serif`, `--font-display` and `--font-mono` alias it.

## 2. Tokens

Defined in `src/index.css`:

| Group | Examples |
| :--- | :--- |
| App-chrome palette (`@theme`) | `--color-ink-950` to `--color-ink-500` (dark surfaces), `--color-paper-*` (light grounds), `--color-danger*` |
| Surfaces | `--surface-canvas` (page, warm sand in light), `--surface-raised`, `--surface-input`, `--surface-inset`, `--surface-sunken`, `--surface-hover`, `--surface-base` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse` |
| Borders | `--border-subtle`, `--border-default`, `--border-control`, `--border-strong` |
| Accent and state | `--accent`, `--accent-hover`, `--accent-solid`, `--accent-subtle`, `--state-success`, `--state-warning`, `--state-danger`, `--state-info` (each with a `-subtle` fill) |
| Aliases | `--theme-bg`, `--theme-fg`, `--theme-border`, plus older `--bg-*` tokens kept as aliases |

`npm run verify:contrast` (`scripts/verify-contrast.mjs`) computes WCAG contrast over the real values in both themes: text, secondary and muted text, accent and state colours at least 4.5:1 on every surface; control borders at least 3:1; inverse text on the accent fill, and text on the subtle callout fills, at least 4.5:1. Changing a token must keep it passing.

## 3. Themes

- Two themes, light and dark. `index.html` carries `data-theme="dark"` and `class="dark"` as the default, then an inline script reads `localStorage` (`scholar-theme`, falling back to `theme`), otherwise `prefers-color-scheme`, and sets `data-theme` and the `dark` class before first paint.
- Dark styles are keyed on `data-theme="dark"` or `.dark` (the Tailwind `dark` custom variant). The light block is `:root[data-theme="light"]`; the dark block applies under `prefers-color-scheme` when no explicit light theme is set and under `:root[data-theme="dark"]`.
- The inline script is allowed by a CSP hash. If you edit it, update `INLINE_THEME_SCRIPT_CSP_HASH` in `server.ts`; `npm run verify:csp-hash` fails otherwise.
- The `theme-color` meta is `#171717`.

## 4. Shell and navigation

| Surface | Component |
| :--- | :--- |
| Entry and routing | `src/desk/DeskApp.tsx`; auth gates in `src/desk/DeskAuthGate.tsx` |
| Landing and signed-out home | `src/desk/ScholarCoreLanding.tsx` |
| Projects list, Ask Scholar and project creation | `src/desk/ProjectListScreen.tsx`, `src/desk/dashboard/` (`OutputTypePicker.tsx`, `constants.ts`) |
| Sidebar | `src/components/navigation/ScholarSidebar.tsx` |
| Generic project shell | `src/desk/DeskShell.tsx` with regions in `src/desk/regions/` (`Header`, `Rail`, `Primary`, `Aside`, `Tray`, `StatusBar`, `StudioPanel`, `GlobalSearchModal`, `AiStatusIndicator`) |
| Layouts | `src/layouts/AppLayout.tsx`, `WorkspaceLayout.tsx` |
| Workspaces | `src/desk/assignment/`, `src/desk/workspace/` (journal), `src/desk/thesis/`, `src/desk/proposal/`, `src/desk/presentation/` |
| Account, Vault, AI Access | `src/desk/account/AccountSettingsScreen.tsx`, `src/desk/vault/`, `src/desk/aiAccess/` |
| Admin | `src/admin/AdminApp.tsx` (lazy, `/admin/*`) |

`src/hooks/useDeviceClass.ts` classifies `mobile` (< 768 px), `tablet` (768-1023 px) and `desktop` (>= 1024 px, demoted when the pointer is coarse) so components that cannot work on a phone (for example local-server AI options) are not mounted there.

Other hooks: `useBackToClose`, `useOnlineStatus`, `useVisualViewport`, `useUnsavedChangesGuard`, `useSubscriptionLimits`.

## 5. Feedback and accessibility

- Feedback uses in-app toasts and modals (`src/components/ui/FeedbackSystem.tsx`, `showAppToast`), not native browser dialogs; screen-reader announcements go through `src/components/ui/AriaLiveAnnouncer.tsx`; autosave state through `WorkspaceAutosaveBadge.tsx`; unsaved edits are guarded by `useUnsavedChangesGuard`.
- Contrast is enforced by `verify:contrast` (section 2). Slide themes are tested for text at least 7:1 and muted text at least 4.5:1 ([`presentation-studio.md`](presentation-studio.md)).
- Playwright specs run axe (WCAG 2.1 A/AA) at 375, 768 and 1280 px (`e2e/accessibility.spec.ts`, `accessibility-signed-in.spec.ts`) and keyboard navigation (`e2e/keyboard.spec.ts`).

## 6. Offline and service worker

`public/sw.js` (cache-first static assets, network-first navigation, never caches `/api/*` or non-GET) and `manifest.json` (standalone display) exist, but `src/main.tsx` unregisters any registered service worker and clears Cache Storage on load so every visit gets fresh assets. `warmServer()` (`src/services/serverWarmup.ts`) pings the server early to absorb free-plan cold starts. User-visible offline behaviour comes from the client offline queue in `src/desk/api/client.ts` and `src/services/offline/`.
