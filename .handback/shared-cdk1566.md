# cdk#1566 — the route contract's half: `POST /events/{eventId}/guest-token`

**Register entry:** U01
**Issue:** patjab/boracaya-cdk#1566
**Epic:** patjab/boracaya-cdk#1550
**Initiative:** patjab/boracaya-cdk#1549

Base head: `9745bebd002267951805a756f4e44db7afd7f84b` (`main`).

## What this is

cdk#1566 replaces userId-as-invitation with an event-scoped, revocable
invitation token, which needs a new endpoint. cdk's route gate
(`node test/check-route-contract.mjs`) compares `config/topology.json` against
this package's published `ApiRoutes` **in both directions**, so the new route
must exist here before cdk's topology entry can go green.

This branch is that one entry, and nothing else.

## What changed

`src/routes.ts` — one route added to `ApiRoutes`:

```ts
{ label: 'public', method: 'POST', path: '/events/{eventId}/guest-token' },
```

`dist/routes.js`, `dist/esm/routes.js` and `docs/tree-shaking.md` are the
rebuild, committed as the campaign requires.

## Decisions taken

| Decision | Chosen | Rejected | Reverse by |
| --- | --- | --- | --- |
| The path | `/events/{eventId}/guest-token`, exactly as cdk#1566 specifies | `/events/{eventId}/auth/guest-token`, which would sit with the rest of the auth family — see the desktop note; I did not silently "improve" the spec | One line here + one in cdk's `config/topology.json` |
| The label | `public` — the link is the credential, so the lane carries no authorizer, exactly like `/auth/exchange` | `admin`, which would require a JWT the caller does not yet have | One word here + topology |

## Gates

Node 20.20.2 / npm 10.8.2.

| Gate | Command | Result |
| --- | --- | --- |
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 — ESM bootstrap 1888 B gzip (92.4 % smaller than legacy 24799 B) |
| Tests | `npm test` | **19 files, 352/352 passed**, 5.19s |
| Export contracts | `npm run test:exports` (inside `npm test`) | exit 0 — legacy Node-resolution consumer compiled; 7 ESM fixture builds + a `require()` probe over 17 subpaths, all 17 loaded from the packed tarball |

## Mutations

**None, and deliberately so.** This change adds a row to a data table. There is
no behaviour here to remove: the assertion that gives the row its meaning lives
in cdk (`test/check-route-contract.mjs`), and the honest mutation for it —
delete the topology entry, watch the gate go red — belongs in the cdk handback,
where I can actually run it. Claiming a mutation here would be theatre.

## For the desktop

- **This must merge FIRST.** The landing order for cdk#1566 is:
  **merge shared → repin cdk's `boracaya-shared` dependency → cdk PR → shore PR → valet PR.**
- **cdk's route gate will be RED until you do.** `node test/check-route-contract.mjs`
  compares topology against the *pinned* shared build, so cdk's branch — which
  adds the topology entry — reports `in topology, MISSING from the contract:
  ['public POST /events/{eventId}/guest-token']` until cdk is repinned to a
  merged commit of this branch. That is expected, it is stated in the cdk
  handback too, and **the gate was not weakened and cdk was not pinned to an
  unmerged commit**.
- **One naming question worth 30 seconds of the owner's time.** Every other auth
  lane on this lambda is `/events/{eventId}/auth/…` (`exchange`, `claim`,
  `unlink`). cdk#1566 specifies `/events/{eventId}/guest-token`, so that is what
  I implemented — I am not going to redesign a stated API path on my own. But if
  the owner would rather it join the family as
  `/events/{eventId}/auth/guest-token`, now is the only cheap moment: it is one
  line here, one in cdk's `config/topology.json`, and one constant in the
  handler. After it ships it is a breaking change across four repos.
- **Unverified live premises:** none. Nothing here needed AWS or a deployed
  host.
- **Left out:** nothing. This is the whole of shared's part in cdk#1566.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01QXXM7vtoa5aUCdu3okTwox
