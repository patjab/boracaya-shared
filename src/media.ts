/** True when a MIME type denotes a video (`video/mp4`, `video/quicktime`, …).
 *  Tolerant of a missing type so a manifest entry with no `mimeType` reads as
 *  "not a video" rather than throwing. */
export const isVideo = (mimeType: string): boolean =>
  mimeType?.startsWith('video/') ?? false;
