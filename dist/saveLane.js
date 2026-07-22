"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.laneOf = void 0;
/** Adapts a hook whose flag is spelled `isSaving` (usePagesData) to the lane
 *  contract, so the group never has to know which spelling a lane uses. */
const laneOf = (hook) => ({
    dirty: hook.dirty,
    saving: 'saving' in hook ? hook.saving : hook.isSaving,
    save: hook.save,
});
exports.laneOf = laneOf;
