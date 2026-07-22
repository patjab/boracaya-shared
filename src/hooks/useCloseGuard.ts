import * as React from 'react';

/**
 * Loss prevention for overlays that own their own Save (cdk#1007): the guest
 * drawer and the Steps editor dialog. Both close on a backdrop click or Escape,
 * which discarded unsaved edits silently — the shell's navigation guard never
 * sees these because closing an overlay is not navigation.
 *
 * Clean: close immediately. Dirty: ask first. The confirm state lives here so
 * each overlay renders the same dialog rather than inventing its own.
 */
export const useCloseGuard = ({ dirty, onClose }: {
  dirty: boolean;
  onClose: () => void;
}) => {
  const [confirming, setConfirming] = React.useState(false);

  /** Wire this to the overlay's onClose AND its explicit close button. */
  const requestClose = React.useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  const discard = React.useCallback(() => {
    setConfirming(false);
    onClose();
  }, [onClose]);

  const keepEditing = React.useCallback(() => setConfirming(false), []);

  return { confirming, requestClose, discard, keepEditing };
};
