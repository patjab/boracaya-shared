import * as React from 'react';
/**
 * Renders the official Google button. Kept outside the identity primitives so
 * API/client imports do not retain React UI code.
 */
export declare function GoogleSignInButton(props: {
    onSignIn?: () => void;
    text?: string;
}): React.ReactElement;
