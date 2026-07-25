import { describe, expect, it } from 'vitest';
import {
  MUTATION_LIMITS,
  MUTATION_SECURITY_ERROR_CODES,
  retryAfterSeconds,
} from './security';

describe('mutation security contracts', () => {
  it('pins the launch limits used by clients and handlers', () => {
    expect(MUTATION_LIMITS).toMatchObject({
      bodyBytes: 16_384,
      companions: 20,
      pulseContentChars: 2_000,
      pulseContentBytes: 4_096,
      surveyDepth: 4,
    });
  });

  it('keeps stable machine-readable error codes unique', () => {
    expect(new Set(MUTATION_SECURITY_ERROR_CODES).size)
      .toBe(MUTATION_SECURITY_ERROR_CODES.length);
  });

  it.each([
    ['0', 0],
    [' 90 ', 90],
    [undefined, undefined],
    ['', undefined],
    ['1.5', undefined],
    ['tomorrow', undefined],
    ['-1', undefined],
  ])('parses Retry-After %j', (input, expected) => {
    expect(retryAfterSeconds(input)).toBe(expected);
  });
});
