import { AdminEventApi } from 'boracaya-shared/api';
import { invalidateCache, sendJson } from 'boracaya-shared/client';
import { STYLE_TIERS } from 'boracaya-shared/domain';

export const valetBrowser = {
  eventConfig: AdminEventApi.config('fixture-event'),
  save: sendJson,
  invalidateCache,
  styleTiers: STYLE_TIERS,
};
