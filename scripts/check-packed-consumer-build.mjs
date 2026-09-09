/**
 * Build every consumer fixture against the PACKED package (cdk#1583 step 3).
 *
 * `check-consumer-exports.mjs` already audits a great deal — it packs with
 * `--dry-run` and asserts every `exports`, `main`/`module`/`types` and
 * `typesVersions` target appears in the manifest, and it bundles the same
 * fixtures. Two things it cannot see, and they are the reason this exists:
 *
 *  1. IT NEVER BUILDS A TARBALL. `--dry-run` reports a file LIST. A path can be
 *     listed and still not survive packing, and a consumer installs the
 *     tarball, not the manifest.
 *
 *  2. IT HAND-RESOLVES THE EXPORTS MAP. Its esbuild plugin reads
 *     `packageJson.exports[subpath][condition]` itself and returns a path under
 *     the working tree. That audits the map's CONTENTS but never asks Node to
 *     honour it — so an `exports` map that Node rejects, or one whose targets
 *     are right in-tree and absent from the package, passes.
 *
 * This packs for real, extracts into a throwaway `node_modules`, and builds
 * each fixture with esbuild's own resolver walking the installed package's
 * `exports`. What passes here is what a consumer gets from `npm install`.
 *
 * Peer UI packages stay external, exactly as the sibling audit does: this
 * compares the shared package's own resolution, not framework versions.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

/** The peers a consumer supplies; never bundled, in either audit. */
const external = ['react', 'react/*', '@mui/material', '@mui/material/*', '@emotion/*'];

/**
 * Fixtures that deliberately do NOT go through the exports map: the legacy
 * pair reaches for deep `dist/` paths to prove the compatibility aliases still
 * answer, and those are covered by the sibling audit's own runtime checks.
 */
const SKIP = new Set(['legacy-node-resolution.ts']);

const npmCli = process.env.npm_execpath;
assert(npmCli, 'npm_execpath is unavailable; run this through an npm script');

