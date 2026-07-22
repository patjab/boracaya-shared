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
export declare const currentUrl: () => URL;
/** The current path — a raw-path read (e.g. invite-landing routing). */
export declare const currentPathname: () => string;
/** One query parameter off the current URL. */
export declare const queryParam: (name: string) => string | null;
/** Local-dev detection: the vite dev server's loopback names. */
export declare const isLocalhost: () => boolean;
/** Viewport + outer-window dimensions, snapshotted for analytics. */
export declare const viewportSnapshot: () => {
    innerHeight: number;
    innerWidth: number;
    outerHeight: number;
    outerWidth: number;
};
/** A boolean opt-out flag persisted in localStorage ('true' = set). */
export declare const localFlag: (key: string) => boolean;
/** Rewrite the address bar in place, preserving history state (no navigation). */
export declare const replaceUrl: (url: URL) => void;
/** Full-page navigation (leaves the SPA — for cross-tenant entry redirects). */
export declare const navigateTo: (path: string) => void;
/** Reload the current document. The ErrorBoundary's retry affordance (cdk#1203):
 *  after an unexpected throw the React tree is gone, so a fresh document is the
 *  only recovery the user can perform themselves. */
export declare const reloadPage: () => void;
/** Subscribe to window resize; returns the unsubscribe. */
export declare const onWindowResize: (handler: () => void) => (() => void);
/**
 * Subscribe to the shared package's auth-change event (`pdab-auth-change`,
 * dispatched by the auth lane on sign-in/out); returns the unsubscribe.
 */
export declare const onAuthChange: (handler: () => void) => (() => void);
/** Subscribe to global keydown (dialog/lightbox keyboard nav); returns the unsubscribe. */
export declare const onGlobalKeydown: (handler: (e: KeyboardEvent) => void) => (() => void);
/**
 * Warn on tab close / refresh / typed URL while `isDirty()` says work is
 * pending (cdk#1007). This is the one leave-path a page cannot theme: browsers
 * removed custom copy years ago (Chrome 2016, Firefox 2017), so a page may
 * only ask for the native prompt. Returns the unsubscribe.
 */
export declare const onBeforeUnload: (isDirty: () => boolean) => (() => void);
