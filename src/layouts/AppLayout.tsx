import React, { useState } from 'react';
import ScholarSidebar from '../components/navigation/ScholarSidebar';

export interface AppLayoutProps {
  children: React.ReactNode;
  activeItem?: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  userName?: string;
  userEmail?: string;
  onNavigate?: (route: string) => void;
  onNewProject?: () => void;
  className?: string;
}

/**
 * AppLayout: Global Scholar Core application shell wrapping pages/workspaces
 * alongside the Scholar Core left navigation rail (ScholarSidebar).
 */
export default function AppLayout({
  children,
  activeItem = 'presentation',
  isSidebarCollapsed,
  onToggleSidebar,
  userName,
  userEmail,
  onNavigate,
  onNewProject,
  className = '',
}: AppLayoutProps) {
  // Phones start with the navigation closed so the page gets the full width.
  const [internalCollapsed, setInternalCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  const collapsed = isSidebarCollapsed !== undefined ? isSidebarCollapsed : internalCollapsed;
  const toggleSidebar = onToggleSidebar || (() => setInternalCollapsed((prev) => !prev));

  return (
    <div
      className={`flex h-screen w-full overflow-hidden bg-[#F7F5F0] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-200 ${className}`}
      data-testid="app-layout"
    >
      {/* Scholar Core Left Navigation Rail */}
      <ScholarSidebar
        isCollapsed={collapsed}
        onToggle={toggleSidebar}
        activeItem={activeItem}
        userName={userName}
        userEmail={userEmail}
        onNavigate={onNavigate}
        onNewProject={onNewProject}
      />

      {/* Main Workspace Column */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
