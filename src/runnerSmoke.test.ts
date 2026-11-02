// .github/workflows/runner-smoke.yml: this repository's copy of the
// per-registration identity smoke (patjab/boracaya-ops#143; the reference is
// boracaya-ops .github/workflows/runner-smoke.yml, ops#142). Not part of the
// package (tsconfig excludes *.test.ts); vitest runs it with the rest.
//
// A new registration carries only its unique quarantine label, so this
// dispatch-only workflow is the one thing that can route a job to it. This
// repo is public: only someone with write access can dispatch, the job runs
// only on a `quarantine-` label, and it checks nothing out and reads no
// secret, so a fork can neither trigger it nor reach a self-hosted runner
// through it. Pinned here: dispatch-only with a correlated run name, the
// quarantine-only selector, no checkout/secrets/`uses:`, a read-only token,
// inputs reaching scripts only through env, and the body below the header
// byte-identical to the reference (its SHA-256 is pinned in boracaya-ops
// tests/test_runner_smoke.py too). No YAML library here, so it reads lines.
import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const TEXT = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'runner-smoke.yml'), 'utf8');
// SHA-256 of everything from the `on:` line to the end of the reference
// (boracaya-ops main). Change the reference first, then every copy.
const REFERENCE_BODY_SHA256 = 'e5fa233469b6a318ffd8c6bf5f387e0091ae64fd949de02fb16c8cede62d8f98';
const BODY = TEXT.slice(TEXT.indexOf('\non:\n') + 1);
const LINES = BODY.split('\n');

describe('runner-smoke.yml (copy of the boracaya-ops reference)', () => {
  it('is dispatch-only, with the correlation in the run name', () => {
    const on = LINES.indexOf('on:');
    const triggers: string[] = [];
    for (const l of LINES.slice(on + 1)) {
      if (l && !l.startsWith(' ')) break;
      const m = /^ {2}([a-z_]+):/.exec(l);
      if (m) triggers.push(m[1]);
    }
    expect(triggers).toEqual(['workflow_dispatch']);
    const inputs = LINES.filter((l) => /^ {6}[a-z-]+:$/.test(l)).map((l) => l.trim().slice(0, -1));
    expect(inputs).toEqual(['label', 'correlation']);
    expect(LINES.find((l) => l.startsWith('run-name:'))).toContain('inputs.correlation');
  });

  it('only ever targets a quarantine label', () => {
    expect(LINES).toContain("    if: startsWith(inputs.label, 'quarantine-')");
    expect(LINES).toContain('    runs-on: ${{ inputs.label }}');
    expect(LINES.filter((l) => /^\s+runs-on:/.test(l))).toHaveLength(1);
  });

  it('checks nothing out, reads no secret, uses no action, holds a read-only token', () => {
    expect(TEXT).not.toContain('secrets.');
    expect(/^\s+-?\s*uses:/m.test(TEXT)).toBe(false);
    const perms = LINES.indexOf('permissions:');
    expect(LINES.slice(perms, perms + 3)).toEqual(['permissions:', '  contents: read', '']);
  });

  it('passes inputs to scripts through env, never by interpolation into run:', () => {
    const blocks = BODY.split(/\n {8}run: \|\n/).slice(1);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      const script: string[] = [];
      for (const l of b.split('\n')) {
        if (l !== '' && !l.startsWith('          ')) break;
        script.push(l);
      }
      expect(script.length).toBeGreaterThan(0);
      expect(script.join('\n')).not.toContain('${{ inputs.');
    }
  });

  it('is byte-identical to the reference below the header', () => {
    expect(createHash('sha256').update(BODY, 'utf8').digest('hex')).toBe(REFERENCE_BODY_SHA256);
  });
});
