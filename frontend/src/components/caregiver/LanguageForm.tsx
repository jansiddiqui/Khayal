import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { updatePatient, type Patient, type VoiceCheck } from "../../api/client";
import { Button } from "../../ui/Button";
import { t } from "../../t";

const LANGUAGES = [
  { value: "en", label: t.elderPanels.language.options.en },
  { value: "hi", label: t.elderPanels.language.options.hi },
  { value: "ur", label: t.elderPanels.language.options.ur },
] as const;
const NAME = t.elderPanels.language.names;

/** What read-aloud found on the elder's phone, in words for the family (Round 2 batch 5). */
export function voiceStatus(name: string, language: string, check: VoiceCheck | null | undefined): string {
  if (!check || check.lang !== language) {
    return t.elderPanels.language.notChecked(name);
  }
  const voice = check.voice ? ` (${check.voice})` : "";
  if (check.using === "none") {
    const lang = NAME[language] ?? "English";
    return t.elderPanels.language.noVoice(name, lang, lang === "Urdu" ? t.elderPanels.language.urduOrHindi : lang, lang === "Urdu" ? "Hindi" : lang);
  }
  if (language === "ur" && check.using === "hi") {
    return t.elderPanels.language.urduWithHindi(name, voice);
  }
  return t.elderPanels.language.uses(NAME[check.using] ?? "English", name, voice);
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
        {t.elderPanels.language.title(patient.name)}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-ink-soft">{t.elderPanels.language.label}</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-md border border-line-strong bg-surface px-2 py-1.5">
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={language === current}>
          {t.elderPanels.language.save}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        {t.elderPanels.language.intro}
      </p>
      <p className="text-sm text-ink-soft" aria-live="polite">
        {voiceStatus(patient.name, current, patient.voice_check)}
      </p>
      {save.isError && (
        <p role="alert" className="text-danger">
          {t.elderPanels.language.saveFailed}
        </p>
      )}
    </form>
  );
}
