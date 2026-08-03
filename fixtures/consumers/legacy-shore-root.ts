import {
  GuestEventApi,
  SHELL_KEYS,
  SiteUrls,
  getJson,
  isShellKey,
} from 'boracaya-shared';

export const legacyShoreBootstrap = {
  feed: GuestEventApi.momentsPublic('fixture-event'),
  publicSite: SiteUrls.PUBLIC,
  firstShell: SHELL_KEYS[0],
  validShell: isShellKey(SHELL_KEYS[0]),
  read: getJson,
};
