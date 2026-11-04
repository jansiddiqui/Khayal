// All user-facing patient text lives here so it can be translated (e.g. to Hindi) later.

export const copy = {
  appName: "Khayal",
  common: {
    loading: "Just a moment…",
  },
  nav: {
    home: "Home",
    readAloudOn: "Read aloud: On",
    readAloudOff: "Read aloud: Off",
  },
  patientHome: {
    greeting: (name: string) => `Hello, ${name}!`,
    nextReminderLabel: "Next reminder",
    noReminder: "Nothing planned right now. Enjoy your day.",
    playGames: "Play a game",
    todaysReminders: "Today's reminders",
    whoIsThis: "Who is this?",
  },
  games: {
    title: "Games",
    comingSoon: "Games are on their way. Thank you for your patience.",
  },
  reminders: {
    title: "Today's reminders",
    comingSoon: "Your reminders will appear here soon.",
  },
  whoIsThis: {
    title: "Who is this?",
    comingSoon: "Family photos will appear here soon.",
  },
  voiceTask: {
    title: "Tell me about a picture",
    comingSoon: "This activity is coming soon.",
  },
  login: {
    title: "Welcome to Khayal",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    failed: "That email and password did not match. Let's try again.",
    unavailable: "We could not reach Khayal just now. Please try again in a moment.",
    toRegister: "New here? Create an account",
  },
  register: {
    title: "Create an account",
    name: "Your name",
    email: "Email",
    password: "Password (at least 8 characters)",
    roleLegend: "I am…",
    rolePatient: "Using Khayal for myself",
    roleCaregiver: "A caregiver or doctor",
    submit: "Create account",
    submitting: "Creating…",
    emailTaken: "This email already has an account. Try signing in instead.",
    invalid: "Please check the details and try again.",
    toLogin: "Already have an account? Sign in",
  },
} as const;
