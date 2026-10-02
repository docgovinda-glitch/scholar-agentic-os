import React from 'react';
import PresentationController, { type PresentationControllerProps } from './PresentationController';

export type KeynoteControllerProps = PresentationControllerProps;

/**
 * Backward compatibility wrapper for KeynoteController.
 * Deprecated: Use PresentationController instead.
 */
export default function KeynoteController(props: KeynoteControllerProps) {
  return (
    <div data-testid="keynote-controller" className="contents">
      <PresentationController {...props} />
    </div>
  );
}
