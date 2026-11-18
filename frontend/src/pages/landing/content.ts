// All text on the public landing page lives here, so it can be translated (Hindi, Urdu) later.
// Honest by rule (PRODUCT.md): no testimonials, clinical claims, prices or endorsements.

export const NAV = [
  { id: "how", label: "How it works" },
  { id: "for-families", label: "For families" },
  { id: "science", label: "The science" },
  { id: "privacy", label: "Privacy" },
  { id: "faq", label: "FAQ" },
] as const;

export const landing = {
  title: "Khayal (خیال) — notice memory changes early, gently, at home",
  signIn: "Sign in",
  requestInvite: "Request an invite",
  /** Header, every width: straight to setting up an elder's phone with the family's code. */
  pairPhone: "Pair a phone",
  menu: "Open menu",
  closeMenu: "Close menu",
  skipToContent: "Skip to content",

  hero: {
    headline: "Notice memory changes early — gently, at home.",
    subline:
      "A few gentle brain games and reminders each day for elders with early memory loss. Their family sees how they are doing against their own normal, and hears early when something changes.",
    secondary: "See how it works",
    pilot: "Invite-only pilot in India",
    /** Outlined button beside "Request an invite" (pair-entry). */
    haveCode: "I have a code",
    tryDemo: "Try the demo",
    phoneLabel: "Khayal on an elder's phone: the Home screen with the next reminder and three big buttons",
  },

  how: {
    title: "How it works",
    intro: "Three people, one quiet routine.",
    steps: [
      {
        title: "The family sets it up",
        text: "Create a caregiver account, add reminders and family photos, and pair the elder's phone or tablet with a 6-digit code. The elder never needs a password.",
      },
      {
        title: "The elder plays and gets reminders",
        text: "Three short games a day that adjust to stay comfortable, a big Done button for medicine and meals, and “Who is this?” with family photos. Large text, read aloud, no timers.",
      },
      {
        title: "The family sees how they are doing",
        text: "Each game is compared with the elder's own baseline. You see Stable, Watch or Declining in plain words, and a gentle early warning when a change lasts.",
      },
    ],
  },

  familyView: {
    label: "What the family sees (illustration with made-up numbers)",
    patient: "Kamala Devi",
    overall: "Overall: Stable",
    game: "Find the Pairs",
    status: "This game: Watch",
    sentence: "A little below her own normal this week: average 0.55, her normal 0.62. Nothing to worry about yet; worth watching.",
  },

  audiences: {
    title: "Made for the whole family",
    cards: [
      {
        id: "elders",
        title: "For elders",
        lead: "A few calm minutes a day.",
        points: [
          "Games that are never too hard and never rushed",
          "Big text and an Indian English voice that reads aloud",
          "Reminders with one big Done button",
          "No scores, streaks or “wrong!”, ever",
        ],
      },
      {
        id: "for-families",
        title: "For families",
        lead: "Peace of mind, without more worry.",
        points: [
          "Set reminders and add photos from your own phone",
          "See each game against their own normal, not a chart for everyone",
          "Early warnings explained in plain words",
          "Know if medicine reminders are being missed",
        ],
      },
      {
        id: "doctors",
        title: "For doctors",
        lead: "A longer view than a clinic visit.",
        points: [
          "Weeks of trends for each game, with session history",
          "Plain explanations with the numbers behind them",
          "Changes measured against the person's own baseline",
          "Not a diagnosis: questions worth asking at the next visit",
        ],
      },
    ],
  },

  screens: {
    title: "See it as they will",
    intro: "The real screens, with a sample name and made-up numbers.",
    game: {
      title: "Gentle games",
      text: "Find the Pairs is one of five. Each gets a little easier or harder to stay comfortable; nothing is timed except Tap When Green.",
      label: "The Find the Pairs game on a phone: pairs found so far shown in soft green, a kind message below",
    },
    reminders: {
      title: "Daily reminders",
      text: "Medicine, meals and appointments, each with one big Done button. If three are missed in two days, the family is told.",
      label: "Today's reminders on a phone: the blood pressure tablet marked done, lunch and an evening walk still to do",
    },
    trend: {
      title: "What the family sees",
      text: "Each game against the elder's own normal, the status in words, and a plain sentence about what changed.",
      label: "A caregiver chart for Find the Pairs: the line stays in the band of her normal, then dips slightly; status Watch",
    },
    more: [
      { title: "“Who is this?”", text: "Family photos with names and relations, read aloud, so faces and names stay together." },
      { title: "Weekly voice task", text: "With the family's consent, the elder describes a picture once a week. The recordings are kept; their analysis is still being researched and is not shown." },
    ],
  },

  features: {
    title: "What is inside",
    items: [
      {
        icon: "games",
        title: "Adaptive brain games",
        text: "Find the Pairs, Follow the Colours, Remember the Words, About Today and Tap When Green. Each game gets a little easier or harder to stay in a comfortable zone.",
      },
      {
        icon: "reminders",
        title: "Daily reminders",
        text: "Medicine, meals and appointments, with the next one always on the Home screen. If three are missed in two days, the family is told.",
      },
      {
        icon: "who",
        title: "“Who is this?”",
        text: "Family photos with names and relations, read aloud. A gentle way to keep faces and names together.",
      },
      {
        icon: "voice",
        title: "Weekly voice task",
        text: "Once a week, the elder describes a picture of a busy Indian kitchen. Recordings are stored only with the family's consent; their analysis is still being researched and is not shown yet.",
      },
      {
        icon: "dashboard",
        title: "Caregiver dashboard",
        text: "Trends for every game, alerts in plain words, reminder adherence and a full session history, on your phone or laptop.",
      },
    ],
  },

  science: {
    title: "The science, honestly",
    intro: "Khayal measures change the way a careful family member would: against the person's own normal, slowly, and with an explanation.",
    blocks: [
      {
        title: "Difficulty that adapts",
        text: "After every 5 rounds, a game moves up a level when 85% or more were right and down a level when fewer than 55% were. That keeps success in a comfortable 60 to 80% zone, so play stays pleasant.",
      },
      {
        title: "A personal baseline",
        text: "Each game ignores the first 5 sessions while the elder gets used to it, then learns their normal from the next 10. After that, the average of the last 5 sessions is compared with that normal.",
      },
      {
        title: "Warnings only when a change lasts",
        text: "A warning appears only when the same game stays clearly below normal for 3 sessions in a row, with a sentence saying what changed. One bad day is not a warning.",
      },
    ],
    evidence:
      "So far we have tested this method on simulated patients only. There are no results from real patients yet; the pilot is how we will learn.",
    disclaimer:
      "Khayal is not a medical device and does not diagnose. It helps families notice changes early and talk to a doctor.",
    project: "Khayal began as a B.Tech research project (CSE471, Deep Learning) in India.",
  },

  privacy: {
    title: "Privacy and safety",
    items: [
      {
        title: "What we store",
        text: "Names and emails of family accounts; the elder's game results, reminders and Done marks; and only the family photos and voice recordings you choose to add.",
      },
      {
        title: "Who sees it",
        text: "Only the elder and the family members or doctors linked to them. No ads, no selling or sharing of data.",
      },
      {
        title: "Delete any time",
        text: "When the pilot opens, you can delete your account and everything in it at any time.",
      },
      {
        title: "Your data stays in India",
        text: "Everything is stored on servers in Mumbai, India.",
      },
    ],
    policyLink: "Read the privacy policy",
  },

  faq: {
    title: "Questions families ask",
    items: [
      {
        q: "Who is Khayal for?",
        a: "Elders with early memory loss or mild cognitive impairment, and the family members and doctors who look after them.",
      },
      {
        q: "Does Khayal diagnose dementia?",
        a: "No. Khayal is not a medical device. It shows how someone is doing compared with their own normal, so you can notice changes early and talk to a doctor.",
      },
      {
        q: "What does the elder need?",
        a: "A phone or tablet with a web browser. A family member sets it up once with a 6-digit code, and it stays signed in for 90 days.",
      },
      {
        q: "Is there an app to install?",
        a: "No. Khayal runs in the browser. You can add it to the home screen so it opens like an app.",
      },
      {
        q: "Which languages does it speak?",
        a: "English for now, read aloud in an Indian English voice. Hindi and Urdu are planned.",
      },
      {
        q: "Can a doctor or a care home use it?",
        a: "Yes. Doctors see the same trends as families for the patients linked to them, and a care home can look after several residents.",
      },
      {
        q: "Is my family's information safe?",
        a: "Only the people you link can see it, it is never sold or shared, and it is stored in India. When the pilot opens you can delete everything at any time.",
      },
      {
        q: "What happens after I request an invite?",
        a: "We read every request and write to you by email when a place opens in the pilot.",
      },
    ],
  },

  invite: {
    title: "Request an invite",
    intro: "Khayal is opening slowly, to a small group of families, doctors and care homes. Tell us a little about yourself.",
    name: "Your name",
    email: "Email",
    role: "I am",
    roles: [
      { value: "family", label: "A family member" },
      { value: "doctor", label: "A doctor" },
      { value: "care_home", label: "From a care home" },
    ],
    city: "City",
    message: "Anything you would like us to know (optional)",
    consent: "You may email me about the Khayal pilot. I can ask you to delete my request at any time.",
    submit: "Request an invite",
    submitting: "Sending…",
    thanksTitle: "Thank you. We have your request.",
    thanksText: "We read every request ourselves and will write to you by email when a place opens in the pilot.",
    errorInvalid: "Please check the highlighted details and try again.",
    errorBusy: "Many requests came from here just now. Please try again in an hour.",
    errorDown: "We could not reach Khayal just now. The server may be waking up; please try again in a minute.",
  },

  closing: {
    title: "Help someone you love keep their mind active.",
    text: "Join the invite-only pilot. It takes a minute to ask.",
  },

  footer: {
    tagline: "Thought and care, every day.",
    privacy: "Privacy policy",
    terms: "Terms",
    contact: "Contact",
    contactViaForm: "Write to us through the invite form",
    madeIn: "Made in India",
    project: "A B.Tech research project (CSE471)",
  },
} as const;
