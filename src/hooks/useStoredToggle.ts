import * as React from 'react';

/**
 * A two-value preference persisted in localStorage, storage-failure tolerant
 * (private mode / disabled storage still toggles for the session). Generalized
 * from Valet's operator light/dark switch (admin#74) so any app's binary,
 * remembered preference reads through one place.
 *
 * `values` must be a stable reference (a module-level `as const` tuple) — it is
 * a dependency of the returned `toggle`.
 */
export const useStoredToggle = <T extends string>(
  key: string,
  values: readonly [T, T],
  initial: T = values[0],
): [T, () => void] => {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === values[0] || stored === values[1] ? (stored as T) : initial;
    } catch {
      return initial;
    }
  });
  const toggle = React.useCallback(() => {
    setValue((current) => {
      const next: T = current === values[0] ? values[1] : values[0];
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage unavailable (private mode) — the toggle still works for the session.
      }
      return next;
    });
  }, [key, values]);
  return [value, toggle];
};
