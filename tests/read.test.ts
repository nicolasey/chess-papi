import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import MDBReader from "mdb-reader";
import { countPlayers, openPapi, readClubs, readPlayers, streamPlayers } from "../src/read";

/**
 * A reader that reports the tables it is told to, and holds no data.
 *
 * The "table is missing" branch needs an Access file without a JOUEUR table,
 * which cannot be produced here — mdb-reader only reads. Borrowing the
 * prototype satisfies the `instanceof` check so the guard itself is exercised.
 */
function readerWithTables(names: string[]): MDBReader {
  const reader = Object.create(MDBReader.prototype) as MDBReader;
  reader.getTableNames = () => names;
  return reader;
}

/**
 * Integration tests against a real national PAPI file.
 *
 * The file is ~20 MB and is not committed. Point PAPI_FILE at a copy to run
 * these; without it they skip, so the suite stays green in CI.
 */
const PAPI_FILE = process.env.PAPI_FILE;
const hasFile = PAPI_FILE !== undefined && existsSync(PAPI_FILE);

describe("readTable", () => {
  test("says what it found when the file is not a PAPI database", () => {
    // An empty buffer is not an Access file at all.
    expect(() => readClubs(Buffer.alloc(0))).toThrow();
  });

  test("names the tables it did find when the expected one is absent", () => {
    // The real case: an Access file that is not a PAPI export. The message has
    // to say what arrived, or the caller has nothing to go on.
    const reader = readerWithTables(["CLUB", "TOURNOI"]);

    expect(() => readPlayers(reader)).toThrow(/"JOUEUR" not found/);
    expect(() => readPlayers(reader)).toThrow(/CLUB, TOURNOI/);
    expect(() => readPlayers(reader)).toThrow(/Is it a PAPI database\?/);
  });

  test("handles a file with no tables at all", () => {
    expect(() => readClubs(readerWithTables([]))).toThrow(/no tables/);
  });
});

describe("streamPlayers", () => {
  test("rejects a batch size that would not terminate", () => {
    expect(() => [...streamPlayers(Buffer.alloc(0), 0)]).toThrow(RangeError);
    expect(() => [...streamPlayers(Buffer.alloc(0), -1)]).toThrow(RangeError);
    expect(() => [...streamPlayers(Buffer.alloc(0), 1.5)]).toThrow(RangeError);
  });
});

describe.skipIf(!hasFile)("against a real PAPI file", () => {
  const buffer = hasFile ? readFileSync(PAPI_FILE!) : Buffer.alloc(0);

  test("reads clubs", () => {
    const clubs = readClubs(buffer);

    expect(clubs.length).toBeGreaterThan(500);
    expect(clubs[0]!.ref).toBeGreaterThan(0);
    expect(clubs[0]!.name).not.toBe("");
  });

  test("reads players", () => {
    const players = readPlayers(buffer, { limit: 500 });

    expect(players).toHaveLength(500);
    for (const player of players) {
      expect(player.ffeId).not.toBe("");
      expect(player.fideId).not.toBe("");
      expect(player.titleCode).not.toBe("");
      expect(player.clubRef).not.toBe(0);
    }
  });

  test("counts without reading", () => {
    expect(countPlayers(buffer)).toBeGreaterThan(100_000);
  });

  test("a club ref can point at a club the file does not carry", () => {
    // CLUB lists clubs active in the current season; a player keeps the ref of
    // a club that has since folded. Around 5% of attached players do not
    // resolve. Any consumer joining on clubRef has to tolerate the miss —
    // indexing and calling .id on the result will throw on real data.
    const refs = new Set(readClubs(buffer).map((c) => c.ref));
    const attached = readPlayers(buffer, { limit: 5000 }).filter((p) => p.clubRef !== null);
    const orphans = attached.filter((p) => !refs.has(p.clubRef!));

    expect(attached.length).toBeGreaterThan(0);
    expect(orphans.length).toBeGreaterThan(0);
    expect(orphans.length / attached.length).toBeLessThan(0.2);
  });

  test("streams the same rows the offset walk gives", () => {
    const reader = openPapi(buffer);
    const streamed = streamPlayers(reader, 250).next().value ?? [];

    expect(streamed).toEqual(readPlayers(reader, { offset: 0, limit: 250 }));
  });

  test("offset skips exactly that many rows", () => {
    const reader = openPapi(buffer);
    const head = readPlayers(reader, { limit: 110 });

    // Reading from 100 must land on row 100, not back at the start. Without
    // this, a stream built on offset can repeat its first batch forever.
    expect(readPlayers(reader, { offset: 100, limit: 10 })).toEqual(head.slice(100, 110));
    expect(readPlayers(reader, { offset: 1, limit: 1 })).toEqual(head.slice(1, 2));
    expect(readPlayers(reader, { offset: 100, limit: 10 })).not.toEqual(head.slice(0, 10));
  });

  test("streaming yields every player exactly once", () => {
    // The failure this exists for: a stream that quietly drops rows still
    // looks healthy — the import runs, the data is just incomplete. Checking
    // the first batch cannot see it. Only the total can.
    const reader = openPapi(buffer);
    const expected = countPlayers(reader);

    let seen = 0;
    let batches = 0;
    const refs = new Set<number>();
    for (const batch of streamPlayers(reader, 50_000)) {
      batches++;
      seen += batch.length;
      for (const player of batch) refs.add(player.ref);
    }

    expect(seen).toBe(expected);
    expect(batches).toBe(Math.ceil(expected / 50_000));
    // Distinct refs rule out a batch being served twice to make up the count.
    expect(refs.size).toBe(expected);
  }, 60_000);

  test("a batch size that does not divide the total still ends cleanly", () => {
    const reader = openPapi(buffer);
    const total = countPlayers(reader);
    const batchSize = 7_777;

    const sizes = [...streamPlayers(reader, batchSize)].map((b) => b.length);

    expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
    // Every batch is full except the last, which carries the remainder.
    expect(sizes.slice(0, -1).every((n) => n === batchSize)).toBe(true);
    expect(sizes.at(-1)).toBe(total % batchSize || batchSize);
  }, 60_000);
});
