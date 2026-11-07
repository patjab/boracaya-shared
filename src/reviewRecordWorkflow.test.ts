// .github/workflows/review-record.yml: the merge gate runs on any `codex`
// runner, so its steps come once per OS. Not part of the package (tsconfig
// excludes *.test.ts); vitest runs it with the rest of the suite.
//
//  * The OS guards are READ: a skipped step does not fail a job, so a flipped
//    guard would leave a box running no check and the gate green.
//  * The macOS steps are RUN, under GitHub's bash flags, against a real temporary
//    clone. Only `git fetch` (the network) and python3.13 are stubbed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const WF = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'review-record.yml'), 'utf8');
const LINES = WF.split('\n');

const FETCH = 'Fetch the record checker from codex-review (clone, pinned)';
const VERIFY = 'Verify the review record';

function stepBlock(name: string): string[] {
  const start = LINES.indexOf(`      - name: ${name}`);
  expect(start, name).toBeGreaterThan(0);
  const next = LINES.findIndex((l, i) => i > start && /^ {6}- /.test(l));
  return LINES.slice(start, next === -1 ? undefined : next);
}

function runOf(block: string[]): string {
  const run = block.indexOf('        run: |');
  expect(run).toBeGreaterThan(0);
  return block.slice(run + 1).map((l) => l.slice(10)).join('\n') + '\n';
}

describe('review-record runner selection', () => {
  it('selects any codex runner, with no default shell to send PowerShell to a Mac', () => {
    expect(WF).toContain('    runs-on: [self-hosted, codex]\n');
    expect(WF).not.toMatch(/^ {4}defaults:/m);
  });

  it.each([FETCH, VERIFY])('%s runs exactly once on each OS, in that OS\'s shell', (name) => {
    const windows = stepBlock(`${name} (Windows)`);
    const macos = stepBlock(`${name} (macOS)`);
    expect(windows).toContain("        if: runner.os == 'Windows'");
    expect(windows).toContain('        shell: powershell');
    expect(macos).toContain("        if: runner.os != 'Windows'");
    expect(macos).toContain('        shell: bash');
  });

  it('every step that runs a command is one of the guarded pairs', () => {
    const names = LINES.filter((l) => /^ {6}- name: /.test(l)).map((l) => l.replace('      - name: ', ''));
    expect(names).toEqual([`${FETCH} (Windows)`, `${FETCH} (macOS)`, `${VERIFY} (Windows)`, `${VERIFY} (macOS)`]);
  });

  it('both OSes trust the same origins', () => {
    const pattern = '(git@github\\.com:|ssh://git@github\\.com/|https://github\\.com/)patjab/codex-review(\\.git)?/?$';
    expect(runOf(stepBlock(`${FETCH} (Windows)`))).toContain(`'^${pattern}'`);
    expect(runOf(stepBlock(`${FETCH} (macOS)`))).toContain(`'^${pattern}'`);
  });
});

