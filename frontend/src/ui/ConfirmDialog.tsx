import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Only for destructive actions that can't be undone. The consequence is spelled out, "Cancel" has
 * the focus, Escape closes it, and the confirm button shows a spinner while it works.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="caregiver confirm-dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-sm text-ink shadow-toast backdrop:bg-[rgb(16_35_37/0.35)]"
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <h2 id="confirm-title" className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-danger" />
            {title}
          </h2>
          <div className="text-ink-soft">{children}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
