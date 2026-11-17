import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Smartphone } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPairingCode, listDevices } from "../../api/client";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";
import { serverDate } from "../../api/client";

const timeOf = (iso: string) => serverDate(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * "Pair a device": a one-time 6-digit code (valid 10 minutes) that the patient types on
 * their own phone or tablet, which then stays signed in for 90 days (CLAUDE.md section 4).
 */
export function PairDevicePanel({ patientId, patientName }: { patientId: number; patientName: string }) {
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
      toast.show({ message: `${patientName}'s device is paired and signed in.` });
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    }
  }, [pairedNow, patientName, toast, queryClient]);

  return (
    <section aria-labelledby="pair-heading" className="flex flex-col gap-3">
      <h2 id="pair-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Smartphone aria-hidden="true" className="size-5" />
        Pair a device
      </h2>
      <p className="text-sm text-ink-soft">
        Sign in {patientName}'s own phone or tablet without a password. Open Khayal on that device, then type the
        code shown here. The device stays signed in for 90 days.
      </p>
      {pairedNow ? (
        <p role="status" className="flex items-center gap-2 font-medium text-success">
          <CircleCheck aria-hidden="true" className="size-5" />
          Paired just now. {patientName}'s device is signed in.
        </p>
      ) : code.isSuccess && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <output
            aria-label="Pairing code"
            className="rounded-md border border-line bg-sunken px-3 py-1 font-mono text-3xl tracking-[0.3em] tabular-nums"
          >
            {code.data.code}
          </output>
          <span className="text-sm text-ink-soft">Valid until {timeOf(code.data.expires_at)}, one use only. Waiting for the device…</span>
        </div>
      )}
      {code.isError && (
        <p role="alert" className="text-danger">
          Could not create a code. Please try again.
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
          {code.isSuccess ? "New code" : "Show pairing code"}
        </Button>
      </div>
    </section>
  );
}