describe.skipIf(process.platform === 'win32')('review-record macOS steps (run in bash)', () => {
  let tmp: string;
  let bin: string;
  let clone: string;
  let pin: string;
  const realGit = spawnSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const GOOD_ORIGIN = 'https://github.com/patjab/codex-review.git';

  const git = (...args: string[]) => {
    const r = spawnSync(realGit, ['-C', clone, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim();
  };

  // The real git, except that `fetch` (the network) succeeds without doing anything.
  const stubGit = (body = 'exit 0') => {
    const file = path.join(bin, 'git');
    fs.writeFileSync(file, `#!/bin/bash\nfor a in "$@"; do if [ "$a" = fetch ]; then ${body}; fi; done\nexec "${realGit}" "$@"\n`);
    fs.chmodSync(file, 0o755);
  };

  const stubPython = (code: number) => {
    const file = path.join(bin, 'python3.13');
    fs.writeFileSync(file, `#!/bin/bash\necho "$@" > "${tmp}/python.args"\nexit ${code}\n`);
    fs.chmodSync(file, 0o755);
  };

  const run = (script: string, env: Record<string, string>, pathValue = `${bin}:/usr/bin:/bin`) => {
    const file = path.join(tmp, 'step.sh');
    fs.writeFileSync(file, script);
    return spawnSync('/bin/bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], {
      env: { PATH: pathValue, HOME: tmp, RUNNER_TEMP: tmp, GITHUB_ENV: path.join(tmp, 'env'), GITHUB_STEP_SUMMARY: path.join(tmp, 'summary'), ...env },
      encoding: 'utf8',
      cwd: tmp,
    });
  };

  const fetchStep = (env: Record<string, string> = {}) =>
    run(runOf(stepBlock(`${FETCH} (macOS)`)), { CODEX_REVIEW_CLONE: clone, CODEX_REVIEW_PIN: pin, ...env });

  const verifyStep = (pathValue?: string) =>
    run(runOf(stepBlock(`${VERIFY} (macOS)`)), { BASE_REF: 'main', HEAD_SHA: 'abc', PR: '7', RECORD_CHECKER: '/checker' }, pathValue);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-record-'));
    bin = path.join(tmp, 'bin');
    clone = path.join(tmp, 'clone');
    fs.mkdirSync(bin);
    for (const dir of ['record', 'local', 'review']) fs.mkdirSync(path.join(clone, dir), { recursive: true });
    fs.writeFileSync(path.join(clone, 'record', 'record_check.py'), '# checker\n');
    fs.writeFileSync(path.join(clone, 'local', 'x'), 'x\n');
    fs.writeFileSync(path.join(clone, 'review', 'x'), 'x\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'checker');
    git('remote', 'add', 'origin', GOOD_ORIGIN);
    pin = git('rev-parse', 'HEAD');
    stubGit();
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('archives the checker at the pin and points the next step at it', () => {
    const r = fetchStep();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const dest = path.join(tmp, 'codex-review-record');
    expect(fs.readFileSync(path.join(tmp, 'env'), 'utf8')).toBe(`RECORD_CHECKER=${dest}\n`);
    expect(fs.existsSync(path.join(dest, 'record', 'record_check.py'))).toBe(true);
  });

  it('takes the checker at the pin, not at the clone\'s current commit', () => {
    fs.writeFileSync(path.join(clone, 'record', 'record_check.py'), '# changed later\n');
    git('commit', '-q', '-am', 'later');
    expect(fetchStep().status).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'codex-review-record', 'record', 'record_check.py'), 'utf8')).toBe('# checker\n');
  });

  it('defaults to ~/boracaya, never ~/Desktop, where a launchd agent may not read', () => {
    fs.mkdirSync(path.join(tmp, 'boracaya'));
    fs.renameSync(clone, path.join(tmp, 'boracaya', 'codex-review'));
    const r = fetchStep({ CODEX_REVIEW_CLONE: '' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('refuses a missing clone', () => {
    const r = fetchStep({ CODEX_REVIEW_CLONE: path.join(tmp, 'absent') });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('no patjab/codex-review clone');
  });

  it.each([
    'https://evil.example/https://github.com/patjab/codex-review',
    'https://github.com/patjab/codex-review-fork.git',
    'https://github.com/mallory/codex-review.git',
    'https://github.com/PATJAB/codex-review.git',
  ])('refuses a clone whose origin is %s', (origin) => {
    git('remote', 'set-url', 'origin', origin);
    const r = fetchStep();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('not patjab/codex-review');
    expect(fs.existsSync(path.join(tmp, 'env'))).toBe(false);
  });

  it.each([
    'git@github.com:patjab/codex-review.git',
    'ssh://git@github.com/patjab/codex-review',
    'https://github.com/patjab/codex-review/',
  ])('accepts the origin %s', (origin) => {
    git('remote', 'set-url', 'origin', origin);
    expect(fetchStep().status).toBe(0);
  });

  it('refuses when the fetch fails', () => {
    stubGit('exit 1');
    const r = fetchStep();
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('git fetch of codex-review failed');
  });

  it('refuses a pin the clone does not have', () => {
    const r = fetchStep({ CODEX_REVIEW_PIN: '0123456789012345678901234567890123456789' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('is not in the codex-review clone');
  });

  it('gives the checker the PR\'s base, head and number', () => {
    stubPython(0);
    const r = verifyStep();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'python.args'), 'utf8').trim()).toBe('/checker/record/record_check.py --base origin/main --head abc --pr 7');
  });

  it('fails the job when the checker fails, so a missing record cannot pass', () => {
    stubPython(3);
    expect(verifyStep().status).toBe(3);
  });

  it('fails rather than skips when python3.13 is absent', () => {
    const r = verifyStep(bin);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('no python3.13');
  });

  it('fails when the base branch cannot be fetched, without running the checker', () => {
    stubPython(0);
    stubGit('exit 1');
    expect(verifyStep().status).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'python.args'))).toBe(false);
  });
});
