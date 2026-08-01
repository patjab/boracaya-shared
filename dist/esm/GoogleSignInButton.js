import * as React from 'react';
import { initAuth, renderGoogleSignInButton } from './auth.js';
/**
 * Renders the official Google button. Kept outside the identity primitives so
 * API/client imports do not retain React UI code.
 */
export function GoogleSignInButton(props) {
    const ref = React.useRef(null);
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
        let cancelled = false;
        let retryTimer;
        initAuth()
            .then(() => {
            if (cancelled || !ref.current)
                return;
            renderGoogleSignInButton(ref.current, props.text);
        })
            .catch(() => {
            // GIS failed to load/initialize (initAuth reset its memo, #1278): retry this
            // mount after a short delay so a transient blip self-heals without a reload.
            if (!cancelled)
                retryTimer = setTimeout(() => setAttempt((a) => a + 1), 2000);
        });
        const onChange = () => { var _a; return (_a = props.onSignIn) === null || _a === void 0 ? void 0 : _a.call(props); };
        window.addEventListener('pdab-auth-change', onChange);
        return () => {
            cancelled = true;
            if (retryTimer !== undefined)
                clearTimeout(retryTimer);
            window.removeEventListener('pdab-auth-change', onChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);
    return React.createElement('div', { ref });
}
