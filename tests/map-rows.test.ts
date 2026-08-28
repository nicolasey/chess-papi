import { describe, expect, test } from "bun:test";
import { mapCategory, mapClub, mapPlayer, mapTitle } from "../src/map-rows";
import { FideTitle, Licence, RatingType, Sex } from "../src/papi.enums";

/** A real JOUEUR row, copied verbatim out of a national PAPI file. */
const REAL_ROW = {
  Ref: 77,
  NrFFE: "A00031",
  Nom: "ADAM",
  Prenom: "Serge",
  Sexe: "M",
  NeLe: new Date("1930-12-26T00:00:00.000Z"),
  Cat: "VetM",
  Federation: "FRA",
  ClubRef: 1479,
  Elo: 1798,
  Rapide: 1820,
  Fide: "F",
  RapideFide: "N",
  FideTitre: "  ",
  AffType: "N",
  Actif: "2026",
  Blitz: 1820,
  BlitzFide: "N",
  FideCode: "00695530  ",
};

describe("mapPlayer", () => {
  test("maps a real row", () => {
    const player = mapPlayer(REAL_ROW);

    expect(player.ref).toBe(77);
    expect(player.ffeId).toBe("A00031");
    expect(player.lastName).toBe("ADAM");
    expect(player.firstName).toBe("Serge");
    expect(player.sex).toBe(Sex.MALE);
    expect(player.federation).toBe("FRA");
    expect(player.clubRef).toBe(1479);
    expect(player.licence).toBe(Licence.NONE);
    expect(player.activeUntil).toBe(2026);
    expect(player.birthDate?.getUTCFullYear()).toBe(1930);
  });

  test("trims the padding PAPI puts on fixed-width columns", () => {
    // The bug this guards: "00695530  " is not a FIDE ID, and neither is "".
    expect(mapPlayer(REAL_ROW).fideId).toBe("00695530");
    expect(mapPlayer({ ...REAL_ROW, FideCode: "   " }).fideId).toBeNull();
  });

  test("keeps each rating with the source it came from", () => {
    const { ratings } = mapPlayer(REAL_ROW);

    expect(ratings.standard).toEqual({ elo: 1798, type: RatingType.FIDE });
    expect(ratings.rapid).toEqual({ elo: 1820, type: RatingType.NATIONAL });
    expect(ratings.blitz).toEqual({ elo: 1820, type: RatingType.NATIONAL });
  });

  test("reads the RapideFide column, not RapidFide", () => {
    // Misspelling the column yields undefined, which used to become the
    // string "undefined" downstream rather than a missing value.
    const player = mapPlayer({ ...REAL_ROW, RapideFide: "F" });
    expect(player.ratings.rapid.type).toBe(RatingType.FIDE);

    const misspelled = mapPlayer({ ...REAL_ROW, RapideFide: undefined, RapidFide: "F" });
    expect(misspelled.ratings.rapid.type).toBeNull();
  });

  test("club ref 0 means unattached, not club number zero", () => {
    expect(mapPlayer({ ...REAL_ROW, ClubRef: 0 }).clubRef).toBeNull();
    expect(mapPlayer({ ...REAL_ROW, ClubRef: null }).clubRef).toBeNull();
  });

  test("survives a row with everything missing", () => {
    const player = mapPlayer({});

    expect(player.ref).toBe(0);
    expect(player.lastName).toBe("");
    expect(player.sex).toBeNull();
    expect(player.birthDate).toBeNull();
    expect(player.title).toBeNull();
    expect(player.ratings.standard).toEqual({ elo: null, type: null });
  });

  test("rejects a value outside the enum instead of trusting it", () => {
    expect(mapPlayer({ ...REAL_ROW, Sexe: "X" }).sex).toBeNull();
    expect(mapPlayer({ ...REAL_ROW, Fide: "Z" }).ratings.standard.type).toBeNull();
  });

  test("a non-numeric value in a number column is null, never NaN", () => {
    // NaN survives every arithmetic check downstream and lands in the database
    // as NULL or 0 depending on the driver. It must not get that far.
    const player = mapPlayer({ ...REAL_ROW, Elo: "n/a", Ref: "??", ClubRef: "x" });

    expect(player.ratings.standard.elo).toBeNull();
    expect(player.ref).toBe(0);
    expect(player.clubRef).toBeNull();
    expect(Number.isNaN(player.ratings.standard.elo)).toBe(false);
    expect(Number.isNaN(player.activeUntil)).toBe(false);
  });

  test("parses a date given as a string", () => {
    const player = mapPlayer({ ...REAL_ROW, NeLe: "1982-06-07T00:00:00.000Z" });
    expect(player.birthDate?.getUTCFullYear()).toBe(1982);
  });

  test("an unparseable date is null, never an Invalid Date", () => {
    const player = mapPlayer({ ...REAL_ROW, NeLe: "not a date" });
    expect(player.birthDate).toBeNull();
  });
});

describe("mapTitle", () => {
  test("decodes every code the national file contains", () => {
    expect(mapTitle("g ")).toBe(FideTitle.GM);
    expect(mapTitle("m ")).toBe(FideTitle.IM);
    expect(mapTitle("f ")).toBe(FideTitle.FM);
    expect(mapTitle("gf")).toBe(FideTitle.WGM);
    expect(mapTitle("mf")).toBe(FideTitle.WIM);
    expect(mapTitle("ff")).toBe(FideTitle.WFM);
  });

  test("decodes a code whatever its case", () => {
    // The national file is lowercase, but the code is defensive and has to
    // work, or it should not be there.
    expect(mapTitle("G ")).toBe(FideTitle.GM);
    expect(mapTitle("MF")).toBe(FideTitle.WIM);
    expect(mapTitle("Ff")).toBe(FideTitle.WFM);
  });

  test("blank is no title", () => {
    expect(mapTitle("  ")).toBeNull();
    expect(mapTitle(null)).toBeNull();
  });

  test("an unmapped code is not silently dropped", () => {
    const player = mapPlayer({ ...REAL_ROW, FideTitre: "zz" });

    expect(player.title).toBeNull();
    expect(player.titleCode).toBe("zz");
  });
});

describe("mapCategory", () => {
  test("splits the sex suffix off the age category", () => {
    expect(mapCategory("SenM")).toBe("Sen");
    expect(mapCategory("PouF")).toBe("Pou");
    expect(mapCategory("VetM")).toBe("Vet");
  });

  test("leaves a category carrying no suffix alone", () => {
    expect(mapCategory("Sen")).toBe("Sen");
  });

  test("empty is null", () => {
    expect(mapCategory("  ")).toBeNull();
  });
});

describe("mapClub", () => {
  test("maps a real row", () => {
    const club = mapClub({
      Ref: 22,
      NrFFE: "B68067",
      Nom: "Les Cheiks de Brossolette",
      Ligue: "EST",
      Commune: "MULHOUSE",
      Actif: "2024",
    });

    expect(club).toEqual({
      ref: 22,
      ffeId: "B68067",
      name: "Les Cheiks de Brossolette",
      ligue: "EST",
      town: "MULHOUSE",
      // Stored as text in PAPI; a season is a number.
      activeUntil: 2024,
    });
  });
});
