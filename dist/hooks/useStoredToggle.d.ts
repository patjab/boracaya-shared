/**
 * A two-value preference persisted in localStorage, storage-failure tolerant
 * (private mode / disabled storage still toggles for the session). Generalized
 * from Valet's operator light/dark switch (admin#74) so any app's binary,
 * remembered preference reads through one place.
 *
 * `values` must be a stable reference (a module-level `as const` tuple) — it is
 * a dependency of the returned `toggle`.
 */
export declare const useStoredToggle: <T extends string>(key: string, values: readonly [T, T], initial?: T) => [T, () => void];
