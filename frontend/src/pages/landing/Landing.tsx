import { ArrowDown, ArrowRight, Menu, PlayCircle, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAppConfig } from "../../api/useAppConfig";
import { Jaali } from "../../components/brand/Jaali";
import { Logo, LogoMark } from "../../components/brand/Logo";
import { landing as t, NAV } from "./content";
import { EASE_OUT, goToSection } from "./motion";
import { PhoneMock } from "./PhoneMock";
import { primaryButton } from "./styles";

// Everything below the hero loads after first paint (and is fetched right away in the background).
const loadSections = () => import("./Sections");
const Sections = lazy(loadSections);
const Footer = lazy(() => loadSections().then((m) => ({ default: m.Footer })));

function SectionLink({ id, children, className, onDone }: { id: string; children: ReactNode; className?: string; onDone?: () => void }) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onDone?.();
        goToSection(id);
      }}
    >
      {children}
    </a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const link = "rounded-md px-1 py-1 text-[0.85rem] font-bold text-ink-soft underline-offset-[0.3em] transition-colors hover:text-teal-700 hover:underline";
  return (
    <header
      className={`sticky top-0 z-40 border-b bg-paper transition-[border-color,box-shadow] duration-200 ${
        scrolled ? "border-line shadow-[0_8px_20px_-16px_rgb(16_35_37_/_0.35)]" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[3.6rem] max-w-[72rem] items-center gap-6 px-5 lg:px-10">
        <Link to="/" className="shrink-0 rounded-md" aria-label="Khayal, home">
          <Logo size={34} />
        </Link>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-5 lg:flex">
          {NAV.map((n) => (
            <SectionLink key={n.id} id={n.id} className={link}>
              {n.label}
            </SectionLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-2">
          <Link to="/login" className={`${link} hidden sm:inline-block`}>
            {t.signIn}
          </Link>
          {/* Wider screens only: on phones the hero's own button and the menu carry it. */}
          <span className="hidden sm:inline-flex">
            <SectionLink id="invite" className={`${primaryButton} min-h-[2.2rem] px-4 text-[0.85rem]`}>
              {t.requestInvite}
            </SectionLink>
          </span>
          {/* Icon only: the hamburger is universally understood here (the public site, not a patient screen). */}
          <button
            type="button"
            className="inline-flex size-[2.4rem] items-center justify-center rounded-full text-ink transition-colors duration-150 hover:bg-sunken active:scale-[0.95] motion-reduce:active:scale-100 lg:hidden"
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? t.closeMenu : t.menu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Sections" className="border-t border-line bg-paper px-5 pt-2 pb-5 lg:hidden">
          <ul className="flex flex-col">
            {NAV.map((n) => (
              <li key={n.id}>
                <SectionLink id={n.id} onDone={() => setOpen(false)} className="block border-b border-line py-3 text-base font-bold">
                  {n.label}
                </SectionLink>
              </li>
            ))}
            <li>
              <Link to="/login" className="block border-b border-line py-3 text-base font-bold">
                {t.signIn}
              </Link>
            </li>
          </ul>
          <SectionLink id="invite" onDone={() => setOpen(false)} className={`${primaryButton} mt-4 w-full`}>
            {t.requestInvite}
          </SectionLink>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  const config = useAppConfig();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const arrive = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE_OUT, delay } };

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-teal-700 text-ivory">
      {/* Light through the jaali falls where the niche stands. */}
      <Jaali color="var(--color-teal-600)" lightX={0.78} lightY={0.5} drift />
      {/* Phones: copy, then the niche (its arch above the fold), then the smaller links.
          Wide screens: copy and links on the left, the niche spanning both rows on the right. */}
      <div className="relative mx-auto grid max-w-[72rem] gap-x-6 gap-y-8 px-5 pt-8 pb-0 lg:grid-cols-12 lg:px-10 lg:pt-16">
        <div className="lg:col-span-7 lg:row-start-1">
          <LogoMark size={56} tone="reversed" drawIn className="mb-5 hidden sm:block" />
          <motion.h1
            id="hero-title"
            className="max-w-[14ch] text-[clamp(2.1rem,1.2rem+4.2vw,4.3rem)] leading-[1.02] font-bold tracking-[-0.025em]"
            {...arrive(0.15)}
          >
            {t.hero.headline}
          </motion.h1>
          <motion.p className="mt-5 max-w-[34ch] text-[clamp(1rem,0.9rem+0.45vw,1.2rem)] leading-relaxed text-teal-50" {...arrive(0.25)}>
            {t.hero.subline}
          </motion.p>
          <motion.div className="mt-7 flex flex-wrap items-center gap-3" {...arrive(0.35)}>
            <SectionLink id="invite" className={`${primaryButton} min-h-[2.8rem] px-6 text-[1.05rem]`}>
              {t.requestInvite}
              <ArrowRight className="size-[1.1em]" aria-hidden="true" />
            </SectionLink>
            <SectionLink
              id="how"
              className="inline-flex min-h-[2.8rem] items-center gap-2 rounded-full border-2 border-teal-200 px-6 text-[1.05rem] font-bold text-ivory transition-colors duration-150 hover:border-ivory hover:bg-teal-800 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {t.hero.secondary}
              <ArrowDown className="size-[1.1em]" aria-hidden="true" />
            </SectionLink>
          </motion.div>
        </div>
        <div className="relative lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-end">
          {/* An arched niche in the courtyard wall; the phone stands in its light. */}
          <div
            role="img"
            aria-label={t.hero.phoneLabel}
            className="relative mx-auto flex max-w-[24rem] justify-center rounded-t-full bg-[radial-gradient(ellipse_at_50%_25%,var(--color-teal-400),var(--color-teal-800)_72%)] px-3 pt-12 pb-0 shadow-[inset_0_16px_30px_-12px_rgb(0_0_0_/_0.45)] sm:px-6 sm:pt-16"
          >
            <motion.div
              className="translate-y-6"
              {...(reduce ? {} : { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 24 }, transition: { duration: 0.6, ease: EASE_OUT, delay: 0.3 } })}
            >
              <PhoneMock />
            </motion.div>
          </div>
        </div>
        <motion.ul className="flex flex-col gap-2 pb-10 text-[0.85rem] text-teal-50 lg:col-span-7 lg:row-start-2 lg:pb-16" {...arrive(0.45)}>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-saffron-400" aria-hidden="true" />
            {t.hero.pilot}
          </li>
          <li>
            <Link to="/pair" className="font-bold text-ivory underline decoration-teal-300 underline-offset-[0.25em] hover:decoration-saffron-400">
              {t.hero.haveCode}
            </Link>
          </li>
          {config?.demo_mode && (
            <li>
              <button
                type="button"
                onClick={() => navigate("/demo", { state: { autostart: true } })}
                className="inline-flex items-center gap-1.5 font-bold text-saffron-300 underline underline-offset-[0.25em] hover:text-saffron-200"
              >
                <PlayCircle className="size-[1.1em]" aria-hidden="true" />
                {t.hero.tryDemo}
              </button>
            </li>
          )}
        </motion.ul>
      </div>
      {/* The marigold garland along the bottom of the door. */}
      <div aria-hidden="true" className="h-2 bg-[repeating-linear-gradient(90deg,var(--color-saffron-400)_0_14px,var(--color-saffron-500)_14px_28px)]" />
    </section>
  );
}

/** The public landing page at "/" for signed-out visitors (CLAUDE.md section 11, Phase A). */
export default function Landing() {
  useEffect(() => {
    document.title = t.title;
    void loadSections(); // fetch the rest now, so anchor links never wait
    // Arriving with an anchor (e.g. /#invite from the sign-in page): go there once it has loaded.
    const target = window.location.hash.slice(1);
    if (target) goToSection(target);
  }, []);

  return (
    <div className="landing min-h-screen bg-paper text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.skipToContent}
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Suspense fallback={<div className="min-h-[60vh]" aria-hidden="true" />}>
          <Sections />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
