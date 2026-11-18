import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Copy, MessageCircle, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPairingCode, listDevices } from "../../api/client";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";
import { serverDate } from "../../api/client";
import { pairLink } from "../../pairLink";
import { t, timeText } from "../../t";
import { QrCode } from "./QrCode";

const timeOf = (iso: string) => timeText(serverDate(iso));

/**
 * "Pair a device": a one-time 6-digit code (valid 10 minutes) that the patient types on
 * their own phone or tablet, which then stays signed in for 90 days (CLAUDE.md section 4).
 * pair-entry: the same code also as a QR code and a link (/pair?code=…, in the elder's
 * language), to copy, or to send on WhatsApp from a phone. Still one use, still 10 minutes.
 */
export function PairDevicePanel({
  patientId,
  patientName,
  patientLanguage,
}: {
  patientId: number;
  patientName: string;
  patientLanguage?: string;
}) {
  const code = useMutation({ mutationFn: () => createPairingCode(patientId) });
  const queryClient = useQueryClient();
  const toast = useToast();
  // While a code is waiting to be typed, check every few seconds whether a device has used it.
  const waiting = code.isSuccess && Date.parse(code.data.expires_at) > Date.now();
  const devices = useQuery({
    queryKey: ["devices", patientId],
    queryFn: () => listDevices(patientId),
    refetchInterval: waiting ? 4000 : false,
  });
  const before = useRef<number | null>(null);
  const pairedNow = code.isSuccess && before.current !== null && (devices.data?.length ?? 0) > before.current;
  useEffect(() => {
    if (code.isSuccess && before.current === null) before.current = devices.data?.length ?? 0;
  }, [code.isSuccess, devices.data]);
  useEffect(() => {
    if (pairedNow) {
      toast.show({ message: t.elderPanels.pair.paired(patientName) });
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    }
  }, [pairedNow, patientName, toast, queryClient]);

  return (
    <section aria-labelledby="pair-heading" className="flex flex-col gap-3">
      <h2 id="pair-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone aria-hidden="true" className="size-5" />
        {t.elderPanels.pair.title}
      </h2>
      <p className="text-sm text-ink-soft">
        {t.elderPanels.pair.intro(patientName)}
      </p>
      {pairedNow ? (
        <p role="status" className="flex items-center gap-2 font-medium text-success">
          <CircleCheck aria-hidden="true" className="size-5" />
          {t.elderPanels.pair.pairedNow(patientName)}
        </p>
      ) : code.isSuccess && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <output
              aria-label={t.elderPanels.pair.code}
              className="rounded-md border border-line bg-sunken px-3 py-1 font-mono text-3xl tracking-[0.3em] tabular-nums"
            >
              {code.data.code}
            </output>
            <span className="text-sm text-ink-soft">{t.elderPanels.pair.validUntil(timeOf(code.data.expires_at))}</span>
          </div>
          <PairLink code={code.data.code} patientName={patientName} patientLanguage={patientLanguage} />
        </div>
      )}
      {code.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.pair.failed}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          icon={<Smartphone />}
          loading={code.isPending}
          onClick={() => {
            before.current = null;
            code.mutate();
          }}
        >
          {code.isSuccess ? t.elderPanels.pair.newCode : t.elderPanels.pair.showCode}
        </Button>
      </div>
    </section>
  );
}

/** The same code as a QR code and a link: copy it, or (on a phone) send it on WhatsApp. */
function PairLink({ code, patientName, patientLanguage }: { code: string; patientName: string; patientLanguage?: string }) {
  const url = pairLink(window.location.origin, code, patientLanguage);
  const [copied, setCopied] = useState(false);
  const p = t.elderPanels.pair;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(p.shareMessage(patientName, url))}`;
  const action =
    "inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-sunken";
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-md border border-line bg-surface p-3">
      <QrCode value={url} label={p.qrLabel(patientName)} />
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
        <p className="text-sm">{p.scanHint(patientName)}</p>
        <input
          readOnly
          value={url}
          aria-label={p.linkLabel}
          onFocus={(e) => e.target.select()}
          className="min-w-0 rounded border border-line-strong bg-sunken px-2 py-1 font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={action}
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? p.copied : p.copyLink}
          </button>
          {/* Phones: WhatsApp opens with the message ready; on a computer, copy the link instead. */}
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${action} sm:hidden`}>
            <MessageCircle className="size-4" aria-hidden="true" />
            {p.whatsapp}
          </a>
        </div>
        <p className="text-xs text-ink-muted">{p.linkNote}</p>
      </div>
    </div>
  );
}

