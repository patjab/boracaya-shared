# boracaya-shared
Shared API constants, types, and hooks for Boracaya apps

## Version 10 migration

Version 10 makes `StageFormRenderer.messages` and `WizardShell.messages`
required. This is intentionally a major release: there is no implicit English
fallback after upgrading. Add each consumer's typed, localized renderer copy
before changing its shared dependency. The exact call sites and message fields
are documented in
[the renderer-message migration](docs/renderer-message-migration.md).

## Supported package surfaces

The package publishes native ESM and CommonJS compatibility output. New
frontend code should use one of the explicit subpaths; the root remains
supported for existing imports but intentionally exposes the complete legacy
surface.

| Subpath | Responsibility | React / MUI |
| --- | --- | --- |
| `boracaya-shared/bootstrap` | Shore-safe public endpoints, reads, environment/site links, and shell contracts | No |
| `boracaya-shared/api` | Public, guest, admin, account, invite, and Faces endpoint builders | No |
| `boracaya-shared/client` | Fetch, parse, guarded-state, and cache primitives | No |
| `boracaya-shared/identity` | Browser/admin and guest identity operations, without UI controls | No |
| `boracaya-shared/domain` | Plain event, About, Pulse, stage, style, date, and utility contracts | No |
| `boracaya-shared/browser` | Explicit DOM/window capabilities | No |
| `boracaya-shared/forms` | `StageFormRenderer`, `WizardShell`, and their message contracts | Yes |
| `boracaya-shared/ui` | Generic ErrorBoundary, Google sign-in control, and unsaved guard UI | Yes |
| `boracaya-shared/hooks` | Shared React hooks | React |
| `boracaya-shared/node` | Node-safe aggregate of domain and endpoint contracts | No |
| `boracaya-shared/switchboard` | Switchboard design tokens: the Bench and Arcade faces, fonts | No |

The explicit `dist/routes`, `dist/about`, and `dist/eventDate` aliases (with or
without `.js`) remain temporarily supported for existing fleet imports. New
code should use `api` or `domain`; the aliases can be removed only after those
consumers migrate. Every supported subpath also has an explicit
`typesVersions` declaration mapping for TypeScript projects that still use
legacy `moduleResolution: "Node"`.

`sideEffects` is `false`: package modules do not mutate global state at import
time. Browser/storage/network behavior is invoked only through exported
functions or mounted components. The consumer fixtures enforce that bootstrap,
identity, forms, Node, and switchboard each retain only their intended graph; their current
before/after evidence is in [docs/tree-shaking.md](docs/tree-shaking.md).

Typical Shore imports:

```ts
import { GuestEventApi, PublicApi, getJson } from 'boracaya-shared/bootstrap';
import { guestAuthHeaders } from 'boracaya-shared/identity';
import type { AboutTree, PublicEventMetadata } from 'boracaya-shared/domain';
import { StageFormRenderer } from 'boracaya-shared/forms';
```

