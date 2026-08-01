import {
  GuestEventApi,
  PublicApi,
  SHELL_KEYS,
  SiteUrls,
  getJson,
  isShellKey,
} from 'boracaya-shared/bootstrap';

export const shoreBootstrap = {
  config: `${PublicApi.EVENTS}/fixture-event/config`,
  feed: GuestEventApi.momentsPublic('fixture-event'),
  publicSite: SiteUrls.PUBLIC,
  firstShell: SHELL_KEYS[0],
  validShell: isShellKey(SHELL_KEYS[0]),
  read: getJson,
};
