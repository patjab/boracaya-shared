import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, 'docs/tree-shaking.md');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const external = [
  'react',
  'react/*',
  '@mui/material',
  '@mui/material/*',
  '@emotion/*',
];

const packageSubpath = (specifier) => {
  if (specifier === packageJson.name) return '.';
  const prefix = `${packageJson.name}/`;
  return specifier.startsWith(prefix) ? `./${specifier.slice(prefix.length)}` : undefined;
};

/** Force esbuild onto one published condition so both graphs are audited. */
const publishedConditionPlugin = (condition) => ({
  name: `published-${condition}-condition`,
  setup(builder) {
    builder.onResolve({ filter: /^boracaya-shared(?:\/.*)?$/ }, ({ path }) => {
      const subpath = packageSubpath(path);
      const entry = subpath && packageJson.exports[subpath];
      assert(entry && typeof entry === 'object', `fixture imports unsupported subpath ${path}`);
      assert(typeof entry[condition] === 'string', `${path} lacks published ${condition} target`);
      return { path: resolve(root, entry[condition]) };
    });
  },
});

const bundle = async (fixture, { condition = 'import', platform = 'browser' } = {}) => {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, 'fixtures/consumers', fixture)],
    bundle: true,
    write: false,
    metafile: true,
    minify: true,
    treeShaking: true,
    format: 'esm',
    platform,
    target: 'es2018',
    external,
    plugins: [publishedConditionPlugin(condition)],
    logLevel: 'silent',
  });
  const output = result.outputFiles[0].contents;
  return {
    bytes: output.byteLength,
    gzipBytes: gzipSync(output).byteLength,
    code: new TextDecoder().decode(output),
    inputs: Object.keys(result.metafile.inputs).map((path) => path.replaceAll('\\', '/')),
  };
};

const hasInput = (result, suffix) => {
  const normalized = suffix.replace(/^\/+/, '');
  return result.inputs.some((path) => path === normalized || path.endsWith(`/${normalized}`));
};

const assertInputs = (result, suffixes, label) => {
  for (const suffix of suffixes) {
    assert(hasInput(result, suffix), `${label} must retain ${suffix}`);
  }
};

const assertNoInputs = (result, suffixes, label) => {
  for (const suffix of suffixes) {
    assert(!hasInput(result, suffix), `${label} unexpectedly retained ${suffix}`);
  }
};

const sharedInputCount = (result) => result.inputs.filter((path) =>
  path.startsWith('dist/') || path.includes('/dist/')).length;

const bothConditions = async (fixture, options = {}) => ({
  esm: await bundle(fixture, { ...options, condition: 'import' }),
  cjs: await bundle(fixture, { ...options, condition: 'require' }),
});

const legacy = await bundle('legacy-shore-root.ts', { condition: 'require' });
const bootstrap = await bothConditions('shore-bootstrap.ts');
const identity = await bothConditions('shore-identity.ts');
const shoreForms = await bothConditions('shore-forms.ts');
const valetBrowser = await bothConditions('valet-browser.ts');
const valetForms = await bothConditions('valet-forms.ts');
const nodeSurface = await bothConditions('valet-node.ts', { platform: 'node' });

assertInputs(legacy, [
  '/dist/StageFormRenderer.js',
  '/dist/WizardShell.js',
  '/dist/api.js',
], 'legacy CommonJS root');
assert.match(legacy.code, /valet-api/, 'legacy root must demonstrate retained admin endpoint code');

for (const [condition, result] of Object.entries(bootstrap)) {
  const prefix = condition === 'esm' ? '/dist/esm' : '/dist';
  assertInputs(result, [
    `${prefix}/publicApi.js`,
    `${prefix}/authToken.js`,
  ], `${condition.toUpperCase()} bootstrap`);
  assertNoInputs(result, [
    `${prefix}/api.js`,
    `${prefix}/auth.js`,
    `${prefix}/StageFormRenderer.js`,
    `${prefix}/WizardShell.js`,
    `${prefix}/ErrorBoundary.js`,
    `${prefix}/GoogleSignInButton.js`,
  ], `${condition.toUpperCase()} bootstrap`);
  assert.doesNotMatch(result.code, /@mui|valet-api|accounts\.google\.com\/gsi/);
}
assert(
  bootstrap.esm.gzipBytes < legacy.gzipBytes * 0.5,
  `ESM bootstrap gzip must be less than half the legacy root (${bootstrap.esm.gzipBytes} vs ${legacy.gzipBytes})`,
);
assert(
  bootstrap.esm.gzipBytes < bootstrap.cjs.gzipBytes * 0.5,
  `ESM bootstrap gzip must be less than half the granular CommonJS build (${bootstrap.esm.gzipBytes} vs ${bootstrap.cjs.gzipBytes})`,
);

