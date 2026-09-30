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

/**
 * The face Switchboard wears — its light and dark sides, not two layouts
 * (#369). Chosen by a MANUAL toggle that persists per browser; the OS
 * `prefers-color-scheme` is deliberately never consulted, and absent a stored
 * choice the face is Arcade.
 *
 * Defined here, beside the values it keys, since valet#393 retired the shell
 * union it used to live next to: Switchboard is the only layout, so light/dark
 * is the only appearance axis left and the face IS the theme mode.
 */
export type SwitchboardFace = 'bench' | 'arcade';

/**
 * Switchboard's design tokens — the wireframe's `.id-swb` variables plus the
 * `.swb-arcade` override, matched EXACTLY (valet layout study 2026-07,
 * identity study "Switchboard"). One layout, two faces: only these values
 * change between Bench and Arcade — the hardware character (module borders,
 * LEDs, offset shadows) is shared.
 *
 * `edge` and `shadow` are FIRST-CLASS tokens, deliberately separate from
 * `ink`: the light Bench face draws borders and offset shadows in ink, but
 * the dark Arcade face uses a mellow edge and a deep shadow — a dark mode
 * must never trace its modules in light text color.
 *
 * `danger` is a token of its own (valet#373) rather than MUI's `error.main`
 * for the same reason. Measured against these grounds, the inherited defaults
 * do not hold: `#d32f2f` (MUI light) is 4.64:1 on Bench's panel but only
 * 3.92:1 on its `bg` ground, which is where the delete row's quiet link and
 * the danger module's own border sit — a fail. `#f44336` (MUI dark) clears
 * Arcade at 4.62:1 on panel / 5.16:1 on bg with no headroom for the 9.5px
 * mono stamp type this face uses. The values below were chosen to pass on
 * BOTH grounds with room: Bench `#b3261e` is 6.09:1 on panel and 5.14:1 on
 * bg; Arcade `#ff8a7a` is 7.43:1 on panel and 8.30:1 on bg. `dangerInk` is
 * the label on a filled danger button — 6.54:1 and 7.90:1 respectively.
 *
 * `good` / `warn` / `accentText` were measured the same way after valet#373's
 * danger work exposed the gap: that round added a build-failing contrast test
 * but asserted on `danger` alone, so the other status colors were never
 * checked. On Bench they did not hold as TEXT — `good` #1fa465 was 2.98:1 on
 * panel, `warn` #dd9a1c 2.25:1, and the accent 3.36:1 — while every stamp
 * that uses them (`sent`, `live`, `coming`, `set`, `copied`) is 9.5px mono,
 * i.e. squarely under the 4.5:1 normal-text bar. Arcade already passed
 * everywhere and is unchanged.
 *
 * The signature orange is NOT altered: `accent` stays #f04e23 for fills, LEDs
 * and borders, where the applicable bar is the 3:1 non-text one it already
 * clears. Two narrower tokens carry the load instead — `accentText` for the
 * rare places the accent is set as type on a light ground, and `accentInk`,
 * whose Bench value moved from white (3.61:1 — a fail on every primary
 * button) to near-black, matching what Arcade already does on its yellow.
 *
 * These live in `shared` beside `SwitchboardFace` rather than next to the MUI
 * theme in `app` because the #1200 fences let `invite` and `settings` import
 * `shared` only — and the dialogs those packages own have to wear the sheet
 * (valet#371). `app/containers/switchboardTheme` re-exports everything here,
 * so the shell side keeps its single import.
 */
export interface SwitchboardTokens {
  /** Page ground. */
  bg: string;
  /** Module face. */
  panel: string;
  /** Text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Accent — LEDs, the current station, the primary CTA. FILLS AND BORDERS
   *  ONLY: on the light face it is below the 4.5:1 text bar, so anything
   *  setting the accent as type must reach for `accentText`. */
  accent: string;
  /** Text on a filled `accent` surface. */
  accentInk: string;
  /** The accent set as TYPE on a page/module ground — dark enough to pass as
   *  normal text where `accent` itself does not. */
  accentText: string;
  /** Hairline rules inside modules. */
  rule: string;
  /** Positive statuses (sent, live, done). */
  good: string;
  /** Waiting statuses (no reply, unsaved). */
  warn: string;
  /** Destructive actions — the delete link, its module border and its button. */
  danger: string;
  /** Text on a filled `danger` surface. */
  dangerInk: string;
  /** LCD screen ground (the stat module). */
  lcd: string;
  /** LCD digits. */
  lcdInk: string;
  /** Module borders and keycap edges. */
  edge: string;
  /** Offset module shadows. */
  shadow: string;
  /**
   * What the browser is painting on (valet#767). Not a colour — the one
   * token the USER AGENT reads. Everything it draws for us rather than with
   * us (scrollbars first, and the native bits of form controls) defaults to
   * a light appearance until a page says otherwise, so Arcade's scrolling
   * lists came with a white track and a grey thumb bolted to a navy panel.
   * It lives with the values it follows: the face IS the appearance, and a
   * face that changes its colours without changing this would lie to the UA.
   */
  scheme: 'light' | 'dark';
}

export const SWITCHBOARD_TOKENS: Record<SwitchboardFace, SwitchboardTokens> = {
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
export const SWITCHBOARD_DISPLAY_FONT =
  "ui-rounded,'SF Pro Rounded','Hiragino Maru Gothic ProN','Varela Round','Nunito',system-ui,sans-serif";

/** Body copy — the wireframe's `--sv-body` stack, exactly. */
export const SWITCHBOARD_BODY_FONT = "ui-rounded,'SF Pro Rounded',system-ui,sans-serif";

/** Data/labels — the wireframe's `--sv-data` monospace stack, exactly. */
export const SWITCHBOARD_DATA_FONT = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
