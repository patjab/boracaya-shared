// .github/workflows/codex-review.yml: where a review round may run
// (patjab/codex-review#25 section 5). Not part of the package (tsconfig
// excludes *.test.ts); vitest runs it with the rest of the suite.
//
//  * `route` is RUN: its own bash, under GitHub's `bash -e` flags, for each
//    event shape. Only a same-repo pull_request head matching
//    ^onboard/(windows|macos)/[a-z0-9-]+/[a-z0-9-]+$ selects an OS.
//  * the OS guards' `if:` expressions are EVALUATED (GitHub semantics:
//    string comparison ignores case, && / || return operands) over every
//    observed OS x requested OS, so a swapped == / != fails here.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const WF = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'codex-review.yml'), 'utf8');
const LINES = WF.split('\n');

function routeScript(): string {
  const start = LINES.indexOf('  route:');
  expect(start).toBeGreaterThan(0);
  const run = LINES.findIndex((l, i) => i > start && l === '        run: |');
  expect(run).toBeGreaterThan(start);
  const body: string[] = [];
  for (const l of LINES.slice(run + 1)) {
    if (l.trim() !== '' && !l.startsWith('          ')) break;
    body.push(l.slice(10));
  }
  return body.join('\n') + '\n';
}

function route(env: Record<string, string>): { code: number | null; output: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-'));
  const script = path.join(dir, 'step.sh');
  const out = path.join(dir, 'out');
  fs.writeFileSync(script, routeScript());
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    env: { PATH: process.env.PATH ?? '', GITHUB_REPOSITORY: 'patjab/boracaya-shared', GITHUB_OUTPUT: out,
           EVENT: '', HEAD_REPO: 'patjab/boracaya-shared', HEAD_REF: '', INPUT_OS: '', ...env },
    encoding: 'utf8',
  });
  const output = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, output };
}

describe.skipIf(process.platform === 'win32')('route (runs on hosted Ubuntu)', () => {
  it('selects the OS of a same-repo onboard head', () => {
    expect(route({ EVENT: 'pull_request', HEAD_REF: 'onboard/macos/op-1/shared' })).toEqual({ code: 0, output: 'runner-os=macos\n' });
    expect(route({ EVENT: 'pull_request', HEAD_REF: 'onboard/windows/a1/shared2' })).toEqual({ code: 0, output: 'runner-os=windows\n' });
  });
  it('selects nothing for any other head', () => {
    for (const ref of ['feat/x', 'onboard/macos/op', 'onboard/linux/op/s', 'onboard/macos/Op/s', 'onboard/macos/op/s/x', 'xonboard/macos/op/s']) {
      expect(route({ EVENT: 'pull_request', HEAD_REF: ref }), ref).toEqual({ code: 0, output: 'runner-os=\n' });
    }
  });
  it('never selects for a fork, and ignores the branch on a comment', () => {
    expect(route({ EVENT: 'pull_request', HEAD_REPO: 'mallory/boracaya-shared', HEAD_REF: 'onboard/macos/op/s' }).output).toBe('runner-os=\n');
    expect(route({ EVENT: 'issue_comment', HEAD_REF: 'onboard/macos/op/s' }).output).toBe('runner-os=\n');
  });
  it('passes a dispatch input of windows, macos or nothing, and refuses anything else', () => {
    for (const v of ['', 'windows', 'macos']) expect(route({ EVENT: 'workflow_dispatch', INPUT_OS: v })).toEqual({ code: 0, output: `runner-os=${v}\n` });
    expect(route({ EVENT: 'workflow_dispatch', INPUT_OS: 'linux' })).toEqual({ code: 1, output: '' });
  });
});

// A whitelist evaluator for the guards' expressions: paths, '...' strings,
// == != && || and parentheses.
type V = string | boolean | null;
function evaluate(src: string, ctx: Record<string, string>): V {
  const toks = src.match(/'(?:[^']|'')*'|&&|\|\||==|!=|\(|\)|[A-Za-z_][\w.-]*/g) ?? [];
  expect(toks.join('')).toBe(src.replace(/\s+/g, ''));
  let i = 0;
  const truthy = (v: V) => !(v === null || v === false || v === '');
  const eq = (a: V, b: V) => (typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const atom = (): V => {
    const t = toks[i++];
    if (t === '(') { const v = or(); expect(toks[i++]).toBe(')'); return v; }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (!(t in ctx)) throw new Error(`unmodelled ${t}`);
    return ctx[t];
  };
  const cmp = (): V => { let v = atom(); while (toks[i] === '==' || toks[i] === '!=') { const op = toks[i++]; const r = atom(); v = op === '==' ? eq(v, r) : !eq(v, r); } return v; };
  const and = (): V => { let v = cmp(); while (toks[i] === '&&') { i++; const r = cmp(); v = truthy(v) ? r : v; } return v; };
  const or = (): V => { let v = and(); while (toks[i] === '||') { i++; const r = and(); v = truthy(v) ? v : r; } return v; };
  const v = or();
  expect(i).toBe(toks.length);
  return truthy(v);
}

function guardIfs(): string[] {
  const ifs: string[] = [];
  LINES.forEach((l, n) => {
    if (l.startsWith('      - name: Guard - supported runner OS')) ifs.push(LINES[n + 1].replace(/^\s+if:\s*/, ''));
  });
  return ifs;
}

describe('the OS guard', () => {
  const cases: Array<[string, string, boolean]> = [
    ['Windows', '', false], ['Windows', 'windows', false], ['macOS', '', false], ['macOS', 'macos', false],
    ['Windows', 'macos', true], ['macOS', 'windows', true], ['Linux', '', true], ['Linux', 'linux', true],
  ];
  it.each(cases)('runner %s, runner-os %j -> refused %s', (observed, wanted, refused) => {
    const ifs = guardIfs();
    expect(ifs).toHaveLength(2);
    const fired = ifs.filter((e) => evaluate(e, { 'runner.os': observed, 'needs.route.outputs.runner-os': wanted }));
    expect(fired.length > 0).toBe(refused);
    expect(fired.length).toBeLessThanOrEqual(1);
  });

  it('selects [self-hosted, codex] plus only a known OS label', () => {
    expect(WF).toContain(`runs-on: \${{ fromJSON(needs.route.outputs.runner-os == 'windows' && '["self-hosted","codex","windows"]' || needs.route.outputs.runner-os == 'macos' && '["self-hosted","codex","macos"]' || '["self-hosted","codex"]') }}`);
  });

  it('checks the harness out at a full SHA, never a branch', () => {
    expect(WF).toMatch(/\n {10}repository: patjab\/codex-review\n {10}ref: [0-9a-f]{40} /);
  });
});
