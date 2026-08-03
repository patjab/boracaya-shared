import {
  StageFormRenderer,
  type StageFormRendererMessages,
} from 'boracaya-shared/forms';
import {
  isDisplayBlock,
  type StageDefinition,
} from 'boracaya-shared/domain';

export const valetMessages: StageFormRendererMessages = {
  yesOptionLabel: 'Yes',
  noOptionLabel: 'No',
  listSeparatorHint: 'Separate entries with commas',
  addEntryActionLabel: 'Add another',
  requiredIndicator: '*',
  requiredFieldLabel: 'Required',
  formatRemoveEntryActionLabel: ({ fieldLabel, entryNumber }) =>
    `Remove ${fieldLabel}, entry ${entryNumber}`,
  wizard: {
    backActionLabel: 'Back',
    nextActionLabel: 'Next',
    formatStepCount: ({ stepNumber, stepCount }) => `${stepNumber} of ${stepCount}`,
  },
};

export const createValetFormSurface = (stage: StageDefinition) => ({
  Renderer: StageFormRenderer,
  messages: valetMessages,
  displayBlocks: (stage.fields ?? []).filter(isDisplayBlock),
});
