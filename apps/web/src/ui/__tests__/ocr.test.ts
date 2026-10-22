import { describe, expect, it } from "vitest";
import { zaehlerstandKandidaten } from "../ocr";

describe("zaehlerstandKandidaten", () => {
  it("extracts distinct numeric readings and normalizes decimal commas", () => {
    expect(zaehlerstandKandidaten("Stand: 01234,5\n01234,5 m³\n7.25"))
      .toEqual(["01234.5", "7.25"]);
  });

  it("returns no candidates when OCR finds no digits", () => {
    expect(zaehlerstandKandidaten("keine lesbaren Ziffern")).toEqual([]);
  });
});
