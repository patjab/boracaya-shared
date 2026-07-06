import { describe, it, expect } from 'vitest';
import { ABOUT_ICONS, ABOUT_ICON_NAMES } from './about';

describe('About icon vocabulary (cdk#492)', () => {
  it('every icon has a non-empty name and label', () => {
    for (const icon of ABOUT_ICONS) {
      expect(icon.name).toMatch(/\S/);
      expect(icon.label).toMatch(/\S/);
    }
  });

  it('names are unique', () => {
    expect(new Set(ABOUT_ICON_NAMES).size).toBe(ABOUT_ICON_NAMES.length);
  });

  it('ABOUT_ICON_NAMES mirrors ABOUT_ICONS in order', () => {
    expect(ABOUT_ICON_NAMES).toEqual(ABOUT_ICONS.map((i) => i.name));
  });

  it('is deep-frozen at runtime so the vocabulary cannot desync', () => {
    expect(Object.isFrozen(ABOUT_ICONS)).toBe(true);
    expect(Object.isFrozen(ABOUT_ICON_NAMES)).toBe(true);
    for (const icon of ABOUT_ICONS) expect(Object.isFrozen(icon)).toBe(true);
  });
});
