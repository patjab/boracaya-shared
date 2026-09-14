// The inline advisory sweep, EXECUTED (cdk#1583; Codex r2 on shared#175).
//
// `.github/workflows/advisory-sweep.yml` is a byte-for-byte copy of the
// boracaya-ops reusable workflow's job (this repo is public and cannot call a
// private reusable workflow), and the copy's tests live in ops. Nothing there
// pins THIS file: the smallest regression here -- turning the `fixed`-but-present
// branch into `continue`, or dropping `|| code=$?` on the audit line -- would
// merge green. So this runs the two steps that carry the behaviour, lifted out
// of the YAML, against fakes, and asserts outcomes: the exit status the audit
// step ends with, and which issue call the script made with what body.
//
// No YAML parser (a dependency this repo does not carry): the two blocks are
// sliced by their indentation, and the slicing asserts it found them.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// CRLF-normalised: a Windows checkout with autocrlf must not change what the slicer sees.
const WORKFLOW = readFileSync(new URL('../.github/workflows/advisory-sweep.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The first `key: |` block scalar after the line holding `marker`, dedented, ending at the first line indented less than the block. */
function blockScalar(marker: string, after: string): string {
  const lines = WORKFLOW.split('\n');
  const from = lines.findIndex((l) => l.includes(marker));
  if (from < 0) throw new Error(`no step "${marker}" in the workflow`);
  const start = lines.findIndex((l, i) => i > from && l.trimEnd().endsWith(after));
  if (start < 0) throw new Error(`no block scalar "${after}" after "${marker}" in the workflow`);
  const indent = lines[start + 1].match(/^ */)![0].length;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && line.match(/^ */)![0].length < indent) break;
    out.push(line.slice(indent));
  }
  return out.join('\n');
}

const AUDIT_STEP = blockScalar('name: npm audit (production dependencies)', 'run: |');
const SCRIPT = blockScalar('name: Open, update or close the advisory issue', 'script: |');

const CLEAN = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };
const LODASH = 'GHSA-35jh-r3h4-6jhm';
function auditWith(...ids: string[]) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      lodash: {
        name: 'lodash', severity: 'high', isDirect: true,
        via: ids.map((id, i) => ({ source: 100 + i, name: 'lodash', dependency: 'lodash', title: `${i} in lodash`,
          url: `https://github.com/advisories/${id}`, severity: 'high', range: '<1' })),
        effects: [], range: '<1', nodes: ['node_modules/lodash'], fixAvailable: true,
      },
    },
    metadata: { vulnerabilities: { total: ids.length } },
  };
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// ---- the audit step, under the invocation GitHub uses for `shell: bash` ----

