import React from 'react';

/**
 * A tiny channel so a deep editor can tell the shell "I have unsaved edits"
 * without lifting all its state (#610). The shell owns the actual guard +
 * confirm dialog and wraps every navigation entry point; an editor just
 * registers a getter for its own dirty flag.
 */
export interface UnsavedGuard {
  /** Register the mounted editor's dirty-getter; returns a cleanup that clears
   *  it (so a torn-down editor never keeps navigation blocked). */
  register: (isDirty: () => boolean) => () => void;
}

export const UnsavedGuardContext = React.createContext<UnsavedGuard>({
  register: () => () => {},
});

/** Register `dirty` with the shell's navigation guard for this editor's lifetime.
 *  The registered getter reads a ref kept current every render, so the shell
 *  always sees the latest dirty value — registering `() => dirty` in an effect
 *  instead would leave a post-paint window where a just-flipped dirty flag is
 *  still reported false and navigation slips past the guard (Copilot on #190). */
export const useUnsavedGuard = (dirty: boolean): void => {
  const { register } = React.useContext(UnsavedGuardContext);
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;
  React.useEffect(() => register(() => dirtyRef.current), [register]);
};
