// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StageFormRenderer } from './StageFormRenderer';
import type { StageFormValues } from './StageFormRenderer';
import type { StageFormRendererMessages } from './formMessages';
import type { StageElement, StageQuestion } from './stages';

const base: StageFormRendererMessages = {
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
const messages: StageFormRendererMessages = { ...base, requiredSubFieldMessage: 'Needed for this entry' };

const Host = ({ elements, initial, presentation, copy = messages }: {
  elements: StageElement[];
  initial: StageFormValues;
  presentation?: 'stepped' | 'flat';
  copy?: StageFormRendererMessages;
}) => {
  const [values, setValues] = React.useState(initial);
  return (
    <StageFormRenderer messages={copy} elements={elements} values={values} presentation={presentation}
      footer={<button type="button">Submit</button>}
      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
  );
};

afterEach(cleanup);

/** The core companions shape, then one more question so the group screen has a Next. */
const companionsThenMore: StageElement[] = [
  {
    key: 'companions', label: 'Who is coming with you?', type: 'repeatingGroup', addLabel: 'Add another guest',
    subFields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'allergies', label: 'Allergies', type: 'text' },
    ],
  },
  { key: 'song', label: 'Song request', type: 'text' },
];
const nameInput = () => screen.getByLabelText(/^Name/, { selector: 'input' }) as HTMLInputElement;
const allergiesInput = () => screen.getByLabelText(/^Allergies/, { selector: 'input' });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const invalid = (el: Element) => el.getAttribute('aria-invalid') === 'true';
/** The text of the elements aria-describedby names (jsdom has no accessible-description API). */
const description = (el: Element): string => (el.getAttribute('aria-describedby') ?? '')
  .split(/\s+/).filter(Boolean)
  .map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();

