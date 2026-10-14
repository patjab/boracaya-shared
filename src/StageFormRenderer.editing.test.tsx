// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StageFormRenderer } from './StageFormRenderer';
import type { StageFormValues } from './StageFormRenderer';
import type { StageFormRendererMessages } from './formMessages';
import type { StageQuestion } from './stages';

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

/** A controlled host wired the way Shore's StageForm/RSVPForm are. */
const Host = ({ elements, initial, seen }: {
  elements: StageQuestion[];
  initial: StageFormValues;
  seen: { values: StageFormValues };
}) => {
  const [values, setValues] = React.useState(initial);
  seen.values = values;
  return (
    <StageFormRenderer messages={messages} elements={elements} values={values}
      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
  );
};

afterEach(cleanup);

describe('StageFormRenderer list field (shore#475)', () => {
  const names: StageQuestion[] = [{ key: 'names', label: 'Names', type: 'list' }];
  const input = () => screen.getByLabelText('Names', { selector: 'input' }) as HTMLInputElement;
  /** One change event per keystroke, each on top of what the input shows. */
  const typeInto = (el: HTMLInputElement, text: string) => {
    for (const ch of text) fireEvent.change(el, { target: { value: el.value + ch } });
  };

  it('keeps commas and spaces as they are typed and stores the parsed items', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={names} initial={{}} seen={seen} />);
    input().focus();
    typeInto(input(), 'Ann Lee, Bob');
    expect(input().value).toBe('Ann Lee, Bob');
    expect(seen.values.names).toEqual(['Ann Lee', 'Bob']);
  });

  it('drops empty items and stray whitespace, and tidies the text on blur', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={names} initial={{}} seen={seen} />);
    typeInto(input(), ' Ann ,, Bob ,');
    expect(input().value).toBe(' Ann ,, Bob ,');
    expect(seen.values.names).toEqual(['Ann', 'Bob']);
    fireEvent.blur(input());
    expect(input().value).toBe('Ann, Bob');
  });

  it('shows a prefilled value, and one replaced from outside, as "a, b"', () => {
    const { rerender } = render(<StageFormRenderer messages={messages} elements={names}
      values={{ names: ['Ann', 'Bob'] }} onChange={() => undefined} />);
    expect(input().value).toBe('Ann, Bob');
    // A draft typed, then the value swapped under it (a draft restore).
    fireEvent.change(input(), { target: { value: 'Ann, Bob, ' } });
    rerender(<StageFormRenderer messages={messages} elements={names}
      values={{ names: ['Cy'] }} onChange={() => undefined} />);
    expect(input().value).toBe('Cy');
  });
});

describe('StageFormRenderer repeating group focus (shore#571)', () => {
  const companions = (maxEntries?: number): StageQuestion[] => [{
    key: 'companions', label: 'Companions', type: 'repeatingGroup', maxEntries,
    subFields: [{ key: 'name', label: 'Name', type: 'text' }],
  }];
  const nameInputs = () => screen.queryAllByLabelText('Name', { selector: 'input' });
  const press = (el: HTMLElement) => {
    el.focus();
    fireEvent.click(el);
  };

  it('Add focuses the new entry\'s first input, also when it reaches the cap', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={companions(2)} initial={{ companions: [{ name: 'Ann' }] }} seen={seen} />);
    press(screen.getByRole('button', { name: 'Add another' }));
    expect(screen.queryByRole('button', { name: 'Add another' })).toBeNull();
    expect(nameInputs()).toHaveLength(2);
    expect(document.activeElement).toBe(nameInputs()[1]);
  });

  it('Remove on the last entry focuses the previous entry\'s first input', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={companions()} initial={{ companions: [{ name: 'Ann' }, { name: 'Bob' }] }}
      seen={seen} />);
    press(screen.getByRole('button', { name: 'Remove Companions 2' }));
    expect(seen.values.companions).toEqual([{ name: 'Ann' }]);
    expect(document.activeElement).toBe(nameInputs()[0]);
  });

  it('Remove on a middle entry focuses the entry that took its place, keeping its own DOM', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={companions()}
      initial={{ companions: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cy' }] }} seen={seen} />);
    const cy = nameInputs()[2];
    press(screen.getByRole('button', { name: 'Remove Companions 2' }));
    expect(seen.values.companions).toEqual([{ name: 'Ann' }, { name: 'Cy' }]);
    expect(nameInputs()[1]).toBe(cy);
    expect(document.activeElement).toBe(cy);
  });

  it('Remove on the only entry focuses the Add button', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host elements={companions()} initial={{ companions: [{ name: 'Ann' }] }} seen={seen} />);
    press(screen.getByRole('button', { name: 'Remove Companions 1' }));
    expect(seen.values.companions).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add another' }));
  });

  it('a Yes/No sub-field takes focus on its pill, not the entry\'s remove button', () => {
    const seen = { values: {} as StageFormValues };
    render(<Host
      elements={[{
        key: 'kids', label: 'Kids', type: 'repeatingGroup',
        subFields: [{ key: 'seat', label: 'Needs a seat', type: 'boolean' }],
      }]}
      initial={{}}
      seen={seen}
    />);
    press(screen.getByRole('button', { name: 'Add another' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Yes' }));
  });
});

describe('StageFormRenderer legacy `fields` prop (cdk#2132)', () => {
  it('renders only `elements`: a stray `fields` list from an untyped caller is not read', () => {
    const legacy = [{ key: 'names', label: 'Names', type: 'list' }] as StageQuestion[];
    const props = { messages, values: {}, onChange: () => {}, fields: legacy };
    render(<StageFormRenderer {...(props as unknown as React.ComponentProps<typeof StageFormRenderer>)} />);
    expect(screen.queryByLabelText('Names', { selector: 'input' })).toBeNull();
    cleanup();
    render(<StageFormRenderer {...(props as unknown as React.ComponentProps<typeof StageFormRenderer>)}
      elements={legacy} />);
    expect(screen.getByLabelText('Names', { selector: 'input' })).toBeTruthy();
  });
});
