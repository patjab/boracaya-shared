import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * cdk#2381: the passport stamp lane is gone. stampImageUrl, stampNaming and
 * doorStage left the event-config lane in cdk#2391 and the last Valet reader in
 * valet#1006, so the event types must not declare them: a consumer that still
 * names one would be writing a field no server accepts. Tests are outside the
 * tsc program, so this reads the source instead of asserting on the types.
 */
describe('retired passport-stamp fields', () => {
  const source = readFileSync(resolve(__dirname, 'event.ts'), 'utf8');

  it.each(['stampImageUrl', 'stampNaming', 'doorStage'])('%s is not declared on the event types', (field) => {
    expect(source).not.toMatch(new RegExp(String.raw`\b${field}\b`));
  });
});
