import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const outputDirectory = resolve('dist/esm');

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
};

const resolvedSpecifier = async (sourceFile, specifier) => {
  if (!specifier.startsWith('.') || extname(specifier)) return specifier;
  const base = resolve(dirname(sourceFile), specifier);
  if (await exists(`${base}.js`)) return `${specifier}.js`;
  if (await exists(resolve(base, 'index.js'))) return `${specifier}/index.js`;
  throw new Error(`Cannot resolve generated ESM import ${specifier} from ${sourceFile}`);
};

const rewriteSpecifiers = async (sourceFile) => {
  const source = await readFile(sourceFile, 'utf8');
  // Cover re-exports/import-from, dynamic import(), and static side-effect
  // imports. TypeScript emits no require() in this ESNext build.
  const patterns = [
    /(\bfrom\s*|\bimport\s*\()(['"])(\.\.?\/[^'"]+)\2/g,
    /(\bimport\s*)(['"])(\.\.?\/[^'"]+)\2/g,
  ];
  const matches = patterns
    .flatMap((pattern) => [...source.matchAll(pattern)])
    .sort((left, right) => right.index - left.index);
  let next = source;
  for (const match of matches) {
    const specifier = match[3];
    const replacement = await resolvedSpecifier(sourceFile, specifier);
    if (replacement === specifier) continue;
    const at = match.index + match[0].lastIndexOf(specifier);
    next = `${next.slice(0, at)}${replacement}${next.slice(at + specifier.length)}`;
  }
  await writeFile(sourceFile, next);
};

const trimTrailingWhitespace = async (sourceFile) => {
  const source = await readFile(sourceFile, 'utf8');
  await writeFile(sourceFile, source.replace(/[\t ]+$/gm, ''));
};

const generatedFiles = await filesUnder(outputDirectory);
const javascriptFiles = generatedFiles.filter((file) => file.endsWith('.js'));
await Promise.all(javascriptFiles.map(rewriteSpecifiers));
await Promise.all(generatedFiles.map(trimTrailingWhitespace));
await writeFile(
  resolve(outputDirectory, 'package.json'),
  `${JSON.stringify({ type: 'module', sideEffects: false }, null, 2)}\n`,
);
