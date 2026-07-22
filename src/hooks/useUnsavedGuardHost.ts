import * as React from 'react';
import { onBeforeUnload } from '../browser';

/**
 * The shell side of the navigation guard (#610): a mounted editor registers its
 * dirty-getter; any navigation that would leave it (tab/subtab switch, "Your
 * events", "Sign out") is intercepted with a confirm when there are unsaved
 * edits.
 *
 * A SET of getters, not a single slot (cdk#984): an editor can nest another
 * editor, so two guards can be live at once — each unregister removes only its
 * own getter, and navigation is dirty when ANY registrant says so.
 */
export const useUnsavedGuardHost = () => {
  const dirtyGetters = React.useRef(new Set<() => boolean>());
  const register = React.useCallback((isDirty: () => boolean) => {
    dirtyGetters.current.add(isDirty);
    return () => { dirtyGetters.current.delete(isDirty); };
  }, []);
  const guardValue = React.useMemo(() => ({ register }), [register]);
  const [pending, setPending] = React.useState<null | (() => void)>(null);
  const guard = (action: () => void) => {
    if ([...dirtyGetters.current].some((isDirty) => isDirty())) setPending(() => action);
    else action();
  };
  const proceed = () => { const act = pending; setPending(null); act?.(); };
  const stay = () => setPending(null);

  const anyDirty = React.useCallback(
    () => [...dirtyGetters.current].some((isDirty) => isDirty()), []);

  // Tab close / refresh / typed URL: the ONLY case a page cannot theme.
  // Browsers removed custom copy years ago (Chrome 2016, Firefox 2017) — a
  // page may trigger the native prompt and nothing more.
  React.useEffect(() => onBeforeUnload(anyDirty), [anyDirty]);

  return { guardValue, guard, pending, proceed, stay };
};
