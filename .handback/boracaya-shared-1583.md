# cdk#1583 — the weekly advisory sweep, inline (boracaya-shared)

**Register** U60, U56, U57 · **Issue** [cdk#1583](https://github.com/patjab/boracaya-cdk/issues/1583) · **Epic** [cdk#1560](https://github.com/patjab/boracaya-cdk/issues/1560) · **Initiative** [cdk#1549](https://github.com/patjab/boracaya-cdk/issues/1549)

## What was wrong

`boracaya-cdk/docs/advisories.md` did the hard half of U60: every production
advisory across the eight repositories triaged, with a reachability verdict, and
zero left open. Then it ended by admitting that nothing holds it in place —

> `docs/advisories.md` is refreshed **by hand**. No CI job runs `npm audit`, in
> this repo or any of the other seven. Every bump recorded above could be
> reverted and no gate would notice.

A triage nobody re-checks decays into a document that describes a tree that has
moved on. That is what this closes.

## What changed

Two files.

* **`.github/workflows/advisory-sweep.yml`** — **an inline copy** of the ops
  `sweep` job, not a one-line `uses:`. This repository is **public**, and a
  public repository cannot call a **private** reusable workflow; boracaya-ops is
  private. That is the same constraint that already gives this repo its own
  inline pr-gate.

  The copy is *mechanical, not retyped*: the steps are the ops job verbatim with
  the four `workflow_call` inputs replaced by their literal defaults
  (`ubuntu-latest`, `package-lock.json`, `docs/advisory-dispositions.json`,
  `Dependency advisories — sweep`). The github-script body is **byte-identical**
  to the original — compared before committing — so a diff against the ops file
  shows only those substitutions, and re-copying it when ops changes is a
  mechanical step rather than a judgement call. The header records the ops SHA
  it was taken from.
* **`docs/advisory-dispositions.json`** — `{}`. No advisory in the record
  concerns this repository, and the audit at this head returns 0.

Being public also means this one is **free**: GitHub-hosted minutes on public
repositories are not billed, so the fleet's recurring cost is the seven private
repos only.

## Why this shape

The owner ruled on cdk#1583 on 2026-09-12 and this implements that ruling rather
than reopening it: **scheduled, non-blocking.** Once a week, per repository,
`npm audit --omit=dev --json`, opening or updating exactly **one** issue by
exact title, listing every advisory that is

* **absent** from that repo's dispositions — nobody has judged it yet;
* dispositioned **`fixed` yet present in the tree again** — a reverted bump;
* left **`investigating` past two refreshes**.

`not-affected` rows stay silent — the point of having triaged them. **Nothing
blocks a merge, and this must never be made a required check.**

Rejected, and still rejected: a **blocking gate** (turns unrelated PRs red the
moment an advisory lands upstream, with nobody awake to judge reachability), and
a **pinned-floor test** (catches a revert but is silent on anything new — it
protects only what has already been triaged).

The sweep runs **inside each repo**, on that repo's own `GITHUB_TOKEN`, because
an ops workflow cannot clone seven private repositories without a wider PAT
(ops#44 territory). No token crosses a repository boundary. `boracaya-shared` is
public and cannot call a private reusable workflow, so it carries an inline copy
— the existing pr-gate precedent.

## Decisions

Each one is written so it can be undone in a single change.

### 1. The audit's exit code is never obeyed

**Chosen:** the audit step captures `npm audit`'s exit code into a file and
ends `0`; the script judges whether the REPORT parsed.
**Rejected:** letting the step fail on a non-zero exit. `npm audit` exits **1
whenever it finds anything** — verified locally — so obeying it turns every
repo with an advisory into a red weekly job, which is the blocking gate the
owner rejected, arrived at by accident.
**Also rejected:** `continue-on-error`. It would swallow findings *and* a
genuinely broken run, and an unreadable report parsed as "empty" **closes** the
issue — the one outcome that must never happen silently.
**Reverse by:** changing the final `exit 0` in the audit step.

### 2. A row that is both *not affected* and *fixed* is recorded as `fixed`

**Chosen:** `fixed`, with the reachability sentence kept verbatim in `reason`.
**Rejected:** `not-affected`. The schema carries one state. `not-affected` is
the sweep's only silent branch, so it would stay silent through a revert —
losing exactly the thing cdk#1583 exists to catch. `fixed` is the state with
teeth; the reachability verdict is not lost, it is the `reason` and the prose.
**Reverse by:** changing the `state` in the JSON; the row goes quiet.

### 3. A broken dispositions file fails the job

**Chosen:** missing / unparseable / not-an-object → `core.setFailed`.
**Rejected:** treating it as empty. That lists every advisory as *new*, and —
worse — a typo'd path in a repo with no advisories would sweep clean forever
and nobody would ever find out.
**Reverse by:** replacing that `setFailed` with `raw = {}`.

### 4. Two refreshes = 14 days, and an undated `investigating` is stale

**Chosen:** `STALE_AFTER_DAYS = 14`, and an `investigating` row whose `since`
is missing or not `YYYY-MM-DD` is listed immediately — it cannot be shown to be
fresh.
**Rejected:** silence on an undated row, which lets an `investigating` sit
forever; `docs/advisories.md` already says that is not a resting state.
**Reverse by:** the one constant at the top of the script.

### 5. Hosted `ubuntu-latest`, not the desktop runners

**Chosen:** `ubuntu-latest`, overridable per caller via `runner-labels`.
**Rejected:** the self-hosted desktop runners. A *weekly* job must not depend
on a person's machine being awake — `runner-heartbeat.yml` documents that a
sleeping desktop produces no run at all, and no issue.
**Reverse by:** the caller passes `runner-labels` (a Linux runner; the steps
are bash and a guard rejects anything else loudly).

### 6. The script lives inline in the YAML

**Not really a choice.** A reusable workflow's `actions/checkout` checks out
the **caller**, so nothing in boracaya-ops is on disk while the job runs — a
`scripts/sweep.js` beside the workflow could not be `require`d. It is lifted
back out of the YAML and executed against mocks by the tests, which is the
`repo-drift.yml` precedent. Inputs reach it through `env`; a `${{ }}` in the
body would splice a caller's string into the source github-script executes, and
a test asserts there is none.

### 7. The issue body is replaced, not commented on

**Chosen:** update the body, so the issue always reads as current state.
**Rejected:** a comment per run — 52 a year would bury the list it exists to
show. (A *clean* sweep still comments once, saying it is closing.)
**Reverse by:** swapping the `issues.update` for a `createComment`.

## Gates

| Gate | Result |
|---|---|
| `actionlint` 1.7.12 on the new workflow | **clean, exit 0** |
| github-script body compared byte-for-byte against the ops original | **identical** |
| inline-copy contract, parsed from the YAML | **clean** — every action pinned to a 40-hex SHA, no `continue-on-error` on the job or any step, no `${{ }}` spliced into the script body, triggers exactly `schedule` + `workflow_dispatch`, permissions exactly `contents: read` + `issues: write`, and no surviving reference to the private ops workflow |
| cron stagger across all eight repos | **no clash** |
| `npm audit --omit=dev --json` at `e20e6b6`, lockfile only | **exit 0, 0 advisories** |

**Not run, and why:** one YAML file and one JSON file. No source file, lockfile
or test is touched, so the repo's build/test set has nothing to say about them.

## Mutation

This branch carries **configuration only** — one YAML file and one JSON file —
so there is no script here to mutate. The mutation bar is met where the logic
lives: **boracaya-ops, 19 mutations, 19 caught** (its handback has the table),
and **boracaya-cdk, 15/15** for the generator and the caller contract.

What is asserted here instead, by parsing the YAML rather than grepping it:

| Claim | Checked |
|---|---|
| the `uses:` ref is a 40-hex commit SHA, never a tag or branch | ✅ |
| the pin carries the house comment (`# ops …`, `cdk#1583`, `bump deliberately; never a mutable ref`) | ✅ |
| triggers are exactly `schedule` + `workflow_dispatch` | ✅ |
| no `pull_request` / `pull_request_target` / `push` / `merge_group` trigger | ✅ |
| permissions are exactly `contents: read` + `issues: write` | ✅ |
| the cron is weekly, off the hour, and clashes with no other repo's | ✅ |
| `docs/advisory-dispositions.json` parses, and every row has a state the sweep recognises plus `since` and `reason` | ✅ |
| every `reason` is the prose sentence from `docs/advisories.md`, verbatim | ✅ |

The identical check was run across all eight repos at once: **8/8 clean, no
cron clash.**

## For the desktop

**This branch does not depend on the ops pin**, because it carries the job
inline rather than a `uses:`. It can land at any point in the order. Its header
comment records the ops SHA the copy was taken from
(`55818de…`) — please update that to the merged ops `main` SHA when you bump the
other six, so the provenance line stays true.

**Keep the two in step from here on.** If the ops workflow changes, this copy
must be retaken; the byte-identical script body is what makes that a diff rather
than a rewrite.

### The landing order

**boracaya-ops first.** Every other repo pins the ops workflow by commit SHA,
so the callers can only be finalised once the ops PR has merged.

```
1. boracaya-ops       the reusable workflow, its tests, docs/advisory-sweep.md
2. boracaya-shared    independent of the pin (inline copy) - may land any time
3. the six callers    cdk, valet, shore, e2e, passport, heat, pact
```

**The one line you must bump in each caller, before opening its PR.** The pin
currently points at my ops *branch* head; it must point at the merged ops
`main` SHA:

```
  uses: patjab/boracaya-ops/.github/workflows/advisory-sweep.yml@55818de71b43806040aa6acaf43195fd823d58f9 # ops claude/boracaya-review-register-cloud-b @ 2026-09-13 (55818de) - cdk#1583; bump deliberately; never a mutable ref
```

becomes

```
  uses: patjab/boracaya-ops/.github/workflows/advisory-sweep.yml@<merged ops main SHA> # ops main @ <date> (<short>) - cdk#1583; bump deliberately; never a mutable ref
```

`boracaya-shared` has no `uses:` — it carries an inline copy — but its header
records the ops SHA it was taken from, and that line should be updated to the
merged SHA in the same pass, for provenance.

### When the schedule actually starts firing

A GitHub `schedule` only ever runs the workflow **as it exists on the
repository's default branch**. The defaults are not all `main`:

| Repo | PR base | Default branch | Sweep goes live |
|---|---|---|---|
| `boracaya-cdk` | `develop` | `main` | at the next develop → main promotion |
| `boracaya-valet` | `develop` | `main` | at the next develop → main promotion |
| `boracaya-shore` | `develop` | `main` | at the next develop → main promotion |
| `boracaya-pact` | `develop` | `main` | at the next develop → main promotion |
| `boracaya-passport` | `develop` | `develop` | on merge |
| `boracaya-heat` | `develop` | `develop` | on merge |
| `boracaya-e2e` | `main` | `main` | on merge |
| `boracaya-shared` | `main` | `main` | on merge |

Nothing is broken by this and nothing needs changing — but four of the eight
sweeps will be silent until a promotion, and that is worth knowing before
somebody reports the workflow as dead. Promotion is owner-gated and was not
mine to do.

### Runner and cost (protocol §6b)

`ubuntu-latest`, hosted. One job per repo per week: checkout, one `npm audit`,
one API call — no build, no `npm ci`. Budget **2 minutes a run** (the measured
audit is seconds; `timeout-minutes: 10` is a ceiling, not an expectation).

* 7 private repos × 1 run/week × 2 min ≈ **61 minutes a month**.
* `boracaya-shared` is public — hosted minutes on public repos are free — so it
  adds **0**.

About **3%** of the 2,000 free minutes on a GitHub Free personal account. It
starts no instance, NAT, endpoint or paid tier, so §6b rule 2 does not apply.
Off switch (§6b rule 3): delete the `schedule:` trigger.

### What I could not do, and what I did instead

* **No `gh`, no GitHub API.** No issue comment, no `## Run state`, no PR. Every
  word that would have gone on cdk#1583 is in these handbacks. **No PR exists
  yet for any of the nine branches.**
* **No AWS, no secrets.** Neither was needed: the sweep runs on each repo's own
  `GITHUB_TOKEN`.
* **The sweep has never executed against the real GitHub API.** Its decision
  table is proven against mocks (19 mutations, all caught) and its YAML against
  actionlint, but the first real run is the first scheduled run — or a
  `workflow_dispatch`, which is the cheapest way to prove it. Dispatching it
  **in boracaya-ops itself fails at the lockfile guard** (ops has no npm
  project); the hand run you want is a **caller's** own dispatch, after merge.
* **Nothing was verified about dev dependencies.** The sweep is `--omit=dev`,
  matching the record's scope. `docs/advisories.md` is explicit that the dev set
  is *unassessed, not cleared*; that pass still does not exist.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01KKEPWP7CHdkLp72HefdVeS