describe('repeating-group required sub-fields (shore#704)', () => {
  it('an entry with allergies and no name holds the stepped Next and marks Name with its reason', () => {
    render(<Host elements={companionsThenMore} initial={{}} presentation="stepped" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add another guest' }));
    // A freshly added, empty entry holds nothing back and shows no error.
    expect(button('Next').disabled).toBe(false);
    expect(invalid(nameInput())).toBe(false);
    expect(screen.queryByText('Needed for this entry')).toBeNull();

    fireEvent.change(allergiesInput(), { target: { value: 'peanuts' } });
    expect(button('Next').disabled).toBe(true);
    expect(invalid(nameInput())).toBe(true);
    expect(description(nameInput())).toBe('Needed for this entry');

    fireEvent.change(nameInput(), { target: { value: 'Ben' } });
    expect(button('Next').disabled).toBe(false);
    expect(invalid(nameInput())).toBe(false);
    expect(screen.queryByText('Needed for this entry')).toBeNull();
  });

  it('the error belongs to its own entry: a named entry beside a nameless one stays valid', () => {
    render(<Host elements={companionsThenMore} presentation="flat"
      initial={{ companions: [{ name: 'Ana' }, { allergies: 'nuts' }] }} />);
    const names = screen.getAllByLabelText(/^Name/, { selector: 'input' });
    expect(invalid(names[0])).toBe(false);
    expect(invalid(names[1])).toBe(true);
    expect(screen.getAllByText('Needed for this entry')).toHaveLength(1);
  });

  it('without the optional message the field is still marked invalid, with no text', () => {
    render(<Host elements={companionsThenMore} presentation="flat" copy={base}
      initial={{ companions: [{ allergies: 'nuts' }] }} />);
    expect(invalid(nameInput())).toBe(true);
    expect(description(nameInput())).toBe('');
  });

  it('a required number or date sub-field left empty in a filled entry is marked with the reason', () => {
    const elements: StageElement[] = [{
      key: 'kids', label: 'Kids', type: 'repeatingGroup',
      subFields: [
        { key: 'note', label: 'Note', type: 'text' },
        { key: 'size', label: 'Shoe size', type: 'number', required: true },
        { key: 'born', label: 'Born', type: 'date', required: true },
      ],
    }];
    render(<Host elements={elements} presentation="flat" initial={{ kids: [{ note: 'x' }] }} />);
    for (const label of [/^Shoe size/, /^Born/]) {
      const input = screen.getByLabelText(label, { selector: 'input' });
      expect(invalid(input)).toBe(true);
      expect(description(input)).toBe('Needed for this entry');
    }
    cleanup();
    render(<Host elements={elements} presentation="flat"
      initial={{ kids: [{ note: 'x', size: 8.5, born: '2020-01-02' }] }} />);
    for (const label of [/^Shoe size/, /^Born/]) {
      expect(invalid(screen.getByLabelText(label, { selector: 'input' }))).toBe(false);
    }
  });

  it('a required Yes/No or select sub-field left empty in a filled entry shows the reason too', () => {
    const elements: StageElement[] = [{
      key: 'kids', label: 'Kids', type: 'repeatingGroup',
      subFields: [
        { key: 'name', label: 'Kid name', type: 'text' },
        { key: 'vegan', label: 'Vegan', type: 'boolean', required: true },
        { key: 'meal', label: 'Meal', type: 'select', options: ['Fish', 'Pasta'], required: true },
      ],
    }];
    render(<Host elements={elements} presentation="flat" initial={{ kids: [{ name: 'Mia' }] }} />);
    expect(screen.getAllByText('Needed for this entry')).toHaveLength(2);
    const vegan = screen.getByRole('group', { name: /^Vegan/ });
    expect(description(vegan)).toBe('Needed for this entry');
    expect(invalid(vegan)).toBe(true);
    const meal = screen.getByRole('combobox');
    expect(description(meal)).toBe('Needed for this entry');
    expect(invalid(meal)).toBe(true);
    cleanup();
    // Without the optional message: still marked invalid, with no text.
    render(<Host elements={elements} presentation="flat" copy={base} initial={{ kids: [{ name: 'Mia' }] }} />);
    expect(invalid(screen.getByRole('group', { name: /^Vegan/ }))).toBe(true);
    expect(invalid(screen.getByRole('combobox'))).toBe(true);
    expect(description(screen.getByRole('combobox'))).toBe('');
    // Filled, neither is marked.
    cleanup();
    render(<Host elements={elements} presentation="flat"
      initial={{ kids: [{ name: 'Mia', vegan: false, meal: 'Fish' }] }} />);
    expect(invalid(screen.getByRole('group', { name: /^Vegan/ }))).toBe(false);
    expect(invalid(screen.getByRole('combobox'))).toBe(false);
  });
});

describe('number questions take decimals (shore#716)', () => {
  const numbers: StageElement[] = [
    { key: 'nights', label: 'How many nights', type: 'number' },
    { key: 'feet', label: 'Feet', type: 'repeatingGroup',
      subFields: [{ key: 'size', label: 'Shoe size', type: 'number', required: true }] },
  ];

  it('a top-level number input carries step="any" and inputmode="decimal"', () => {
    render(<Host elements={numbers} presentation="flat" initial={{}} />);
    const input = screen.getByLabelText('How many nights', { selector: 'input' });
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('step')).toBe('any');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });

  it('a repeating-group number sub-field carries them too, beside its required attributes', () => {
    render(<Host elements={numbers} presentation="flat" initial={{ feet: [{}] }} />);
    const input = screen.getByLabelText(/^Shoe size/, { selector: 'input' });
    expect(input.getAttribute('step')).toBe('any');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect((input as HTMLInputElement).required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  // jsdom implements stepMismatch: without step="any" a 2.5 is invalid there too.
  it('a typed 2.5 and 8.5 are kept as numbers, and the inputs stay valid for native validation', () => {
    const seen: { values: StageFormValues } = { values: {} };
    const Capture = () => {
      const [values, setValues] = React.useState<StageFormValues>({ feet: [{}] });
      seen.values = values;
      return (
        <StageFormRenderer messages={messages} elements={numbers} values={values}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
      );
    };
    render(<Capture />);
    const nights = screen.getByLabelText('How many nights', { selector: 'input' }) as HTMLInputElement;
    const size = screen.getByLabelText(/^Shoe size/, { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(nights, { target: { value: '2.5' } });
    fireEvent.change(size, { target: { value: '8.5' } });
    expect(seen.values).toEqual({ nights: 2.5, feet: [{ size: 8.5 }] });
    expect(nights.value).toBe('2.5');
    expect(size.value).toBe('8.5');
    for (const input of [nights, size]) {
      expect(input.validity.stepMismatch).toBe(false);
      expect(input.checkValidity()).toBe(true);
    }
  });

});

describe('stepped canProceed uses the shared completeness rule', () => {
  it('a required group with only an empty entry holds Next until an entry holds a value', () => {
    const elements: StageElement[] = [
      { ...(companionsThenMore[0] as StageQuestion), required: true },
      companionsThenMore[1],
    ];
    render(<Host elements={elements} presentation="stepped" initial={{ companions: [{}] }} />);
    const next = () => button('Next');
    expect(next().disabled).toBe(true);
    fireEvent.change(nameInput(), { target: { value: 'Ben' } });
    expect(next().disabled).toBe(false);
    fireEvent.click(next());
    expect(screen.getByLabelText('Song request', { selector: 'input' })).toBeTruthy();
  });
});
