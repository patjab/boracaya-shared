# Renderer-message migration

## Version 10 breaking change

`StageFormRenderer.messages` and `WizardShell.messages` are required. There is
no shared English fallback: each app owns these strings and formatters in its
typed catalog. Consumers must complete the migration below before upgrading
from version 9. Catalog lookups used to build the message object must be total:
the renderer relies on the typed contract and does not substitute copy for a
missing translation at runtime.

Version 10 also restricts package deep imports with an explicit `exports` map.
Import from the supported root, `bootstrap`, `api`, `client`, `identity`,
`domain`, `browser`, `forms`, `ui`, `hooks`, or `node` surfaces. Existing fleet
imports of `dist/routes`, `dist/about`, and `dist/eventDate` remain temporarily
supported (with or without `.js`); other `dist/*` and `src/*` imports must move
to the public surface that owns the symbol before upgrading.

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
- the spoken required-field label (used for non-native controls such as boolean and repeating groups);
- the remove-entry accessible name with `{fieldLabel}` and one-based
  `{entryNumber}` parameters;
- Back and Next actions; and
- the progress formatter with one-based `{stepNumber}` and `{stepCount}`
  parameters.

The organizer-authored field label remains data. It is passed into the
remove-entry formatter as a parameter and must not be looked up as a catalog
key.
