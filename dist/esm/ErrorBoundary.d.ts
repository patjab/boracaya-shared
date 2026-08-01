import React from 'react';
/**
 * The floor under every unexpected throw in a Boracaya app (cdk#1203).
 *
 * Without one, a single bad property read unmounts the whole tree and the user
 * gets a blank document with nothing to act on — the entire product, gone
 * silently. This exists so the NEXT such bug is a message and a retry rather
 * than a white screen.
 *
 * The boundary itself MUST be a class (React exposes no hook form of
 * `getDerivedStateFromError`), so the app-specific, themed fallback is injected
 * as `fallback` — each app passes its own catalog copy and retry affordance.
 * It renders OUTSIDE any app ThemeProvider, so the fallback must not depend on a
 * resolved theme.
 *
 * It does not swallow: the error and component stack still go to the console
 * (tagged with `label`), so the failure stays diagnosable in the field.
 */
interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** The app's themed error surface, rendered after an unexpected throw. */
    fallback: React.ReactNode;
    /** Console tag for the logged error, e.g. 'shore' / 'valet'. */
    label?: string;
}
interface ErrorBoundaryState {
    hasError: boolean;
}
export declare class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState;
    static getDerivedStateFromError(): ErrorBoundaryState;
    componentDidCatch(error: Error, info: React.ErrorInfo): void;
    render(): React.ReactNode;
}
export {};
