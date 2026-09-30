import {
  SWITCHBOARD_BODY_FONT,
  SWITCHBOARD_DATA_FONT,
  SWITCHBOARD_DISPLAY_FONT,
  SWITCHBOARD_TOKENS,
  type SwitchboardFace,
  type SwitchboardTokens,
} from 'boracaya-shared/switchboard';

/** What a console's theme builder reads: one face's tokens plus the type stacks. */
export const consoleSwitchboardFace = (face: SwitchboardFace) => {
  const tokens: SwitchboardTokens = SWITCHBOARD_TOKENS[face];
  return {
    background: tokens.bg,
    primary: tokens.accent,
    colorScheme: tokens.scheme,
    fonts: {
      display: SWITCHBOARD_DISPLAY_FONT,
      body: SWITCHBOARD_BODY_FONT,
      data: SWITCHBOARD_DATA_FONT,
    },
  };
};
