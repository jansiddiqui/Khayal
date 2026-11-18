import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, LogOut, Smartphone, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createShare,
  deleteElderPhoto,
  fetchPhotoBlob,
  linkUrl,
  listDevices,
  listShares,
  revokeDevice,
  revokeShare,
  listElderConsents,
  setElderConsent,
  signOutAllDevices,
  uploadElderPhoto,
  type Patient,
  type SecretLink,
} from "../../api/client";
import { LoadError } from "./LoadError";
import { serverDate } from "../../api/client";
import { dateTimeText, LOCALE, serverDetail, t } from "../../t";

const when = (iso: string) => dateTimeText(serverDate(iso));
const day = (iso: string) => serverDate(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

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
          {copied ? t.elderPanels.privacy.copied : t.elderPanels.privacy.copy}
        </button>
      </div>
      <p className="text-ink-muted">{t.elderPanels.privacy.sendYourself}</p>
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
        {src ? <img src={src} alt={t.elderPanels.privacy.photoOf(patient.name)} className="size-full object-cover" /> : <span aria-hidden="true">—</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <button type="button" className={button} disabled={!patient.photos_enabled || upload.isPending} onClick={() => input.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {patient.has_photo ? t.elderPanels.privacy.changePhoto : t.elderPanels.privacy.addPhoto}
        </button>
        {patient.has_photo && (
          <button type="button" className={button} disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t.elderPanels.privacy.removePhoto}
          </button>
        )}
        {!patient.photos_enabled && <p className="w-full text-ink-muted">{t.elderPanels.privacy.turnOnPhotos}</p>}
        {upload.isError && <p role="alert" className="w-full text-danger">{serverDetail(upload.error) ?? t.elderPanels.privacy.uploadFailed}</p>}
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
        {t.elderPanels.privacy.photos}
      </label>
      <p className="text-ink-muted">
        {t.elderPanels.privacy.photosIntro(patient.name)}
      </p>
      {confirmOff && (
        <div role="alertdialog" aria-label={t.elderPanels.privacy.photosOffAria} className="flex flex-wrap items-center gap-3 rounded-md border border-danger bg-danger-soft p-3">
          <p className="min-w-0 flex-1">{t.elderPanels.privacy.photosOff(patient.name)}</p>
          <button type="button" onClick={() => toggle.mutate(false)} className="rounded-md bg-danger px-3 py-1 font-medium text-white">
            {t.elderPanels.privacy.turnOffDelete}
          </button>
          <button type="button" onClick={() => setConfirmOff(false)} className="rounded-md border border-line-strong px-3 py-1">
            {t.elderPanels.privacy.keepPhotos}
          </button>
        </div>
      )}
      {toggle.isSuccess && toggle.data.deleted > 0 && <p className="text-calm">{t.elderPanels.privacy.deletedPhotos(toggle.data.deleted)}</p>}
    </div>
  );
}

/** The research opt-in text, as recorded with the consent (backend services/research.py). */
export const RESEARCH_TEXT = t.elderPanels.privacy.researchText;

function ResearchConsent({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const consents = useQuery({ queryKey: ["consents", patient.id], queryFn: () => listElderConsents(patient.id) });
  const on = consents.data?.some((c) => c.kind === "research" && c.withdrawn_at === null) ?? false;
  const toggle = useMutation({
    mutationFn: (granted: boolean) => setElderConsent(patient.id, "research", granted),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["consents", patient.id] }),
  });
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 font-medium">
        <input
          type="checkbox"
          className="size-5 accent-brand"
          checked={on}
          disabled={!consents.isSuccess || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
        {t.elderPanels.privacy.research}
      </label>
      <p className="text-ink-muted">{RESEARCH_TEXT}</p>
      {toggle.isSuccess && <p className="text-calm">{on ? t.elderPanels.privacy.researchOn : t.elderPanels.privacy.researchOff}</p>}
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
      <h3 className="font-semibold">{t.elderPanels.privacy.devices}</h3>
      {devices.isPending && <p className="text-ink-muted">{t.elderPanels.privacy.loadingDevices}</p>}
      {devices.isError && <LoadError message={t.elderPanels.privacy.devicesFailed} onRetry={() => void devices.refetch()} />}
      {devices.isSuccess && devices.data.length === 0 && <p className="text-ink-muted">{t.elderPanels.privacy.noDevice}</p>}
      {devices.isSuccess && devices.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {devices.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Smartphone className="size-4 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{d.device_label || t.elderPanels.privacy.device}</span>
                <span className="text-ink-muted">{t.elderPanels.privacy.pairedSeen(day(d.created_at), when(d.last_seen_at))}</span>
              </span>
              <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(d.id)}>
                <LogOut className="size-4" aria-hidden="true" />
                {t.elderPanels.privacy.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={button} disabled={all.isPending} onClick={() => all.mutate()}>
          <LogOut className="size-4" aria-hidden="true" />
          {t.elderPanels.privacy.signOutAll}
        </button>
        {all.isSuccess && <span className="ml-3 text-calm">{t.elderPanels.privacy.allSignedOut(patient.name)}</span>}
      </div>
    </div>
  );
}

const SHARE_STATE: Record<string, string> = t.elderPanels.privacy.shareStates;

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
      <h3 className="font-semibold">{t.elderPanels.privacy.share}</h3>
      <p className="text-ink-muted">
        {t.elderPanels.privacy.shareIntro(patient.name)}
      </p>
      <div>
        <button type="button" className={button} disabled={create.isPending} onClick={() => create.mutate()}>
          <Link2 className="size-4" aria-hidden="true" />
          {t.elderPanels.privacy.createShare}
        </button>
      </div>
      {made && <CopyLink url={linkUrl("share", made.token)} label={t.elderPanels.privacy.shareLinkFor(patient.name)} />}
      {shares.isSuccess && shares.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {shares.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                {t.elderPanels.privacy.made(day(s.created_at))}<span className="font-medium">{SHARE_STATE[s.state]}</span>
                {s.state === "open" && <span className="text-ink-muted">{t.elderPanels.privacy.until(day(s.expires_at))}</span>}
              </span>
              {s.state === "open" && (
                <button type="button" className={button} disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                  {t.elderPanels.privacy.revoke}
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
      <ResearchConsent patient={patient} />
      <Devices patient={patient} />
      <Shares patient={patient} />
    </div>
  );
}
