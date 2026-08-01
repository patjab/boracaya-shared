import React from 'react';
export class ErrorBoundary extends React.Component {
    constructor() {
        super(...arguments);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error, info) {
        var _a;
        // Never silent — React has already torn the tree down by the time we get
        // here, so the console is the only remaining record of what broke.
        console.error(`[${(_a = this.props.label) !== null && _a !== void 0 ? _a : 'app'}] unhandled render error`, error, info.componentStack);
    }
    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}
