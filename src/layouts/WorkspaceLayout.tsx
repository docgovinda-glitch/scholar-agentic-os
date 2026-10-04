import React from 'react';
import AppLayout, { type AppLayoutProps } from './AppLayout';

export type WorkspaceLayoutProps = AppLayoutProps;

/**
 * WorkspaceLayout: Canonical alias for AppLayout to provide the global Scholar Core
 * shell layout wrapping any workspace alongside ScholarSidebar.
 */
export default function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return <AppLayout {...props} />;
}
