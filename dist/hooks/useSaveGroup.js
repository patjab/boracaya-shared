"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSaveGroup = void 0;
const keysOf = (record) => Object.keys(record);
const useSaveGroup = ({ lanes, labels, onToast, messages }) => {
    const keys = keysOf(lanes);
    const dirty = keys.some((k) => lanes[k].dirty);
    const saving = keys.some((k) => lanes[k].saving);
    const dirtyByLane = keys.reduce((acc, k) => {
        acc[k] = lanes[k].dirty;
        return acc;
    }, {});
    // Not memoised on purpose: the closure must read the CURRENT lanes, and a
    // stale dep array here would save yesterday's dirty set.
    const onSave = async () => {
        // Sequential, not Promise.all: these lanes can share one backend row, and
        // serialising keeps a conditional write (the date guard, cdk#910) from
        // racing a sibling lane's PATCH.
        const failed = [];
        for (const k of keys) {
            if (!lanes[k].dirty)
                continue;
            // eslint-disable-next-line no-await-in-loop
            const ok = await lanes[k].save();
            if (!ok)
                failed.push(k);
        }
        if (failed.length === 0)
            onToast(messages.saved);
        else if (failed.length === keys.length || failed.length > 1) {
            onToast(messages.saveError);
        }
        else
            onToast(messages.laneFailed(labels[failed[0]]));
    };
    return { dirty, saving, dirtyByLane, onSave };
};
exports.useSaveGroup = useSaveGroup;
