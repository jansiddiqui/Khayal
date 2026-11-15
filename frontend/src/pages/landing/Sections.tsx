import {
  AudioLines,
  BellRing,
  ChevronDown,
  CircleCheck,
  Gamepad2,
  Info,
  LayoutDashboard,
  Lock,
  MapPin,
  Trash2,
  TriangleAlert,
  Users,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { useAppConfig } from "../../api/useAppConfig";
import { Jaali } from "../../components/brand/Jaali";
import { Logo } from "../../components/brand/Logo";
import { landing as t, NAV } from "./content";
import { InviteForm } from "./InviteForm";
import { goToSection, Reveal } from "./motion";

const wrap = "mx-auto max-w-[72rem] px-5 lg:px-10";
const sectionTitle = "text-[clamp(1.8rem,1.2rem+2.2vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em]";
/** Section anchors sit below the sticky header. */
const anchor = "scroll-mt-[4.2rem] outline-none";

/** A small, labelled illustration of one line of the caregiver dashboard: status in words, then a plain sentence. */
function FamilyView() {
  const v = t.familyView;
  return (
    <figure className="mt-5 max-w-[22rem] text-left">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_16px_32px_-24px_rgb(16_35_37_/_0.6)]" style={{ fontFamily: "var(--font-caregiver)" }}>
        <div className="flex items-baseline justify-between gap-3 text-[0.8rem]">
          <span className="font-semibold">{v.patient}</span>
          <span className="flex items-center gap-1.5 text-success">
            <CircleCheck className="size-[1.1em]" aria-hidden="true" />
            {v.overall}
          </span>
        </div>
        <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2.5 text-[0.8rem]">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <TriangleAlert className="size-[1.1em]" aria-hidden="true" />
            {v.game} · {v.status}
          </p>
          <p className="mt-1 leading-snug text-ink">{v.sentence}</p>
        </div>
      </div>
      <figcaption className="mt-2 text-[0.75rem] text-ink-muted">{v.label}</figcaption>
    </figure>
  );
}

