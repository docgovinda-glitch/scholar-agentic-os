import React from "react";
import type { DiscoveredSource } from "../types";
import { ReferenceBarItem } from "../ReferenceBarItem";

export interface CuratedSourceCardProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss?: (sourceId: string) => void;
  isReplacing?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (sourceId: string) => void;
  onEdit?: (source: DiscoveredSource) => void;
  onSaveEdit?: (sourceId: string, updates: Partial<DiscoveredSource>) => void;
  className?: string;
}

/**
 * CuratedSourceCard: Deprecated bulky multi-paragraph card container.
 * Now renders the ultra-compact, Apple-inspired horizontal ReferenceBarItem (~44px height).
 */
export const CuratedSourceCard: React.FC<CuratedSourceCardProps> = ({
  source,
  isApproved,
  onToggleApproval,
  onDismiss,
  isBookmarked = false,
  onToggleBookmark,
  onEdit,
  onSaveEdit,
  className = "",
}) => {
  return (
    <ReferenceBarItem
      source={source}
      isApproved={isApproved}
      onToggleApproval={onToggleApproval}
      onDismiss={onDismiss}
      isBookmarked={isBookmarked}
      onToggleBookmark={onToggleBookmark}
      onEdit={onEdit}
      onSaveEdit={onSaveEdit}
      className={className}
    />
  );
};

export default CuratedSourceCard;
