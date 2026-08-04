/**
 * Pocket — mobile-first web application for Scholar OS.
 *
 * Four jobs: Approve (source queue), Read (document review), Ask (chat),
 * Know (what needs attention). Designed for 360px baseline with thumb-zone
 * optimization, one decision per screen. Responsive layout for 600px+ tablets.
 *
 * Usage:
 *   import PocketShell from '@/src/pocket/PocketShell';
 *   import PocketResponsive from '@/src/pocket/PocketResponsive';
 *
 *   // Mobile-first (360px)
 *   <PocketShell projects={projects} approvalQueue={queue} />
 *
 *   // Responsive (360px - desktop)
 *   <PocketResponsive projects={projects} approvalQueue={queue} />
 *
 * Components:
 *   - PocketShell: Mobile-first layout with four persistent tabs
 *   - PocketResponsive: Responsive shell with tablet master-detail sidebar
 *   - ApprovalQueueView: Source review card interface (flagship feature)
 *   - ReadView: Document review with comment threads
 *   - AskView: Chat interface for Scholar OS assistant
 *   - DiscoveryView: Source discovery and intake from databases
 *   - HomeTab: What needs attention (projects with pending items)
 *   - ProjectsTab: Project list and detail view
 *   - SearchTab: Search interface (Phase 4.9+)
 *   - MeTab: Account settings and notification preferences
 *
 * Layout Zones (Reference §3.1):
 *   - Reference Zone (top): 56px app bar with context title and menu
 *   - Read Zone (middle): Scrollable content area for tab content
 *   - Reach Zone (bottom): Action buttons (tab-dependent) + 56px tab bar
 *
 * Design Tokens:
 *   - 360px baseline viewport for touch optimization
 *   - Navy color palette (#0F172A, #1E293B, #334155) for reading
 *   - Luminous blue accent (#00D9FF) for actions and selection
 *   - 10px/12px type for readability on small screens
 *   - Large buttons (36-48px min height) for thumb zone
 *
 * Phase 4 Status:
 *   Phase 4.1-4.2: Pocket shell foundation ✓
 *   Phase 4.3: Approval queue card UI ✓
 *   Phase 4.4-4.6: Read and Ask view interfaces ✓
 *   Phase 4.7: PWA implementation ✓
 *   Phase 4.8: Responsive tablet layout ✓
 *   Phase 4.9: Source discovery interface ✓
 *   Phase 4.10-4.15: Vault, imports, advanced features (future)
 */

// Main shells
export { default as PocketShell } from "./PocketShell";
export { default as PocketResponsive } from "./PocketResponsive";

// View components
export { default as ApprovalQueueView } from "./views/ApprovalQueueView";
export { default as ReadView } from "./views/ReadView";
export type { DocumentReview, Comment } from "./views/ReadView";
export { default as AskView } from "./views/AskView";
export type { ChatMessage } from "./views/AskView";
export { default as DiscoveryView } from "./views/DiscoveryView";
export type { DiscoverySource } from "./views/DiscoveryView";

// Tab components
export { default as HomeTab } from "./tabs/HomeTab";
export { default as ProjectsTab } from "./tabs/ProjectsTab";
export { default as SearchTab } from "./tabs/SearchTab";
export { default as MeTab } from "./tabs/MeTab";

// PWA components and hooks
export { default as InstallPrompt } from "./components/InstallPrompt";
export {
  useServiceWorkerRegistration,
  usePushNotifications,
  useInstallPrompt,
} from "./hooks/useServiceWorker";

// Types
export type {
  PocketTab,
  ApprovalCandidate,
  ApprovalQueueState,
  NotificationPreferences,
  PocketUser,
  PocketProject,
} from "./types";
