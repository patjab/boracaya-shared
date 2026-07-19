// The Pulse wall's per-event config (cdk#668, decisions cdk#671): lives on
// metadata.pulse. THE canonical contract (shared#96, cdk#1115) — Valet's editor
// writes this document, the guest wall renders it; both UIs previously declared
// their own copies. Polls and the time capsule were cut after founder review
// (cdk#685); a backend payload still carrying those keys is harmless (unknown
// keys are ignored).

export interface PulsePrompt {
    /** Stable id — posts reference it via promptId. */
    id: string;
    /** The prompt question shown on the card / compose chip. */
    label: string;
    /** Placeholder text for the compose field while this prompt is selected. */
    ghost: string;
}

// Asks (cdk#688): guests propose answers (posts carrying askId) and upvote
// each other's (upvotes = the reactions lane keyed by the proposal post id).
export interface PulseAsk {
    id: string;
    question: string;
    /** ISO timestamp; in the past → upvoting disabled and proposing hidden. */
    closesAt?: string;
}

// Challenges (cdk#688): organizer missions guests mark done. A done-mark is a
// reaction on the synthetic target `chal:{challengeId}`.
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
