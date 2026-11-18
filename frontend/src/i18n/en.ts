// English patient text: the source every language follows (Round 2 batch 5). Hindi and Urdu are in
// ./hi.ts and ./ur.ts with the same shape (type Copy); src/copy.ts picks the elder's language.
// Review file for translators: docs/i18n/review.md (python -m scripts.i18n_review writes it).

/** The relations a caregiver can pick (pages/caregiver/Family.tsx RELATIONS), lower case. */
export type RelationId = "son" | "daughter" | "grandson" | "granddaughter" | "wife" | "husband" | "friend" | "other";

const RELATIONS: Record<RelationId, string> = {
  son: "son",
  daughter: "daughter",
  grandson: "grandson",
  granddaughter: "granddaughter",
  wife: "wife",
  husband: "husband",
  friend: "friend",
  other: "other",
};

/** "This is Rahul, your grandson." (just "This is Rahul." when the relation is "Other"). */
function thisIs(name: string, relation: string): string {
  const r = relation.trim().toLowerCase();
  const word = RELATIONS[r as RelationId] ?? r;
  return r === "other" ? `This is ${name}.` : `This is ${name}, your ${word}.`;
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "quarter", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
];

/** "10 past 11", "half past 3", "quarter to 4", "3 o'clock"; with `asWords`, "twenty to four". */
function clockTime(h: number, m: number, asWords = false): string {
  const n = (x: number) => (asWords ? NUMBER_WORDS[x]! : String(x));
  const next = h === 12 ? 1 : h + 1;
  if (m === 0) return `${n(h)} o'clock`;
  if (m === 30) return `half past ${n(h)}`;
  if (m === 15) return `quarter past ${n(h)}`;
  if (m === 45) return `quarter to ${n(next)}`;
  return m < 30 ? `${n(m)} past ${n(h)}` : `${n(60 - m)} to ${n(next)}`;
}

