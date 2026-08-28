export enum Sex {
  MALE = "M",
  FEMALE = "F",
}

/**
 * Where a rating comes from, as PAPI records it.
 *
 * A player can hold a FIDE rating for standard and a national one for blitz,
 * so this is recorded per time control, not per player.
 */
export enum RatingType {
  /** FIDE rating */
  FIDE = "F",
  /** National (FFE) rating */
  NATIONAL = "N",
  /** Estimated — no rated game played yet */
  ESTIMATED = "E",
}

/**
 * FFE licence type.
 *
 * @see AffType column
 */
export enum Licence {
  /** Licence A — full, allows official competition */
  A = "A",
  /** Licence B — restricted */
  B = "B",
  /** No licence for the current season */
  NONE = "N",
}

/**
 * FIDE titles, as encoded in the two-character PAPI `FideTitre` column.
 *
 * The first character is the title, a trailing `f` marks the women's title:
 * `g` grandmaster, `m` international master, `f` FIDE master.
 */
export enum FideTitle {
  GM = "GM",
  IM = "IM",
  FM = "FM",
  WGM = "WGM",
  WIM = "WIM",
  WFM = "WFM",
}

export const FIDE_TITLE_CODES: Readonly<Record<string, FideTitle>> = Object.freeze({
  g: FideTitle.GM,
  m: FideTitle.IM,
  f: FideTitle.FM,
  gf: FideTitle.WGM,
  mf: FideTitle.WIM,
  ff: FideTitle.WFM,
});
