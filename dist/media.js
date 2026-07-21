"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVideo = void 0;
/** True when a MIME type denotes a video (`video/mp4`, `video/quicktime`, …).
 *  Tolerant of a missing type so a manifest entry with no `mimeType` reads as
 *  "not a video" rather than throwing. */
const isVideo = (mimeType) => { var _a; return (_a = mimeType === null || mimeType === void 0 ? void 0 : mimeType.startsWith('video/')) !== null && _a !== void 0 ? _a : false; };
exports.isVideo = isVideo;
