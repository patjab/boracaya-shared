import { describe, expect, it, vi } from 'vitest';
import { PublicApi } from './api';

describe('PublicApi', () => {
  it('pins the production public endpoints without exposing the admin lane', () => {
    expect(PublicApi).toEqual({
      EVENTS: 'https://public-api.boracaya.com/events',
      DISCOVER: 'https://public-api.boracaya.com/discover',
      GUEST_LOGIN: 'https://public-api.boracaya.com/auth/login',
      FACES_CONTROL: 'https://faces-control.pdaboracay.com',
      FACES_BOX: 'https://faces.pdaboracay.com',
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
        FACES_CONTROL: 'https://faces-control.test.pdaboracay.com',
        FACES_BOX: 'https://faces.test.pdaboracay.com',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
