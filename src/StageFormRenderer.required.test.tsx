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

  it('a decimal answer is reported as a number', () => {
    const seen: StageFormValues[] = [];
    render(<StageFormRenderer messages={messages} elements={numbers} values={{}}
      onChange={(key, value) => seen.push({ [key]: value })} />);
    fireEvent.change(screen.getByLabelText('How many nights', { selector: 'input' }), { target: { value: '2.5' } });
    expect(seen).toEqual([{ nights: 2.5 }]);
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
