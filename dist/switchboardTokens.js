"use strict";
/**
 * Switchboard's design tokens — the SINGLE source both consoles that wear the
 * Switchboard design system import: boracaya-valet and
 * boracaya-mission-control (mission-control#47). Published as the plain
 * `boracaya-shared/switchboard` subpath, with no React or MUI: each console
 * keeps its own MUI theme builder, theme-mode store and face toggle, and
 * builds them from these values.
 *
 * Moved here from boracaya-valet `src/shared/domain/switchboardTokens.ts` at
 * commit 33945b2, which Mission Control had been copying by hand
 * (mission-control#31). Every value is unchanged and pinned, together with the
 * WCAG contrast the values were chosen to clear, by `switchboardTokens.test.ts`,
 * so an edit here is a deliberate diff that reaches both consoles on their next
 * bump of this package.
 *
 * The comments below are Valet's and are kept as they were, because they are
 * the design history: a bare `#NNN` in them is a boracaya-valet issue, and the
 * `shared` / `app` / `invite` / `settings` packages they name are Valet's.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SWITCHBOARD_DATA_FONT = exports.SWITCHBOARD_BODY_FONT = exports.SWITCHBOARD_DISPLAY_FONT = exports.SWITCHBOARD_TOKENS = void 0;
exports.SWITCHBOARD_TOKENS = {
    bench: {
        bg: '#e7e4db',
        panel: '#f8f7f1',
        ink: '#20211e',
        muted: '#64655e',
        accent: '#f04e23',
        accentInk: '#161616',
        accentText: '#bc310d',
        rule: '#d3d0c4',
        good: '#167347',
        warn: '#865d11',
        danger: '#b3261e',
        dangerInk: '#ffffff',
        lcd: '#14211b',
        lcdInk: '#6fe3a5',
        edge: '#20211e',
        shadow: '#20211e',
        scheme: 'light',
    },
    arcade: {
        bg: '#0d1018',
        panel: '#171c28',
        ink: '#e9edf8',
        muted: '#8b93a8',
        accent: '#ffd23f',
        accentInk: '#161616',
        accentText: '#ffd23f',
        rule: '#252b3a',
        good: '#42e08c',
        warn: '#ff9f43',
        danger: '#ff8a7a',
        dangerInk: '#161616',
        lcd: '#0f1722',
        lcdInk: '#7dd8ff',
        edge: '#3b4360',
        shadow: '#05070d',
        scheme: 'dark',
    },
};
/** Rounded display type — the wireframe's `--sv-disp` stack, exactly. */
exports.SWITCHBOARD_DISPLAY_FONT = "ui-rounded,'SF Pro Rounded','Hiragino Maru Gothic ProN','Varela Round','Nunito',system-ui,sans-serif";
/** Body copy — the wireframe's `--sv-body` stack, exactly. */
exports.SWITCHBOARD_BODY_FONT = "ui-rounded,'SF Pro Rounded',system-ui,sans-serif";
/** Data/labels — the wireframe's `--sv-data` monospace stack, exactly. */
exports.SWITCHBOARD_DATA_FONT = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
