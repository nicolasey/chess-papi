import MDBReader from "mdb-reader";
import { mapClub, mapPlayer } from "./map-rows";
import type { PapiClub, PapiPlayer, PapiRow, ReadOptions } from "./papi.types";

const PLAYERS_TABLE = "JOUEUR";
const CLUBS_TABLE = "CLUB";

/**
 * Open a PAPI database.
 *
 * Takes the bytes, never a path — so the same code runs under Node, Bun, Tauri
 * and the browser, each of which gets at the file its own way.
 */
export function openPapi(buffer: Buffer | Uint8Array): MDBReader {
  return new MDBReader(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
}

function readTable(
  source: Buffer | Uint8Array | MDBReader,
  table: string,
  options: ReadOptions = {},
): PapiRow[] {
  const reader = source instanceof MDBReader ? source : openPapi(source);
  const names = reader.getTableNames();
  if (!names.includes(table)) {
    throw new Error(
      `Table "${table}" not found. This file has: ${names.join(", ") || "no tables"}. Is it a PAPI database?`,
    );
  }
  return reader.getTable(table).getData({
    rowOffset: options.offset,
    rowLimit: options.limit,
  }) as PapiRow[];
}

/**
 * Read the club list.
 *
 * @param source PAPI file bytes, or a reader from `openPapi`
 */
export function readClubs(
  source: Buffer | Uint8Array | MDBReader,
  options?: ReadOptions,
): PapiClub[] {
  return readTable(source, CLUBS_TABLE, options).map(mapClub);
}

/**
 * Read the player list.
 *
 * The national file holds well over half a million players. Reading it whole
 * costs roughly a gigabyte of heap; pass `offset` and `limit` to walk it in
 * chunks, or use `streamPlayers`.
 *
 * @param source PAPI file bytes, or a reader from `openPapi`
 */
export function readPlayers(
  source: Buffer | Uint8Array | MDBReader,
  options?: ReadOptions,
): PapiPlayer[] {
  return readTable(source, PLAYERS_TABLE, options).map(mapPlayer);
}

/** Number of players in the file, without reading any of them. */
export function countPlayers(source: Buffer | Uint8Array | MDBReader): number {
  const reader = source instanceof MDBReader ? source : openPapi(source);
  return reader.getTable(PLAYERS_TABLE).rowCount;
}

/**
 * Read players in chunks.
 *
 * Yields one batch at a time so a full national import stays flat in memory
 * instead of holding 644k mapped objects at once.
 *
 * ```ts
 * for (const batch of streamPlayers(buffer, 5000)) {
 *   await db.insert(players).values(batch);
 * }
 * ```
 */
export function* streamPlayers(
  source: Buffer | Uint8Array | MDBReader,
  batchSize = 5000,
): Generator<PapiPlayer[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(`batchSize must be a positive integer, got ${batchSize}`);
  }
  const reader = source instanceof MDBReader ? source : openPapi(source);
  const total = countPlayers(reader);

  for (let offset = 0; offset < total; offset += batchSize) {
    yield readPlayers(reader, { offset, limit: batchSize });
  }
}
