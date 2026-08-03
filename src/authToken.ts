// Token-only browser identity primitives. Keeping these separate from the GIS
// loader lets CommonJS data/bootstrap consumers attach an existing token
// without retaining script-loading and sign-in-button implementation details.
export const ID_TOKEN_KEY = 'pdab_id_token';

export function getIdToken(): string | null {
  const token = sessionStorage.getItem(ID_TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp: number };
    if (exp * 1000 < Date.now()) {
      sessionStorage.removeItem(ID_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function authHeaders(): Record<string, string> {
  const token = getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Email claim from the current Google ID token, or null. */
export function getEmail(): string | null {
  const token = getIdToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(atob(payload)) as { email?: unknown };
    return typeof parsed.email === 'string' ? parsed.email : null;
  } catch {
    return null;
  }
}
