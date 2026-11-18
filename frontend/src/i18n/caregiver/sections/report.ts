// Caregiver words: report (Round 2 batch 5b): the print-ready doctor report and its controls.
// English is the source; Hindi has the same shape. Hindi style and glossary: ./common.ts.
// In Hindi, game names are followed by the clinical English name in brackets (pages/caregiver/Report.tsx).
export const en = {
  statement:
    "Khayal is not a medical device and this is not a diagnosis. The scores come from brain games and reminders " +
    "on a phone or tablet, compared with this person's own earlier scores, not with other people. Please read them " +
    "alongside your own clinical assessment.",
  sparkline: (n: number) => `${n} session scores`,
  learning: "Learning",
  toBaseline: (n: number) => `${n} sessions to baseline`,
  kicker: "Khayal · summary for the doctor",
  period: (start: string, end: string, days: number, made: string) => `${start} – ${end} (${days} days) · made ${made}`,
  overallTitle: "Overall",
  overallStatus: "Overall status: ",
  index: (z: string) => ` (index ${z})`,
  played: (played: number, days: number) => `. Played on ${played} of ${days} days.`,
  overallHelp:
    "Each game is compared with this person's own normal (finished sessions 6–15). z is the average of the last 5 " +
    "sessions against that normal: Stable at −0.5 or above, Watch below −0.5, Declining below −1.5.",
  gamesTitle: "Core games",
  colGame: "Game",
  colSessions: "Sessions",
  colScore: "Score, 1st → 2nd half",
  colStatus: "Status now",
  colSpark: "Sessions in the period",
  scoreHelp: "Score = accuracy × level / 10 × reaction-time ratio, per finished session.",
  adherenceTitle: "Medicines and reminders",
  noMedicines: "No medicine reminders in this period.",
  doses: (taken: number, total: number) => `Medicine doses: ${taken} of ${total} taken`,
  confirmedLater: (n: number) => ` (${n} confirmed later)`,
  dosesRest: (missed: number, unsure: number) => `, ${missed} missed, ${unsure} not sure.`,
  allReminders: (done: number, total: number) =>
    `All reminders: ${done} of ${total} done. Taken doses are as marked on the phone by the person or the family.`,
  alertsTitle: "Alerts in this period",
  none: "None.",
  moodTitle: "Mood",
  moodNone: "The daily mood question was not answered in this period.",
  moodCounts: (good: number, okay: number, notSoGood: number, skipped: number, answered: number, days: number) =>
    `Answers to “How are you feeling today?” (optional, once a day): ${good} good, ${okay} okay, ${notSoGood} not so good, ${skipped} skipped, on ${answered} of ${days} days.`,
  moodRun: (n: number) => ` The longest run of “not so good” days was ${n}.`,
  voiceTitle: "Voice task",
  recordings: (n: number) => `${n} ${n === 1 ? "recording" : "recordings"} of the weekly picture description. Not analysed yet.`,
  notesTitle: "Notes from the family",
  back: "Back to their page",
  periodLabel: "Period",
  lastDays: (n: number) => `Last ${n} days`,
  download: "Download PDF",
  downloadHelp: "“Download PDF” opens your browser's print window: choose “Save as PDF”.",
  notesLabel: "Notes for the doctor (printed with the report, not saved)",
  notesPlaceholder: "For example: sleeping less this month; new tablet started on 3 November.",
  loading: "Loading the report",
  loadFailed: "Could not make the report.",
};

