import React from 'react';
export const UnsavedGuardContext = React.createContext({
    register: () => () => { },
});
/** Register `dirty` with the shell's navigation guard for this editor's lifetime.
 *  The registered getter reads a ref kept current every render, so the shell
 *  always sees the latest dirty value — registering `() => dirty` in an effect
 *  instead would leave a post-paint window where a just-flipped dirty flag is
 *  still reported false and navigation slips past the guard (Copilot on #190). */
export const useUnsavedGuard = (dirty) => {
    const { register } = React.useContext(UnsavedGuardContext);
    const dirtyRef = React.useRef(dirty);
    dirtyRef.current = dirty;
    React.useEffect(() => register(() => dirtyRef.current), [register]);
};
