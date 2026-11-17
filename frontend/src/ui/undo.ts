import { useCallback } from "react";
import { useToast } from "./Toast";

export interface UndoableAction {
  /** What the toast says, e.g. "Reminder deleted". */
  message: string;
  /** Show the result straight away (e.g. take the row out of the cached list). */
  apply: () => void;
  /** Put things back as they were. */
  revert: () => void;
  /** Carry it out on the server, once the Undo window has passed (or the page is closing). */
  commit: () => Promise<unknown>;
  /** Shown if the server refuses; the change is reverted first. */
  failureMessage: string;
  /** After the server has done it (refresh related data). */
  onCommitted?: () => void;
}

/**
 * Delete-with-Undo instead of "Are you sure?": the change shows at once, a toast offers Undo for a
 * few seconds, and only then is it sent to the server. A refusal puts it back with a message.
 */
export function useUndoable(): (action: UndoableAction) => void {
  const toast = useToast();
  return useCallback(
    (action: UndoableAction) => {
      action.apply();
      let settled = false;
      toast.show({
        message: action.message,
        tone: "success",
        onUndo: () => {
          if (settled) return;
          settled = true;
          action.revert();
          toast.show({ message: "Undone. It's back.", tone: "info" });
        },
        onExpire: () => {
          if (settled) return;
          settled = true;
          action
            .commit()
            .then(() => action.onCommitted?.())
            .catch(() => {
              action.revert();
              toast.show({ message: action.failureMessage, tone: "error" });
            });
        },
      });
    },
    [toast],
  );
}
