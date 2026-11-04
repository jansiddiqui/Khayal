// All user-facing patient text lives here so it can be translated (e.g. to Hindi) later.

export const copy = {
  appName: "Khayal",
  nav: {
    home: "Home",
  },
  patientHome: {
    greeting: "Hello! Good to see you.",
    subtitle: "What would you like to do today?",
    playGames: "Play a game",
  },
  games: {
    title: "Games",
    comingSoon: "Games are on their way. Thank you for your patience.",
  },
  reminders: {
    title: "My day",
    comingSoon: "Your reminders will appear here soon.",
  },
  whoIsThis: {
    title: "Who is this?",
    comingSoon: "Family photos will appear here soon.",
  },
  voiceTask: {
    title: "Talk about a picture",
    comingSoon: "This activity is coming soon.",
  },
  start: {
    title: "Welcome to Khayal",
    patient: "I am here to play",
    caregiver: "I am a caregiver",
  },
} as const;
