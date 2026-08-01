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

The explicit `dist/routes`, `dist/about`, and `dist/eventDate` aliases (with or
without `.js`) remain temporarily supported for existing fleet imports. New
code should use `api` or `domain`; the aliases can be removed only after those
consumers migrate. Every supported subpath also has an explicit
`typesVersions` declaration mapping for TypeScript projects that still use
legacy `moduleResolution: "Node"`.

`sideEffects` is `false`: package modules do not mutate global state at import
time. Browser/storage/network behavior is invoked only through exported
functions or mounted components. The consumer fixtures enforce that bootstrap,
identity, forms, and Node each retain only their intended graph; their current
before/after evidence is in [docs/tree-shaking.md](docs/tree-shaking.md).

Typical Shore imports:

```ts
import { GuestEventApi, PublicApi, getJson } from 'boracaya-shared/bootstrap';
import { guestAuthHeaders } from 'boracaya-shared/identity';
import type { AboutTree, PublicEventMetadata } from 'boracaya-shared/domain';
import { StageFormRenderer } from 'boracaya-shared/forms';
```

`PublicApi` is the tree-shakeable Shore replacement for the public members of
the compatibility `ApiConstants` object. Admin consumers import
`AdminEventApi` from `boracaya-shared/api` (or `boracaya-shared/node` in Node).

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
