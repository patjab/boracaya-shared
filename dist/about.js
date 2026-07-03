"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABOUT_SCHEMA = exports.ABOUT_PAGE_FIELDS = exports.ABOUT_BLOCK_TYPES = void 0;
/** The block vocabulary — one entry per approved repeating body block type. */
exports.ABOUT_BLOCK_TYPES = {
    textSection: {
        type: 'textSection',
        label: 'Text sections',
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
        itemNoun: 'question',
        fields: [
            { key: 'question', label: 'Question', type: 'text', required: true },
            { key: 'answer', label: 'Answer', type: 'multiline', required: true },
        ],
    },
    card: {
        type: 'card',
        label: 'Cards',
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
exports.ABOUT_PAGE_FIELDS = [
    { key: 'eyebrow', label: 'Eyebrow', type: 'text', help: 'Small label above the title, e.g. "WHAT TO WEAR"' },
    { key: 'title', label: 'Page title', type: 'text', required: true },
    { key: 'blurb', label: 'Short blurb', type: 'multiline' },
    { key: 'blurbVideoUrl', label: 'Blurb video (YouTube URL)', type: 'youtube', help: 'Embedded under the blurb, before the content' },
    { key: 'sectionLabel', label: 'Section label', type: 'text', help: 'Small label above the content, e.g. "PLAN YOUR TRIP"' },
    { key: 'footerNote', label: 'Footer note', type: 'multiline', help: 'Callout under the content, e.g. FAQs’ final note' },
    { key: 'footerVideoUrl', label: 'Footer video (YouTube URL)', type: 'youtube', help: 'Embedded after the content (cf. NY Vows)' },
];
/** The comparable contract object the cdk Lambda bundles a JSON copy of. */
exports.ABOUT_SCHEMA = {
    version: 1,
    blockTypes: exports.ABOUT_BLOCK_TYPES,
    pageFields: exports.ABOUT_PAGE_FIELDS,
};
