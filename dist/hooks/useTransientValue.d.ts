/** The one home for the transient-feedback window (cdk#1156) — the private
 *  2000ms literals that each app's "copied/saved" flags re-declared. */
export declare const TRANSIENT_FLAG_MS = 2000;
/**
 * A value that clears itself after `durationMs` (cdk#1156: reusable, no API —
 * class 1 of the standard-8 taxonomy). The former per-hook copies each
 * re-solved the same two races; the discipline lives once now:
 * - showing again restarts the window (the prior timer is cleared, so an old
 *   timer can never clear a newer value), and
 * - unmount clears the timer, so a late firing can't reach a dead component.
 */
export declare const useTransientValue: <T>(durationMs?: number) => readonly [T | null, (v: T) => void];
