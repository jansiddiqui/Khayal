import { useMutation } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { createPairingCode } from "../../api/client";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * "Pair a device": a one-time 6-digit code (valid 10 minutes) that the patient types on
 * their own phone or tablet, which then stays signed in for 90 days (CLAUDE.md section 4).
 */
export function PairDevicePanel({ patientId, patientName }: { patientId: number; patientName: string }) {
  const code = useMutation({ mutationFn: () => createPairingCode(patientId) });

  return (
    <section aria-labelledby="pair-heading" className="flex flex-col gap-3">
      <h2 id="pair-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone aria-hidden="true" className="size-5" />
        Pair a device
      </h2>
      <p className="text-sm text-gray-700">
        Sign in {patientName}'s own phone or tablet without a password. Open Khayal on that device, then type the
        code shown here. The device stays signed in for 90 days.
      </p>
      {code.isSuccess && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <output
            aria-label="Pairing code"
            className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1 font-mono text-3xl tracking-[0.3em] tabular-nums"
          >
            {code.data.code}
          </output>
          <span className="text-sm text-gray-700">Valid until {timeOf(code.data.expires_at)}, one use only.</span>
        </div>
      )}
      {code.isError && (
        <p role="alert" className="text-red-700">
          Could not create a code. Please try again.
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={() => code.mutate()}
          disabled={code.isPending}
          className="rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {code.isSuccess ? "New code" : "Show pairing code"}
        </button>
      </div>
    </section>
  );
}
