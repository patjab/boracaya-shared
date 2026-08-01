import {
  AdminEventApi,
  formatEventDate,
} from 'boracaya-shared/node';

export const valetContractProbe = {
  eventConfig: AdminEventApi.config('fixture-event'),
  formatEventDate,
};
