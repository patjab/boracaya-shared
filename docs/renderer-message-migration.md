# Renderer-message migration

## Version 10 breaking change

`StageFormRenderer.messages` and `WizardShell.messages` are required. There is
no shared English fallback: each app owns these strings and formatters in its
typed catalog. This required prop is the breaking API change in
`boracaya-shared@10.0.0`; consumers must complete the migration below before
upgrading from version 9.

The three existing `StageFormRenderer` call sites to update when a consumer
pins this shared revision are:

- Shore: `src/attend/containers/RSVPForm.tsx`
- Shore: `src/attend/containers/StageForm.tsx`
- Valet: `src/organize/steps/containers/StageEditorDialog.tsx`

Each app should construct one stable `StageFormRendererMessages` value from its
translation function and pass it to every renderer. Add catalog entries for:

- yes and no option labels;
- the comma-separated-list hint;
- the default add-entry action;
- the required indicator;
- the remove-entry accessible name with `{fieldLabel}` and one-based
  `{entryNumber}` parameters;
- Back and Next actions; and
- the progress formatter with one-based `{stepNumber}` and `{stepCount}`
  parameters.

The organizer-authored field label remains data. It is passed into the
remove-entry formatter as a parameter and must not be looked up as a catalog
key.
