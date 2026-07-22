/**
 * The save contract every editor hook in Valet already satisfies informally
 * (cdk#1007). Naming it does two jobs: it stops the spelling drift that forced
 * callers to paper over `saving` vs `isSaving`, and it makes lanes composable
 * so one Save button can cover several of them.
 *
 * A lane OWNS its own request. `useSaveGroup` orchestrates which lanes save and
 * reports the outcome — it never merges payloads. That rule is load-bearing,
 * not stylistic: the config PATCH runs a delete-all-and-reinsert pages pass
 * whenever a `pages` key is PRESENT (the #156/#164 data-loss trap), so a
 * "helpful" merge of two lanes' bodies would be a data-loss bug. The backend
 * shallow-merges per field (admin#155), so separate concurrent PATCHes from
 * different lanes are safe by construction.
 */
export interface SaveLane {
  /** Unsaved edits are pending in this lane. */
  dirty: boolean;
  /** This lane's write is in flight. */
  saving: boolean;
  /** Persist this lane. Resolves true on success — never throws. */
  save: () => Promise<boolean>;
}

/** Adapts a hook whose flag is spelled `isSaving` (usePagesData) to the lane
 *  contract, so the group never has to know which spelling a lane uses. */
export const laneOf = (
  hook: { dirty: boolean; save: () => Promise<boolean> } & ({ saving: boolean } | { isSaving: boolean }),
): SaveLane => ({
  dirty: hook.dirty,
  saving: 'saving' in hook ? hook.saving : hook.isSaving,
  save: hook.save,
});
