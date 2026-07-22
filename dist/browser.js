"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBeforeUnload = exports.onGlobalKeydown = exports.onAuthChange = exports.onWindowResize = exports.reloadPage = exports.navigateTo = exports.replaceUrl = exports.localFlag = exports.viewportSnapshot = exports.isLocalhost = exports.queryParam = exports.currentPathname = exports.currentUrl = void 0;
/** The page URL as a fresh, mutable URL object. */
const currentUrl = () => new URL(window.location.href);
exports.currentUrl = currentUrl;
/** The current path — a raw-path read (e.g. invite-landing routing). */
const currentPathname = () => window.location.pathname;
exports.currentPathname = currentPathname;
/** One query parameter off the current URL. */
const queryParam = (name) => (0, exports.currentUrl)().searchParams.get(name);
exports.queryParam = queryParam;
/** Local-dev detection: the vite dev server's loopback names. */
const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
exports.isLocalhost = isLocalhost;
/** Viewport + outer-window dimensions, snapshotted for analytics. */
const viewportSnapshot = () => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    outerHeight: window.outerHeight,
    outerWidth: window.outerWidth,
});
exports.viewportSnapshot = viewportSnapshot;
/** A boolean opt-out flag persisted in localStorage ('true' = set). */
const localFlag = (key) => {
    try {
        return localStorage.getItem(key) === 'true';
    }
    catch (_a) {
        return false; // storage unavailable (private mode / disabled) — flag unset
    }
};
exports.localFlag = localFlag;
/** Rewrite the address bar in place, preserving history state (no navigation). */
const replaceUrl = (url) => window.history.replaceState(window.history.state, '', url);
exports.replaceUrl = replaceUrl;
/** Full-page navigation (leaves the SPA — for cross-tenant entry redirects). */
const navigateTo = (path) => window.location.assign(path);
exports.navigateTo = navigateTo;
/** Reload the current document. The ErrorBoundary's retry affordance (cdk#1203):
 *  after an unexpected throw the React tree is gone, so a fresh document is the
 *  only recovery the user can perform themselves. */
const reloadPage = () => window.location.reload();
exports.reloadPage = reloadPage;
/** Subscribe to window resize; returns the unsubscribe. */
const onWindowResize = (handler) => {
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
};
exports.onWindowResize = onWindowResize;
/**
 * Subscribe to the shared package's auth-change event (`pdab-auth-change`,
 * dispatched by the auth lane on sign-in/out); returns the unsubscribe.
 */
const onAuthChange = (handler) => {
    window.addEventListener('pdab-auth-change', handler);
    return () => window.removeEventListener('pdab-auth-change', handler);
};
exports.onAuthChange = onAuthChange;
/** Subscribe to global keydown (dialog/lightbox keyboard nav); returns the unsubscribe. */
const onGlobalKeydown = (handler) => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
};
exports.onGlobalKeydown = onGlobalKeydown;
/**
 * Warn on tab close / refresh / typed URL while `isDirty()` says work is
 * pending (cdk#1007). This is the one leave-path a page cannot theme: browsers
 * removed custom copy years ago (Chrome 2016, Firefox 2017), so a page may
 * only ask for the native prompt. Returns the unsubscribe.
 */
const onBeforeUnload = (isDirty) => {
    const handler = (e) => {
        if (!isDirty())
            return;
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
exports.onBeforeUnload = onBeforeUnload;
