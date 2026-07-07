// The shared data-access layer (#28): one seam for fetch + auth-header attach +
// ok-guard + JSON parse + error mapping, the resilient multi-read pattern, and
// the defensive response-shape coercions — so screens stop hand-rolling (and
// drifting on) each of these. React binding lives in hooks/useGuardedLoad.ts;
// this module is plain TypeScript so Node consumers (e2e, contract tests) can
// import it safely.
import { authHeaders } from './auth';

// authHeaders() reads sessionStorage, which doesn't exist in Node (e2e, the
// contract test) — and this module must stay Node-safe like guestAuth.ts. No
// storage simply means no token to attach.
const safeAuthHeaders = (): Record<string, string> => {
  try {
    return authHeaders();
  } catch {
    return {};
  }
};

/**
 * Typed failure from the call primitives. `status` is set for HTTP-level
 * failures (non-2xx); network/parse failures leave it undefined. `label` is the
 * caller's short name for the read/write ("invites", "save template") so logs
 * and error states say which call failed without URL spelunking.
 */
export class ApiError extends Error {
  readonly label: string;

  readonly status?: number;

  constructor(label: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.label = label;
    this.status = status;
  }
}

// A body-stream read failure (connection reset mid-body, etc.) is a failed
// call, not a successful empty response — surface it instead of masking it.
const readBody = async (res: Response, label: string): Promise<string> => {
  try {
    return await res.text();
  } catch (e) {
    throw new ApiError(
      label,
      `${label}: failed to read the response body (${e instanceof Error ? e.message : String(e)})`,
      res.status,
    );
  }
};

interface CallOptions {
  /** Short human name for the call, used in errors/logs. Defaults to the URL. */
  label?: string;
  /** Extra headers; merged over the auto-attached auth headers. */
  headers?: Record<string, string>;
  /**
   * Cancels the underlying fetch when aborted (cache.ts threads this through
   * so a key switch stops the old key's request on the wire, admin#159).
   */
  signal?: AbortSignal;
}

/**
 * Read primitive: GET the URL, guard `res.ok`, parse JSON. The signed-in Google
 * token (when present) is attached automatically — same behavior consumers get
 * from the admin's patched fetch, made explicit. Throws ApiError on any failure.
 * A successful empty response (204, or 200 with a blank body) resolves to
 * undefined — reflected in the return type — rather than failing JSON parse.
 */
export async function getJson<T>(url: string, opts: CallOptions = {}): Promise<T | undefined> {
  const label = opts.label ?? url;
  let res: Response;
  try {
    res = await fetch(url, { headers: { ...safeAuthHeaders(), ...opts.headers }, signal: opts.signal });
  } catch (e) {
    throw new ApiError(label, `${label}: network error (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) throw new ApiError(label, `${label}: HTTP ${res.status}`, res.status);
  const text = await readBody(res, label);
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(label, `${label}: response was not valid JSON`, res.status);
  }
}

/**
 * Resilient read: like getJson but NEVER throws — a failure logs and returns
 * the fallback, so one failing endpoint degrades only its own slice of a
 * multi-read screen instead of blanking it. (The `jsonOr` both RSVP screens
 * independently reinvented, homed.)
 */
export async function jsonOr<T>(url: string, label: string, fallback: T, opts: CallOptions = {}): Promise<T> {
  try {
    return (await getJson<T>(url, { ...opts, label })) ?? fallback;
  } catch (e) {
    console.error(`data: ${label} failed to load:`, e);
    return fallback;
  }
}

interface SendOptions extends CallOptions {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialized as the request body when provided. */
  body?: unknown;
}

/**
 * Write primitive: JSON body, ok-guard, and error mapping that prefers the
 * server's own message — a non-2xx with `{ "error": "..." }` surfaces that text
 * (e.g. a 409 "template already exists") instead of a bare status code.
 * Returns the parsed response body, or undefined when the response has none
 * (reflected in the return type).
 */
export async function sendJson<T = void>(url: string, opts: SendOptions): Promise<T | undefined> {
  const label = opts.label ?? url;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...safeAuthHeaders(),
        ...opts.headers,
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch (e) {
    throw new ApiError(label, `${label}: network error (${e instanceof Error ? e.message : String(e)})`);
  }
  const text = await readBody(res, label);
  if (!res.ok) {
    let serverMessage: string | undefined;
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const m = parsed?.error ?? parsed?.message;
      if (typeof m === 'string' && m.trim()) serverMessage = m;
    } catch {
      /* non-JSON error body -> fall through to the status message */
    }
    throw new ApiError(label, serverMessage ?? `${label}: HTTP ${res.status}`, res.status);
  }
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(label, `${label}: response was not valid JSON`, res.status);
  }
}

/**
 * Defensive text coercion, homed here so every surface handles response-shape
 * quirks the same way. Coerce before trimming: joined API rows occasionally
 * carry a non-string in a field treated as text (e.g. a boolean `attending`),
 * and a bare `.trim()` on it throws — the failure class behind admin#69's
 * forever-spinner.
 */
export const clean = (v?: unknown): string => (v == null ? '' : String(v)).trim();

/**
 * Envelope coercion: accepts a bare array or an `{ items: [...] }` wrapper and
 * always returns a real array — anything else (error object, null, off-shape
 * envelope) becomes [] so a single bad read degrades its slice instead of
 * throwing out of the screen's view-model join.
 */
export const asArray = <T>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  const items = (v as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
};

export interface GuardedState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * The loading/error contract, as a plain function so the guarantee is testable
 * without React: run the loader (fetches AND the view-model transform — so a
 * bad field surfaces as an error state, not a hang), report the result through
 * `set`, and ALWAYS clear isLoading via finally. hooks/useGuardedLoad binds
 * this to component state.
 */
export async function runGuarded<T>(
  load: () => Promise<T>,
  set: (next: GuardedState<T>) => void,
  errorMessage: string,
): Promise<void> {
  set({ data: null, isLoading: true, error: null });
  let data: T | null = null;
  let error: string | null = null;
  try {
    data = await load();
  } catch (e) {
    console.error(`data: guarded load failed (${errorMessage}):`, e);
    error = errorMessage;
  } finally {
    set({ data, isLoading: false, error });
  }
}
