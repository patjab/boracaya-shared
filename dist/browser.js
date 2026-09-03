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
exports.onBeforeUnload = exports.onGlobalKeydown = exports.pageTelemetryContext = exports.onDocumentClick = exports.onUncaughtErrors = exports.onAuthChange = exports.onWindowResize = exports.reloadPage = exports.navigateTo = exports.replaceUrl = exports.localFlag = exports.viewportSnapshot = exports.isLocalhost = exports.queryParam = exports.currentPathname = exports.currentUrl = void 0;
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
/**
 * Client error telemetry wiring (cdk#1495): the window-touching half of the
 * reporter. `report.ts` is DOM-free; this installs the global handlers and
 * supplies the page context it cannot read itself. Returns the unsubscribe.
 *
 *  - `error` / `unhandledrejection` -> one report each (kind uncaught / rejection)
 *  - `pagehide` -> flush the queue with keepalive, so a report from the last
 *    click before a tab closes still lands
 */
const onUncaughtErrors = (handlers) => {
    const onError = (e) => handlers.onError(e.message, e.error);
    const onRejection = (e) => handlers.onRejection(e.reason);
    const onPageHide = () => handlers.onPageHide();
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', onPageHide);
    return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        window.removeEventListener('pagehide', onPageHide);
    };
};
exports.onUncaughtErrors = onUncaughtErrors;
/**
 * Capture-phase click subscription for the reporter's click breadcrumbs
 * (cdk#1495). The handler receives the pressed control's ACCESSIBLE NAME only
 * — aria-label, then data-testid, then the tag — never input values or text
 * a guest typed. Returns the unsubscribe.
 */
const onDocumentClick = (handler) => {
    const listener = (e) => {
        var _a, _b, _c;
        const el = (_b = (_a = e.target) === null || _a === void 0 ? void 0 : _a.closest) === null || _b === void 0 ? void 0 : _b.call(_a, 'button, a, [role="button"], [role="tab"], [role="menuitem"], input, [data-testid]');
        if (!el)
            return;
        const name = el.getAttribute('aria-label') || el.getAttribute('data-testid')
            || (el.tagName === 'INPUT' ? `input:${(_c = el.getAttribute('type')) !== null && _c !== void 0 ? _c : 'text'}` : el.tagName.toLowerCase());
        handler(name);
    };
    window.document.addEventListener('click', listener, true);
    return () => window.document.removeEventListener('click', listener, true);
};
exports.onDocumentClick = onDocumentClick;
/** The page facts a client error report carries (cdk#1495): connectivity + UA + path. */
const pageTelemetryContext = () => ({
    route: window.location.pathname,
    online: window.navigator.onLine,
    ua: window.navigator.userAgent,
});
exports.pageTelemetryContext = pageTelemetryContext;
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
