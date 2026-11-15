import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Logo } from "../../components/brand/Logo";
import { landing } from "./content";

interface LegalProps {
  kind: "privacy" | "terms";
}

const PAGES = {
  privacy: {
    title: "Privacy policy",
    intro: "The full privacy policy is being written for the start of the pilot. Until then, this is what we promise:",
    points: landing.privacy.items.map((i) => `${i.title}: ${i.text}`),
  },
  terms: {
    title: "Terms",
    intro: "The full terms of use are being written for the start of the pilot. Until then, in short:",
    points: [
      "Khayal is an invite-only pilot. It may change, and parts of it are still being researched.",
      landing.science.disclaimer,
      "Requesting an invite does not create an account or any obligation; we only email you about the pilot.",
    ],
  },
} as const;

/** Placeholder Privacy and Terms pages; Phase B replaces them with the full texts. */
export default function Legal({ kind }: LegalProps) {
  const page = PAGES[kind];
  useEffect(() => {
    document.title = `${page.title} · Khayal`;
  }, [page.title]);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[3.6rem] max-w-[48rem] items-center px-5">
          <Link to="/" aria-label="Khayal, home">
            <Logo size={32} />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[48rem] px-5 py-12">
        <h1 className="text-[2.2rem] leading-tight font-bold tracking-[-0.02em]">{page.title}</h1>
        <p className="mt-4 rounded-xl border-2 border-saffron-600 bg-saffron-100 px-4 py-3 font-bold text-saffron-900">
          Draft for the pilot. The complete text will be published here before the pilot opens.
        </p>
        <p className="mt-6 leading-relaxed">{page.intro}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {page.points.map((p) => (
            <li key={p} className="flex gap-3 leading-relaxed">
              <span className="mt-[0.55em] size-2 shrink-0 rounded-full bg-teal-700" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
        <Link to="/" className="mt-10 inline-flex items-center gap-2 font-bold text-teal-700 underline underline-offset-[0.3em]">
          <ArrowLeft className="size-[1em]" aria-hidden="true" />
          Back to Khayal
        </Link>
      </main>
    </div>
  );
}
