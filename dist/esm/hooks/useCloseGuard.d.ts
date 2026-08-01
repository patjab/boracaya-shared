/**
 * Loss prevention for overlays that own their own Save (cdk#1007): the guest
 * drawer and the Steps editor dialog. Both close on a backdrop click or Escape,
 * which discarded unsaved edits silently — the shell's navigation guard never
 * sees these because closing an overlay is not navigation.
 *
 * Clean: close immediately. Dirty: ask first. The confirm state lives here so
 * each overlay renders the same dialog rather than inventing its own.
 */
export declare const useCloseGuard: ({ dirty, onClose }: {
    dirty: boolean;
    onClose: () => void;
}) => {
    confirming: boolean;
    requestClose: () => void;
    discard: () => void;
    keepEditing: () => void;
};
