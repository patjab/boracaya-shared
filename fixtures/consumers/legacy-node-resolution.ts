import { AdminEventApi } from 'boracaya-shared/api';
import { PublicApi } from 'boracaya-shared/bootstrap';
import { currentPathname } from 'boracaya-shared/browser';
import { sendJson } from 'boracaya-shared/client';
import { isShellKey } from 'boracaya-shared/domain';
import { StageFormRenderer } from 'boracaya-shared/forms';
import { useLoading } from 'boracaya-shared/hooks';
import { loginNoEvent } from 'boracaya-shared/identity';
import { formatEventDate } from 'boracaya-shared/node';
import { ErrorBoundary } from 'boracaya-shared/ui';
import { ABOUT_SCHEMA as about } from 'boracaya-shared/dist/about';
import { ABOUT_SCHEMA as aboutJs } from 'boracaya-shared/dist/about.js';
import { formatEventDate as eventDate } from 'boracaya-shared/dist/eventDate';
import { formatEventDate as eventDateJs } from 'boracaya-shared/dist/eventDate.js';
import { ApiRoutes as routes } from 'boracaya-shared/dist/routes';
import { ApiRoutes as routesJs } from 'boracaya-shared/dist/routes.js';

// This fixture deliberately compiles with TypeScript's legacy `Node` resolver.
// Referencing each value makes accidental declaration-only or wildcard fallbacks
// visible to both TypeScript and the package export audit.
export const legacyNodeResolutionSurface = {
  AdminEventApi,
  PublicApi,
  currentPathname,
  sendJson,
  isShellKey,
  StageFormRenderer,
  useLoading,
  loginNoEvent,
  formatEventDate,
  ErrorBoundary,
  about,
  aboutJs,
  eventDate,
  eventDateJs,
  routes,
  routesJs,
};
