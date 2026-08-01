/** Adapts a hook whose flag is spelled `isSaving` (usePagesData) to the lane
 *  contract, so the group never has to know which spelling a lane uses. */
export const laneOf = (hook) => ({
    dirty: hook.dirty,
    saving: 'saving' in hook ? hook.saving : hook.isSaving,
    save: hook.save,
});
