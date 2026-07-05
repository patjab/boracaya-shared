export type AboutFieldType = 'text' | 'multiline' | 'image' | 'youtube' | 'link' | 'icon';
export interface AboutFieldDef {
    /** storage key on the block's `fields` map (or the page item for page fields) */
    key: string;
    /** organizer-facing label in the Valet form */
    label: string;
    type: AboutFieldType;
    required?: boolean;
    /** short helper text under the input */
    help?: string;
}
export interface AboutBlockDef {
    /** stable type id stored on the page (`blockType`) */
    type: string;
    /** organizer-facing name of the block type */
    label: string;
    /** one-line, guest's-eye description of what this block renders as on the
     *  site — shown in the content-type picker so the (pick-once) choice is
     *  informed, not a guess (cdk#487). */
    description: string;
    /** what one repeated item is called in the editor ("Add <itemNoun>") */
    itemNoun: string;
    fields: AboutFieldDef[];
}
/** The block vocabulary — one entry per approved repeating body block type. */
export declare const ABOUT_BLOCK_TYPES: Record<string, AboutBlockDef>;
/** Page-level fields (page chrome — NOT blocks): eyebrow → title → blurb(+video) →
 *  [section label] → body → footer note (+ trailing video, cf. NY Vows). */
export declare const ABOUT_PAGE_FIELDS: AboutFieldDef[];
/** The comparable contract object the cdk Lambda bundles a JSON copy of. */
export declare const ABOUT_SCHEMA: {
    readonly version: 1;
    readonly blockTypes: Record<string, AboutBlockDef>;
    readonly pageFields: AboutFieldDef[];
};
export interface AboutBlock {
    blockId: string;
    order: number;
    fields: Record<string, string>;
}
export interface AboutPage {
    /** stable id; doubles as the guest route segment under /our-wedding (e.g. "couple/story") */
    pageId: string;
    groupId: string;
    order: number;
    /** short label on the leaf tab; page `title` is the on-page heading */
    navLabel: string;
    /** leaf-tab icon (emoji or icon-registry key) */
    icon?: string;
    /** landing page of its group: the group tab renders this page directly (no leaf row) */
    isLanding?: boolean;
    blockType: string;
    eyebrow?: string;
    title: string;
    blurb?: string;
    blurbVideoUrl?: string;
    sectionLabel?: string;
    footerNote?: string;
    footerVideoUrl?: string;
    blocks: AboutBlock[];
}
export interface AboutGroup {
    groupId: string;
    order: number;
    title: string;
    pages: AboutPage[];
}
export interface AboutTree {
    eventId: string;
    groups: AboutGroup[];
}
