// English caregiver text: the source Hindi follows (Round 2 batch 5b). Each screen group has its own
// file in ./sections (English `en` and Hindi `hi`, same shape); src/t.ts picks the caregiver's language.
// Review file for translators: docs/i18n/review.md, "Caregiver screens" (npm run i18n:review).
import * as account from "./sections/account";
import * as common from "./sections/common";
import * as dashboard from "./sections/dashboard";
import * as elderPage from "./sections/elderPage";
import * as elderPanels from "./sections/elderPanels";
import * as family from "./sections/family";
import * as memoryBook from "./sections/memoryBook";
import * as reminders from "./sections/reminders";
import * as report from "./sections/report";
import * as server from "./sections/server";

export const cgEn = {
  common: common.en,
  dashboard: dashboard.en,
  elderPage: elderPage.en,
  elderPanels: elderPanels.en,
  reminders: reminders.en,
  family: family.en,
  memoryBook: memoryBook.en,
  report: report.en,
  account: account.en,
  server: server.en,
};

export type CgCopy = typeof cgEn;

export const cgHi: CgCopy = {
  common: common.hi,
  dashboard: dashboard.hi,
  elderPage: elderPage.hi,
  elderPanels: elderPanels.hi,
  reminders: reminders.hi,
  family: family.hi,
  memoryBook: memoryBook.hi,
  report: report.hi,
  account: account.hi,
  server: server.hi,
};
