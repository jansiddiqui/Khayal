import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, LogOut, Smartphone, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createShare,
  deleteElderPhoto,
  errorDetail,
  fetchPhotoBlob,
  linkUrl,
  listDevices,
  listShares,
  revokeDevice,
  revokeShare,
  setElderConsent,
  signOutAllDevices,
  uploadElderPhoto,
  type Patient,
  type SecretLink,
} from "../../api/client";
import { LoadError } from "./LoadError";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const button = "inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1 hover:bg-sunken disabled:opacity-60";

/** Copy a secret link once; it is never shown again after this page is left. */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-brand bg-brand-soft p-3">
      <p className="font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 py-1 font-mono text-xs" />
        <button
          type="button"
          className={button}
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-ink-muted">Send it yourself by WhatsApp or email. It works once, and is shown only now.</p>
    </div>
  );
}

function ElderPhoto({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["patients"] });
  const upload = useMutation({ mutationFn: (file: File) => uploadElderPhoto(patient.id, file), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteElderPhoto(patient.id), onSuccess: refresh });
  useEffect(() => {
    if (!patient.has_photo) {
      setSrc(null);
      return;
    }
    let url: string | null = null;
    void fetchPhotoBlob(`/patients/${patient.id}/photo`).then((blob) => {
      url = URL.createObjectURL(blob);
      setSrc(url);
    }).catch(() => setSrc(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [patient.id, patient.has_photo, upload.data]);

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sunken text-ink-muted">
        {src ? <img src={src} alt={`Photo of ${patient.name}`} className="size-full object-cover" /> : <span aria-hidden="true">—</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <button type="button" className={button} disabled={!patient.photos_enabled || upload.isPending} onClick={() => input.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {patient.has_photo ? "Change photo" : "Add a photo"}
        </button>
        {patient.has_photo && (
          <button type="button" className={button} disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4" aria-hidden="true" />
            Remove photo
          </button>
        )}
        {!patient.photos_enabled && <p className="w-full text-ink-muted">Turn on photos below to add one.</p>}
        {upload.isError && <p role="alert" className="w-full text-danger">{errorDetail(upload.error) ?? "Could not upload the photo."}</p>}
      </div>
    </div>
  );
}

function PhotosConsent({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const toggle = useMutation({
    mutationFn: (granted: boolean) => setElderConsent(patient.id, "photos", granted),
    onSuccess: () => {
      setConfirmOff(false);
      for (const key of [["patients"], ["family", patient.id], ["consents", patient.id]]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 font-medium">
        <input
          type="checkbox"
          className="size-5 accent-brand"
          checked={patient.photos_enabled}
          disabled={toggle.isPending}
          onChange={(e) => (e.target.checked ? toggle.mutate(true) : setConfirmOff(true))}
        />
        Family photos (separate consent)
      </label>
      <p className="text-ink-muted">
        Photos of family members for “Who is this?”, and a photo of {patient.name}. Only the people linked to {patient.name} can see them.
      </p>
      {confirmOff && (
        <div role="alertdialog" aria-label="Turn off photos" className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
          <p className="min-w-0 flex-1">Turning photos off withdraws the consent and deletes every family photo and the photo of {patient.name}. Names and relations stay. This cannot be undone.</p>
          <button type="button" onClick={() => toggle.mutate(false)} className="rounded-md bg-danger px-3 py-1 font-medium text-white">
            Turn off and delete
          </button>
          <button type="button" onClick={() => setConfirmOff(false)} className="rounded-md border border-line-strong px-3 py-1">
            Keep photos
          </button>
        </div>
      )}
      {toggle.isSuccess && toggle.data.deleted > 0 && <p className="text-calm">Deleted {toggle.data.deleted} photo(s).</p>}
    </div>
  );
}

function Devices({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const key = ["devices", patient.id];
  const devices = useQuery({ queryKey: key, queryFn: () => listDevices(patient.id) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const revoke = useMutation({ mutationFn: (id: number) => revokeDevice(patient.id, id), onSuccess: refresh });
  const all = useMutation({ mutationFn: () => signOutAllDevices(patient.id), onSuccess: refresh });
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Signed-in devices</h3>
      {devices.isPending && <p className="text-ink-muted">Loading devices…</p>}
      {devices.isError && <LoadError message="Could not load the devices." onRetry={() => void devices.refetch()} />}
      {devices.isSuccess && devices.data.length === 0 && <p className="text-ink-muted">No device is signed in. Pair one with a code above.</p>}
      {devices.isSuccess && devices.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {devices.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Smartphone className="size-4 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{d.device_label || "Device"}</span>
                <span className="text-ink-muted"> · paired {day(d.created_at)} · last seen {when(d.last_seen_at)}</span>
              </span>
              <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(d.id)}>
                <LogOut className="size-4" aria-hidden="true" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={button} disabled={all.isPending} onClick={() => all.mutate()}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out all devices
        </button>
        {all.isSuccess && <span className="ml-3 text-calm">Every device of {patient.name} is signed out.</span>}
      </div>
    </div>
  );
}

const SHARE_STATE: Record<string, string> = { open: "Waiting", used: "Joined", revoked: "Revoked", expired: "Expired" };

function Shares({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const key = ["shares", patient.id];
  const shares = useQuery({ queryKey: key, queryFn: () => listShares(patient.id) });
  const [made, setMade] = useState<SecretLink | null>(null);
  const create = useMutation({
    mutationFn: () => createShare(patient.id),
    onSuccess: (link) => {
      setMade(link);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({ mutationFn: (id: number) => revokeShare(patient.id, id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }) });
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">Share with family</h3>
      <p className="text-ink-muted">
        Invite another family member to look after {patient.name} with you. The link works once and for 14 days; if they have no account yet, it lets them create one.
      </p>
      <div>
        <button type="button" className={button} disabled={create.isPending} onClick={() => create.mutate()}>
          <Link2 className="size-4" aria-hidden="true" />
          Create a share link
        </button>
      </div>
      {made && <CopyLink url={linkUrl("share", made.token)} label={`Share link for ${patient.name}`} />}
      {shares.isSuccess && shares.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {shares.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                Made {day(s.created_at)} · <span className="font-medium">{SHARE_STATE[s.state]}</span>
                {s.state === "open" && <span className="text-ink-muted"> · until {day(s.expires_at)}</span>}
              </span>
              {s.state === "open" && (
                <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One elder's photo, photo consent, paired devices and family share links (CLAUDE.md section 11). */
export function PrivacyPanel({ patient }: { patient: Patient }) {
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-4">
      <ElderPhoto patient={patient} />
      <PhotosConsent patient={patient} />
      <Devices patient={patient} />
      <Shares patient={patient} />
    </div>
  );
}
