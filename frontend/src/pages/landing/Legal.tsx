import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { useAppConfig } from "../../api/useAppConfig";
import { Logo } from "../../components/brand/Logo";

/** The version consents are recorded against (backend: config.POLICY_VERSION). */
export const POLICY_VERSION = "2026-11-draft-1";
const UPDATED = "15 November 2026";

interface LegalProps {
  kind: "privacy" | "terms";
}

function Contact({ email }: { email: string | null | undefined }) {
  return email ? (
    <a href={`mailto:${email}`} className="font-bold text-teal-700 underline">
      {email}
    </a>
  ) : (
    <>the invite form on the home page (our contact address will be listed here)</>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 text-[1.4rem] leading-snug font-bold">{children}</h2>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 leading-relaxed">
          <span className="mt-[0.6em] size-2 shrink-0 rounded-full bg-teal-700" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Privacy({ email }: { email: string | null | undefined }) {
  return (
    <>
      <p className="mt-6 leading-relaxed">
        Khayal (خیال) is an invite-only pilot that helps families look after an elder with early memory loss. This policy explains, in plain words, what we collect, why, where it is kept, who can see it, and what you can do about it. It is written for the Digital Personal Data Protection Act, 2023 (India).
      </p>

      <H2>1. Who we are</H2>
      <p className="mt-3 leading-relaxed">
        Khayal is run by the small team that built it as a B.Tech research project (CSE471, Deep Learning). For this pilot we decide how your data is used, so under the DPDP Act we are the “data fiduciary”. You can reach us at <Contact email={email} />.
      </p>

      <H2>2. What we collect</H2>
      <List
        items={[
          <><b>Your account (family member or doctor):</b> name, email, a scrambled (hashed) form of your password, and when you agreed to this policy.</>,
          <><b>The person you look after (“the elder”):</b> their name and city, and a photo only if you turn photos on. Elders have no email or password; their phone or tablet signs in with a 6-digit code.</>,
          <><b>How the elder uses Khayal:</b> game results (rounds, right or wrong, levels, how long they looked and how quickly they answered), reminders and whether they were marked done, and alerts we create from these.</>,
          <><b>Family members you add for “Who is this?”:</b> names, relations and notes, and their photos only if photos are on.</>,
          <><b>Voice recordings:</b> only if you turn on the weekly voice task. The elder describes a picture; we keep the recording and its length.</>,
          <><b>Devices:</b> for each signed-in device of the elder, a short description of the browser (for example “Android phone · Chrome”) and when it was last used, so you can sign it out.</>,
          <><b>Consent records:</b> what was agreed, by whom, for whom, under which version of this policy, and when it was withdrawn.</>,
          <><b>Invite requests:</b> the name, email, role, city and message you send with “Request an invite”.</>,
          <><b>Technical data:</b> our hosting provider keeps short-lived server logs (such as IP addresses) to run and protect the service. We keep request counts per address in memory for a few minutes to stop abuse.</>,
        ]}
      />

      <H2>3. Why we use it</H2>
      <List
        items={[
          "To run Khayal for you: games that adapt, reminders, “Who is this?”, the voice task, and the family's dashboard.",
          "To show how the elder is doing compared with their own normal, and to raise an alert when a change lasts.",
          "To keep accounts secure and the service working.",
          "To improve Khayal as a research project, using the same data only inside the team. We will ask separately before using anything in a publication, and anything published will not identify anyone.",
        ]}
      />
      <p className="mt-3 leading-relaxed">We use your data only with your consent. You agree when you create your account; you agree for the elder when you add them; photos and voice recordings each need their own separate consent.</p>

      <H2>4. Consent for an elder</H2>
      <p className="mt-3 leading-relaxed">
        When you add an elder, you confirm that you are a family member or their legal guardian, and either that they agreed to use Khayal, or that you are legally authorised to decide for them (for example a guardian appointed under Indian law). Please talk to them about it in a way they understand. If they do not want to use Khayal, stop, and delete their data.
      </p>

      <H2>5. Where it is kept</H2>
      <p className="mt-3 leading-relaxed">
        Everything is stored on servers in Mumbai, India, at our hosting provider (Voroa), including photos and recordings. Data travels over an encrypted connection (HTTPS). We make a backup of the database once a week and keep the last 8 backups, also stored in India.
      </p>

      <H2>6. Who can see it</H2>
      <List
        items={[
          "The elder, on their own paired device.",
          "The family members and doctors linked to that elder, and only for that elder.",
          "Our team, only when needed to run the pilot, fix a problem or answer a request from you.",
          "Our hosting provider stores the data for us and may not use it for anything else.",
          <><b>We never sell your data, show ads, or share it with advertisers or data brokers.</b> We do not use third-party tracking or analytics.</>,
          "We would disclose data to authorities only if Indian law requires it.",
        ]}
      />

      <H2>7. How long we keep it</H2>
      <List
        items={[
          "While your account exists. When you delete your account, we delete it and every elder no other family member looks after, with all their data and files, straight away.",
          "Withdrawing photos or the voice task deletes those photos or recordings straight away.",
          "Deleted data disappears from our backups within 8 weeks, as old backups are replaced.",
          "Invite requests are kept until the pilot ends, or deleted sooner if you ask.",
        ]}
      />

      <H2>8. Your rights and how to use them</H2>
      <List
        items={[
          <><b>See and take a copy:</b> Account → “Export my data” gives you everything as a file (photos and recordings included).</>,
          <><b>Correct:</b> change details in the app, or write to us.</>,
          <><b>Withdraw consent:</b> turn photos or the voice task off on the elder's page (this deletes them); to withdraw everything, delete your account.</>,
          <><b>Delete:</b> Account → “Delete my account”.</>,
          <><b>Nominate:</b> you can name someone to use these rights for you if you cannot; write to us.</>,
          <><b>Complain:</b> write to our grievance contact, <Contact email={email} />. We aim to reply within 7 days. If you are not satisfied, you can approach the Data Protection Board of India.</>,
        ]}
      />

      <H2>9. Children</H2>
      <p className="mt-3 leading-relaxed">Khayal is for adults. Family accounts must be 18 or older.</p>

      <H2>10. Changes</H2>
      <p className="mt-3 leading-relaxed">
        If we change this policy, we will show the new version here with its date and ask for your agreement again where the change matters. Consents are recorded with the version they were given under.
      </p>
    </>
  );
}

function Terms({ email }: { email: string | null | undefined }) {
  return (
    <>
      <p className="mt-6 leading-relaxed">These terms are the agreement between you and the Khayal team for using the Khayal pilot. Please read them with the privacy policy.</p>

      <div role="note" className="mt-6 rounded-2xl border-2 border-teal-700 bg-surface p-5">
        <p className="text-[1.15rem] leading-snug font-bold">
          Khayal is not a medical device and does not diagnose. It helps families notice changes early and talk to a doctor.
        </p>
        <p className="mt-2 leading-relaxed text-ink-soft">
          It does not replace a doctor, a diagnosis or treatment, and it is not for emergencies. If you are worried about someone's health, speak to a doctor. In an emergency, call 112.
        </p>
      </div>

      <H2>1. The pilot</H2>
      <p className="mt-3 leading-relaxed">
        Khayal is an invite-only pilot that grew out of a B.Tech research project. Parts of it are still being researched and it will change. We run it on a free hosting plan, so it may be slow to wake up after a quiet period and may sometimes be unavailable.
      </p>

      <H2>2. Who may use it</H2>
      <List
        items={[
          "Family accounts are for adults (18 or older) invited to the pilot, and for family members those adults share an elder with.",
          "You may add an elder only if you are their family member or legal guardian, and they agreed or you are legally authorised to decide for them.",
          "Doctors and care homes use the same family account, only for the people who are linked to them.",
        ]}
      />

      <H2>3. Your account</H2>
      <List
        items={[
          "Keep your password to yourself. Changing it signs you out everywhere else.",
          "Pair an elder's device only for that elder, and sign out any device that is lost or no longer used.",
          "Share an elder only with people they would want to see their information.",
        ]}
      />

      <H2>4. What you add</H2>
      <p className="mt-3 leading-relaxed">
        You keep the rights to the photos, names and recordings you add. You let us store and show them, only to the people linked to the elder, to run Khayal. Add photos of family members only if they are happy for you to do so.
      </p>

      <H2>5. Fair use</H2>
      <p className="mt-3 leading-relaxed">Do not try to get into other people's accounts, overload the service, or use Khayal for anything unlawful. We may close accounts that do.</p>

      <H2>6. Ending</H2>
      <p className="mt-3 leading-relaxed">
        You can delete your account at any time (Account → “Delete my account”). We may end the pilot; if we do, we will tell you first, give you time to export your data, and then delete it.
      </p>

      <H2>7. Responsibility</H2>
      <p className="mt-3 leading-relaxed">
        We build Khayal carefully, but we provide the pilot as it is, without promises that it is free of errors or always available. Alerts and trends are information to discuss with a doctor, not medical advice. As far as Indian law allows, we are not responsible for decisions made only on the basis of Khayal.
      </p>

      <H2>8. Law</H2>
      <p className="mt-3 leading-relaxed">These terms are governed by the laws of India.</p>

      <H2>9. Contact</H2>
      <p className="mt-3 leading-relaxed">
        Questions or complaints: <Contact email={email} />.
      </p>
    </>
  );
}

/** The privacy policy and terms of the pilot: plain-language drafts for India, pending review. */
export default function Legal({ kind }: LegalProps) {
  const config = useAppConfig();
  const title = kind === "privacy" ? "Privacy policy" : "Terms of use";
  useEffect(() => {
    document.title = `${title} · Khayal`;
  }, [title]);
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
        <p className="inline-block rounded-full border-2 border-saffron-600 bg-saffron-100 px-4 py-1 font-bold text-saffron-900">
          Draft — pending review
        </p>
        <h1 className="mt-4 text-[2.2rem] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
        <p className="mt-2 text-ink-soft">
          Version {POLICY_VERSION} · {UPDATED}. This draft has not yet been reviewed by a lawyer.
        </p>
        {kind === "privacy" ? <Privacy email={config?.contact_email} /> : <Terms email={config?.contact_email} />}
        <Link to="/" className="mt-12 inline-flex items-center gap-2 font-bold text-teal-700 underline underline-offset-[0.3em]">
          <ArrowLeft className="size-[1em]" aria-hidden="true" />
          Back to Khayal
        </Link>
      </main>
    </div>
  );
}
