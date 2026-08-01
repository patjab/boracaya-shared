import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const outputDirectory = resolve('dist/esm');
if (!outputDirectory.endsWith(`${sep}dist${sep}esm`)) {
  throw new Error(`Refusing to clean unexpected ESM output path: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
