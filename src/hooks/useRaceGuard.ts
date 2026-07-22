import { useRef } from 'react';

/**
 * The concurrency discipline every `use*Data` hook needs (cdk#1106), in one place.
 *
 * Four data hooks (usePagesData, useConfigureData, useMomentsData,
 * useCommunicateData) each hand-rolled the same two mechanics, with the same
 * review provenance (admin#155, admin#273, Copilot round-2 on #181):
 *
 *  1. **Generation** — the reseed effect bumps it on every real load (cold fetch,
 *     cache seed on a tab bounce, event switch). An async writer captures a token
 *     before it awaits and checks `isCurrent()` afterwards, so a response that
 *     resolves after the user moved to another event cannot write the previous
 *     tenant's result into the new tenant's state. A closure flag cannot do this
 *     job: the late writers are CALLBACKS living outside the reseed effect.
 *  2. **Edit versions, per lane** — an edit `touch(lane)`es its lane; a save
 *     captures a token first and only clears that lane's dirty flag when
 *     `isUnedited(lane)` still holds, so an edit made while the write was in the
 *     air is never silently marked as saved. Lanes exist because a screen can
 *     have independently dirty halves (useConfigureData: `pages` / `metadata`).
 *
 * Both checks read through ONE token captured before the await, so a writer can
 * never observe a half-updated guard.
 *
 * Deliberately NOT here: the serialized no-op `baseline`, the state mirror for
 * guards outside pure updaters, and the live-eventId latch. Each has exactly one
 * user today (usePagesData for the first two, useMomentsData for the third) and
 * each is about that hook's own document shape, not about concurrency ordering.
 * They stay where they are used until a second caller earns the move.
 *
 * The guard is a plain object built once and parked in a ref, so it holds no
 * React state, never re-renders, and keeps a stable identity for `useCallback`
 * dependency arrays. `createRaceGuard` is exported so the mechanics can be
 * tested without a renderer.
 */
export interface RaceToken<Lane extends string> {
  /** True while the generation captured at `begin()` is still the current one. */
  isCurrent: () => boolean;
  /** True while no edit has touched `lane` since `begin()`. */
  isUnedited: (lane: Lane) => boolean;
}

export interface RaceGuard<Lane extends string> {
  /** Bump the generation — call from the reseed effect, once per real load. */
  reset: () => void;
  /** Record an edit to `lane` — call from every mutator that sets a dirty flag. */
  touch: (lane: Lane) => void;
  /** Snapshot generation + every lane version, before an await. */
  begin: () => RaceToken<Lane>;
}

/** The guard mechanics, free of React (see `useRaceGuard`). */
export const createRaceGuard = <Lane extends string>(): RaceGuard<Lane> => {
  let generation = 0;
  // A Map rather than an object: lane keys never collide with prototype members,
  // and a snapshot is one copy constructor.
  const versions = new Map<Lane, number>();
  return {
    reset: () => {
      generation += 1;
    },
    touch: (lane) => {
      versions.set(lane, (versions.get(lane) ?? 0) + 1);
    },
    begin: () => {
      const generationAtStart = generation;
      const versionsAtStart = new Map(versions);
      return {
        isCurrent: () => generationAtStart === generation,
        // An untouched lane reads `undefined` on both sides, which is exactly
        // "no edit landed" — no special case needed for the first save.
        isUnedited: (lane) => versionsAtStart.get(lane) === versions.get(lane),
      };
    },
  };
};

/**
 * One race guard per hook instance. `Lane` defaults to `never` so a hook with no
 * dirty halves (useMomentsData, useCommunicateData) gets a generation-only guard
 * and any stray `touch()` is a type error.
 */
export const useRaceGuard = <Lane extends string = never>(): RaceGuard<Lane> => {
  const guard = useRef<RaceGuard<Lane> | null>(null);
  guard.current ??= createRaceGuard<Lane>();
  return guard.current;
};
