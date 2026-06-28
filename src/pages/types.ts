export type PageStatus = 'draft' | 'published';

/**
 * Defines a page type: the schema for its content and metadata about how it
 * behaves in the system. Lives in shared so the admin (authoring) and public
 * site (rendering) share a single contract.
 */
export interface PageType {
  /** Stable identifier — never changes even if the slug or display name does. */
  id: string;
  label: string;
  /** JSON Schema describing the page's configurable content. */
  schema: Record<string, unknown>;
  /** Only one instance of this type is allowed per event. */
  singleton?: boolean;
  /** Viewing this page requires authentication. */
  authGated?: boolean;
}

/**
 * A single page within an event. slug and displayName are editable; typeId is
 * immutable and drives renderer lookup and schema validation.
 */
export interface PageInstance {
  /** Stable, immutable ID — never the route slug. */
  id: string;
  typeId: string;
  /** Namespaces this instance to one event (multi-tenant). */
  eventId: string;
  /** URL path segment, e.g. 'rsvp'. Editable without breaking the renderer. */
  slug: string;
  /** Nav label shown to guests. Editable. */
  displayName: string;
  /** JSON content validated against PageType.schema. */
  content: Record<string, unknown>;
  status: PageStatus;
  isActive: boolean;
  order: number;
}
