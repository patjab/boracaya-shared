"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorBoundary = void 0;
const react_1 = __importDefault(require("react"));
class ErrorBoundary extends react_1.default.Component {
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
exports.ErrorBoundary = ErrorBoundary;