function HowItWorks() {
  return (
    <section id="how" tabIndex={-1} aria-labelledby="how-title" className={`${anchor} py-16 lg:py-24`}>
      <div className={wrap}>
        <Reveal className="max-w-[40ch]">
          <h2 id="how-title" className={sectionTitle}>
            {t.how.title}
          </h2>
          <p className="mt-3 text-[1.1rem] text-ink-soft">{t.how.intro}</p>
        </Reveal>
        {/* Three steps along one garland: the order is the information, so the steps are numbered. */}
        <ol className="relative mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          <span
            aria-hidden="true"
            className="absolute top-6 bottom-6 left-[1.45rem] w-[3px] rounded-full bg-[repeating-linear-gradient(180deg,var(--color-saffron-400)_0_10px,transparent_10px_16px)] lg:top-[1.45rem] lg:right-[16%] lg:bottom-auto lg:left-[16%] lg:h-[3px] lg:w-auto lg:bg-[repeating-linear-gradient(90deg,var(--color-saffron-400)_0_10px,transparent_10px_16px)]"
          />
          {t.how.steps.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 80} className="relative grid grid-cols-[auto_1fr] content-start gap-5 lg:grid-cols-1 lg:justify-items-center lg:text-center">
              <span className="relative z-10 flex size-[2.9rem] items-center justify-center rounded-full bg-teal-700 text-[1.1rem] font-bold text-ivory ring-[6px] ring-paper">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[1.25rem] leading-snug font-bold">{step.title}</h3>
                <p className="mt-2 max-w-[34ch] leading-relaxed text-ink-soft">{step.text}</p>
                {i === 2 && <FamilyView />}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Three doorways, each painted differently: an elder's warm door, the family's teal door, the clinic's pale one. */
const DOORS: Record<string, { surface: string; title: string; lead: string; point: string; dot: string }> = {
  elders: { surface: "bg-saffron-100", title: "text-ink", lead: "text-saffron-800", point: "text-ink", dot: "bg-saffron-500" },
  "for-families": { surface: "bg-teal-700", title: "text-ivory", lead: "text-saffron-300", point: "text-teal-50", dot: "bg-saffron-400" },
  doctors: { surface: "bg-teal-50", title: "text-ink", lead: "text-teal-700", point: "text-ink", dot: "bg-teal-600" },
};

function Audiences() {
  return (
    <section aria-labelledby="audiences-title" className="bg-sunken py-16 lg:py-24">
      <div className={wrap}>
        <Reveal>
          <h2 id="audiences-title" className={sectionTitle}>
            {t.audiences.title}
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {t.audiences.cards.map((card, i) => {
            const door = DOORS[card.id]!;
            return (
              <Reveal key={card.id} delay={i * 90}>
                <article
                  id={card.id}
                  tabIndex={-1}
                  aria-labelledby={`${card.id}-title`}
                  className={`${anchor} ${door.surface} h-full rounded-t-[10rem] rounded-b-2xl px-7 pt-14 pb-8 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgb(16_35_37_/_0.55)] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
                >
                  <h3 id={`${card.id}-title`} className={`text-center text-[1.5rem] font-bold ${door.title}`}>
                    {card.title}
                  </h3>
                  <p className={`mt-1 text-center font-bold ${door.lead}`}>{card.lead}</p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {card.points.map((p) => (
                      <li key={p} className={`flex gap-3 leading-snug ${door.point}`}>
                        <span className={`mt-[0.45em] size-2 shrink-0 rounded-full ${door.dot}`} aria-hidden="true" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const FEATURE_ICONS: Record<string, LucideIcon> = {
  games: Gamepad2,
  reminders: BellRing,
  who: Users,
  voice: AudioLines,
  dashboard: LayoutDashboard,
};

function Features() {
  return (
    <section aria-labelledby="features-title" className="py-16 lg:py-24">
      <div className={`${wrap} grid gap-10 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <h2 id="features-title" className={sectionTitle}>
              {t.features.title}
            </h2>
          </div>
        </Reveal>
        <ul className="divide-y divide-line border-y border-line lg:col-span-8">
          {t.features.items.map((f, i) => {
            const Icon = FEATURE_ICONS[f.icon]!;
            return (
              <Reveal as="li" key={f.title} delay={i * 50} from="right" className="grid grid-cols-[auto_1fr] gap-5 py-6">
                <span className="flex size-[2.6rem] items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <Icon className="size-[1.25rem]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[1.2rem] font-bold">{f.title}</h3>
                  <p className="mt-1.5 max-w-[60ch] leading-relaxed text-ink-soft">{f.text}</p>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** A labelled illustration of a personal baseline: the band is "their normal", the line their last-5 average. */
function BaselineSketch() {
  const points = [50, 48, 52, 49, 51, 50, 48, 47, 45, 37, 31, 27];
  const xs = points.map((_, i) => 20 + i * 30);
  const path = points.map((y, i) => `${i ? "L" : "M"}${xs[i]} ${130 - y}`).join(" ");
  return (
    <figure className="rounded-2xl border border-line bg-surface p-5">
      <svg viewBox="0 0 370 140" className="w-full" role="img" aria-label="Illustration: a line stays inside a shaded band, then drops below it for several sessions in a row">
        <rect x="10" y="68" width="350" height="26" rx="6" fill="var(--color-teal-100)" />
        <text x="16" y="60" fontSize="15" fill="var(--color-teal-700)" fontWeight="700">
          Their normal
        </text>
        <path d={path} fill="none" stroke="var(--color-teal-700)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((y, i) => (
          <circle key={xs[i]} cx={xs[i]} cy={130 - y} r={i >= 9 ? 5 : 3.5} fill={i >= 9 ? "var(--color-saffron-500)" : "var(--color-teal-700)"} />
        ))}
        <text x="360" y="128" fontSize="15" textAnchor="end" fill="var(--color-saffron-800)" fontWeight="700">
          3 sessions below: a warning
        </text>
      </svg>
      <figcaption className="mt-2 text-[0.8rem] text-ink-muted">Illustration with made-up numbers.</figcaption>
    </figure>
  );
}

function Science() {
  return (
    <section id="science" tabIndex={-1} aria-labelledby="science-title" className={`${anchor} bg-sunken py-16 lg:py-24`}>
      <div className={`${wrap} grid gap-10 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-5">
          <h2 id="science-title" className={sectionTitle}>
            {t.science.title}
          </h2>
          <p className="mt-4 max-w-[42ch] text-[1.1rem] leading-relaxed text-ink-soft">{t.science.intro}</p>
          <div className="mt-8 hidden lg:block">
            <BaselineSketch />
          </div>
        </Reveal>
        <div className="flex flex-col gap-8 lg:col-span-7">
          {t.science.blocks.map((b, i) => (
            <Reveal key={b.title} delay={i * 70}>
              <h3 className="text-[1.25rem] font-bold text-teal-800">{b.title}</h3>
              <p className="mt-2 max-w-[60ch] leading-relaxed">{b.text}</p>
            </Reveal>
          ))}
          <div className="lg:hidden">
            <BaselineSketch />
          </div>
          <Reveal>
            <p className="max-w-[60ch] leading-relaxed text-ink-soft">{t.science.evidence}</p>
          </Reveal>
          <Reveal>
            <div role="note" className="flex gap-4 rounded-2xl border-2 border-teal-700 bg-surface p-5">
              <Info className="mt-1 size-6 shrink-0 text-teal-700" aria-hidden="true" />
              <div>
                <p className="text-[1.15rem] leading-snug font-bold">{t.science.disclaimer}</p>
                <p className="mt-2 text-ink-soft">{t.science.project}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const PRIVACY_ICONS: LucideIcon[] = [UserRoundSearch, Lock, Trash2, MapPin];

function Privacy() {
  return (
    <section id="privacy" tabIndex={-1} aria-labelledby="privacy-title" className={`${anchor} relative isolate overflow-hidden bg-teal-800 py-16 text-ivory lg:py-24`}>
      <Jaali color="var(--color-teal-700)" lightX={0.15} lightY={0.2} />
      <div className={`${wrap} relative`}>
        <Reveal>
          <h2 id="privacy-title" className={sectionTitle}>
            {t.privacy.title}
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {t.privacy.items.map((item, i) => {
            const Icon = PRIVACY_ICONS[i]!;
            return (
              <Reveal key={item.title} delay={i * 60} className="flex gap-4">
                <span className="flex size-[2.6rem] shrink-0 items-center justify-center rounded-full bg-teal-900 text-saffron-300">
                  <Icon className="size-[1.2rem]" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-[1.2rem] font-bold">{item.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] leading-relaxed text-teal-50">{item.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-10">
          <Link to="/privacy" className="font-bold text-ivory underline decoration-saffron-400 decoration-2 underline-offset-[0.3em] hover:text-saffron-200">
            {t.privacy.policyLink}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" tabIndex={-1} aria-labelledby="faq-title" className={`${anchor} py-16 lg:py-24`}>
      <div className={`${wrap} grid gap-10 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-4">
          <h2 id="faq-title" className={sectionTitle}>
            {t.faq.title}
          </h2>
        </Reveal>
        <div className="divide-y divide-line border-y border-line lg:col-span-8">
          {t.faq.items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.1rem] font-bold marker:hidden hover:text-teal-700 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="size-5 shrink-0 text-teal-700 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <p className="max-w-[62ch] pb-6 leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section id="invite" tabIndex={-1} aria-labelledby="invite-title" className={`${anchor} relative isolate overflow-hidden bg-teal-700 py-16 text-ivory lg:py-24`}>
      <Jaali color="var(--color-teal-600)" lightX={0.2} lightY={0.7} />
      <div className={`${wrap} relative grid gap-10 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-5" from="left">
          <h2 className={sectionTitle}>{t.closing.title}</h2>
          <p className="mt-4 max-w-[36ch] text-[1.1rem] leading-relaxed text-teal-50">{t.closing.text}</p>
        </Reveal>
        <Reveal className="lg:col-span-7" from="right">
          <InviteForm />
        </Reveal>
      </div>
    </section>
  );
}

/** Everything below the hero, loaded after first paint. */
export default function Sections() {
  return (
    <>
      <HowItWorks />
      <Audiences />
      <Features />
      <Science />
      <Privacy />
      <Faq />
      <Closing />
    </>
  );
}

export function Footer() {
  const config = useAppConfig();
  const link = "hover:text-ivory hover:underline underline-offset-[0.3em]";
  return (
    <footer className="bg-teal-950 py-12 text-teal-100">
      <div className={`${wrap} grid gap-10 md:grid-cols-12`}>
        <div className="md:col-span-5">
          <Logo tone="reversed" size={38} />
          <p className="mt-3 max-w-[30ch]">{t.footer.tagline}</p>
          <p className="mt-6 flex items-center gap-2 font-bold text-ivory">
            <span className="size-2 rounded-full bg-saffron-400" aria-hidden="true" />
            {t.footer.madeIn}
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 text-[0.9rem] md:col-span-7 md:grid-cols-3">
          {NAV.filter((n) => n.id !== "privacy").map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={link}
              onClick={(e) => {
                e.preventDefault();
                goToSection(n.id);
              }}
            >
              {n.label}
            </a>
          ))}
          <Link to="/privacy" className={link}>
            {t.footer.privacy}
          </Link>
          <Link to="/terms" className={link}>
            {t.footer.terms}
          </Link>
          {config?.contact_email ? (
            <a href={`mailto:${config.contact_email}`} className={link}>
              {t.footer.contact}: {config.contact_email}
            </a>
          ) : (
            <a
              href="#invite"
              className={link}
              onClick={(e) => {
                e.preventDefault();
                goToSection("invite");
              }}
            >
              {t.footer.contactViaForm}
            </a>
          )}
        </nav>
        <p className="text-[0.8rem] text-teal-300 md:col-span-12">
          © 2026 Khayal · {t.footer.project}
        </p>
      </div>
    </footer>
  );
}
