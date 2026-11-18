import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { updatePatient, type Patient, type VoiceCheck } from "../../api/client";
import { Button } from "../../ui/Button";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "ur", label: "اردو (Urdu)" },
] as const;
const NAME: Record<string, string> = { en: "English", hi: "Hindi", ur: "Urdu" };

/** What read-aloud found on the elder's phone, in words for the family (Round 2 batch 5). */
export function voiceStatus(name: string, language: string, check: VoiceCheck | null | undefined): string {
  if (!check || check.lang !== language) {
    return `${name}'s phone checks its read-aloud voices the next time the app opens.`;
  }
  const voice = check.voice ? ` (${check.voice})` : "";
  if (check.using === "none") {
    return (
      `${name}'s phone has no ${NAME[language]} voice, so Read aloud stays silent. To add one: on Android, ` +
      `Settings → Text-to-speech → Google → install ${NAME[language] === "Urdu" ? "Urdu or Hindi" : NAME[language]}; on Windows, ` +
      `Settings → Time & language → Speech → add ${NAME[language] === "Urdu" ? "Hindi" : NAME[language]}.`
    );
  }
  if (language === "ur" && check.using === "hi") {
    return `${name}'s phone has no Urdu voice, so Urdu is read aloud with a Hindi voice${voice}: the same spoken words. The screen stays in Urdu.`;
  }
  return `Read aloud uses a ${NAME[check.using]} voice on ${name}'s phone${voice}.`;
}

/**
 * Settings → Language: the language of the elder's app (English, Hindi or Urdu). The patient never
 * has to find it; their phone switches the next time the app comes to the front.
 */
export function LanguageForm({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const current = patient.language ?? "en";
  const [language, setLanguage] = useState(current);
  const save = useMutation({
    mutationFn: () => updatePatient(patient.id, { language: language as "en" | "hi" | "ur" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["patients"] }),
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" aria-labelledby="language-title">
      <h3 id="language-title" className="font-semibold">
        Language of {patient.name}'s app
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-md border border-line-strong bg-surface px-2 py-1.5">
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={language === current}>
          Save
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        Screens, read aloud and the games' words. Their phone switches the next time the app comes to the front. Hindi and Urdu are
        drafts still being checked by a native speaker.
      </p>
      <p className="text-sm text-ink-soft" aria-live="polite">
        {voiceStatus(patient.name, current, patient.voice_check)}
      </p>
      {save.isError && (
        <p role="alert" className="text-danger">
          Could not save the language. Try again.
        </p>
      )}
    </form>
  );
}
