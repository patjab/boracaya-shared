"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGuardedLoad = useGuardedLoad;
const react_1 = require("react");
const data_1 = require("../data");
/**
 * The screen-side binding of the data-access layer's loading/error contract
 * (#28): run `load` on mount (and on `reload`), with loading guaranteed to
 * clear and any throw — from the fetches OR the post-fetch view-model
 * transform — surfacing as the given error message instead of a hang.
 *
 * Each run gets a monotonically increasing id; only the latest run may write
 * state, so a slower earlier run can't overwrite a newer one (reload spam) and
 * an in-flight run stops writing after unmount.
 *
 * `deps` re-creates the loader like useCallback deps would; pass the values
 * the loader closes over (usually none).
 */
function useGuardedLoad(load, errorMessage, deps = []) {
    const [state, setState] = (0, react_1.useState)({ data: null, isLoading: true, error: null });
    const runId = (0, react_1.useRef)(0);
    // Always call the latest load/errorMessage, not the ones captured when deps
    // last changed — `run` stays stable per deps, but never goes stale.
    const loadRef = (0, react_1.useRef)(load);
    loadRef.current = load;
    const errorMessageRef = (0, react_1.useRef)(errorMessage);
    errorMessageRef.current = errorMessage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const run = (0, react_1.useCallback)(() => {
        runId.current += 1;
        const id = runId.current;
        void (0, data_1.runGuarded)(() => loadRef.current(), (next) => {
            if (runId.current === id)
                setState(next);
        }, errorMessageRef.current);
    }, deps);
    (0, react_1.useEffect)(() => {
        run();
        // Invalidate any in-flight run on unmount (or when deps re-create the
        // loader) so it can no longer write state.
        return () => {
            runId.current += 1;
        };
    }, [run]);
    return { ...state, reload: run };
}
