import { useMutation } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { errorStatus, sendFeedback, type FeedbackKind } from "../../api/client";
import { Button } from "../../ui/Button";
import { t } from "../../t";

const F = t.dashboard.feedback;

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "hard", label: F.kinds.hard },
  { value: "liked", label: F.kinds.liked },
  { value: "other", label: F.kinds.other },
];

/** "Send feedback" in the caregiver header (Round 2 batch 3): a kind, a few words, Send. */
export function FeedbackButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("other");
  const [text, setText] = useState("");
  const { pathname } = useLocation();
  const send = useMutation({ mutationFn: () => sendFeedback(kind, text, pathname) });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  function close() {
    setOpen(false);
    if (send.isSuccess) {
      setText("");
      setKind("other");
      send.reset();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send.mutate();
  }

  return (
    <>
      <Button size="sm" variant="quiet" icon={<MessageSquare />} onClick={() => setOpen(true)}>
        {F.button}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="feedback-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-toast backdrop:bg-[rgb(16_35_37/0.35)]"
      >
        {open && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
            <h2 id="feedback-dialog-title" className="text-lg font-semibold">
              {F.title}
            </h2>
            {send.isSuccess ? (
              <p role="status" className="text-calm">
                {F.thanks}
              </p>
            ) : (
              <>
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                  <legend className="mb-1 text-ink-soft">{F.kindLegend}</legend>
                  {KINDS.map((k) => (
                    <label key={k.value} className="flex items-center gap-1.5">
                      <input type="radio" name="feedback-kind" checked={kind === k.value} onChange={() => setKind(k.value)} className="accent-brand" />
                      {k.label}
                    </label>
                  ))}
                </fieldset>
                <label className="flex flex-col gap-1">
                  <span className="text-ink-soft">{F.message}</span>
                  <textarea
                    required
                    rows={4}
                    maxLength={2000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="rounded-md border border-line-strong p-2"
                  />
                </label>
                <p className="text-sm text-ink-muted">{F.privacy}</p>
                {send.isError && (
                  <p role="alert" className="text-danger">
                    {errorStatus(send.error) === 429 ? F.tooMany : F.failed}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="quiet" onClick={close}>
                {send.isSuccess ? F.close : F.cancel}
              </Button>
              {!send.isSuccess && (
                <Button type="submit" size="sm" variant="primary" loading={send.isPending}>
                  {F.send}
                </Button>
              )}
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
