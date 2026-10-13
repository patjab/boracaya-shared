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
