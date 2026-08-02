import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const temporaryConsumer = await mkdtemp(join(tmpdir(), 'boracaya-shared-legacy-node-'));

try {
  const packageDirectory = join(temporaryConsumer, 'node_modules', 'boracaya-shared');
  await mkdir(join(temporaryConsumer, 'node_modules'), { recursive: true });
  await symlink(root, packageDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  await copyFile(
    resolve(root, 'fixtures/consumers/legacy-node-resolution.ts'),
    join(temporaryConsumer, 'consumer.ts'),
  );
  await writeFile(join(temporaryConsumer, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2018',
      module: 'CommonJS',
      lib: ['ES2018', 'DOM'],
      noEmit: true,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      moduleResolution: 'Node',
      jsx: 'react-jsx',
    },
    include: ['consumer.ts'],
  }, null, 2)}\n`);

  execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
    { cwd: temporaryConsumer, stdio: 'inherit' },
  );
} finally {
  await rm(temporaryConsumer, { recursive: true, force: true });
}

console.log('exports: legacy TypeScript Node-resolution consumer compiled');
