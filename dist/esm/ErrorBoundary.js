import React from 'react';
import { report } from './report.js';
export class ErrorBoundary extends React.Component {
    constructor() {
        super(...arguments);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error, info) {
        var _a, _b, _c;
        // Never silent — React has already torn the tree down by the time we get
        // here, so the console is the only remaining record of what broke.
        console.error(`[${(_a = this.props.label) !== null && _a !== void 0 ? _a : 'app'}] unhandled render error`, error, info.componentStack);
        // cdk#1495: the console is no longer the only record — the reporter
        // carries the throw (first frames + component stack) to the client-errors
        // log group with the breadcrumbs that led here.
        report('render', {
            message: error.message,
            name: error.name,
            label: (_b = this.props.label) !== null && _b !== void 0 ? _b : 'app',
            stack: error.stack,
            componentStack: (_c = info.componentStack) !== null && _c !== void 0 ? _c : undefined,
        });
    }
    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}
