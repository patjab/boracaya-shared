// @vitest-environment jsdom
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StageFormRenderer } from './StageFormRenderer';
import type { StageFormRendererMessages } from './formMessages';
import { WizardShell } from './WizardShell';

const messages: StageFormRendererMessages = {
  yesOptionLabel: 'Oui',
  noOptionLabel: 'Non',
  listSeparatorHint: 'Séparez les entrées par des virgules',
  addEntryActionLabel: 'Ajouter une entrée',
  requiredIndicator: '(requis)',
  requiredFieldLabel: 'Champ requis',
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) =>
    `Supprimer ${fieldLabel} ${entryNumber}`,
  wizard: {
    backActionLabel: 'Retour',
    nextActionLabel: 'Suivant',
    formatStepCount: ({ stepNumber, stepCount }) => `Étape ${stepNumber} sur ${stepCount}`,
  },
};

afterEach(cleanup);

describe('consumer-supplied form messages', () => {
  it('drives every wizard state with consumer messages and clamps a shrinking step list', () => {
    const formatStepCount = vi.fn(messages.wizard.formatStepCount);
    const validate = vi.fn().mockReturnValue(true).mockReturnValueOnce(false);
    const steps = [
      { key: 'one', content: <span>Premier</span>, validate },
      { key: 'two', content: <span>Deuxieme</span> },
      { key: 'three', content: <span>Troisieme</span> },
    ];
    const { container, rerender } = render(
      <WizardShell
        messages={{ ...messages.wizard, formatStepCount }}
        steps={steps}
        finish={<button type="submit">Terminer</button>}
      />,
    );

    expect(formatStepCount).toHaveBeenCalledWith({ stepNumber: 1, stepCount: 3 });
    expect(screen.getByText('Premier')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(validate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Premier')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Deuxieme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByText('Premier')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Troisieme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull();

    rerender(<WizardShell messages={messages.wizard} steps={[steps[0]]} />);
    expect(screen.getByText('Premier')).toBeTruthy();
    expect(screen.getByLabelText('Étape 1 sur 1')).toBeTruthy();

    rerender(<WizardShell messages={messages.wizard} steps={steps} />);
    expect(screen.getByText('Premier')).toBeTruthy();
    expect(screen.getByLabelText('Étape 1 sur 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retour' })).toBeNull();

    rerender(<WizardShell messages={messages.wizard} steps={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('disables Next when the current step cannot proceed', () => {
    render(
      <WizardShell
        messages={messages.wizard}
        steps={[
          { key: 'blocked', content: <span>Bloque</span>, canProceed: false },
          { key: 'next', content: <span>Suivant</span> },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Suivant' }).hasAttribute('disabled')).toBe(true);
  });

  it('renders renderer labels, hints, add/remove actions, and required copy from messages', () => {
    const html = renderToStaticMarkup(
      <StageFormRenderer
        messages={messages}
        elements={[
          { key: 'attending', label: 'Présence', type: 'boolean', required: true },
          { key: 'names', label: 'Noms', type: 'list', required: true },
          { key: 'meal', label: 'Repas', type: 'select', options: ['Jardin'], required: true },
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'email', label: 'Courriel', type: 'text', required: true },
          { key: 'notes', label: 'Notes', type: 'multiline', required: true },
          { key: 'count', label: 'Nombre', type: 'number', required: true },
          {
            key: 'companions',
            label: 'Invité',
            type: 'repeatingGroup',
            required: true,
            subFields: [{ key: 'name', label: 'Nom', type: 'text', required: true }],
          },
        ]}
        values={{ companions: [{ name: 'Camille' }] }}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('Présence (requis)');
    expect(html).toContain('Noms (requis)');
    expect(html).toContain('Repas (requis)');
    expect(html).toContain('Date (requis)');
    expect(html).toContain('Courriel (requis)');
    expect(html).toContain('Notes (requis)');
    expect(html).toContain('Nombre (requis)');
    expect(html).toContain('Invité (requis)');
    expect(html).toContain('Nom (requis)');
    expect(html).not.toContain('MuiFormLabel-asterisk');
    expect(html).toContain('Oui');
    expect(html).toContain('Non');
    expect(html).toContain('Séparez les entrées par des virgules');
    expect(html).toContain('Ajouter une entrée');
    expect(html).toContain('aria-label="Supprimer Invité 1"');
    expect(html).toContain('aria-label="Présence Champ requis"');
    expect(html).not.toContain('role="group" aria-required="true"');
    expect((html.match(/aria-required="true"/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((html.match(/ required=""/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(html).not.toContain('Add another');
    expect(html).not.toContain('Separate entries with commas');
  });

  it.each(['*', ''])('announces required boolean groups when the visual indicator is %j',
    (requiredIndicator) => {
      render(
        <StageFormRenderer
          messages={{ ...messages, requiredIndicator }}
          elements={[{ key: 'attending', label: 'Présence', type: 'boolean', required: true }]}
          values={{}}
          onChange={() => undefined}
        />,
      );

      expect(screen.getByRole('group', { name: 'Présence Champ requis' })).toBeTruthy();
    });
});
