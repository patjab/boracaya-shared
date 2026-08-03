import { rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const outputDirectory = resolve('dist');
if (!outputDirectory.endsWith(`${sep}dist`)) {
  throw new Error(`Refusing to clean unexpected build output path: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
