// @vitest-environment jsdom
/**
 * shore#577: a blocked GIS script must not be re-appended every 2 s forever.
 * Retries back off and stop, at most one gsi <script> is in <head> at a time,
 * the button then shows its fallback, and an `online` event tries once more.
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Win = Window & { google?: unknown };

const gsiScripts = () =>
  Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[src*="gsi/client"]'));

/** Fire `error` on the one pending gsi script, then let the rejection settle. */
const failLoad = async () => {
  const scripts = gsiScripts();
  expect(scripts).toHaveLength(1);
  await act(async () => {
    scripts[0].dispatchEvent(new Event('error'));
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const mount = async (props: Record<string, unknown> = {}) => {
  vi.resetModules(); // cold initAuth memo per case
  const { GoogleSignInButton } = await import('./GoogleSignInButton');
  return render(React.createElement(GoogleSignInButton, props));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.head.innerHTML = '';
  delete (window as Win).google;
});

describe('GoogleSignInButton when GIS is blocked (shore#577)', () => {
  it('backs off, caps the retries, keeps one script, then shows the fallback', async () => {
    const onUnavailable = vi.fn();
    const view = await mount({
      fallback: React.createElement('p', { role: 'status' }, 'Google sign-in is unavailable'),
      onUnavailable,
    });

    await failLoad();
    expect(gsiScripts()).toHaveLength(0); // the failed element is removed

    // Delays grow: nothing is retried before each one elapses.
    for (const delay of [2000, 4000, 8000]) {
      await advance(delay - 1);
      expect(gsiScripts()).toHaveLength(0);
      await advance(1);
      await failLoad();
    }
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(view.getByRole('status').textContent).toBe('Google sign-in is unavailable');

    // No further attempts on a timer.
    await advance(10 * 60 * 1000);
    expect(gsiScripts()).toHaveLength(0);

    // Reconnecting makes one attempt; its failure gives up again at once.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await failLoad();
    expect(onUnavailable).toHaveBeenCalledTimes(2);
    await advance(60 * 1000);
    expect(gsiScripts()).toHaveLength(0);
    expect(view.getByRole('status')).toBeTruthy();
  });

  it('a successful attempt after reconnecting renders the button and drops the fallback', async () => {
    const view = await mount({
      fallback: React.createElement('p', { role: 'status' }, 'unavailable'),
    });
    await failLoad();
    for (const delay of [2000, 4000, 8000]) {
      await advance(delay);
      await failLoad();
    }
    expect(view.queryByRole('status')).not.toBeNull();

    const renderButton = vi.fn();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    (window as Win).google = { accounts: { id: { initialize: vi.fn(), renderButton } } };
    await act(async () => {
      gsiScripts()[0].dispatchEvent(new Event('load'));
    });

    expect(renderButton).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('status')).toBeNull();
  });

  it('renders no fallback while loading or before the retries run out', async () => {
    const view = await mount({ fallback: React.createElement('p', { role: 'status' }, 'unavailable') });
    expect(view.queryByRole('status')).toBeNull();
    await failLoad();
    expect(view.queryByRole('status')).toBeNull();
    view.unmount();
    await advance(2000);
    expect(gsiScripts()).toHaveLength(0); // an unmounted button stops retrying
  });
});
