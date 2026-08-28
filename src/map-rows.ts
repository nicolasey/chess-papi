import { FIDE_TITLE_CODES, FideTitle, Licence, RatingType, Sex } from "./papi.enums";
import type { PapiClub, PapiPlayer, PapiRating, PapiRow } from "./papi.types";

/**
 * PAPI pads fixed-width text columns with spaces and uses the blank string
 * where a real database would use NULL. `"  "` is not a FIDE title and
 * `"00695530  "` is not a FIDE ID.
 */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function int(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function enumOrNull<T extends Record<string, string>>(
  e: T,
  value: unknown,
): T[keyof T] | null {
  const code = str(value);
  if (code === null) return null;
  return (Object.values(e) as string[]).includes(code) ? (code as T[keyof T]) : null;
}

function date(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = str(value);
  if (raw === null) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rating(elo: unknown, type: unknown): PapiRating {
  return { elo: int(elo), type: enumOrNull(RatingType, type) };
}

/**
 * Decode a `FideTitre` code.
 *
 * Returns `null` for the blank code and for anything not in the table — the
 * caller keeps `titleCode` for that case, so nothing is silently dropped.
 */
export function mapTitle(code: unknown): FideTitle | null {
  const key = str(code);
  return key === null ? null : (FIDE_TITLE_CODES[key.toLowerCase()] ?? null);
}

/**
 * `Cat` packs the age category and the sex into one field: `"SenM"`, `"PouF"`.
 * The sex is already its own column, so only the category is kept.
 */
export function mapCategory(cat: unknown): string | null {
  const raw = str(cat);
  if (raw === null) return null;
  const category = raw.replace(/[MF]$/, "");
  return category === "" ? null : category;
}

/** Map one `JOUEUR` row. Pure — takes a row, returns a player. */
export function mapPlayer(row: PapiRow): PapiPlayer {
  const clubRef = int(row.ClubRef);

  return {
    ref: int(row.Ref) ?? 0,
    ffeId: str(row.NrFFE) ?? "",
    fideId: str(row.FideCode),

    lastName: str(row.Nom) ?? "",
    firstName: str(row.Prenom) ?? "",
    sex: enumOrNull(Sex, row.Sexe),
    birthDate: date(row.NeLe),

    category: mapCategory(row.Cat),
    federation: str(row.Federation),
    // Ref 0 is PAPI's "no club", not a club whose ref happens to be zero.
    clubRef: clubRef === 0 ? null : clubRef,
    licence: enumOrNull(Licence, row.AffType),
    activeUntil: int(row.Actif),

    title: mapTitle(row.FideTitre),
    titleCode: str(row.FideTitre),

    ratings: {
      standard: rating(row.Elo, row.Fide),
      rapid: rating(row.Rapide, row.RapideFide),
      blitz: rating(row.Blitz, row.BlitzFide),
    },
  };
}

/** Map one `CLUB` row. Pure — takes a row, returns a club. */
export function mapClub(row: PapiRow): PapiClub {
  return {
    ref: int(row.Ref) ?? 0,
    ffeId: str(row.NrFFE) ?? "",
    name: str(row.Nom) ?? "",
    ligue: str(row.Ligue),
    town: str(row.Commune),
    activeUntil: int(row.Actif),
  };
}
