import type { FestivalId } from "./index";

/**
 * 2027 dates from the Government of India list of holidays for central government offices in
 * Delhi (DoPT O.M. F. No. 12/2/2023-JCA of 16 July 2026: gazetted and restricted lists).
 * Id-ul-Fitr, Id-ul-Zuha, Muharram and Milad-un-Nabi depend on the
 * sighting of the moon. Durga Puja = Maha Ashtami.
 */
export const FESTIVALS_2027: Readonly<Record<FestivalId, string>> = {
  makar_sankranti: "2027-01-14",
  pongal: "2027-01-15",
  eid_ul_fitr: "2027-03-10",
  holi: "2027-03-23",
  vaisakhi: "2027-04-14",
  bakrid: "2027-05-17",
  muharram: "2027-06-16",
  milad_un_nabi: "2027-08-15",
  raksha_bandhan: "2027-08-17",
  janmashtami: "2027-08-25",
  ganesh_chaturthi: "2027-09-04",
  onam: "2027-09-12",
  durga_puja: "2027-10-07",
  dussehra: "2027-10-09",
  diwali: "2027-10-29",
  guru_nanak_jayanti: "2027-11-14",
  christmas: "2027-12-25",
};