function runAuditStep(npmExit: number) {
  const root = mkdtempSync(join(tmpdir(), 'sweep-'));
  dirs.push(root);
  const bin = join(root, 'bin');
  const workspace = join(root, 'workspace');
  mkdirSync(bin); mkdirSync(workspace);
  const tool = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}`);
    chmodSync(join(bin, name), 0o755);
  };
  tool('npm', `if [ "$1" = "--version" ]; then echo 10.9.7; exit 0; fi\nprintf '%s' '${JSON.stringify(CLEAN)}'\necho 'npm warn fake' >&2\nexit ${npmExit}\n`);
  tool('node', 'echo v20\n');
  writeFileSync(join(workspace, 'package-lock.json'), '{}');
  writeFileSync(join(root, 'step.sh'), AUDIT_STEP);
  const proc = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', join(root, 'step.sh')], {
    cwd: workspace, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, GITHUB_WORKSPACE: workspace, LOCKFILE: 'package-lock.json' },
  });
  const read = (n: string) => { try { return readFileSync(join(workspace, n), 'utf8').trim(); } catch { return null; } };
  return { status: proc.status, out: proc.stdout + proc.stderr, exitFile: read('audit-exit.txt'), report: read('audit.json') };
}

// Spawning bash three times is I/O-bound; under a full parallel vitest run on a loaded box
// it has exceeded the 5 s default. The bound is generous, not a hiding place.
const SPAWN_TIMEOUT_MS = 30_000;

describe('the audit step', () => {
  it('captures exit 1 (findings) and ends 0 under the -e every bash step inherits', () => {
    const r = runAuditStep(1);
    expect(r.status, r.out).toBe(0);
    expect(r.exitFile).toBe('1');
    expect(JSON.parse(r.report!)).toEqual(CLEAN);
  }, SPAWN_TIMEOUT_MS);
  it('records a clean audit as exit 0', () => {
    const r = runAuditStep(0);
    expect(r.status, r.out).toBe(0);
    expect(r.exitFile).toBe('0');
  }, SPAWN_TIMEOUT_MS);
  it('records a broken audit (exit 2) for the script to judge, rather than hiding it', () => {
    const r = runAuditStep(2);
    expect(r.status, r.out).toBe(0);
    expect(r.exitFile).toBe('2');
  }, SPAWN_TIMEOUT_MS);
});

// ---- the script step, as actions/github-script runs it, against fakes ----

type Case = { audit?: unknown; auditExit?: string; dispositions?: unknown; existing?: boolean; decoy?: 'user' | 'pasted' | 'bot' };
type Calls = { create: any[]; update: any[]; createComment: any[]; setFailed: string[] };

async function runScript(c: Case): Promise<Calls> {
  const files: Record<string, string> = {
    'audit.json': typeof c.audit === 'string' ? c.audit : JSON.stringify(c.audit ?? CLEAN),
    'audit-exit.txt': c.auditExit ?? '0',
    'audit-stderr.txt': '',
    'docs/advisory-dispositions.json': JSON.stringify(c.dispositions ?? {}),
  };
  const fakeFs = { readFileSync: (name: string) => { if (!(name in files)) { const e: any = new Error(`ENOENT ${name}`); e.code = 'ENOENT'; throw e; } return files[name]; } };
  const calls: Calls = { create: [], update: [], createComment: [], setFailed: [] };
  const TITLE = 'Dependency advisories — sweep';
  const BOT = { login: 'github-actions[bot]' };
  const openIssues: any[] = [];
  // The sweep's own issue: the title, the marker in its body, opened by the workflow token.
  if (c.existing) openIssues.push({ number: 91, title: TITLE, body: '<!-- advisory-sweep -->' + String.fromCharCode(10) + 'sweep', user: BOT });
  // Same-title issues that are NOT the sweep's (this repo is public; anyone can open one):
  if (c.decoy === 'user') openIssues.push({ number: 95, title: TITLE, body: 'I think we have advisories?', user: { login: 'someone' } });
  if (c.decoy === 'pasted') openIssues.push({ number: 96, title: TITLE, body: '<!-- advisory-sweep -->' + String.fromCharCode(10) + 'pasted', user: { login: 'someone' } });
  if (c.decoy === 'bot') openIssues.push({ number: 97, title: TITLE, body: 'opened by some other workflow', user: BOT });
  const github = {
    paginate: async (fn: any, args: any) => fn(args),
    rest: { issues: {
      listForRepo: async () => openIssues,
      create: async (a: any) => { calls.create.push(a); return { data: { number: 94 } }; },
      createComment: async (a: any) => { calls.createComment.push(a); },
      update: async (a: any) => { calls.update.push(a); },
    } },
  };
  const context = { repo: { owner: 'patjab', repo: 'boracaya-shared' }, serverUrl: 'https://github.com', runId: 7 };
  const summary = { addHeading() { return this; }, addRaw() { return this; }, async write() {} };
  const core = { info: () => {}, setFailed: (m: unknown) => calls.setFailed.push(String(m)), summary };
  // The inline copy carries its inputs as literal env values; the same three the script reads.
  process.env.DISPOSITIONS_PATH = 'docs/advisory-dispositions.json';
  process.env.ISSUE_TITLE = 'Dependency advisories — sweep';
  process.env.LOCKFILE = 'package-lock.json';
  process.env.SWEEP_NOW = '2026-09-13T00:00:00Z';
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('require', 'github', 'context', 'core', SCRIPT);
  const requireShim = (name: string) => (name === 'fs' ? fakeFs : require(name));
  await run(requireShim, github, context, core);
  return calls;
}

const written = (c: Calls) => c.create[0]?.body ?? c.update.find((u) => 'body' in u)?.body ?? '';

describe('the script step', () => {
  it('lists a fixed-but-present advisory as reverted, in one issue, without failing the job', async () => {
    const c = await runScript({ audit: auditWith(LODASH), auditExit: '1',
      dispositions: { [LODASH]: { state: 'fixed', since: '2026-09-09', reason: 'bumped out' } } });
    expect(c.create).toHaveLength(1);
    expect(written(c)).toContain(LODASH);
    expect(written(c)).toContain('**reverted**');
    expect(c.setFailed).toEqual([]);
  });
  it('lists an advisory absent from the dispositions as new', async () => {
    const c = await runScript({ audit: auditWith(LODASH), auditExit: '1', dispositions: {} });
    expect(written(c)).toContain('**new**');
    expect(c.setFailed).toEqual([]);
  });
  it('keeps a not-affected advisory silent and closes the open issue on a clean listing', async () => {
    const c = await runScript({ audit: auditWith(LODASH), auditExit: '1', existing: true,
      dispositions: { [LODASH]: { state: 'not-affected', since: '2026-09-09', reason: 'no path from input' } } });
    expect(c.create).toEqual([]);
    expect(c.update.some((u) => u.state === 'closed')).toBe(true);
  });
  it('fails on an audit that did not reach a verdict and touches no issue, even with a clean-looking report', async () => {
    for (const auditExit of ['2', '127', '']) {
      const c = await runScript({ audit: CLEAN, auditExit, existing: true });
      expect(c.setFailed, auditExit).toHaveLength(1);
      expect([c.create, c.update, c.createComment]).toEqual([[], [], []]);
    }
  });
  it('never mutates a same-title issue that is not its own (public repo: anyone can open one)', async () => {
    // One decoy per rejected clause: a human author; a human author who pasted the marker; the bot author without the marker.
    for (const decoy of ['user', 'pasted', 'bot'] as const) {
      const clean = await runScript({ audit: auditWith(LODASH), auditExit: '1', decoy,
        dispositions: { [LODASH]: { state: 'not-affected', since: '2026-09-09', reason: 'no path' } } });
      expect([clean.update, clean.createComment], decoy).toEqual([[], []]);
      const found = await runScript({ audit: auditWith(LODASH), auditExit: '1', decoy, dispositions: {} });
      expect(found.create, decoy).toHaveLength(1);
      expect(found.update, decoy).toEqual([]);
    }
  });
  it('fails on a report it cannot read rather than closing the issue', async () => {
    const c = await runScript({ audit: 'not json', auditExit: '1', existing: true });
    expect(c.setFailed).toHaveLength(1);
    expect(c.update).toEqual([]);
  });
});

// The copy is taken from boracaya-ops; the header says from which commit.
describe('provenance', () => {
  it('names the ops commit the copy was taken from', () => {
    expect(WORKFLOW).toMatch(/taken at ops\n# [0-9a-f]{40} \(main/);
  });
  it('is not a reusable-workflow call (a public repo cannot make one)', () => {
    expect(WORKFLOW).not.toMatch(/uses: patjab\/boracaya-ops\//);
  });
});

// ---- the action-pins step (cdk#1573): the pure decision, then the run against fakes ----
//
// Same reasoning as above: the copy's tests live in ops (tests/test_action_pins.py)
// and nothing there pins THIS file. The pure region is lifted between its markers
// and evaluated with nothing else in scope; the whole body then runs in a temp
// tree with the release lookups and the issues API answered from the case.

const PINS_SCRIPT = blockScalar('name: List action pins that are behind their latest release', 'script: |');
const CHECKOUT_V7 = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const CHECKOUT_V5 = 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09';
const LATEST = { 'actions/checkout': { tag: 'v7.0.1', sha: CHECKOUT_V7, signed: true } };
const wf = (...uses: string[]) => `name: x\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${uses.map((u) => `      - uses: ${u}`).join('\n')}\n`;

type PinRow = { line: number; kind: string };
type PureApi = {
  pinsBehind: (files: { path: string; text: string }[], latest: Record<string, unknown>, opts: { firstPartyOwner: string }) => PinRow[];
  actionsIn: (files: { path: string; text: string }[], owner: string) => string[];
};

/** The region between the pure markers, evaluated with nothing else in scope (as ops tests/action_pins_harness.js does). */
function pureApi(): PureApi {
  const START = '// >>> pure: action-pins';
  const start = PINS_SCRIPT.indexOf(START);
  const end = PINS_SCRIPT.indexOf('// <<< pure: action-pins');
  if (start < 0 || end < start) throw new Error('pure region markers not found in the action-pins script');
  const factory = new Function(`${PINS_SCRIPT.slice(start + START.length, end)}\n;return { pinsBehind, actionsIn };`);
  return factory() as PureApi;
}

describe('the action-pins decision', () => {
  const kinds = (rows: PinRow[]) => rows.map((r) => [r.line, r.kind]);
  it('lists a floating tag as unpinned and a stale commit as behind; a current labelled pin is silent', () => {
    const { pinsBehind } = pureApi();
    const files = [{ path: 'w.yml', text: wf('actions/checkout@v5', `actions/checkout@${CHECKOUT_V5} # v5.1.0`, `actions/checkout@${CHECKOUT_V7} # v7.0.1`) }];
    expect(kinds(pinsBehind(files, LATEST, { firstPartyOwner: 'patjab' }))).toEqual([[7, 'unpinned'], [8, 'behind']]);
  });
  it('lists a current commit whose comment does not name the release', () => {
    const { pinsBehind } = pureApi();
    const rows = pinsBehind([{ path: 'w.yml', text: wf(`actions/checkout@${CHECKOUT_V7} # v7`) }], LATEST, { firstPartyOwner: 'patjab' });
    expect(kinds(rows)).toEqual([[7, 'label']]);
  });
  it('lists a current, labelled pin whose release carries no verified signature (the ruling says signed)', () => {
    const { pinsBehind } = pureApi();
    const unsigned = { 'actions/checkout': { tag: 'v7.0.1', sha: CHECKOUT_V7, signed: false } };
    const rows = pinsBehind([{ path: 'w.yml', text: wf(`actions/checkout@${CHECKOUT_V7} # v7.0.1`) }], unsigned, { firstPartyOwner: 'patjab' });
    expect(kinds(rows)).toEqual([[7, 'unsigned']]);
  });
  it('skips first-party, local and docker references and never skips an action with no release', () => {
    const { pinsBehind, actionsIn } = pureApi();
    const files = [{ path: 'w.yml', text: wf('patjab/boracaya-ops/actions/e2e-gate@00f28cba239a1a0e128010ea330b9f763982436d # ops main', './.ops-review', 'docker://alpine:3', 'someone/tool@0123456789012345678901234567890123456789 # v1.0.0') }];
    expect(actionsIn(files, 'patjab')).toEqual(['someone/tool']);
    expect(kinds(pinsBehind(files, { 'someone/tool': null }, { firstPartyOwner: 'patjab' }))).toEqual([[10, 'no-release']]);
  });
});

