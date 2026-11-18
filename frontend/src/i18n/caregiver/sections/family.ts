// Caregiver words: family photos page (pages/caregiver/Family.tsx) and shared ui/* pieces
// (Round 2 batch 5b). English is the source; Hindi has the same shape.
// Hindi style and glossary: ./common.ts.

export const en = {
  title: (elder: string | null) => `Family photos${elder ? ` · ${elder}` : ""}`,
  backToPatient: "Back to patient",
  privateNote: "These photos are private: they are only shown to this patient and their linked caregivers.",
  /** Stands in for the elder's first name before it has loaded. */
  thePatient: "the patient",
  photosOff: (first: string) =>
    `Family photos are off for ${first}. Turn them on to add photos for “Who is this?”. This records your consent; turning them off later deletes every photo.`,
  turnOnPhotos: "Turn on family photos",
  photosOnToast: (first: string) => `Family photos are on for ${first}.`,
  photosOnFailed: "Could not turn on family photos. Try again.",
  addAPerson: "Add a person",
  addPeopleHint: (first: string) => `Add the people ${first} sees often, each with a photo.`,
  loadingFamily: "Loading family",
  loadFailed: "Could not load the family list.",
  emptyTitle: "No one added yet",
  emptyBody: (first: string) =>
    `Add the people ${first} sees often, with a photo each. They appear in “Who is this?” and in the daily “About Today” game once three people have photos.`,
  form: {
    name: "Name",
    nameError: "Write their name, as the patient knows them.",
    relation: "Relation",
    relationCustom: "Relation (your words)",
    relationPlaceholder: "e.g. Neighbour",
    note: "Note (optional, read aloud to the patient)",
    notePlaceholder: "e.g. Lives in Pune, visits on Sundays.",
    saveChanges: "Save changes",
    addPerson: "Add person",
    photosOptional: "Photos (optional)",
    choosePhotos: "Choose photos",
    queueNote: (max: number) => `Up to ${max} · JPG or PNG · or drop them here`,
    photosToAdd: "Photos to add",
    removeFile: (fileName: string) => `Remove ${fileName}`,
  },
  photos: {
    onlyJpgPng: "Only JPG and PNG photos are allowed.",
    tooBig: "Photos must be 5 MB or smaller.",
    fileIssue: (fileName: string, issue: string) => `${fileName}: ${issue}`,
    alreadyFull: (max: number) => `This person already has ${max} photos.`,
    onlyFit: (n: number, max: number) =>
      `Only ${n} more photo${n === 1 ? "" : "s"} fit (${max} per person), so the first ${n} ${n === 1 ? "is" : "are"} added.`,
    uploadingLabel: (index: number, total: number) => (total > 1 ? `Uploading photo ${index} of ${total}` : "Uploading photo"),
    uploadingProgress: (index: number, total: number, percent: number) =>
      `Uploading${total > 1 ? ` ${index} of ${total}` : ""} · ${percent}%`,
    preparing: "Preparing…",
    photosOf: (name: string) => `Photos of ${name}`,
    dropHere: "Drop the photos here",
    uploadFailed: (fileName: string | null, reason: string) => `Could not upload ${fileName ?? "the photo"}. ${reason}`,
    saved: (n: number) => (n === 1 ? "Photo saved." : `${n} photos saved.`),
    removed: (index: number, name: string) => `Photo ${index} of ${name} removed.`,
    removeFailed: "Could not remove the photo. It is back.",
    alt: (name: string, index: number) => `${name}, photo ${index}`,
    removeLabel: (name: string, index: number) => `Remove ${name} photo ${index}`,
    addHint: (elder: string, name: string) => `Add a photo so ${elder} can see ${name} in “Who is this?”.`,
    uploading: "Uploading…",
    addPhotos: "Add photos",
    note: (count: number, max: number) => `${count} / ${max} photos · JPG or PNG, up to 5 MB each · or drop them here`,
  },
  member: {
    edit: (name: string) => `Edit ${name}`,
    delete: (name: string) => `Delete ${name}`,
    saveFailed: (name: string) => `Could not save the change to ${name}. Try again.`,
    saved: (name: string) => `Saved: ${name}.`,
    added: (name: string, photos: number) =>
      photos ? `${name} added with ${photos === 1 ? "a photo" : `${photos} photos`}.` : `${name} added.`,
    addFailed: "Could not add the person. Try again.",
    deleted: (name: string, photos: number) => `${name} deleted, with ${photos === 1 ? "1 photo" : `${photos} photos`}.`,
    deleteFailed: (name: string) => `Could not delete ${name}. They are back in the list.`,
  },
  /** Shared ui/* pieces on caregiver screens. */
  ui: {
    loading: "Loading",
  },
};

