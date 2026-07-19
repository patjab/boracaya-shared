// A stored icon value renders as text ONLY when it contains a genuine
// emoji/pictographic character; curated icon-name keys (e.g. "beachAccess") are
// resolved to icon components by each UI. THE canonical rule (shared#96,
// cdk#1115): Valet's pickers and the guest renderers must agree on what counts
// as an emoji — both previously carried identical private copies.
export const isEmojiIcon = (value?: string): boolean =>
    !!value && /\p{Extended_Pictographic}/u.test(value);
