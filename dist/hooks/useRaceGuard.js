"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRaceGuard = exports.createRaceGuard = void 0;
const react_1 = require("react");
/** The guard mechanics, free of React (see `useRaceGuard`). */
const createRaceGuard = () => {
    let generation = 0;
    // A Map rather than an object: lane keys never collide with prototype members,
    // and a snapshot is one copy constructor.
    const versions = new Map();
    return {
        reset: () => {
            generation += 1;
        },
        touch: (lane) => {
            var _a;
            versions.set(lane, ((_a = versions.get(lane)) !== null && _a !== void 0 ? _a : 0) + 1);
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
exports.createRaceGuard = createRaceGuard;
/**
 * One race guard per hook instance. `Lane` defaults to `never` so a hook with no
 * dirty halves (useMomentsData, useCommunicateData) gets a generation-only guard
 * and any stray `touch()` is a type error.
 */
const useRaceGuard = () => {
    var _a;
    const guard = (0, react_1.useRef)(null);
    (_a = guard.current) !== null && _a !== void 0 ? _a : (guard.current = (0, exports.createRaceGuard)());
    return guard.current;
};
exports.useRaceGuard = useRaceGuard;
