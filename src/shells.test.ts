/**
 * Shells & Styles vocabulary (cdk#742 shared half): every occasion default is
 * internally valid — a wizard tap can never produce a config the handler's
 * validation (cdk#743) would reject or the guest would degrade to classic.
 */
import { describe, expect, it } from 'vitest';
import {
  CURATED_DESIGNS,
  FALLBACK_DEFAULTS,
  GENERATED_STYLE_DEFAULTS,
  OCCASION_DEFAULTS,
  SHELL_KEYS,
  STYLE_MODES,
  STYLE_TIERS,
  TYPE_VOICES,
} from './shells';

describe('occasion defaults (cdk#739 D4/D14)', () => {
  const all = [...Object.values(OCCASION_DEFAULTS), FALLBACK_DEFAULTS];

  it('every default names a valid shell and tier', () => {
    for (const d of all) {
      expect(SHELL_KEYS).toContain(d.shell);
      expect(STYLE_TIERS).toContain(d.style.tier);
    }
  });

  it('curated defaults reference designs in the launch collection', () => {
    for (const d of all) {
      if (d.style.tier === 'curated') {
        expect(CURATED_DESIGNS).toContain(d.style.inputs?.designId);
      }
    }
  });

  it('covers all seventeen catalog personas', () => {
    expect(Object.keys(OCCASION_DEFAULTS).sort()).toEqual([
      'art-show', 'baptism', 'birthday', 'block-party', 'celebration-of-life',
      'class', 'cupsleeve', 'fun-run', 'funeral', 'gala', 'grand-opening',
      'meetup', 'night-out', 'quinceanera', 'reunion', 'trip', 'wedding',
    ]);
  });

  it('solemn occasions default to the restrained design (D18 register)', () => {
    expect(OCCASION_DEFAULTS.funeral.style.inputs.designId).toBe('restrained');
    expect(OCCASION_DEFAULTS['celebration-of-life'].style.inputs.designId).toBe('restrained');
  });

  it('the no-pick fallback is classic (absence-is-fallback everywhere)', () => {
    expect(FALLBACK_DEFAULTS.shell).toBe('classic');
  });

  it('generated modes are valid; only sunlit occasions opt into light (D19)', () => {
    for (const [key, d] of Object.entries(OCCASION_DEFAULTS)) {
      if (d.style.tier === 'generated' && d.style.inputs && 'mode' in d.style.inputs) {
        expect(STYLE_MODES).toContain(d.style.inputs.mode);
        expect(['block-party', 'reunion']).toContain(key);
      }
    }
    expect(OCCASION_DEFAULTS['block-party'].style.inputs.mode).toBe('light');
    expect(OCCASION_DEFAULTS.reunion.style.inputs.mode).toBe('light');
  });
});

describe('generated-tier fallbacks (valet#921)', () => {
  it('are the values the guest site renders for an unset input, and valid ones', () => {
    expect(GENERATED_STYLE_DEFAULTS).toEqual({ energy: 0.6, typeVoice: 'clean', mode: 'dark' });
    expect(TYPE_VOICES).toContain(GENERATED_STYLE_DEFAULTS.typeVoice);
    expect(STYLE_MODES).toContain(GENERATED_STYLE_DEFAULTS.mode);
    expect(GENERATED_STYLE_DEFAULTS.energy).toBeGreaterThanOrEqual(0);
    expect(GENERATED_STYLE_DEFAULTS.energy).toBeLessThanOrEqual(1);
  });
});
