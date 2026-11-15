import { PlayCircle, Smartphone } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { BigButton } from "../components/BigButton";
import { copy } from "../copy";

const w = copy.welcome;

/** The public demo's start page for signed-out visitors: try the demo, or pair a patient's device. */
export function Welcome() {
  const navigate = useNavigate();
  return (
    // Snug spacing and Home's button size, so everything fits a 375 × 667 phone below the banner.
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-5 sm:px-8 sm:py-10">
      <WelcomeHeading />
      <BigButton
        onClick={() => navigate("/demo", { state: { autostart: true } })}
        label={w.tryDemo}
        icon={<PlayCircle />}
        size="home"
      />
      <BigButton to="/pair" variant="secondary" label={w.haveCode} icon={<Smartphone />} size="home" />
      <Link to="/login" className="self-start text-xl text-brand-dark underline">
        {w.signIn}
      </Link>
    </main>
  );
}

export function WelcomeHeading() {
  return (
    <>
      <h1 className="text-4xl font-bold">
        {w.name}{" "}
        <span lang="ur" dir="rtl">
          ({w.nameUrdu})
        </span>
      </h1>
      <p className="text-xl">{w.description}</p>
    </>
  );
}

/** "/" while the backend is still waking up: the banner says so; nothing to choose yet. */
export function WelcomeWaiting() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 sm:px-8 sm:py-10">
      <WelcomeHeading />
      <p className="text-xl text-ink-soft">{copy.common.loading}</p>
    </main>
  );
}
