/**
 * The browser adapter (cdk#1107): product code never touches `window` directly —
 * it imports the named capability from here. Each export names a real
 * dependency, keeps jsdom/test behavior in one place, and leaves the door open
 * for non-browser rendering later.
 *
 * This is the shared union of the capabilities both Boracaya apps' local
 * adapters had grown; each app re-exports the subset it uses from its own
 * `browser` module, so the `window`-touching lives in ONE place across the apps
 * rather than being re-derived per app.
 */

/** The page URL as a fresh, mutable URL object. */
export const currentUrl = (): URL => new URL(window.location.href);

/** The current path — a raw-path read (e.g. invite-landing routing). */
export const currentPathname = (): string => window.location.pathname;

/** One query parameter off the current URL. */
export const queryParam = (name: string): string | null =>
  currentUrl().searchParams.get(name);

/** Local-dev detection: the vite dev server's loopback names. */
export const isLocalhost = (): boolean =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);

/** Viewport + outer-window dimensions, snapshotted for analytics. */
export const viewportSnapshot = () => ({
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  outerHeight: window.outerHeight,
  outerWidth: window.outerWidth,
});

/** A boolean opt-out flag persisted in localStorage ('true' = set). */
export const localFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false; // storage unavailable (private mode / disabled) — flag unset
  }
};

/** Rewrite the address bar in place, preserving history state (no navigation). */
export const replaceUrl = (url: URL): void =>
  window.history.replaceState(window.history.state, '', url);

/** Full-page navigation (leaves the SPA — for cross-tenant entry redirects). */
export const navigateTo = (path: string): void => window.location.assign(path);

/** Reload the current document. The ErrorBoundary's retry affordance (cdk#1203):
 *  after an unexpected throw the React tree is gone, so a fresh document is the
 *  only recovery the user can perform themselves. */
export const reloadPage = (): void => window.location.reload();

/** Subscribe to window resize; returns the unsubscribe. */
export const onWindowResize = (handler: () => void): (() => void) => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
};

/**
 * Subscribe to the shared package's auth-change event (`pdab-auth-change`,
 * dispatched by the auth lane on sign-in/out); returns the unsubscribe.
 */
export const onAuthChange = (handler: () => void): (() => void) => {
  window.addEventListener('pdab-auth-change', handler);
  return () => window.removeEventListener('pdab-auth-change', handler);
};

/** Subscribe to global keydown (dialog/lightbox keyboard nav); returns the unsubscribe. */
export const onGlobalKeydown = (handler: (e: KeyboardEvent) => void): (() => void) => {
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
};

/**
 * Warn on tab close / refresh / typed URL while `isDirty()` says work is
 * pending (cdk#1007). This is the one leave-path a page cannot theme: browsers
 * removed custom copy years ago (Chrome 2016, Firefox 2017), so a page may
 * only ask for the native prompt. Returns the unsubscribe.
 */
export const onBeforeUnload = (isDirty: () => boolean): (() => void) => {
  const handler = (e: BeforeUnloadEvent) => {
    if (!isDirty()) return;
    // Legacy path first, THEN preventDefault — order is load-bearing. On a
    // generic Event `returnValue = true` CLEARS the cancelled flag, so setting
    // it after preventDefault would undo the cancellation. Truthy matters too:
    // '' is the property's default and does not prompt (CodeRabbit on #323).
    // Modern browsers ignore the value entirely and show their own copy.
    e.returnValue = true;
    e.preventDefault();
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
};