assertInputs(identity.esm, [
  '/dist/esm/authToken.js',
  '/dist/esm/guestAuth.js',
  '/dist/esm/publicApi.js',
], 'actual Shore ESM identity');
assertNoInputs(identity.esm, [
  '/dist/esm/api.js',
  '/dist/esm/GoogleSignInButton.js',
], 'actual Shore ESM identity');
assert.doesNotMatch(
  identity.esm.code,
  /@mui|valet-api|accounts\.google\.com\/gsi|from\s*["']react["']/,
);

// The compatibility identity barrel legitimately loads auth.js because it
// publishes initAuth/signOut as well as token calls. It must still exclude all
// admin/API and React UI implementation.
assertInputs(identity.cjs, [
  '/dist/auth.js',
  '/dist/authToken.js',
  '/dist/guestAuth.js',
  '/dist/publicApi.js',
], 'actual Shore CommonJS identity');
assertNoInputs(identity.cjs, [
  '/dist/api.js',
  '/dist/GoogleSignInButton.js',
  '/dist/StageFormRenderer.js',
  '/dist/WizardShell.js',
], 'actual Shore CommonJS identity');
assert.doesNotMatch(identity.cjs.code, /@mui|valet-api|from\s*["']react["']/);

for (const [consumer, variants] of [
  ['Shore forms', shoreForms],
  ['Valet forms', valetForms],
]) {
  for (const [condition, result] of Object.entries(variants)) {
    const prefix = condition === 'esm' ? '/dist/esm' : '/dist';
    assertInputs(result, [
      `${prefix}/StageFormRenderer.js`,
      `${prefix}/WizardShell.js`,
    ], `${consumer} ${condition.toUpperCase()}`);
    assertNoInputs(result, [
      `${prefix}/api.js`,
      `${prefix}/publicApi.js`,
      `${prefix}/auth.js`,
      `${prefix}/authToken.js`,
    ], `${consumer} ${condition.toUpperCase()}`);
    assert.match(result.code, /@mui\/material/);
    assert.doesNotMatch(result.code, /valet-api/);
  }
}

for (const [condition, result] of Object.entries(valetBrowser)) {
  const prefix = condition === 'esm' ? '/dist/esm' : '/dist';
  assertInputs(result, [`${prefix}/api.js`], `Valet browser ${condition.toUpperCase()}`);
  assertNoInputs(result, [
    `${prefix}/auth.js`,
    `${prefix}/browser.js`,
    `${prefix}/ErrorBoundary.js`,
    `${prefix}/GoogleSignInButton.js`,
    `${prefix}/StageFormRenderer.js`,
    `${prefix}/WizardShell.js`,
  ], `Valet browser ${condition.toUpperCase()}`);
  assert.match(result.code, /valet-api/);
  assert.doesNotMatch(result.code, /@mui|from\s*["']react["']/);
}

for (const [condition, result] of Object.entries(nodeSurface)) {
  const prefix = condition === 'esm' ? '/dist/esm' : '/dist';
  assertNoInputs(result, [
    `${prefix}/auth.js`,
    `${prefix}/authToken.js`,
    `${prefix}/browser.js`,
    `${prefix}/ErrorBoundary.js`,
    `${prefix}/GoogleSignInButton.js`,
    `${prefix}/StageFormRenderer.js`,
    `${prefix}/WizardShell.js`,
  ], `Node surface ${condition.toUpperCase()}`);
  assert.doesNotMatch(result.code, /@mui|from\s*["']react["']/);
}

const expectedSubpaths = [
  '.',
  './api',
  './bootstrap',
  './browser',
  './client',
  './dist/about',
  './dist/about.js',
  './dist/eventDate',
  './dist/eventDate.js',
  './dist/routes',
  './dist/routes.js',
  './domain',
  './forms',
  './hooks',
  './identity',
  './node',
  './package.json',
  './ui',
];
assert.equal(packageJson.version, '10.0.0');
assert.equal(packageJson.sideEffects, false);
assert.deepEqual(Object.keys(packageJson.exports).sort(), expectedSubpaths);
assert(!Object.keys(packageJson.exports).some((key) => key.includes('*')), 'exports must stay explicit');
assert.equal(packageJson.scripts.clean, 'node scripts/clean-dist.mjs');
assert.match(
  packageJson.scripts.build,
  /^npm run clean && npm run build:cjs/,
  'the full build must clean all dist output before CommonJS compilation',
);

for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
  if (subpath === './package.json') continue;
  for (const condition of ['types', 'import', 'require']) {
    assert(typeof conditions[condition] === 'string', `${subpath} lacks ${condition}`);
    await access(resolve(root, conditions[condition]));
  }
}

const typeMappings = packageJson.typesVersions?.['*'];
assert(typeMappings && typeof typeMappings === 'object', 'typesVersions must publish a catch-all compiler range');
assert.deepEqual(Object.keys(packageJson.typesVersions), ['*'], 'typesVersions compiler ranges changed');
const typeBearingSubpaths = expectedSubpaths.filter((subpath) =>
  subpath !== '.' && subpath !== './package.json');
assert.deepEqual(
  Object.keys(typeMappings).sort(),
  typeBearingSubpaths.map((subpath) => subpath.slice(2)).sort(),
  'typesVersions must map every supported type-bearing subpath exactly',
);
for (const subpath of typeBearingSubpaths) {
  const expectedType = packageJson.exports[subpath].types.replace(/^\.\//, '');
  const mapping = typeMappings[subpath.slice(2)];
  assert.deepEqual(mapping, [expectedType], `${subpath} typesVersions target drifted from exports.types`);
  await access(resolve(root, expectedType));
}

const require = createRequire(import.meta.url);
const runtimeModules = new Map();
for (const subpath of expectedSubpaths.filter((value) => value !== './package.json')) {
  const specifier = subpath === '.'
    ? packageJson.name
    : `${packageJson.name}/${subpath.slice(2)}`;
  const cjs = require(specifier);
  const esm = await import(specifier);
  assert.equal(typeof cjs, 'object', `${specifier} did not resolve through require`);
  assert.equal(typeof esm, 'object', `${specifier} did not resolve through import`);
  runtimeModules.set(subpath, { cjs, esm });
}

const { cjs: cjsRoot, esm: esmRoot } = runtimeModules.get('.');
const { cjs: cjsBootstrap, esm: esmBootstrap } = runtimeModules.get('./bootstrap');
const { esm: esmNode } = runtimeModules.get('./node');

assert.equal(typeof cjsRoot.StageFormRenderer, 'function');
assert.equal(typeof esmRoot.StageFormRenderer, 'function');
assert.equal(typeof cjsBootstrap.GuestEventApi.momentsPublic, 'function');
assert.equal(typeof esmBootstrap.GuestEventApi.momentsPublic, 'function');
assert.equal(typeof esmNode.AdminEventApi.config, 'function');

for (const subpath of ['./dist/routes', './dist/routes.js']) {
  const { cjs, esm } = runtimeModules.get(subpath);
  assert.equal(typeof cjs.ApiRoutes, 'object', `${subpath} CJS alias lacks ApiRoutes`);
  assert.equal(typeof esm.ApiRoutes, 'object', `${subpath} ESM alias lacks ApiRoutes`);
}
for (const subpath of ['./dist/about', './dist/about.js']) {
  const { cjs, esm } = runtimeModules.get(subpath);
  assert.equal(typeof cjs.ABOUT_SCHEMA, 'object', `${subpath} CJS alias lacks ABOUT_SCHEMA`);
  assert.equal(typeof esm.ABOUT_SCHEMA, 'object', `${subpath} ESM alias lacks ABOUT_SCHEMA`);
}
for (const subpath of ['./dist/eventDate', './dist/eventDate.js']) {
  const { cjs, esm } = runtimeModules.get(subpath);
  assert.equal(typeof cjs.formatEventDate, 'function', `${subpath} CJS alias lacks formatEventDate`);
  assert.equal(typeof esm.formatEventDate, 'function', `${subpath} ESM alias lacks formatEventDate`);
}

const legacyRootExports = JSON.parse(
  await readFile(resolve(root, 'fixtures/contracts/root-runtime-exports.json'), 'utf8'),
);
const currentRootExports = new Set(Object.keys(cjsRoot));
const missingRootExports = legacyRootExports.filter((name) => !currentRootExports.has(name));
assert.deepEqual(missingRootExports, [], `root compatibility exports missing: ${missingRootExports.join(', ')}`);

const npmCli = process.env.npm_execpath;
assert(npmCli, 'npm_execpath is unavailable; run this export audit through an npm script');
const packResult = JSON.parse(execFileSync(
  process.execPath,
  [npmCli, 'pack', '--dry-run', '--json'],
  { cwd: root, encoding: 'utf8' },
))[0];
assert.equal(packResult.version, packageJson.version, 'npm pack version differs from package.json');
const packedFiles = new Set(packResult.files.map(({ path }) => path));
assert(
  ![...packedFiles].some((path) => path.startsWith('dist/esm/') && path.endsWith('.d.ts')),
  'pack must not include unreferenced ESM declarations',
);
for (const field of ['main', 'module', 'types']) {
  assert(packedFiles.has(packageJson[field]), `pack omits package.${field} target ${packageJson[field]}`);
}
for (const conditions of Object.values(packageJson.exports)) {
  if (typeof conditions === 'string') {
    assert(packedFiles.has(conditions.replace(/^\.\//, '')), `pack omits ${conditions}`);
    continue;
  }
  for (const target of Object.values(conditions)) {
    assert(packedFiles.has(target.replace(/^\.\//, '')), `pack omits ${target}`);
  }
}
for (const targets of Object.values(typeMappings)) {
  for (const target of targets) {
    assert(packedFiles.has(target), `pack omits typesVersions target ${target}`);
  }
}
for (const requiredFile of [
  'dist/authToken.js',
  'dist/publicApi.js',
  'dist/esm/authToken.js',
  'dist/esm/publicApi.js',
  'dist/esm/package.json',
  'docs/tree-shaking.md',
  'docs/renderer-message-migration.md',
]) {
  assert(packedFiles.has(requiredFile), `pack omits ${requiredFile}`);
}

const reduction = Math.round((1 - bootstrap.esm.gzipBytes / legacy.gzipBytes) * 1000) / 10;
const report = `# Tree-shaking evidence\n\n` +
  `Generated by \`npm run build\` from the committed consumer fixtures. Peer UI packages are external in every measurement so this compares shared-package retention rather than framework versions.\n\n` +
  `| Consumer fixture | Published condition | Raw bytes | Gzip bytes | Shared inputs |\n` +
  `| --- | --- | ---: | ---: | ---: |\n` +
  `| Shore bootstrap through legacy root | CommonJS | ${legacy.bytes} | ${legacy.gzipBytes} | ${sharedInputCount(legacy)} |\n` +
  `| Shore bootstrap through granular subpath | ESM | ${bootstrap.esm.bytes} | ${bootstrap.esm.gzipBytes} | ${sharedInputCount(bootstrap.esm)} |\n` +
  `| Shore bootstrap through granular subpath | CommonJS | ${bootstrap.cjs.bytes} | ${bootstrap.cjs.gzipBytes} | ${sharedInputCount(bootstrap.cjs)} |\n\n` +
  `The granular ESM bootstrap is **${reduction}% smaller gzip** in this controlled fixture.\n\n` +
  `Verified boundaries:\n\n` +
  `- Both published conditions of \`boracaya-shared/bootstrap\` retain the split public endpoint and token helpers while excluding the monolithic admin API, GIS loader, React, MUI, ErrorBoundary, GoogleSignInButton, StageFormRenderer, and WizardShell.\n` +
  `- Shore's actual \`identity\` calls (including no-event login, claim, linked-email lookup, unlink, Google-token reads, and guest headers) exclude admin endpoints and UI; the ESM graph also tree-shakes the unused GIS loader.\n` +
  `- Shore and Valet \`forms\` fixtures include StageFormRenderer/WizardShell and MUI, but no API or identity client.\n` +
  `- Valet's \`api\` + \`domain\` fixture includes admin client code but excludes forms, generic UI, browser adapters, React, and MUI.\n` +
  `- \`boracaya-shared/node\` imports in Node without DOM, identity, React, or MUI modules.\n` +
  `- Every supported subpath and compatibility alias resolves at runtime through ESM and CommonJS, has an exact legacy-Node \`typesVersions\` mapping where type-bearing, and is present in the npm pack manifest.\n`;

if (process.argv.includes('--write')) {
  await writeFile(reportPath, report);
} else {
  assert.equal(await readFile(reportPath, 'utf8'), report, 'tree-shaking report is stale; run npm run build');
}

console.log(`exports: legacy ${legacy.gzipBytes} B gzip -> ESM bootstrap ${bootstrap.esm.gzipBytes} B (${reduction}% smaller)`);
