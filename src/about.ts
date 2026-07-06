// The About content contract (pda-boracay#90 / #91): the SINGLE SOURCE OF TRUTH for
// the block vocabulary and page-level fields. This one definition drives BOTH the
// Valet schema-driven form engine AND the guest block renderers, so the two can never
// drift (north star #2 of #90). The cdk About Lambda bundles a JSON copy of
// ABOUT_SCHEMA with a CI equality check against this module (conformance-style guard).
//
// Adding a new block type = add an entry to ABOUT_BLOCK_TYPES here + one guest
// renderer component. NO new editor UI and NO storage change is ever needed.
//
// Field values are plain strings only (no HTML/CSS/JS — organizers never enter markup;
// renderers emit values as text nodes). The only rich affordances are the `youtube`
// field type (rendered as a nocookie embed) and `image`/`link` URLs.

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
export const ABOUT_BLOCK_TYPES: Record<string, AboutBlockDef> = {
  textSection: {
    type: 'textSection',
    label: 'Text sections',
    description: 'A stack of headings with paragraphs of text, each with an optional icon.',
    itemNoun: 'section',
    fields: [
      { key: 'icon', label: 'Icon', type: 'icon', help: 'Icon name (e.g. favorite, flight)' },
      { key: 'heading', label: 'Heading', type: 'text', required: true },
      { key: 'body', label: 'Text', type: 'multiline', required: true },
    ],
  },
  accordionItem: {
    type: 'accordionItem',
    label: 'Q&A accordion',
    description: 'Collapsible question-and-answer rows guests tap to expand.',
    itemNoun: 'question',
    fields: [
      { key: 'question', label: 'Question', type: 'text', required: true },
      { key: 'answer', label: 'Answer', type: 'multiline', required: true },
    ],
  },
  card: {
    type: 'card',
    label: 'Cards',
    description: 'A grid of tiles, each with an image or icon, a heading, and optional link.',
    itemNoun: 'card',
    fields: [
      { key: 'image', label: 'Image URL', type: 'image', help: 'Shown above the text when set' },
      { key: 'icon', label: 'Icon', type: 'icon', help: 'Icon name or emoji, shown next to the heading' },
      { key: 'heading', label: 'Heading', type: 'text', required: true },
      { key: 'body', label: 'Text', type: 'multiline' },
      { key: 'link', label: 'Link URL', type: 'link', help: 'Makes the whole card a link' },
    ],
  },
  milestone: {
    type: 'milestone',
    label: 'Timeline milestones',
    description: 'Dated moments laid out along a vertical timeline.',
    itemNoun: 'milestone',
    fields: [
      { key: 'date', label: 'Date', type: 'text', required: true, help: 'Free text, e.g. "Aug 2016"' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'multiline' },
    ],
  },
  itineraryCard: {
    type: 'itineraryCard',
    label: 'Itinerary cards',
    description: 'Schedule stops with a date, venue, details, and an optional map.',
    itemNoun: 'stop',
    fields: [
      { key: 'date', label: 'Date', type: 'text', required: true },
      { key: 'location', label: 'Venue / location', type: 'text', required: true },
      { key: 'description', label: 'Details', type: 'multiline' },
      { key: 'image', label: 'Image URL', type: 'image' },
      { key: 'mapLink', label: 'Map embed URL', type: 'link', help: 'Google Maps embed URL for "View location on map"' },
    ],
  },
  galleryImage: {
    type: 'galleryImage',
    label: 'Photo gallery',
    description: 'A grid of captioned photos guests can open full-size.',
    itemNoun: 'photo',
    fields: [
      { key: 'image', label: 'Image URL', type: 'image', required: true },
      { key: 'thumb', label: 'Thumbnail URL', type: 'image', help: 'Optional smaller grid image; full image used when empty' },
      { key: 'caption', label: 'Caption', type: 'text' },
    ],
  },
  video: {
    type: 'video',
    label: 'Videos',
    description: 'Embedded YouTube videos with an optional title and description.',
    itemNoun: 'video',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'description', label: 'Description', type: 'multiline' },
      { key: 'youtubeUrl', label: 'YouTube URL', type: 'youtube', required: true },
    ],
  },
};

/** Page-level fields (page chrome — NOT blocks): eyebrow → title → blurb(+video) →
 *  [section label] → body → footer note (+ trailing video, cf. NY Vows). */
