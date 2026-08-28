import type { FideTitle, Licence, RatingType, Sex } from "./papi.enums";

/** A rating and the source it comes from, for one time control. */
export type PapiRating = {
  elo: number | null;
  type: RatingType | null;
};

export type PapiPlayer = {
  /** PAPI internal reference. Stable, and what `PapiClub.ref` is joined on. */
  ref: number;
  /** FFE licence number, e.g. `"A00031"`. */
  ffeId: string;
  /** FIDE ID, trimmed. `null` when the player has none. */
  fideId: string | null;

  lastName: string;
  firstName: string;
  sex: Sex | null;
  birthDate: Date | null;

  /** Age category code without its sex suffix, e.g. `"Sen"` from `"SenM"`. */
  category: string | null;
  /** Three-letter federation code, e.g. `"FRA"`. */
  federation: string | null;
  /** `PapiClub.ref` of the player's club. `null` when unattached. */
  clubRef: number | null;
  licence: Licence | null;
  /** Last season the player is licensed for, e.g. `2026`. */
  activeUntil: number | null;

  title: FideTitle | null;
  /** Raw `FideTitre` code, trimmed. Kept so an unmapped code is never lost. */
  titleCode: string | null;

  ratings: {
    standard: PapiRating;
    rapid: PapiRating;
    blitz: PapiRating;
  };
};

export type PapiClub = {
  /** PAPI internal reference. Join `PapiPlayer.clubRef` on this. */
  ref: number;
  /** FFE club number, e.g. `"B68067"`. */
  ffeId: string;
  name: string;
  /** Regional league code, e.g. `"EST"`. */
  ligue: string | null;
  town: string | null;
  /** Last season the club is registered for, e.g. `2024`. */
  activeUntil: number | null;
};

/** A raw row as `mdb-reader` returns it. */
export type PapiRow = Record<string, unknown>;

export type ReadOptions = {
  /** Rows to skip. Use with `limit` to read a 644k-row table in chunks. */
  offset?: number;
  /** Maximum rows to read. */
  limit?: number;
};