export const en = {
  appName: "Khayal",
  /** Voice for read-aloud. */
  speechLang: "en-IN",
  /** Writing direction of the patient app. */
  dir: "ltr" as "ltr" | "rtl",
  /** Clock times in words, for "Set the clock" (logic in games/clockSetting/logic.ts). */
  clockTime,
  a11y: { topBar: "Top bar", mainActions: "Main actions", gamesList: "Games", kitchenPicture: "A picture of a busy kitchen" },
  common: {
    loading: "Just a moment…",
    /** Read aloud after a question: "Thursday, Friday, Monday, or Saturday?" */
    spokenChoices: (options: readonly string[]) =>
      options.length < 2 ? options.join("") : `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}?`,
  },
  nav: {
    home: "Home",
    readAloudOn: "Read aloud: On",
    readAloudOff: "Read aloud: Off",
    /** The same, in two parts for the top bar ("Read aloud:" above "On" / "Off" on phones). */
    readAloud: "Read aloud:",
    on: "On",
    off: "Off",
    sayItAgain: "Say it again",
    settings: "Settings",
    more: "More",
    /** The settings button's name for screen readers; it contains both visible words. */
    moreSettings: "More settings",
  },
  /** The small settings sheet next to Read aloud (Phase C): touch and sound feedback. */
  settings: {
    title: "Settings",
    intro: "Choose how your phone answers when you tap.",
    vibration: "Gentle vibration",
    sound: "Soft sound",
    on: "On",
    off: "Off",
    noVibration: "This phone can't vibrate, so there is nothing to switch here.",
    done: "Done",
    /** A quiet link under Done that opens the feedback view (Round 2 batch 3). */
    tellUs: "Tell us something",
  },
  /** Send feedback from the Settings sheet (Round 2 batch 3): two big choices, then words or a voice note. */
  feedback: {
    title: "Tell us something",
    question: "How was it?",
    hard: "Something was hard",
    liked: "I liked this",
    words: "A few words, if you like",
    record: "Record a voice note",
    stop: "Stop",
    recorded: "Your voice note is ready",
    send: "Send",
    sending: "Sending…",
    thanks: "Thank you. The Khayal team will read this.",
    retry: "That didn't send. Let's try again.",
    back: "Back",
  },
  patientHome: {
    greeting: (name: string) => `Hello, ${name}!`,
    /** By the time of day on the phone's clock; late at night simply "Hello" (never "Good night"). */
    greetingAt: (name: string, hour: number) =>
      hour >= 5 && hour < 12
        ? `Good morning, ${name}`
        : hour >= 12 && hour < 17
          ? `Good afternoon, ${name}`
          : hour >= 17 && hour < 22
            ? `Good evening, ${name}`
            : `Hello, ${name}`,
    nextReminderLabel: "Next reminder",
    noReminder: "Nothing planned right now. Enjoy your day.",
    /** When reminders can't be loaded: never claim there is nothing planned. */
    reminderUnavailable: "We could not check your reminders just now. Tap Today's reminders to look again.",
    nextReminder: (time: string, title: string) => `${time} · ${title}`,
    reminderNow: (title: string) => `Now · ${title}`,
    playGames: "Play a game",
    todaysReminders: "Today's reminders",
    whoIsThis: "Who is this?",
    /** Status line on "Play a game": today's progress, never a score. */
    gamesProgress: (done: number, total: number) => `${done} of ${total} done today`,
  },
  /** Once a day, the first time Home opens (Round 2 batch 4). Optional; Skip is always there. */
  mood: {
    question: "How are you feeling today?",
    spoken: "How are you feeling today? Good, okay, or not so good. You can also skip.",
    good: "Good",
    okay: "Okay",
    notSoGood: "Not so good",
    skip: "Skip for today",
    thanks: "Thank you for telling me.",
    gentle: "I hope the day gets a little gentler.",
    continue: "Continue",
  },
  /** The memory book, on the "Memories" side of "Who is this?" (Round 2 batch 4). */
  memories: {
    people: "People",
    memories: "Memories",
    switchLabel: "Show people or memories",
    intro: "Photos and stories from your family.",
    empty: "Your family hasn't added memories yet.",
    loadFailed: "We could not load your memories just now. Let's try again.",
    listen: "Listen",
    readStory: "Read it to me",
    stop: "Stop",
    nextMemory: "Next memory",
    photoOf: (n: number, total: number) => `Photo ${n} of ${total}`,
    nextPhoto: "Tap the photo to see the next one.",
    memoryOf: (n: number, total: number) => `Memory ${n} of ${total}`,
  },
  games: {
    title: "Games",
    intro: "Here are today's games. Pick one to play.",
    doneToday: "✓ Done today",
    listFailed: "We could not load today's games just now. Let's try again.",
    empty: "Your games will be ready soon. Please come back a little later.",
    start: "Start",
    roundOf: (n: number, total: number) => `Round ${n} of ${total}`,
    /** Kind words after a right answer, taken in turn so the same words don't repeat round after round. */
    praise: ["Well done!", "Lovely.", "That's right.", "Nicely done.", "Good, that's it.", "Very good."],
    roundTryAnother: "Let's try another.",
    /** First-time tutorial (research.md 3.4). */
    tutorialHeading: "Let's see how it works",
    tryOne: "Let's try one",
    /** Games outside the core set, after today's games are done (CLAUDE.md section 7). */
    moreGames: "More games",
    moreTitle: "More games",
    moreIntro: "A few more games, if you'd like to play.",
    moreEmpty: "That's all the games for now. Well played today.",
    practiceDone: "That's how it works. Now let's play.",
    next: "Next one",
    saving: "Just a moment…",
    saveFailed: "We could not save your game just now. Let's try again.",
    retry: "Try again",
    /** One is picked at the end of each session, so the ending varies. Never mentions levels. */
    encouragement: [
      "Lovely playing. Thank you!",
      "That was wonderful. Well done.",
      "Beautifully done. A good stretch for the mind.",
      "Well played! That was a pleasure.",
      "You took your time and did it well. Lovely work.",
    ],
    /** Added when the game will be a little harder next time. */
    endUp: "Next time will be a little more interesting.",
    showMeAgain: "Show me again",
    playAgain: "Play again",
    backToGames: "Back to games",
    nextGame: "Next game",
    backHome: "Back to Home",
    memoryMatch: {
      title: "Find the Pairs",
      intro: "Turn over two cards at a time and find the matching pairs.",
      lookCarefully: "Look at the cards.",
      hideCards: "I've looked — hide the cards",
      findPairs: "Now find the pairs.",
      faceDown: (n: number) => `Card ${n}, face down`,
      tutorial: [
        "First the cards are face up. Look at them as long as you like.",
        "Then tap two cards to turn them over. When they match, they stay.",
      ],
    },
    sequenceRecall: {
      title: "Follow the Colours",
      intro: "Watch the tiles light up, then tap them in the same order.",
      watch: "Watch carefully…",
      replay: "Here's how it went.",
      yourTurn: "Your turn. Tap the tiles in the same order.",
      /** How far the patient has got, so they don't have to remember it too. */
      tapsOf: (done: number, total: number) => `${done} of ${total}`,
      tutorial: ["Watch the tiles light up, one after another.", "Then tap them in the same order. Take your time."],
    },
    wordRecall: {
      title: "Remember the Words",
      intro: "Some words will appear one at a time. Try to remember them.",
      remember: "Remember this word",
      nextWord: "Next word",
      stars: "Now tap the 5 stars.",
      starsDone: "Lovely! Just a moment…",
      star: (n: number) => `Star ${n}`,
      starTapped: (n: number) => `Star ${n}, tapped`,
      choose: "Which words did you see?",
      done: "Done",
      hintLetters: (letters: string) => `Look for words starting with: ${letters}`,
      tutorial: ["You will see a few words, one at a time.", "After a little break, tap the words you saw."],
      /** Delayed check (D4), at the start of the next game: never says how it went. */
      delayedAsk: "Earlier we saw some words. Which of these did you see?",
      delayedThanks: "Thank you. Now on to the game.",
    },
    orientation: {
      title: "About Today",
      intro: "A few gentle questions about today.",
      askDay: "What day of the week is it today?",
      askMonth: "Which month is it?",
      askSeason: "Which season is it now?",
      askTimeOfDay: "What time of day is it?",
      askCity: "Which city are you in?",
      askYear: "Which year is it?",
      askWhoIsThis: "Who is this?",
      yes: "Yes! ",
      replyDay: (day: string) => `It's ${day} today.`,
      replyMonth: (month: string) => `It's ${month} now.`,
      replySeason: (season: string) => `It's ${season.toLowerCase()} now.`,
      replyTimeOfDay: (time: string) => `It's ${time.toLowerCase()} now.`,
      replyCity: (city: string) => `You're in ${city}.`,
      replyYear: (year: string) => `It's ${year}.`,
      /** Our own adapted item, asked only before a festival the family celebrates (D6). */
      askFestival: "Which festival comes next?",
      replyFestival: (name: string) => `${name} comes next.`,
      tutorial: ["A few gentle questions about today.", "Tap the answer you think is right."],
    },
    reactionTap: {
      title: "Tap When Green",
      intro: "Tap the circle as soon as it turns green.",
      instructions: "Tap the circle when it turns green.",
      instructionsWithRed: "Tap the circle when it turns green. Don't tap red.",
      waiting: "Wait…",
      green: "Tap!",
      red: "Don't tap",
      tooEarly: "Wait for green.",
      tutorial: ["Wait for the circle to turn green.", "Then tap it."],
    },
    colourTrails: {
      title: "Join in order",
      intro: "Tap the numbers in order, one after another.",
      promptPart1: "Tap the numbers in order: 1, then 2, then 3, and on.",
      promptPart2: "Change each time: teal circle 1, saffron square 2, teal circle 3, and on.",
      /** After a tap that doesn't join: which number comes next (never "wrong"). */
      lookFor: (n: number, mark: "circle" | "square" | null) =>
        mark === null ? `Let's look for ${n}.` : `Let's look for the ${mark === "circle" ? "teal circle" : "saffron square"} ${n}.`,
      joinedOf: (done: number, total: number) => `${done} of ${total} joined`,
      markName: (n: number, mark: "circle" | "square" | null) =>
        mark === null ? `${n}` : `${mark === "circle" ? "Teal circle" : "Saffron square"} ${n}`,
      joinedName: (name: string) => `${name}, joined`,
      tutorial: ["Tap the numbers in order: 1, then 2, then 3.", "A line joins them as you go. Take your time."],
    },
    clockSetting: {
      title: "Set the clock",
      intro: "Put the clock's hands at the time you hear.",
      setTo: (words: string) => `Set the clock to ${words}.`,
      inDigits: (d: string) => `That's ${d}.`,
      tapShort: "Tap where the short hand goes.",
      tapLong: "Now tap where the long hand goes.",
      tapDone: "Tap Done when it looks right. You can still move a hand.",
      shortHand: "Short hand",
      longHand: "Long hand",
      done: "Done",
      clockLabel: "Clock face. Tap to place the hand.",
      clockShowing: (words: string) => `A clock showing ${words}`,
      read: "What time does this clock show?",
      readLater: "This clock shows the time now. What will the time be in an hour and a half?",
      itIs: (words: string) => `It's ${words}.`,
      thisIs: (words: string) => `Here's how ${words} looks: the long hand on the minutes, the short hand near the hour.`,
      practiceHint: (words: string) => `It's ${words}. Tap it.`,
      tutorial: ["Tap where the short hand goes, then where the long hand goes.", "You can move a hand again. Tap Done when it looks right."],
    },
    market: {
      title: "Market day",
      intro: "Pay at the shop, and work out the change.",
      payOne: (item: string, price: number) => `${item} costs ₹${price}. Tap the money to pay.`,
      payCheaper: (a: string, pa: number, b: string, pb: number) =>
        `${a} costs ₹${pa}. ${b.charAt(0).toUpperCase() + b.slice(1)} costs ₹${pb}. Pay for the one that costs less.`,
      payBoth: (a: string, pa: number, b: string, pb: number) => `${a} costs ₹${pa} and ${b} costs ₹${pb}. Pay for both.`,
      counter: "On the counter",
      purse: "In your purse",
      give: (v: number) => `₹${v}, put it on the counter`,
      takeBack: (v: number) => `₹${v} on the counter, take it back`,
      pay: "Pay",
      exactly: (v: number) => `That's exactly ₹${v}.`,
      notQuite: (paid: number, price: number) => `That was ₹${paid}. It comes to ₹${price}.`,
      practiceHint: (v: number) => `It costs ₹${v}: the ₹${v} note pays it.`,
      askChange: (item: string, price: number, money: number) =>
        `${item} costs ₹${price}. You pay with a ₹${money} note. How much change do you get back?`,
      changeReply: (change: number, money: number, price: number) => `₹${change} back: ₹${money} take away ₹${price}.`,
      askAfford: (money: number) => `You have ₹${money}. Which two can you buy?`,
      pairLabel: (a: string, pa: number, b: string, pb: number) => `${a} (₹${pa}) and ${b} (₹${pb})`,
      affordReply: (pair: string, sum: number, money: number) => `${pair} come to ₹${sum}, which fits in ₹${money}.`,
      tutorial: ["Tap a note or coin to put it on the counter. Tap it again to take it back.", "When it's the right money, tap Pay."],
    },
    spatialSpan: {
      title: "Tap the squares",
      intro: "Watch the squares light up, then tap them in the same order.",
      watch: "Watch the squares…",
      yourTurn: "Your turn. Tap the same squares in the same order.",
      square: (n: number) => `Square ${n}`,
      tutorial: ["Some squares light up, one after another.", "Then tap the same squares in the same order."],
    },
    objectLocation: {
      title: "Where did it go?",
      intro: "See where some everyday things are, then show where each one was.",
      study: (n: number, total: number) => `Look where this is. (${n} of ${total})`,
      next: "Next",
      ready: "I'm ready",
      whereWas: (thing: string) => `Where was the ${thing.toLowerCase()}?`,
      again: "Here's where they were. Let's try those again.",
      box: (n: number) => `Box ${n}`,
      boxWith: (n: number, thing: string) => `Box ${n}, ${thing.toLowerCase()}`,
      placedOf: (done: number, total: number) => `${done} of ${total} placed`,
      practiceHint: "It was here. Tap this box.",
      tutorial: ["Some things appear, one at a time, each in a box. Remember where each one is.", "Then each thing comes back. Tap the box where it was."],
    },
  },
  days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  seasons: { summer: "Summer", monsoon: "Monsoon", winter: "Winter" },
  timesOfDay: { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" },
  // Other answers offered next to the patient's own city.
  cities: ["Delhi", "Mumbai", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Pune", "Jaipur", "Lucknow", "Ahmedabad"],
  /** Festivals for About Today's festival question (dates in games/dailyOrientation/festivals). */
  festivals: {
    makar_sankranti: "Makar Sankranti",
    pongal: "Pongal",
    holi: "Holi",
    eid_ul_fitr: "Eid ul-Fitr",
    vaisakhi: "Vaisakhi",
    bakrid: "Bakrid (Eid ul-Adha)",
    muharram: "Muharram",
    milad_un_nabi: "Milad-un-Nabi (Eid-e-Milad)",
    onam: "Onam",
    raksha_bandhan: "Raksha Bandhan",
    janmashtami: "Janmashtami",
    ganesh_chaturthi: "Ganesh Chaturthi",
    durga_puja: "Durga Puja",
    dussehra: "Dussehra",
    diwali: "Diwali",
    guru_nanak_jayanti: "Guru Nanak Jayanti",
    christmas: "Christmas",
  },
  /** "Where did it go?" objects (photos in games/objectLocation/photos). */
  objects: {
    key: "Key",
    glasses: "Glasses",
    lock: "Lock",
    comb: "Comb",
    cup: "Cup",
    umbrella: "Umbrella",
    spoon: "Spoon",
    banana: "Bananas",
    tomato: "Tomatoes",
    onion: "Onion",
  },
  /** Market day items (prices in games/moneyHandling/prices.ts); lower case, used inside sentences. */
  market: {
    biscuits: "a packet of biscuits",
    coriander: "a bunch of coriander",
    potatoes: "a kilo of potatoes",
    milk: "half a litre of milk",
    tomatoes: "a kilo of tomatoes",
    onions: "a kilo of onions",
    coconut: "a coconut",
    sugar: "a kilo of sugar",
    bread: "a loaf of bread",
    atta: "a kilo of atta",
    bananas: "a dozen bananas",
    rice: "a kilo of rice",
    soap: "a bar of soap",
    notebook: "a notebook",
    pen: "a pen",
    toothpaste: "a tube of toothpaste",
    tea: "a packet of tea",
    dal: "a kilo of dal",
    apples: "a kilo of apples",
    turmeric: "a packet of turmeric",
    oil: "a litre of oil",
    curd: "a cup of curd",
    matches: "a box of matches",
    candles: "a packet of candles",
  },
  // Everyday words for Word Recall.
  words: {
    tea: "Tea",
    bus: "Bus",
    temple: "Temple",
    rice: "Rice",
    umbrella: "Umbrella",
    market: "Market",
    doctor: "Doctor",
    train: "Train",
    garden: "Garden",
    mirror: "Mirror",
    milk: "Milk",
    bangle: "Bangle",
    kettle: "Kettle",
    window: "Window",
    pillow: "Pillow",
    bicycle: "Bicycle",
    radio: "Radio",
    lamp: "Lamp",
    shoes: "Shoes",
    clock: "Clock",
    spoon: "Spoon",
    flower: "Flower",
    letter: "Letter",
    bucket: "Bucket",
  },
  cards: {
    chai: "Chai",
    roti: "Roti",
    mango: "Mango",
    auto: "Rickshaw",
    marigold: "Marigold",
    cricket: "Cricket",
    diya: "Diya",
    kite: "Kite",
    elephant: "Elephant",
    coconut: "Coconut",
  },
  tiles: {
    red: "Red",
    blue: "Blue",
    green: "Green",
    yellow: "Yellow",
  },
  reminders: {
    title: "Today's reminders",
    nowHeading: "Now",
    /** Over reminders whose time has passed: never "Now" (CLAUDE.md section 6). */
    earlierHeading: "Earlier today",
    /** Under the one reminder being asked about, when more are waiting. */
    moreAfter: (n: number) => (n === 1 ? "1 more reminder after this one." : `${n} more reminders after this one.`),
    /** Nothing left to answer, but something was "not sure": never "All done… Well done!". */
    familyWillHelp: "That's everything for now. Your family will help with the rest.",
    laterHeading: "Later today",
    doneHeading: "Done",
    timeForThis: "It's time for this.",
    letsDoItNow: "Let's do this now.",
    /** Overdue reminders ask, they never urge (CLAUDE.md section 6). */
    overdueAsk: (time: string) => `This was for ${time}. Is it done?`,
    yesDone: "Yes, it's done",
    notSure: "No / not sure",
    /** After "No / not sure": never a suggestion to take a dose. */
    askFamilyMedicine: "Please ask your family before taking it. We've let them know.",
    askFamilyOther: "That's all right. We've let your family know.",
    familyKnows: "Your family knows about this one.",
    done: "Done",
    doneMark: "✓ Done",
    thanks: "Thank you! That's done.",
    allDone: "All done for today. Well done!",
    nothingToday: "Nothing planned today. Enjoy your day.",
    nothingNow: "Nothing to do right now. Enjoy the moment.",
    loadFailed: "We could not load your reminders just now. Let's try again.",
    saveFailed: "That didn't save just now. Let's try again.",
    retry: "Try again",
    types: { medicine: "Medicine", meal: "Meal", appointment: "Appointment", other: "Reminder" },
    /** "13:05:00" -> "1:05 PM" */
    time: (hhmmss: string) => {
      const [h = 0, m = 0] = hhmmss.split(":").map(Number);
      const suffix = h < 12 ? "AM" : "PM";
      return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
    },
  },
  whoIsThis: {
    title: "Who is this?",
    intro: "Tap a photo to see it big and hear about them.",
    empty: "Family photos will appear here soon.",
    loadFailed: "We could not load the photos just now. Let's try again.",
    back: "Back",
    photoOf: (name: string) => `Photo of ${name}`,
    /** "This is Rahul, your grandson. Lives in Pune, visits on Sundays." */
    spoken: (name: string, relation: string, note: string | null) => [thisIs(name, relation), note].filter(Boolean).join(" "),
    thisIs,
    relations: RELATIONS,
  },
  voiceTask: {
    title: "Tell me about a picture",
    instruction: "Tell me everything you see happening.",
    start: "Start",
    stop: "Stop",
    listening: "I'm listening",
    soundLevel: "Sound level",
    saving: "Saving…",
    thanks: "Thank you, that was lovely.",
    micProblem: "We could not use the microphone just now. Please ask your family member to help.",
    /** Before Start: the browser will ask once to use the microphone. */
    micHeadsUp: "The first time, your phone may ask to use the microphone. Tap Allow.",
    saveFailed: "We could not save it just now. Let's try again.",
    tryAgain: "Try again",
    notOn: "This activity is not turned on yet. Your family member can turn it on.",
  },
  demo: {
    banner: "Demo only: no real health info or photos.",
    tryIt: "Try the demo",
    pairLink: "Just visiting? Try the demo",
    title: "Try Khayal",
    intro:
      "We will make a caregiver account just for you, with three made-up patients and 90 days of practice history.",
    deleted: (days: number) => `Your demo account and everything in it are deleted after ${days} days.`,
    start: "Start the demo",
    starting: "Setting up your demo…",
    readyTitle: "Your demo is ready",
    patientSide: (name: string) =>
      `To try the patient side, open the address below on a phone or in a private window, then type this code for ${name}:`,
    codeLabel: "Code for the patient's device",
    codeExpires: "The code works for 10 minutes. You can make a new one on the patient's page.",
    toDashboard: "Open the caregiver dashboard",
    failed: "We could not start the demo just now. Please try again in a few minutes.",
    tooMany: "Several demos were started from here recently. Please try again later.",
    notAvailable: "The demo is not available on this server.",
    waking: "Waking up the server… this can take up to a minute.",
  },
  pair: {
    title: "Set up this device",
    intro: "Ask your family member for the 6-digit code, then type it here.",
    codeLabel: "6-digit code",
    submit: "Start",
    submitting: "Just a moment…",
    failed: "That code didn't work. Please check the 6 numbers and try again. If it still doesn't work, ask for a new code.",
    /** Under the box: how many numbers are in so far. */
    typed: (n: number) => `${n} of 6 numbers`,
    /** After a good code: a moment to see it worked, then Start (never rushed). */
    readyTitle: "All set",
    ready: (name: string) => `This phone is now set up for ${name}.`,
    readyStart: "Start",
    tooMany: "Let's wait a few minutes, then try a new code.",
    unavailable: "We could not reach Khayal just now. Please try again in a moment.",
    caregiverLink: "Family member or doctor? Sign in with email",
  },
  login: {
    title: "Welcome to Khayal",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    failed: "That email and password did not match. Let's try again.",
    unavailable: "We could not reach Khayal just now. Please try again in a moment.",
    toRegister: "New here? Khayal is invite-only: request an invite",
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
};

/** The shape every language follows (strings widened, so Hindi and Urdu can differ). */
export type Copy = typeof en;