export const hi: typeof en = {
  statement:
    "ख़याल कोई मेडिकल उपकरण नहीं है और यह कोई डायग्नोसिस नहीं है। ये स्कोर फ़ोन या टैबलेट पर दिमाग़ी खेलों और रिमाइंडर से आते हैं, " +
    "और इनकी तुलना इसी व्यक्ति के अपने पहले के स्कोर से होती है, दूसरे लोगों से नहीं। कृपया इन्हें अपनी क्लिनिकल जाँच के साथ पढ़ें।",
  sparkline: (n: number) => `${n} सेशन के स्कोर`,
  learning: "अभी सीख रहे हैं",
  toBaseline: (n: number) => `बेसलाइन में ${n} सेशन बाक़ी`,
  kicker: "ख़याल · डॉक्टर के लिए सारांश",
  period: (start: string, end: string, days: number, made: string) => `${start} – ${end} (${days} दिन) · ${made} को बनी`,
  overallTitle: "कुल मिलाकर",
  overallStatus: "कुल स्थिति: ",
  index: (z: string) => ` (इंडेक्स ${z})`,
  played: (played: number, days: number) => `। ${days} में से ${played} दिन खेले।`,
  overallHelp:
    "हर खेल की तुलना इसी व्यक्ति के अपने सामान्य से होती है (पूरे हुए सेशन 6–15)। z पिछले 5 सेशन के औसत की उस सामान्य से " +
    "तुलना है: −0.5 या ऊपर स्थिर, −0.5 से नीचे नज़र रखें, −1.5 से नीचे गिरावट।",
  gamesTitle: "मुख्य खेल",
  colGame: "खेल",
  colSessions: "सेशन",
  colScore: "स्कोर, पहला → दूसरा आधा",
  colStatus: "अभी की स्थिति",
  colSpark: "इस अवधि के सेशन",
  scoreHelp: "स्कोर = सही जवाब का अनुपात × लेवल / 10 × रिएक्शन-टाइम अनुपात, हर पूरे सेशन के लिए।",
  adherenceTitle: "दवाई और रिमाइंडर",
  noMedicines: "इस अवधि में दवाई का कोई रिमाइंडर नहीं था।",
  doses: (taken: number, total: number) => `दवाई की खुराक: ${total} में से ${taken} ली`,
  confirmedLater: (n: number) => ` (${n} बाद में पक्की की)`,
  dosesRest: (missed: number, unsure: number) => `, ${missed} छूटी, ${unsure} पक्का नहीं।`,
  allReminders: (done: number, total: number) =>
    `सभी रिमाइंडर: ${total} में से ${done} हो गए। ली गई खुराक वैसी ही है जैसी फ़ोन पर व्यक्ति या परिवार ने दर्ज की।`,
  alertsTitle: "इस अवधि के अलर्ट",
  none: "कोई नहीं।",
  moodTitle: "मन",
  moodNone: "इस अवधि में रोज़ के मन वाले सवाल का जवाब नहीं दिया गया।",
  moodCounts: (good: number, okay: number, notSoGood: number, skipped: number, answered: number, days: number) =>
    `“आज आप कैसा महसूस कर रहे हैं?” के जवाब (ज़रूरी नहीं, दिन में एक बार): ${good} अच्छा, ${okay} ठीक-ठाक, ${notSoGood} ज़्यादा अच्छा नहीं, ${skipped} छोड़ा, ${days} में से ${answered} दिन।`,
  moodRun: (n: number) => ` लगातार सबसे ज़्यादा “ज़्यादा अच्छा नहीं” वाले दिन: ${n}।`,
  voiceTitle: "आवाज़ वाला काम",
  recordings: (n: number) => `हफ़्ते की तस्वीर के बारे में बोलने की ${n} रिकॉर्डिंग। अभी जाँची नहीं गई।`,
  notesTitle: "परिवार के नोट",
  back: "उनके पेज पर वापस",
  periodLabel: "अवधि",
  lastDays: (n: number) => `पिछले ${n} दिन`,
  download: "PDF डाउनलोड करें",
  downloadHelp: "“PDF डाउनलोड करें” से ब्राउज़र की प्रिंट विंडो खुलती है: उसमें “Save as PDF” चुनें।",
  notesLabel: "डॉक्टर के लिए नोट (रिपोर्ट के साथ छपेंगे, सेव नहीं होंगे)",
  notesPlaceholder: "जैसे: इस महीने नींद कम हुई; 3 नवंबर से नई गोली शुरू हुई।",
  loading: "रिपोर्ट लोड हो रही है",
  loadFailed: "रिपोर्ट नहीं बन पाई।",
};
