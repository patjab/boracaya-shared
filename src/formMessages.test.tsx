import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StageFormRenderer } from './StageFormRenderer';
import type { StageFormRendererMessages } from './formMessages';
import { WizardShell } from './WizardShell';

const messages: StageFormRendererMessages = {
  yesOptionLabel: 'Oui',
  noOptionLabel: 'Non',
  listSeparatorHint: 'Séparez les entrées par des virgules',
  addEntryActionLabel: 'Ajouter une entrée',
  requiredIndicator: '(requis)',
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) =>
    `Supprimer ${fieldLabel} ${entryNumber}`,
  wizard: {
    backActionLabel: 'Retour',
    nextActionLabel: 'Suivant',
    formatStepCount: ({ stepNumber, stepCount }) => `Étape ${stepNumber} sur ${stepCount}`,
  },
};

describe('consumer-supplied form messages', () => {
  it('renders wizard progress and navigation through the typed formatter contract', () => {
    const formatStepCount = vi.fn(messages.wizard.formatStepCount);
    const html = renderToStaticMarkup(
      <WizardShell
        messages={{ ...messages.wizard, formatStepCount }}
        steps={[
          { key: 'one', content: <span>Premier</span> },
          { key: 'two', content: <span>Deuxième</span> },
        ]}
      />,
    );

    expect(formatStepCount).toHaveBeenCalledWith({ stepNumber: 1, stepCount: 2 });
    expect(formatStepCount).toHaveBeenCalledTimes(1);
    expect(html).toContain('Étape 1 sur 2');
    expect(html).toContain('aria-label="Étape 1 sur 2"');
    expect(html).toContain('Suivant');
    expect(html).not.toContain('>Next<');
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
          {
            key: 'companions',
            label: 'Invité',
            type: 'repeatingGroup',
            subFields: [{ key: 'name', label: 'Nom', type: 'text' }],
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
    expect(html).not.toContain('MuiFormLabel-asterisk');
    expect(html).toContain('Oui');
    expect(html).toContain('Non');
    expect(html).toContain('Séparez les entrées par des virgules');
    expect(html).toContain('Ajouter une entrée');
    expect(html).toContain('aria-label="Supprimer Invité 1"');
    expect(html).not.toContain('Add another');
    expect(html).not.toContain('Separate entries with commas');
  });
});
