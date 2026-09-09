"use strict";
// The async-ownership invariant, as a thing you can hold (#166).
//
// Seven reproduced findings across Valet and Shore are one defect wearing
// different clothes: work started under one context lands under another. An old
// account's event refresh replaces the new account's list. A closed editor's
// upload overwrites its replacement. Browsing changes an in-flight upload's
// destination. The invariant has been stated in this codebase before — "derive
// sheet state at render, never decide after `await save()`" — and lost again,
// because nothing carried it.
//
// The shape is deliberately small. An owner is captured at REQUEST START, and
// the continuation asks whether it still owns the thing it is about to write.
// Not a wrapper that runs your work: a wrapper would have to guess what
// "commit" means at each site, and the seven sites disagree.
//
// No imports, on purpose — every consumer of this is in a bundle-size-audited
// graph (see the tree-shaking fixtures), and a guard that costs a dependency is
// a guard people route around.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownedContinuation = void 0;
const DIMENSIONS = ['principal', 'event', 'key'];
/**
 * Capture the current owner of some about-to-start async work.
 *
 * ```ts
 * const own = ownedContinuation({ principal: () => session.userId, event: () => eventId });
 * const rows = await getJson(url, { signal: own.signal });
 * if (!own.stillOwns()) return;   // the account or the event changed under us
 * setRows(rows);
 * ```
 */
const ownedContinuation = (owner) => {
    const supplied = DIMENSIONS.filter((name) => typeof owner[name] === 'function');
    if (supplied.length === 0) {
        // A continuation owned by nothing would answer `true` forever, which reads
        // at the call site exactly like a guard and is not one. Louder than a
        // silent always-true.
        throw new TypeError('ownedContinuation: supply at least one of principal, event, key');
    }
    const captured = supplied.map((name) => [name, owner[name]()]);
    const controller = new AbortController();
    return {
        signal: controller.signal,
        stillOwns: () => !controller.signal.aborted
            && captured.every(([name, value]) => Object.is(owner[name](), value)),
        release: () => { controller.abort(); },
    };
};
exports.ownedContinuation = ownedContinuation;
