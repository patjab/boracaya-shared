import { describe, expect, it, vi } from 'vitest';
import { PublicApi } from './api';

describe('PublicApi', () => {
  it('pins the production public endpoints without exposing the admin lane', () => {
    expect(PublicApi).toEqual({
      EVENTS: 'https://public-api.boracaya.com/events',
      DISCOVER: 'https://public-api.boracaya.com/discover',
      GUEST_LOGIN: 'https://public-api.boracaya.com/auth/login',
      TELEMETRY_ERRORS: 'https://public-api.boracaya.com/telemetry/errors',
    });
    expect('ADMIN_EVENTS' in PublicApi).toBe(false);
  });

  it('pins the testing public endpoint hosts', () => {
    vi.stubGlobal('window', { location: { hostname: 'www.test.boracaya.com' } });
    try {
      expect(PublicApi).toEqual({
        EVENTS: 'https://public-api.test.boracaya.com/events',
        DISCOVER: 'https://public-api.test.boracaya.com/discover',
        GUEST_LOGIN: 'https://public-api.test.boracaya.com/auth/login',
        TELEMETRY_ERRORS: 'https://public-api.test.boracaya.com/telemetry/errors',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
