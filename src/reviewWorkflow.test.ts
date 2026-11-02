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

describe('route wiring', () => {
  // The bash tests feed EVENT/HEAD_REPO/HEAD_REF/INPUT_OS directly; these are
  // the bindings that feed them on GitHub and the path the answer takes out
  // to the review job (Codex r2 on midtown-dash#384, same shape here).
  const route = LINES.slice(LINES.indexOf('  route:'), LINES.indexOf('  review:'));
  it.each([
    '      runner-os: ${{ steps.os.outputs.runner-os }}',
    '        id: os',
    '          EVENT: ${{ github.event_name }}',
    '          HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}',
    '          HEAD_REF: ${{ github.head_ref }}',
    '          INPUT_OS: ${{ inputs.runner-os }}',
  ])('route carries %s', (line) => expect(route).toContain(line));
  it('has one step id, exports the answer, and review reads it', () => {
    expect(route.filter((l) => /^ {8}id: /.test(l))).toHaveLength(1);
    expect(routeScript()).toContain('echo "runner-os=$os" >> "$GITHUB_OUTPUT"');
    expect(WF).toContain('\n  review:\n    needs: route\n');
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

});

// One step's lines, by the start of its name, up to the next step.
function stepBlock(name: string): string[] {
  const start = LINES.findIndex((l) => l.startsWith(`      - name: ${name}`) || l === `      - ${name}`);
  expect(start, name).toBeGreaterThan(0);
  const end = LINES.findIndex((l, i) => i > start && (l.startsWith('      - ') || /^ {2}\S/.test(l)));
  return LINES.slice(start, end < 0 ? undefined : end);
}
function runOf(block: string[]): string {
  const at = block.indexOf('        run: |');
  expect(at).toBeGreaterThan(0);
  return block.slice(at + 1).filter((l) => l.trim() === '' || l.startsWith('          ')).map((l) => l.slice(10)).join('\n') + '\n';
}

describe('the harness handoff', () => {
  // Codex r2 on #209: the two checkout destinations, the local action and the
  // workspace input must agree, at the audited SHA.
  it('checks this repo out into pr/ and the harness into .codex-review/ at the audited SHA', () => {
    const harness = stepBlock('The review harness (patjab/codex-review at the pinned SHA)');
    expect(harness).toContain('          repository: patjab/codex-review');
    expect(harness).toContain('          path: .codex-review');
    expect(harness).toContain('          token: ${{ steps.harness-token.outputs.token }}');
    expect(harness).toContain('          persist-credentials: false');
    expect(harness.find((l) => l.startsWith('          ref: '))).toMatch(/^ {10}ref: 62962edd4eb73028f2aef8c515c3391d36f50547 /);
    const pr = LINES.findIndex((l) => l === '          path: pr');
    expect(pr).toBeGreaterThan(0);
  });
  it('runs the harness from that folder against that checkout', () => {
    const round = stepBlock('Codex round');
    expect(round).toContain('        uses: ./.codex-review/review');
    expect(round).toContain('          workspace: ${{ github.workspace }}/pr');
  });
  it('mints the harness token for codex-review contents:read only', () => {
    const tok = stepBlock('Jeongyeon Reviewer App token for the harness');
    expect(tok).toContain('          repositories: codex-review');
    expect(tok).toContain('          permission-contents: read');
    expect(tok.filter((l) => /^ {10}permission-/.test(l))).toHaveLength(1);
  });
});

const GH_STUB = `#!/bin/sh
echo "$*" >> "$GH_LOG"
case "$GH_MODE" in
  same) echo patjab/boracaya-shared ;;
  fork) echo mallory/boracaya-shared ;;
  empty) echo ;;
  fail) echo "HTTP 404: Not Found" >&2; exit 1 ;;
esac
`;

function forkGuard(name: string, shell: string[], mode: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), GH_STUB, { mode: 0o755 });
  const script = path.join(dir, shell[0] === 'bash' ? 'guard.sh' : 'guard.ps1');
  fs.writeFileSync(script, runOf(stepBlock(name)));
  const log = path.join(dir, 'gh.log');
  const r = spawnSync(shell[0], [...shell.slice(1), script], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`, HOME: dir, GH_MODE: mode, GH_LOG: log,
           GITHUB_REPOSITORY: 'patjab/boracaya-shared', PR: '209', GH_TOKEN: 't' },
    encoding: 'utf8',
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), calls };
}

const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;
const guards: Array<[string, string[], boolean]> = [
  ['Guard - same-repo head (every entry point, macOS/Linux)', ['bash', '--noprofile', '--norc', '-eo', 'pipefail'], true],
  // The Windows step under pwsh where installed (hosted Ubuntu has it).
  ['Guard - same-repo head (every entry point)', ['pwsh', '-NoProfile', '-File'], hasPwsh],
];

describe.skipIf(process.platform === 'win32')('the API fork guards (every entry point)', () => {
  // Codex r2 on #209: run both guards against a stub gh for each answer.
  for (const [name, shell, available] of guards) {
    describe.skipIf(!available)(name, () => {
      it.each([
        ['same', 0, 'head is patjab/boracaya-shared (same repo)'],
        ['fork', 1, 'refusing a fork head (mallory/boracaya-shared)'],
        ['fail', 1, 'could not resolve the head repo of PR #209'],
        ['empty', 1, 'could not resolve the head repo of PR #209'],
      ])('gh answers %s -> exit %i', (mode, code, says) => {
        const r = forkGuard(name, shell, mode);
        expect(r.code, r.out).toBe(code);
        // Windows PowerShell 5.1 (production) turns a failing gh's stderr into
        // a terminating NativeCommandError under 'Stop' before the guard's own
        // message; pwsh 7 (this test) does not. Both exit non-zero, and that
        // exit is the contract (seen on the desktop: codex-review CI run
        // 41363223652). So the message is asserted only where 5.1 prints it.
        if (!(shell[0] === 'pwsh' && mode === 'fail')) expect(r.out).toContain(says);
        expect(r.calls).toBe('api repos/patjab/boracaya-shared/pulls/209 --jq .head.repo.full_name');
      });
    });
  }

  it('both run before anything from the PR is checked out', () => {
    const names = LINES.filter((l) => l.startsWith('      - ')).map((l) => l.trim());
    const firstCheckout = names.findIndex((n) => n.includes('actions/checkout@'));
    for (const [name] of guards) expect(names.findIndex((n) => n === `- name: ${name}`)).toBeLessThan(firstCheckout);
    expect(firstCheckout).toBeGreaterThan(0);
  });
});
