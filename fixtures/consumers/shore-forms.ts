import {
  StageFormRenderer,
  type StageFormRendererMessages,
} from 'boracaya-shared/forms';

export const messages: StageFormRendererMessages = {
  yesOptionLabel: 'Sí',
  noOptionLabel: 'No',
  listSeparatorHint: 'Separa las entradas con comas',
  addEntryActionLabel: 'Añadir otra',
  requiredIndicator: '*',
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) =>
    `Quitar ${fieldLabel}, entrada ${entryNumber}`,
  wizard: {
    backActionLabel: 'Atrás',
    nextActionLabel: 'Siguiente',
    formatStepCount: ({ stepNumber, stepCount }) => `${stepNumber} de ${stepCount}`,
  },
};

export const shoreFormSurface = { StageFormRenderer, messages };