const workspace = await mkdtemp(join(tmpdir(), 'shared-packed-'));
try {
  // 1. Pack for real. --json gives the filename npm actually wrote.
  const packed = JSON.parse(execFileSync(
    process.execPath,
    [npmCli, 'pack', '--json', '--pack-destination', workspace],
    { cwd: root, encoding: 'utf8' },
  ))[0];
  assert.equal(packed.version, packageJson.version, 'packed version differs from package.json');

  // 2. Install it the way a consumer would see it: extracted under
  //    node_modules/<name>. npm tarballs are rooted at `package/`.
  const installed = join(workspace, 'node_modules', packageJson.name);
  await mkdir(installed, { recursive: true });
  execFileSync('tar', ['-xzf', join(workspace, packed.filename), '-C', installed, '--strip-components=1']);

  // The tarball must be self-sufficient for what the exports map promises.
  const installedPackageJson = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(installedPackageJson.exports).sort(),
    Object.keys(packageJson.exports).sort(),
    'the packed exports map differs from the source one',
  );

  // The peers a real consumer would already have installed. Linked rather
  // than copied: they are only here so the package's own imports of `react`
  // and MUI resolve — the point under test is the packed package, not them.
  for (const peer of Object.keys(packageJson.peerDependencies ?? {}).concat(
    ['react-dom', '@emotion/react', '@emotion/styled'],
  )) {
    const source = resolve(root, 'node_modules', peer);
    if (!existsSync(source)) continue;
    const target = join(workspace, 'node_modules', peer);
    await mkdir(dirname(target), { recursive: true });
    await symlink(source, target, 'dir');
  }

  // 3. A throwaway consumer holding the fixtures, resolving into that
  //    node_modules — esbuild's own resolver, not a plugin standing in for it.
  const consumer = join(workspace, 'consumer');
  await cp(resolve(root, 'fixtures/consumers'), consumer, { recursive: true });

  const fixtures = (await readdir(consumer)).filter((f) => f.endsWith('.ts') && !SKIP.has(f));
  assert(fixtures.length > 0, 'no consumer fixtures found');
  const subpaths = Object.keys(packageJson.exports).filter((s) => s !== './package.json');

  // Which dist tree a build resolved into is the only proof the condition was
  // honoured, so every build asserts it. This is not belt-and-braces: the
  // first version of this script ran both passes over the SAME fixtures and
  // both resolved entirely into dist/esm/ — identical byte counts — because
  // esbuild keeps its automatic `import` condition for ESM `import`
  // statements whatever else you add to `conditions`, and `import` is ordered
  // before `require` in the map (Codex r1 on #170).
  const treesUsed = (metafile) => {
    const inputs = Object.keys(metafile.inputs).filter((i) => i.includes(packageJson.name));
    return {
      esm: inputs.filter((i) => i.includes('/dist/esm/')).length,
      cjs: inputs.filter((i) => i.includes('/dist/') && !i.includes('/dist/esm/')).length,
    };
  };

  const results = [];

  // The ESM pass: each fixture as a bundler consumer actually writes it.
  for (const fixture of fixtures) {
    let output;
    try {
      output = await build({
        absWorkingDir: consumer,
        entryPoints: [join(consumer, fixture)],
        bundle: true,
        write: false,
        metafile: true,
        minify: true,
        treeShaking: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2018',
        external,
        // No `conditions` here on purpose. esbuild applies `import`
        // automatically for an ESM entry and that wins regardless of what this
        // array says — verified: setting it to ['require','node'] changes
        // nothing, the build still resolves entirely into dist/esm. A line
        // that looks load-bearing and is not is worse than no line, so the
        // assertion below is what proves which tree was used.
        nodePaths: [join(workspace, 'node_modules')],
        logLevel: 'silent',
      });
    } catch (error) {
      assert.fail(`${fixture} (ESM) failed to build against the packed package:\n${error.message}`);
    }
    const bytes = output.outputFiles[0].contents.byteLength;
    assert(bytes > 0, `${fixture} (ESM) bundled to nothing against the packed package`);
    const trees = treesUsed(output.metafile);
    assert(trees.esm > 0, `${fixture} (ESM) pulled no dist/esm module — the import condition was not honoured`);
    assert.equal(trees.cjs, 0, `${fixture} (ESM) fell back to the CommonJS tree`);
    results.push({ fixture, label: 'ESM', bytes });
  }

  // The CJS pass: one generated entry that `require`s every subpath. Written
  // with require() calls rather than reusing the fixtures, because that is the
  // only thing that makes the resolver take the `require` branch — and it
  // covers a superset of what the fixtures reach for.
  const cjsEntry = join(consumer, '__packed-require-probe.cjs');
  await writeFile(cjsEntry, [
    '"use strict";',
    'let sink = 0;',
    ...subpaths.map((subpath) => {
      const specifier = subpath === '.' ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`;
      return `sink += Object.keys(require(${JSON.stringify(specifier)})).length;`;
    }),
    'module.exports = sink;',
  ].join('\n'));

  let cjsOutput;
  try {
    cjsOutput = await build({
      absWorkingDir: consumer,
      entryPoints: [cjsEntry],
      bundle: true,
      write: false,
      metafile: true,
      minify: true,
      treeShaking: false,
      format: 'cjs',
      platform: 'node',
      target: 'es2018',
      external,
      conditions: ['require', 'node'],
      nodePaths: [join(workspace, 'node_modules')],
      logLevel: 'silent',
    });
  } catch (error) {
    assert.fail(`the require() probe failed to build against the packed package:\n${error.message}`);
  }
  assert(cjsOutput.outputFiles[0].contents.byteLength > 0, 'the require() probe bundled to nothing');
  const cjsTrees = treesUsed(cjsOutput.metafile);
  assert(cjsTrees.cjs > 0, 'the require() probe pulled no CommonJS module — the require condition was not honoured');
  assert.equal(cjsTrees.esm, 0, 'the require() probe reached into dist/esm — the require branch was not selected');
  results.push({ fixture: '__packed-require-probe.cjs', label: 'CJS', bytes: cjsOutput.outputFiles[0].contents.byteLength });

  // 4. And the runtime, from the installed copy: every subpath the map
  //    promises must actually load, through both conditions.
  const probe = join(workspace, 'probe.mjs');
  await writeFile(probe, [
    `import { createRequire } from 'node:module';`,
    `const require = createRequire(${JSON.stringify(join(consumer, 'x.js'))});`,
    `const specifiers = ${JSON.stringify(subpaths.map((s) => (s === '.'
      ? packageJson.name
      : `${packageJson.name}/${s.slice(2)}`)))};`,
    `for (const specifier of specifiers) {`,
    `  const esm = await import(specifier);`,
    `  if (typeof esm !== 'object') throw new Error(specifier + ' did not import');`,
    `  const cjs = require(specifier);`,
    `  if (typeof cjs !== 'object') throw new Error(specifier + ' did not require');`,
    `}`,
    `console.log(specifiers.length);`,
  ].join('\n'));
  const loaded = execFileSync(process.execPath, [probe], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: join(workspace, 'node_modules') },
  }).trim();
  assert.equal(Number(loaded), subpaths.length, 'not every subpath loaded from the packed package');

  console.log(
    `packed consumers: ${fixtures.length} ESM fixture builds (dist/esm) + a require() probe over `
    + `${subpaths.length} subpaths (dist), all ${subpaths.length} loaded at runtime from ${packed.filename}`,
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