export const hi: typeof en = {
  title: (elder) => `परिवार की फ़ोटो${elder ? ` · ${elder}` : ""}`,
  backToPatient: "बुज़ुर्ग के पेज पर वापस",
  privateNote: "ये फ़ोटो निजी हैं: ये सिर्फ़ इन बुज़ुर्ग को और इनसे जुड़े परिवार वालों को दिखती हैं।",
  thePatient: "बुज़ुर्ग",
  photosOff: (first) =>
    `${first} के लिए परिवार की फ़ोटो बंद हैं। “ये कौन हैं?” के लिए फ़ोटो जोड़नी हों तो इन्हें चालू करें। इससे आपकी सहमति दर्ज होती है; बाद में बंद करने पर सारी फ़ोटो हट जाती हैं।`,
  turnOnPhotos: "परिवार की फ़ोटो चालू करें",
  photosOnToast: (first) => `${first} के लिए परिवार की फ़ोटो चालू हो गईं।`,
  photosOnFailed: "परिवार की फ़ोटो चालू नहीं हो पाईं। फिर से कोशिश करें।",
  addAPerson: "किसी को जोड़ें",
  addPeopleHint: (first) => `उन लोगों को जोड़ें जिनसे ${first} अक्सर मिलते हैं, हर एक की फ़ोटो के साथ।`,
  loadingFamily: "परिवार की सूची लोड हो रही है",
  loadFailed: "परिवार की सूची खुल नहीं पाई।",
  emptyTitle: "अभी किसी को नहीं जोड़ा गया",
  emptyBody: (first) =>
    `उन लोगों को जोड़ें जिनसे ${first} अक्सर मिलते हैं, हर एक की एक फ़ोटो के साथ। ये “ये कौन हैं?” में दिखते हैं, और तीन लोगों की फ़ोटो हो जाने पर रोज़ के “आज के बारे में” खेल में भी।`,
  form: {
    name: "नाम",
    nameError: "वह नाम लिखें जिससे बुज़ुर्ग इन्हें जानते हैं।",
    relation: "रिश्ता",
    relationCustom: "रिश्ता (अपने शब्दों में)",
    relationPlaceholder: "जैसे पड़ोसी",
    note: "नोट (ज़रूरी नहीं, बुज़ुर्ग को पढ़कर सुनाया जाता है)",
    notePlaceholder: "जैसे पुणे में रहते हैं, रविवार को मिलने आते हैं।",
    saveChanges: "बदलाव सेव करें",
    addPerson: "जोड़ें",
    photosOptional: "फ़ोटो (ज़रूरी नहीं)",
    choosePhotos: "फ़ोटो चुनें",
    queueNote: (max) => `${max} तक · JPG या PNG · या यहाँ छोड़ें`,
    photosToAdd: "जोड़ी जाने वाली फ़ोटो",
    removeFile: (fileName) => `${fileName} हटाएँ`,
  },
  photos: {
    onlyJpgPng: "सिर्फ़ JPG और PNG फ़ोटो ही चल सकती हैं।",
    tooBig: "हर फ़ोटो 5 MB या उससे छोटी होनी चाहिए।",
    fileIssue: (fileName, issue) => `${fileName}: ${issue}`,
    alreadyFull: (max) => `इनकी पहले से ${max} फ़ोटो हैं।`,
    onlyFit: (n, max) =>
      n === 1
        ? `सिर्फ़ 1 और फ़ोटो आ सकती है (हर व्यक्ति की ${max}), इसलिए पहली फ़ोटो जोड़ी जा रही है।`
        : `सिर्फ़ ${n} और फ़ोटो आ सकती हैं (हर व्यक्ति की ${max}), इसलिए पहली ${n} जोड़ी जा रही हैं।`,
    uploadingLabel: (index, total) => (total > 1 ? `${total} में से फ़ोटो ${index} अपलोड हो रही है` : "फ़ोटो अपलोड हो रही है"),
    uploadingProgress: (index, total, percent) => `अपलोड हो रही है${total > 1 ? ` ${index}/${total}` : ""} · ${percent}%`,
    preparing: "तैयार हो रही है…",
    photosOf: (name) => `${name} की फ़ोटो`,
    dropHere: "फ़ोटो यहाँ छोड़ें",
    uploadFailed: (fileName, reason) => `${fileName ?? "फ़ोटो"} अपलोड नहीं हो पाई। ${reason}`,
    saved: (n) => (n === 1 ? "फ़ोटो सेव हो गई।" : `${n} फ़ोटो सेव हो गईं।`),
    removed: (index, name) => `${name} की फ़ोटो ${index} हटा दी गई।`,
    removeFailed: "फ़ोटो हटाई नहीं जा सकी। वह वापस आ गई है।",
    alt: (name, index) => `${name}, फ़ोटो ${index}`,
    removeLabel: (name, index) => `${name} की फ़ोटो ${index} हटाएँ`,
    addHint: (elder, name) => `फ़ोटो जोड़ें, ताकि ${elder} “ये कौन हैं?” में ${name} को देख सकें।`,
    uploading: "अपलोड हो रही है…",
    addPhotos: "फ़ोटो जोड़ें",
    note: (count, max) => `${count} / ${max} फ़ोटो · JPG या PNG, हर एक 5 MB तक · या यहाँ छोड़ें`,
  },
  member: {
    edit: (name) => `${name} को बदलें`,
    delete: (name) => `${name} को हटाएँ`,
    saveFailed: (name) => `${name} का बदलाव सेव नहीं हुआ। फिर से कोशिश करें।`,
    saved: (name) => `सेव हो गया: ${name}।`,
    added: (name, photos) =>
      photos ? `${name} ${photos === 1 ? "एक फ़ोटो" : `${photos} फ़ोटो`} के साथ जुड़ गए।` : `${name} जुड़ गए।`,
    addFailed: "यह व्यक्ति नहीं जुड़ पाया। फिर से कोशिश करें।",
    deleted: (name, photos) => `${name} हटा दिए गए, ${photos === 1 ? "1 फ़ोटो" : `${photos} फ़ोटो`} के साथ।`,
    deleteFailed: (name) => `${name} को हटाया नहीं जा सका। वे फिर से सूची में हैं।`,
  },
  ui: {
    loading: "लोड हो रहा है",
  },
};
