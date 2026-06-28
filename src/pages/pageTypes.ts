import { PageType } from './types';

/**
 * Registry of all page types known to the system. Each entry declares the
 * stable typeId (which maps 1:1 to the current DynamoDB pageEnum value),
 * a human label, and a JSON Schema for the page's configurable content.
 *
 * The schemas are intentionally minimal for Step 1 — content is currently
 * hardcoded in each renderer. They will be expanded in Step 2 when the admin
 * authoring UI is built to generate forms from these schemas.
 */
export const PAGE_TYPES: Record<string, PageType> = {
  rsvp: {
    id: 'rsvp',
    label: 'RSVP',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'RSVP' },
      },
    },
  },

  'about-couple': {
    id: 'about-couple',
    label: 'About the Couple',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'About Us' },
      },
    },
  },

  events: {
    id: 'events',
    label: 'Events',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Events' },
      },
    },
  },

  details: {
    id: 'details',
    label: 'Details',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Details' },
      },
    },
  },

  guestbook: {
    id: 'guestbook',
    label: 'Guestbook',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Guestbook' },
      },
    },
  },

  recap: {
    id: 'recap',
    label: 'Recap',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Recap' },
      },
    },
  },

  moments: {
    id: 'moments',
    label: 'Moments',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Moments' },
      },
    },
  },

  'our-wedding': {
    id: 'our-wedding',
    label: 'Our Wedding',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Our Wedding' },
      },
    },
  },

  'check-in': {
    id: 'check-in',
    label: 'Check-In',
    singleton: true,
    authGated: true,
    schema: {
      type: 'object',
      properties: {},
    },
  },

  'save-the-date': {
    id: 'save-the-date',
    label: 'Save the Date',
    singleton: true,
    schema: {
      type: 'object',
      properties: {
        heading: { type: 'string', default: 'Save the Date' },
      },
    },
  },
};
