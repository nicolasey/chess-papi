import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { countPlayers, openPapi, readClubs, readPlayers, streamPlayers } from "../src/read";

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
});
