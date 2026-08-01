export interface PulsePrompt {
    /** Stable id — posts reference it via promptId. */
    id: string;
    /** The prompt question shown on the card / compose chip. */
    label: string;
    /** Placeholder text for the compose field while this prompt is selected. */
    ghost: string;
}
export interface PulseAsk {
    id: string;
    question: string;
    /** ISO timestamp; in the past → upvoting disabled and proposing hidden. */
    closesAt?: string;
}
export interface PulseChallenge {
    id: string;
    title: string;
}
/** Organizer pinned notices, rendered above the feed. */
export interface PulsePin {
    id: string;
    text: string;
}
export interface PulseConfig {
    /** Host close switch (cdk#1050/#1051): JSON `true` = the whole guest write
     *  surface is closed server-side (posts, votes, reactions) and the wall is
     *  view-only. Absent/anything-else = open (the server checks `is True`). */
    responsesClosed?: boolean;
    /** Guest-facing title (the tab label stays the page config's displayName). */
    title: string;
    /** Compose submit label, e.g. "Post" / "Add to the wall". */
    postVerb: string;
    /** Reaction glyph for post chips; null hides reactions entirely. */
    reactionEmoji: string | null;
    prompts: PulsePrompt[];
    pins: PulsePin[];
    /** Propose-and-upvote asks (cdk#688). Absent = the module is off. */
    asks?: PulseAsk[];
    /** One-tap missions (cdk#688). Absent = the module is off. */
    challenges?: PulseChallenge[];
}
