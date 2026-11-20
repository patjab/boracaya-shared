import { describe, expect, it } from 'vitest';
import * as client from './client';
import * as domain from './domain';
import * as forms from './forms';
import * as root from '../index';

/**
 * The 14.2 release contract the consumers repin against (shore S4, valet V7,
 * cdk C8): each name is reachable from the entry the README promises, and the
 * root keeps the compatibility surface.
 */
const COMPLETENESS = [
    'entryMissingSubFields', 'questionAnswerGaps', 'stageAnswerGaps', 'stageAnswersComplete',
    'visibleStageElements',
] as const;

describe('14.2 exports', () => {
    it.each(COMPLETENESS)('%s is a function from domain, forms and the root', (name) => {
        for (const surface of [domain, forms, root] as Array<Record<string, unknown>>) {
            expect(typeof surface[name]).toBe('function');
        }
    });

    it('the module-internal reveal helper stays off the entries', () => {
        for (const surface of [domain, forms, root] as Array<Record<string, unknown>>) {
            expect(surface.isRevealed).toBeUndefined();
        }
    });

    it('MAX_BATCH_BYTES and MAX_REPORT_BYTES come from client and the root', () => {
        for (const surface of [client, root]) {
            expect(surface.MAX_BATCH_BYTES).toBe(30 * 1024);
            expect(surface.MAX_REPORT_BYTES).toBe(8 * 1024);
        }
    });
});