export const ABOUT_PAGE_FIELDS: AboutFieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', type: 'text', help: 'Small label above the title, e.g. "WHAT TO WEAR"' },
  { key: 'title', label: 'Page title', type: 'text', required: true },
  { key: 'blurb', label: 'Short blurb', type: 'multiline' },
  { key: 'blurbVideoUrl', label: 'Blurb video (YouTube URL)', type: 'youtube', help: 'Embedded under the blurb, before the content' },
  { key: 'sectionLabel', label: 'Section label', type: 'text', help: 'Small label above the content, e.g. "PLAN YOUR TRIP"' },
  { key: 'footerNote', label: 'Footer note', type: 'multiline', help: 'Callout under the content, e.g. FAQs’ final note' },
  { key: 'footerVideoUrl', label: 'Footer video (YouTube URL)', type: 'youtube', help: 'Embedded after the content (cf. NY Vows)' },
];

/** The comparable contract object the cdk Lambda bundles a JSON copy of.
 *  NOTE: the icon vocabulary below is deliberately NOT part of this object — it's
 *  editor/render metadata, not validation, so the cdk drift guard (`about_schema.json`)
 *  stays untouched. */
export const ABOUT_SCHEMA = {
  version: 1,
  blockTypes: ABOUT_BLOCK_TYPES,
  pageFields: ABOUT_PAGE_FIELDS,
} as const;

// ---- icon vocabulary (cdk#492) ---------------------------------------------------
// The canonical set of named icons an `icon` field may hold. The *value stored* is a
// name from this list (or a raw emoji, or nothing). This module owns the vocabulary —
// the valid names + a human label for the editor picker — while each app keeps its own
// name -> icon-component map (guest renderer, admin picker) keyed off this list, guarded
// by a drift test so a name here always has a drawing there. Adding an icon = add an
// entry here + the component in each app's map.

export interface AboutIconDef {
  /** stable key stored on the field value and looked up by every renderer */
  readonly name: string;
  /** human, guest's-eye label — search + a11y in the editor picker */
  readonly label: string;
}

// `readonly` so a consumer can't mutate the single source of truth (e.g. `.sort()`
// or `.push()`) and leave ABOUT_ICON_NAMES a stale snapshot (Copilot review, #48).
export const ABOUT_ICONS: readonly AboutIconDef[] = [
  { name: 'favorite', label: 'Heart' },
  { name: 'flight', label: 'Flight' },
  { name: 'accessTime', label: 'Clock' },
  { name: 'restaurant', label: 'Restaurant' },
  { name: 'locationCity', label: 'City' },
  { name: 'celebration', label: 'Celebration' },
  { name: 'beachAccess', label: 'Beach' },
  { name: 'localDining', label: 'Dining' },
  { name: 'directionsBike', label: 'Cycling' },
  { name: 'calendarToday', label: 'Calendar' },
  { name: 'sportsKabaddi', label: 'Martial arts' },
  { name: 'phoneIphone', label: 'Phone' },
  { name: 'handshake', label: 'Handshake' },
  { name: 'supervisorAccount', label: 'Group' },
  { name: 'church', label: 'Church' },
  { name: 'mic', label: 'Microphone' },
  { name: 'landscape', label: 'Landscape' },
  { name: 'sportsTennis', label: 'Tennis' },
  { name: 'eggAlt', label: 'Egg' },
  { name: 'directionsCar', label: 'Car' },
  { name: 'headphones', label: 'Headphones' },
  { name: 'sailing', label: 'Sailing' },
  { name: 'diamond', label: 'Diamond' },
  { name: 'diversity3', label: 'Community' },
  { name: 'acUnit', label: 'Snowflake' },
  { name: 'https', label: 'Lock' },
  { name: 'stadium', label: 'Stadium' },
  { name: 'masks', label: 'Masks' },
  { name: 'vaccines', label: 'Vaccine' },
  { name: 'monetizationOn', label: 'Money' },
  { name: 'casino', label: 'Dice' },
  { name: 'home', label: 'Home' },
  { name: 'moving', label: 'Trending' },
  { name: 'cake', label: 'Cake' },
];

/** Just the canonical icon names — handy for drift guards and membership checks. */
export const ABOUT_ICON_NAMES: readonly string[] = ABOUT_ICONS.map((i) => i.name);

// ---- tree types (the GET/PUT /events/{eventId}/about payload) ---------------------

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
