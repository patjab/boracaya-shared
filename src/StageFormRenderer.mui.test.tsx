// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { StageFormRenderer } from './StageFormRenderer';
import type { StageFormRendererMessages } from './formMessages';
import type { StageElement, StageQuestion } from './stages';

/**
 * The renderer runs on every @mui/material major its consumers use (7 today,
 * 9 for Shore's upgrade, shore#592). MUI 9 removed `inputProps` /
 * `InputLabelProps` on TextField and the system props on layout components,
 * and passed them straight through to the DOM, so the RSVP inputs lost their
 * required/aria attributes. These tests pin what the native inputs get through
 * `slotProps`, and that MUI never forwards an unknown prop to React.
 */

const messages: StageFormRendererMessages = {
  yesOptionLabel: 'Yes',
  noOptionLabel: 'No',
  listSeparatorHint: 'Separate entries with commas',
  addEntryActionLabel: 'Add another',
  requiredIndicator: '*',
  requiredFieldLabel: 'Required field',
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) => `Remove ${fieldLabel} ${entryNumber}`,
  wizard: {
    backActionLabel: 'Back',
    nextActionLabel: 'Next',
    formatStepCount: ({ stepNumber, stepCount }) => `Step ${stepNumber} of ${stepCount}`,
  },
};

const textInputs: StageQuestion[] = [
  { key: 'names', label: 'Names', type: 'list' },
  { key: 'count', label: 'Count', type: 'number' },
  { key: 'arrival', label: 'Arrival', type: 'date' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'multiline' },
];

const withRequired = (required: boolean): StageQuestion[] =>
  textInputs.map((el) => ({ ...el, required }));

const inputFor = (label: string): HTMLInputElement | HTMLTextAreaElement =>
  screen.getByLabelText(label, { exact: false, selector: 'input, textarea' });

// React reports an unknown DOM prop once per prop per module instance, so the
// spy spans the whole file: the last test reads every warning any render in
// this file produced, not just its own.
let consoleError: MockInstance<typeof console.error>;
beforeAll(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => {
  consoleError.mockRestore();
});
afterEach(cleanup);

const reactWarnings = (): string[] =>
  consoleError.mock.calls.map((args) => args.map(String).join(' '));

describe('StageFormRenderer native input attributes', () => {
  it.each(textInputs.map((el) => el.label))(
    'a required %s input carries required and aria-required on the native element',
    (label) => {
      render(<StageFormRenderer messages={messages} elements={withRequired(true)} values={{}}
        onChange={() => undefined} />);
      const input = inputFor(label);
      expect(input.required).toBe(true);
      expect(input.getAttribute('aria-required')).toBe('true');
    },
  );

  it.each(textInputs.map((el) => el.label))(
    'an optional %s input carries neither attribute',
    (label) => {
      render(<StageFormRenderer messages={messages} elements={withRequired(false)} values={{}}
        onChange={() => undefined} />);
      const input = inputFor(label);
      expect(input.required).toBe(false);
      expect(input.hasAttribute('aria-required')).toBe(false);
    },
  );

  it('text and multiline inputs keep their maxLength (schema value, else 500)', () => {
    render(
      <StageFormRenderer
        messages={messages}
        elements={[
          { key: 'email', label: 'Email', type: 'text', required: true, maxLength: 80 },
          { key: 'notes', label: 'Notes', type: 'multiline' },
        ]}
        values={{}}
        onChange={() => undefined}
      />,
    );
    expect(inputFor('Email').maxLength).toBe(80);
    expect(inputFor('Email').required).toBe(true);
    expect(inputFor('Notes').maxLength).toBe(500);
  });

  it('the date label stays shrunk above an empty date input', () => {
    render(<StageFormRenderer messages={messages} elements={[textInputs[2]]} values={{}}
      onChange={() => undefined} />);
    const label = document.querySelector('label.MuiInputLabel-root');
    expect(label?.textContent).toBe('Arrival');
    expect(label?.getAttribute('data-shrink')).toBe('true');
  });

  it('a sameRow pair still lays out top-aligned in a responsive row', () => {
    render(
      <StageFormRenderer
        messages={messages}
        elements={[
          { key: 'first', label: 'First', type: 'text' },
          { key: 'last', label: 'Last', type: 'text', sameRow: true },
        ]}
        values={{}}
        onChange={() => undefined}
      />,
    );
    const row = inputFor('First').closest('.MuiStack-root') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.contains(inputFor('Last'))).toBe(true);
    expect(getComputedStyle(row).alignItems).toBe('flex-start');
    expect(row.hasAttribute('alignitems')).toBe(false);
  });

  it('a roster block centres each avatar row without leaking a DOM attribute', () => {
    const { container } = render(
      <StageFormRenderer
        messages={messages}
        elements={[{ kind: 'display', id: 'party', label: 'Your party', source: 'party', presentation: 'roster' }]}
        resolved={{ party: ['Ana', 'Ben'] }}
        values={{}}
        onChange={() => undefined}
      />,
    );
    const avatarRow = screen.getByText('Ana').closest('.MuiStack-root') as HTMLElement;
    expect(getComputedStyle(avatarRow).alignItems).toBe('center');
    expect(container.querySelector('[alignitems]')).toBeNull();
  });

  // Keep this test LAST: it asserts over the whole file's warnings.
  it('renders every element kind, flat and stepped, without a React unknown-prop warning', () => {
    const elements: StageElement[] = [
      ...withRequired(true),
      { key: 'meal', label: 'Meal', type: 'select', options: ['Fish'], required: true },
      { key: 'attending', label: 'Attending', type: 'boolean', required: true },
      {
        key: 'companions', label: 'Companions', type: 'repeatingGroup',
        subFields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
      },
      { kind: 'display', id: 'party', label: 'Party', source: 'party', presentation: 'roster' },
      { kind: 'display', id: 'note', text: 'Bring sunscreen' },
      { key: 'a', label: 'A', type: 'text' },
      { key: 'b', label: 'B', type: 'text', sameRow: true },
    ];
    const resolved = { party: ['Ana'] };
    const values = { companions: [{ name: 'Cy' }] };
    render(<StageFormRenderer messages={messages} elements={elements} values={values}
      resolved={resolved} onChange={() => undefined} />);
    cleanup();
    render(<StageFormRenderer messages={messages} elements={elements} values={values}
      resolved={resolved} presentation="stepped" onChange={() => undefined} />);
    expect(reactWarnings().filter((w) => /does not recognize|Unknown prop|invalid DOM property/i.test(w)))
      .toEqual([]);
  });
});
