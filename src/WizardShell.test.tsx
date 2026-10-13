// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WizardShell } from './WizardShell';
import type { WizardMessages } from './formMessages';
import type { WizardStep } from './WizardShell';

const messages: WizardMessages = {
  backActionLabel: 'Back',
  nextActionLabel: 'Next',
  formatStepCount: ({ stepNumber, stepCount }) => `Step ${stepNumber} of ${stepCount}`,
};

const steps: WizardStep[] = ['a', 'b', 'c'].map((key) => ({ key, content: <p>Question {key}</p> }));

const caption = (count: string) => screen.getByText(count, { selector: '[aria-live]' });

/** The focused step: its content, never <body>; the live caption says which. */
const expectOnStep = (question: string, count: string) => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement?.textContent).toBe(question);
  expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  expect(caption(count).getAttribute('aria-live')).toBe('polite');
};

const press = (name: string) => {
  const button = screen.getByRole('button', { name });
  button.focus();
  fireEvent.click(button);
};

afterEach(cleanup);

describe('WizardShell focus on step change (shore#501)', () => {
  it('does not move focus on the first render', () => {
    render(<WizardShell steps={steps} messages={messages} finish={<button type="button">Submit</button>} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('Next and Back land on the new step and announce its "N of M", even when the button unmounts', () => {
    render(<WizardShell steps={steps} messages={messages} finish={<button type="button">Submit</button>} />);
    expect(caption('Step 1 of 3').getAttribute('aria-atomic')).toBe('true');
    press('Next');
    expectOnStep('Question b', 'Step 2 of 3');
    // Next onto the final step: Next itself unmounts for the finish control.
    press('Next');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expectOnStep('Question c', 'Step 3 of 3');
    press('Back');
    expectOnStep('Question b', 'Step 2 of 3');
    // Back from step 2: Back itself unmounts on the first step.
    press('Back');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expectOnStep('Question a', 'Step 1 of 3');
  });

  it('a step list that shrinks under the wizard clamps without taking focus', () => {
    const { rerender } = render(<WizardShell steps={steps} messages={messages} />);
    press('Next');
    press('Next');
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    rerender(<WizardShell steps={steps.slice(0, 2)} messages={messages} />);
    expect(caption('Step 2 of 2')).toBeTruthy();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
