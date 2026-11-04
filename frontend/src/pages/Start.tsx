import { BigButton } from "../components/BigButton";
import { copy } from "../copy";

/** Temporary entry screen until login arrives in Milestone 2. */
export function Start() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 sm:px-8">
      <h1 className="text-4xl font-bold">{copy.start.title}</h1>
      <BigButton to="/patient" icon="🙂" label={copy.start.patient} />
      <BigButton to="/caregiver" icon="🩺" label={copy.start.caregiver} variant="secondary" />
    </main>
  );
}
