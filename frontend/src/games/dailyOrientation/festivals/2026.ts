import type { FestivalId } from "./index";

/**
 * 2026 dates from the Government of India list of holidays for central government offices in
 * Delhi (DoPT O.M. of 3 July 2025, Annexures I and II). Id-ul-Fitr and Id-ul-Zuha depend on the
 * sighting of the moon and may move by a day. Durga Puja = Maha Ashtami.
 */
export const FESTIVALS_2026: Readonly<Record<FestivalId, string>> = {
  makar_sankranti: "2026-01-14",
  pongal: "2026-01-14",
  holi: "2026-03-04",
  eid_ul_fitr: "2026-03-21",
  vaisakhi: "2026-04-14",
  bakrid: "2026-05-27",
  onam: "2026-08-26",
  raksha_bandhan: "2026-08-28",
  janmashtami: "2026-09-04",
  ganesh_chaturthi: "2026-09-14",
  durga_puja: "2026-10-19",
  dussehra: "2026-10-20",
  diwali: "2026-11-08",
  guru_nanak_jayanti: "2026-11-24",
  christmas: "2026-12-25",
};
