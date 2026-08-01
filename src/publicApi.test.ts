import { describe, expect, it } from 'vitest';
import { ApiConstants, PublicApi } from './api';

describe('PublicApi', () => {
  it('preserves every public ApiConstants URL without exposing the admin lane', () => {
    expect(PublicApi).toEqual({
      EVENTS: ApiConstants.EVENTS,
      DISCOVER: ApiConstants.DISCOVER,
      GUEST_LOGIN: ApiConstants.GUEST_LOGIN,
      FACES_CONTROL: ApiConstants.FACES_CONTROL,
      FACES_BOX: ApiConstants.FACES_BOX,
    });
    expect('ADMIN_EVENTS' in PublicApi).toBe(false);
  });
});
