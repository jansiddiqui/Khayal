import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en, relationId } from "./en";
import { hi } from "./hi";
import { ur } from "./ur";

describe("relations: a son's and a daughter's children (batch 5b follow-up)", () => {
  it("reads stored relations, old and new", () => {
    expect(relationId("Grandson (son's son)")).toBe("sons_son");
    expect(relationId("grandson (DAUGHTER'S son)")).toBe("daughters_son");
    expect(relationId("Granddaughter (daughter's daughter)")).toBe("daughters_daughter");
    expect(relationId("Grandson")).toBe("grandson");
    expect(relationId("Neighbour")).toBeNull();
  });

  it("tells the elder who it is, in each language", () => {
    expect(en.whoIsThis.thisIs("Ravi", "Grandson (daughter's son)")).toBe("This is Ravi, your grandson.");
    expect(hi.whoIsThis.thisIs("Ravi", "Grandson (daughter's son)")).toBe("ये Ravi हैं, आपके नाती।");
    expect(hi.whoIsThis.thisIs("Rahul", "Grandson (son's son)")).toBe("ये Rahul हैं, आपके पोते।");
    expect(hi.whoIsThis.thisIs("Isha", "Granddaughter (daughter's daughter)")).toBe("ये Isha हैं, आपकी नातिन।");
    expect(ur.whoIsThis.thisIs("Ravi", "Grandson (daughter's son)")).toBe("یہ Ravi ہیں، آپ کے نواسے۔");
    expect(ur.whoIsThis.thisIs("Isha", "Granddaughter (daughter's daughter)")).toBe("یہ Isha ہیں، آپ کی نواسی۔");
    // Older records still work.
    expect(hi.whoIsThis.thisIs("Rahul", "Grandson")).toBe("ये Rahul हैं, आपके पोते।");
    expect(en.whoIsThis.thisIs("Sunil", "Neighbour")).toBe("This is Sunil, your neighbour.");
  });

  it("labels a photo with the relation word, not the stored English", () => {
    expect(en.whoIsThis.relationName("Granddaughter (son's daughter)")).toBe("Granddaughter");
    expect(hi.whoIsThis.relationName("Granddaughter (son's daughter)")).toBe("पोती");
    expect(hi.whoIsThis.relationName("Grandson (daughter's son)")).toBe("नाती");
    expect(ur.whoIsThis.relationName("Grandson (daughter's son)")).toBe("نواسا");
    expect(hi.whoIsThis.relationName("Other")).toBe("");
    expect(hi.whoIsThis.relationName("Neighbour")).toBe("Neighbour");
  });
});

describe("caregiver screens in Hindi", () => {
  afterEach(() => {
    localStorage.removeItem("khayal.cgLang");
    vi.resetModules();
  });

  async function inHindi() {
    localStorage.setItem("khayal.cgLang", "hi");
    vi.resetModules();
  }

  it("shows the new relations as पोता / नाती, पोती / नातिन", async () => {
    await inHindi();
    const { t } = await import("../t");
    expect(t.common.relations["Grandson (son's son)"]).toBe("पोता");
    expect(t.common.relations["Grandson (daughter's son)"]).toBe("नाती");
    expect(t.common.relations["Granddaughter (son's daughter)"]).toBe("पोती");
    expect(t.common.relations["Granddaughter (daughter's daughter)"]).toBe("नातिन");
    expect(t.common.relations.Grandson).toBe("पोता या नाती");
  });

  it("translates the server's upload reasons, numbers kept", async () => {
    await inHindi();
    const { serverReason } = await import("../t");
    expect(serverReason("Photos must be 5 MB or smaller.")).toBe("फ़ोटो 5 MB या उससे छोटी होनी चाहिए।");
    expect(serverReason("Each person can have up to 5 photos.")).toBe("हर व्यक्ति की ज़्यादा से ज़्यादा 5 फ़ोटो हो सकती हैं।");
    expect(serverReason("Only JPG and PNG photos are allowed.")).toBe("सिर्फ़ JPG और PNG फ़ोटो ही चलती हैं।");
    expect(serverReason("A reason we don't know.")).toBe("A reason we don't know.");
  });

  it("names core games with the elder titles in the caregiver's language", async () => {
    await inHindi();
    const { gameLabel } = await import("../components/caregiver/GamesSettings");
    expect(gameLabel("word_recall")).toBe(`शब्द याद करना — “${hi.games.wordRecall.title}”`);
  });

  it("keeps older plain relations editable, and offers the new ones", async () => {
    vi.resetModules();
    const { MemberForm } = await import("../pages/caregiver/Family");
    const { renderWithProviders } = await import("../test/renderWithProviders");
    renderWithProviders(
      <MemberForm initial={{ name: "Rahul", relation: "Grandson", note: null }} submitLabel="Save" busy={false} onSubmit={() => undefined} />,
    );
    const select = screen.getByRole("combobox", { name: "Relation" });
    expect(select).toHaveValue("Grandson");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Grandson (daughter's son)");
    expect(options).toContain("Granddaughter (son's daughter)");
    fireEvent.change(select, { target: { value: "Grandson (son's son)" } });
    expect(select).toHaveValue("Grandson (son's son)");
  });
});