The consoles (Valet, Mission Control) read one Switchboard token table from
`boracaya-shared/switchboard` (mission-control#47) and build their own MUI
theme, theme-mode store, and face toggle from it; those stay in each console:

```ts
import { SWITCHBOARD_TOKENS, type SwitchboardFace } from 'boracaya-shared/switchboard';
```

`PublicApi` is the tree-shakeable Shore replacement for the public members of
the compatibility `ApiConstants` object. Admin consumers import
`AdminEventApi` from `boracaya-shared/api` (or `boracaya-shared/node` in Node).

## Guest identity claim (cdk#1763)

`claimIdentity` (`boracaya-shared/identity`) is the client for
`POST /events/{eventId}/auth/claim`. On the invite-session lane (`userId` set),
it proves the session by sending this guest's own session as
`Authorization: Bearer <guest JWT>`, through the same `guestAuthHeaders` the
reservations calls use. A claim never replaces a Google account that is already
bound. The server refuses with a 409 that has no `candidates`, and the client
returns that as `{ kind: 'unlinkFirst' }`. To switch accounts, call
`unlinkIdentity` and then claim again. A 409 that does name candidates is still
`{ kind: 'chooser' }`. Exhaustive `switch (result.kind)` handlers need the new
case from 11.3.0 on.

## Guest session refresh (shore#395)

`refreshGuestSession(eventId)` (`boracaya-shared/identity`) is the client for
`POST /events/{eventId}/auth/refresh` (`GuestEventApi.refresh`). It renews the
live guest session this tab holds for the event, including one minted by a
Google claim or login, which has no invitation token to re-exchange. The only
credential is the cached guest JWT, sent as `Authorization: Bearer <guest JWT>`.
The server takes it only while it is unexpired, bound to this event (or to no
event), still a member of the event, and not revoked by the host.

It never throws, and it returns a `GuestSessionRefresh`:

- `{ kind: 'ok', token, userId, linkedEmail, displayName? }`: the new session
  is cached. `userId` comes from the new JWT's `sub` (the body has no userId),
  so a merged identity renews as its canonical id.
- `{ kind: 'noSession' }`: no session is cached for this event, so nothing was
  sent.
- `{ kind: 'unauthenticated' }` (401): the session is missing, invalid or
  already expired. It cannot be renewed.
- `{ kind: 'unknown' }` (403): the guest is no longer on the list, or the host
  revoked the link. Handle it like `InvitationExchange`'s `unknown`.
- `{ kind: 'superseded' }`: the cached session changed while the request was in
  flight (a claim, a login, a sign-out or another exchange). Nothing was
  written, and the newer session stays.
- `{ kind: 'error' }`: a network failure, a 5xx, or any other answer. Safe to
  retry.

The 401 and 403 arms leave the cache as it was. Call `clearGuestToken` if the
app signs the guest out. Concurrent calls for one session share a single
request.

Since 11.4.0 the mint lanes (`exchangeInvitationToken`, `exchangeLegacyInvite`,
`claimIdentity` and `loginNoEvent`) also return `displayName` on `ok`
(shore#503). The field is present only when the server names the guest with a
non-empty string, so results from an older backend keep their old shape.

## Guest session cache

Each event's guest session is cached under its own key (shore#529), so a guest
who opens two events in one tab stays signed in to both. `clearGuestToken(eventId)`
drops only that event's session; `clearGuestToken()` with no event still drops
every event's. `guestTokenExpiresInSeconds(eventId)` reads that event's expiry;
with no event it reads the session the tab cached most recently. A session
cached in the old single slot is still read for its own event and moves to that
event's key on the next write.

When the browser blocks site storage (shore#491), a session the server minted
is held in memory for the life of the tab instead, so `guestAuthHeaders` keeps
sending it. `ensureGuestToken` and `hasGuestSession` never throw, and
`claimIdentity`, `loginNoEvent` and `unlinkIdentity` return `ok` whenever the
server succeeded, even if the session could not be persisted.

A session's expiry is judged on the device's own clock from when it was
received (shore#530): the cache records the token's lifetime (`exp - iat`,
read from the JWT) counted from receipt, so a device clock that is fast or slow
against the server no longer expires fresh sessions or keeps dead ones. The
30-second margin stays. An entry or token without `iat` falls back to `exp`.

A 403 is a refusal only when the auth service wrote it (shore#401): the body
`{ "error": "unknown invitation" }` is `unknown` and, on the legacy lane,
`{ "error": "invitation link replaced" }` is `replaced`. Any other 403, such as
the WAF's `/auth/` rate-limit block with its non-JSON body, is `error`, which is
safe to retry. This holds for `exchangeInvitationToken`, `exchangeLegacyInvite`
and `refreshGuestSession`, so a caller may treat `unknown` as definite and sign
the guest out of the event.

`guestLinkedEmail(eventId, userId)` resolves to the linked Google, or to `null`
only when the server confirmed that none is linked (shore#483). When the link
state cannot be known (no session could be minted after a 429, a 5xx or a
network failure, the id was refused, or an id is missing), it rejects. Show an
error with a retry on rejection, and do not offer Link: a claim binds the
incoming Google, and without the current one no "replace?" check can run.
Before 11.5.0 it resolved to `null` in all of these cases.

## Client error reporting (cdk#1495)

`report.ts` is the one funnel every browser-side failure passes through: the
`ApiError` throw sites and swallow sites in `data.ts` / `cache.ts` (through the
`apiObserver` seam, so the bootstrap graph stays small), `ErrorBoundary`, and
the window `error` / `unhandledrejection` handlers an app installs with
`onUncaughtErrors` from `boracaya-shared/browser`. An app enables it once at
bootstrap:

```ts
import { initReporter, addBreadcrumb, flushReports, report } from 'boracaya-shared/client';
import { onDocumentClick, onUncaughtErrors, pageTelemetryContext } from 'boracaya-shared/browser';

initReporter({
  app: 'valet',
  release: import.meta.env.VITE_RELEASE ?? 'local',
  endpoint: PublicApi.TELEMETRY_ERRORS,
  context: () => ({ ...pageTelemetryContext(), eventId, auth: { hasToken, expiresInS } }),
});
onUncaughtErrors({
  onError: (message, error) => report('uncaught', { message, stack: (error as Error)?.stack }),
  onRejection: (reason) => report('rejection', { message: String(reason) }),
  onPageHide: flushReports,
});
onDocumentClick((id) => addBreadcrumb({ type: 'click', detail: id })); // data-testid / input:<type> / tag[role] — never a label or text
```

Reports are batched (`keepalive` POSTs to `POST /telemetry/errors`), capped at
20 per page load, deduped by fingerprint, and PII-scrubbed inside the module
(emails, JWTs and bearer tokens are redacted from every free-text field; the
shape is a fixed key allowlist). Before `initReporter` runs — and in every
Node consumer — the funnel is a no-op. `report()` never throws.

## Renderer and wizard messages

Shared form UI has no built-in English product copy. Consumers must supply the
typed `StageFormRendererMessages` contract, including count and ARIA
formatters; this keeps pluralization and locale rules in each app's catalog.

```tsx
import {
  StageFormRenderer,
  type StageFormRendererMessages,
} from 'boracaya-shared/forms';

const messages: StageFormRendererMessages = {
  yesOptionLabel: t('common.yes'),
  noOptionLabel: t('common.no'),
  listSeparatorHint: t('forms.separateWithCommas'),
  addEntryActionLabel: t('forms.addAnother'),
  requiredIndicator: t('forms.requiredIndicator'),
  requiredFieldLabel: t('forms.requiredFieldLabel'),
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) =>
    t('forms.removeEntry', { fieldLabel, entryNumber }),
  wizard: {
    backActionLabel: t('common.back'),
    nextActionLabel: t('common.next'),
    formatStepCount: ({ stepNumber, stepCount }) =>
      t('forms.stepCount', { stepNumber, stepCount }),
  },
};

<StageFormRenderer messages={messages} values={values} onChange={onChange} />;
```

The same `WizardMessages` value is passed directly to `WizardShell` when it is
used outside `StageFormRenderer`. The three known consumer call sites and the
catalog additions they require are listed in
[docs/renderer-message-migration.md](docs/renderer-message-migration.md).

## Distribution freshness

`npm run build` first removes the complete `dist/` tree, then regenerates
CommonJS, ESM, declaration files, and the tree-shaking report. Cleaning before
the CommonJS pass prevents deleted source modules from surviving in published
tarballs. CI rejects drift in `dist/` or `docs/tree-shaking.md`.

`npm run test:exports` compiles modern bundler fixtures and a legacy Node
resolution fixture, audits ESM and CommonJS retention, loads every export
through both runtime conditions, validates all `typesVersions` targets, and
checks the npm pack manifest.

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
  (e.g. a 409 conflict text) over a bare status code. A body's `code` (e.g.
  `ASK_CLOSED`) is kept as `ApiError.code`, so callers pick copy by code, not text.

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
