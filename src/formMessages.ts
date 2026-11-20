/** Values supplied to the wizard's progress formatter. */
export interface StepCountMessageParams {
  /** One-based current step number. */
  stepNumber: number;
  stepCount: number;
}

/** Values supplied to a repeating-group remove-action formatter. */
export interface RemoveEntryMessageParams {
  fieldLabel: string;
  /** One-based position of the entry being removed. */
  entryNumber: number;
}

/** Consumer-owned copy for the generic stepped-form chrome. */
export interface WizardMessages {
  backActionLabel: string;
  nextActionLabel: string;
  formatStepCount: (params: StepCountMessageParams) => string;
}

/**
 * Consumer-owned copy for schema-driven forms. Host-authored field labels,
 * placeholders, select options, and `addLabel` remain part of the stage schema;
 * this contract owns renderer chrome and its count/ARIA formatting.
 */
export interface StageFormRendererMessages {
  yesOptionLabel: string;
  noOptionLabel: string;
  listSeparatorHint: string;
  addEntryActionLabel: string;
  /** Copy only (for example `*` or `(required)`); the renderer owns spacing. */
  requiredIndicator: string;
  /** Spoken required-state copy for non-native controls (for example `Required`). */
  requiredFieldLabel: string;
  formatRemoveEntryActionLabel: (params: RemoveEntryMessageParams) => string;
  /**
   * Shown under a required sub-field left empty in a repeating-group entry that
   * holds other answers (for example a companion with allergies but no name,
   * shore#704). Optional since 14.2: without it the field (or a Yes/No
   * sub-field's group) is still marked `aria-invalid`, with no text.
   */
  requiredSubFieldMessage?: string;
  wizard: WizardMessages;
}
