// Token-only browser identity primitives. Keeping these separate from the GIS
// loader lets CommonJS data/bootstrap consumers attach an existing token
// without retaining script-loading and sign-in-button implementation details.
export const ID_TOKEN_KEY = 'pdab_id_token';
export function getIdToken() {
    const token = sessionStorage.getItem(ID_TOKEN_KEY);
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp } = JSON.parse(atob(payload));
        if (exp * 1000 < Date.now()) {
            sessionStorage.removeItem(ID_TOKEN_KEY);
            return null;
        }
        return token;
    }
    catch (_a) {
        return null;
    }
}
export function authHeaders() {
    const token = getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Email claim from the current Google ID token, or null. */
export function getEmail() {
    const token = getIdToken();
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const parsed = JSON.parse(atob(payload));
        return typeof parsed.email === 'string' ? parsed.email : null;
    }
    catch (_a) {
        return null;
    }
}