type Release = { tag: string; sha: string; signed: boolean } | null | 'ERROR';
type PinCalls = Calls & { lookups: string[] };

/** The whole action-pins body, in a temp tree, with the release lookups and the issues API answered from the case. */
async function runPins(c: { files: Record<string, string>; releases?: Record<string, Release>; existing?: boolean }): Promise<PinCalls> {
  const root = mkdtempSync(join(tmpdir(), 'pins-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(c.files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const releases: Record<string, Release> = c.releases ?? LATEST;
  const calls: PinCalls = { create: [], update: [], createComment: [], setFailed: [], lookups: [] };
  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
  const rel = (o: string, r: string) => {
    calls.lookups.push(`${o}/${r}`);
    const x = releases[`${o}/${r}`];
    if (x == null) throw notFound();
    if (x === 'ERROR') throw Object.assign(new Error('boom'), { status: 500 });
    return x;
  };
  const MARKER = '<!-- action-pins -->';
  const openIssues: any[] = c.existing ? [{ number: 91, title: 'Action pins are behind — sweep', body: `${MARKER}\n## Motivation`, user: { login: 'github-actions[bot]' } }] : [];
  const github = {
    paginate: async (fn: any, args: any) => fn(args),
    rest: {
      repos: {
        getLatestRelease: async ({ owner, repo }: any) => ({ data: { tag_name: rel(owner, repo).tag } }),
        getCommit: async ({ owner, repo }: any) => ({ data: { commit: { verification: { verified: rel(owner, repo).signed } } } }),
      },
      git: { getRef: async ({ owner, repo }: any) => ({ data: { object: { type: 'commit', sha: rel(owner, repo).sha } } }) },
      issues: {
        listForRepo: async () => openIssues,
        create: async (a: any) => { calls.create.push(a); return { data: { number: 94 } }; },
        createComment: async (a: any) => { calls.createComment.push(a); },
        update: async (a: any) => { calls.update.push(a); },
      },
    },
  };
  const context = { repo: { owner: 'patjab', repo: 'boracaya-shared' }, serverUrl: 'https://github.com', runId: 7 };
  const summary = { addHeading() { return this; }, addRaw() { return this; }, async write() {} };
  const core = { info: () => {}, setFailed: (m: unknown) => calls.setFailed.push(String(m)), summary };
  process.env.PINS_ISSUE_TITLE = 'Action pins are behind — sweep';
  process.env.SWEEP_NOW = '2026-09-14T00:00:00Z';
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('require', 'github', 'context', 'core', PINS_SCRIPT);
  const cwd = process.cwd();
  process.chdir(root);
  try { await run(require, github, context, core); } finally { process.chdir(cwd); }
  return calls;
}

describe('the action-pins step', () => {
  it('opens one issue listing a pin that is behind, without failing the job', async () => {
    const c = await runPins({ files: { '.github/workflows/ci.yml': wf(`actions/checkout@${CHECKOUT_V5} # v5.1.0`) } });
    expect(c.create).toHaveLength(1);
    expect(c.create[0].body).toContain('<!-- action-pins -->');
    expect(c.create[0].body).toContain('**behind**');
    expect(c.setFailed).toEqual([]);
  });
  it('closes its open issue when every pin is current', async () => {
    const c = await runPins({ files: { '.github/workflows/ci.yml': wf(`actions/checkout@${CHECKOUT_V7} # v7.0.1`) }, existing: true });
    expect(c.create).toEqual([]);
    expect(c.update.some((u) => u.state === 'closed')).toBe(true);
  });
  it('keeps the issue open on a current pin of a release with no verified signature', async () => {
    const c = await runPins({ files: { '.github/workflows/ci.yml': wf(`actions/checkout@${CHECKOUT_V7} # v7.0.1`) }, existing: true,
      releases: { 'actions/checkout': { tag: 'v7.0.1', sha: CHECKOUT_V7, signed: false } } });
    expect(c.update.some((u) => u.state === 'closed')).toBe(false);
    expect(c.update.find((u) => 'body' in u)?.body).toContain('**unsigned**');
  });
  it('fails on a broken release lookup and touches no issue', async () => {
    const c = await runPins({ files: { '.github/workflows/ci.yml': wf(`actions/checkout@${CHECKOUT_V5} # v5.1.0`) }, releases: { 'actions/checkout': 'ERROR' }, existing: true });
    expect(c.setFailed).toHaveLength(1);
    expect([c.create, c.update, c.createComment]).toEqual([[], [], []]);
  });
});
