# boracaya-shared
Shared API constants, types, and hooks for Boracaya apps

## Data-access layer (#28)

One seam for every screen's fetch + auth + parse + error handling, replacing the
per-screen hand-rolled versions that drifted (the admin#69 forever-spinner class).
All of it is exported from the package root.

**Call primitives** (`src/data.ts`, plain TS — safe to import in Node):

- `getJson<T>(url, { label?, headers? })` — GET, ok-guard, JSON parse. Attaches the
  signed-in Google token automatically. Throws a typed `ApiError` (`label`,
  `status?`) on any failure.
- `jsonOr<T>(url, label, fallback)` — resilient read: never throws; a failure logs
  and returns the fallback, so one failing endpoint degrades only its slice of a
  multi-read screen.
- `sendJson<T>(url, { method, body?, label? })` — write primitive: JSON body,
  ok-guard, and error mapping that prefers the server's own `{ error }` message
  (e.g. a 409 conflict text) over a bare status code.

**Shape coercions:**

- `clean(v)` — text coercion that survives non-strings (`clean(false)` → `"false"`,
  never a `.trim()` throw).
- `asArray<T>(v)` — accepts a bare array or `{ items: [...] }` envelope, returns a
  real array, anything off-shape → `[]`.

**The loading/error contract:**

- `runGuarded(load, set, errorMessage)` — plain-function core: runs the loader
  (fetches *and* the post-fetch view-model transform, so a bad field becomes an
  error state instead of a hang) and **always** clears `isLoading` via `finally`.
- `useGuardedLoad(load, errorMessage, deps?)` — the React binding: `{ data,
  isLoading, error, reload }`, loading on mount, guaranteed to settle.

Typical screen:

```ts
const { data: guests, isLoading, error, reload } = useGuardedLoad(async () => {
  const [invites, rsvps, pre] = await Promise.all([
    jsonOr<UserData[]>(ApiConstants.GET_ALL_INVITES, 'invites', []),
    jsonOr<RawRsvp[]>(ApiConstants.GET_ALL_RSVPS, 'rsvps', []),
    jsonOr(ApiConstants.GET_ALL_PRECHECKINS, 'precheckins', { items: [] }),
  ]);
  return buildGuests(asArray(invites), asArray(rsvps), asArray(pre));
}, 'We could not load the guest list. Please try again.');
```

`useApi` remains for existing callers but new code should use the layer above.
