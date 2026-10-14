/**
 * The organizer's Google ID token rides only to first-party API hosts
 * (shared#199). Pins the allowlist itself and the two data-layer call paths
 * that used to attach it to any url.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPlatformApiUrl } from './apiHosts';

describe('isPlatformApiUrl', () => {
  it.each([
    'https://valet-api.boracaya.com/events',
    'https://valet-api.test.boracaya.com/events',
    'https://public-api.boracaya.com/events/e1/config',
    'https://public-api.test.boracaya.com/events/e1/config',
    'https://reservations-api.boracaya.com/x',
    'https://share-api.boracaya.com/x',
    'https://moments-api.test.boracaya.com/x',
    'https://faces-api.boracaya.com/x',
    'https://faces-control.pdaboracay.com/runs',
    'https://faces-control.test.pdaboracay.com/runs',
    'https://VALET-API.boracaya.com/events',
  ])('allows %s', (url) => {
    expect(isPlatformApiUrl(url)).toBe(true);
  });

  it.each([
    ['third-party host', 'https://example.com/x'],
    ['look-alike suffix', 'https://valet-api.boracaya.com.evil.com/x'],
    ['look-alike prefix', 'https://evil-valet-api.boracaya.com/x'],
    ['bare apex', 'https://boracaya.com/x'],
    ['frontend', 'https://valet.boracaya.com/x'],
    ['faces GPU box', 'https://faces.pdaboracay.com/x'],
    ['unknown env marker', 'https://valet-api.staging.boracaya.com/x'],
    ['service on the wrong apex', 'https://valet-api.pdaboracay.com/x'],
    ['nested subdomain', 'https://a.valet-api.boracaya.com/x'],
    ['plain http', 'http://valet-api.boracaya.com/x'],
    ['relative url', '/events'],
    ['garbage', 'not a url'],
  ])('refuses a %s', (_label, url) => {
    expect(isPlatformApiUrl(url)).toBe(false);
  });
});

describe('getJson / sendJson attach the token only to API hosts', () => {
  const TOKEN = 'h.e30.s';
  let fetchMock: ReturnType<typeof vi.fn>;

  const sentAuth = (): string | undefined =>
    (fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }).headers.Authorization;

  const load = async () => {
    vi.resetModules();
    vi.doMock('./authToken', () => ({ authHeaders: () => ({ Authorization: `Bearer ${TOKEN}` }) }));
    return import('./data');
  };

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.doUnmock('./authToken');
    vi.unstubAllGlobals();
  });

  it('getJson sends the token to an API host', async () => {
    const { getJson } = await load();
    await getJson('https://valet-api.boracaya.com/events');
    expect(sentAuth()).toBe(`Bearer ${TOKEN}`);
  });

  it('getJson does not send the token to any other host', async () => {
    const { getJson } = await load();
    await getJson('https://example.com/steal');
    expect(sentAuth()).toBeUndefined();
  });

  it('sendJson sends the token to an API host', async () => {
    const { sendJson } = await load();
    await sendJson('https://valet-api.test.boracaya.com/events', { method: 'POST', body: {} });
    expect(sentAuth()).toBe(`Bearer ${TOKEN}`);
  });

  it('sendJson does not send the token to a look-alike host', async () => {
    const { sendJson } = await load();
    await sendJson('https://valet-api.boracaya.com.evil.com/x', { method: 'POST', body: {} });
    expect(sentAuth()).toBeUndefined();
  });

  it('a caller-supplied Authorization header still wins', async () => {
    const { getJson } = await load();
    await getJson('https://valet-api.boracaya.com/events', { headers: { Authorization: 'Bearer explicit' } });
    expect(sentAuth()).toBe('Bearer explicit');
  });
});
