# @nicolasey/chess-papi

Reads players and clubs out of **PAPI**, the French Chess Federation's national
database — the `Data.mdb` file behind every FFE rating lookup.

PAPI ships as a Microsoft Access database, which is why importing it is usually
someone's afternoon. This package hands you typed records and stops there: no
database, no filesystem, no network. What you do with 644,000 players is your
business.

## Install

```bash
bun add @nicolasey/chess-papi
# or
npm install @nicolasey/chess-papi
```

> Ships as TypeScript source, no build step. Works with Bun and with any
> bundler or `tsconfig` using `moduleResolution: "bundler"`.

## Getting the file

The FFE publishes it at `https://www.echecs.asso.fr/Papi/PapiData.zip`, which
unzips to `Data.mdb`. Downloading and unzipping are left to you — that keeps
this package free of a network stack and usable offline.

## Usage

```ts
import { readFileSync } from "node:fs";
import { readClubs, readPlayers } from "@nicolasey/chess-papi";

const buffer = readFileSync("Data.mdb");

readClubs(buffer);
// [{ ref: 22, ffeId: "B68067", name: "Les Cheiks de Brossolette",
//    ligue: "EST", town: "MULHOUSE", activeUntil: 2024 }, ...]

readPlayers(buffer, { limit: 1 });
// [{ ref: 77, ffeId: "A00031", fideId: "00695530",
//    lastName: "ADAM", firstName: "Serge", sex: "M",
//    birthDate: 1930-12-26T00:00:00.000Z,
//    category: "Vet", federation: "FRA", clubRef: 1479,
//    licence: "N", activeUntil: 2026,
//    title: null, titleCode: null,
//    ratings: {
//      standard: { elo: 1798, type: "F" },
//      rapid:    { elo: 1820, type: "N" },
//      blitz:    { elo: 1820, type: "N" },
//    } }]
```

It takes **bytes, never a path**, so the same code runs under Node, Bun, Tauri
and the browser — each of which gets at the file its own way.

```ts
// Tauri
import { readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
const buffer = await readFile("Data.mdb", { baseDir: BaseDirectory.AppLocalData });
```

## Reading the whole national file

The national file holds over 640,000 players. `readPlayers(buffer)` maps every
one of them into a single array, which is rarely what you want.

```ts
import { streamPlayers, openPapi, countPlayers } from "@nicolasey/chess-papi";

const reader = openPapi(buffer);       // parse the file once, reuse it
countPlayers(reader);                  // 644433 — without reading a row

for (const batch of streamPlayers(reader, 5000)) {
  await db.insert(players).values(batch);
}
```

Pass the reader from `openPapi` rather than the buffer when you make several
calls; otherwise each call re-parses the file.

## What the data is actually like

Four things about PAPI that will bite you, and how this package handles them.

**Text columns are space-padded.** The FIDE ID arrives as `"00695530  "` and an
absent title as `"  "`. Every text field is trimmed, and a field that trims to
nothing becomes `null` rather than an empty string.

**`ClubRef` is `0` for an unattached player.** That is a sentinel, not a club
whose reference happens to be zero, so it maps to `null`.

**A club reference can point at a club the file does not carry.** `CLUB` lists
clubs registered for the current season; a player keeps the reference of a club
that has since folded. On the file this was built against, **about 5% of
attached players do not resolve**. Plan for the miss:

```ts
const byRef = new Map(readClubs(buffer).map((c) => [c.ref, c]));
const club = player.clubRef !== null ? byRef.get(player.clubRef) ?? null : null;
```

**`Cat` packs two fields into one.** `"SenM"` is category `Sen` and sex `M`. The
sex is already its own column, so `category` carries only `"Sen"`.

## Ratings

Each time control carries its own rating **and its own source**. A player can
hold a FIDE standard rating and a national blitz rating at the same time, so the
two travel together:

```ts
type PapiRating = { elo: number | null; type: RatingType | null };
```

| `RatingType` | Meaning |
|---|---|
| `FIDE` (`"F"`) | FIDE rating |
| `NATIONAL` (`"N"`) | National FFE rating |
| `ESTIMATED` (`"E"`) | Estimated — no rated game played yet |

Treating an estimated rating as a played one is the classic way to corrupt a
league table. The source is kept next to the number so you cannot lose it.

## Titles

`FideTitre` is a two-character code: the letter is the title, a trailing `f`
marks the women's title.

| Code | `FideTitle` |
|---|---|
| `g` | `GM` |
| `m` | `IM` |
| `f` | `FM` |
| `gf` | `WGM` |
| `mf` | `WIM` |
| `ff` | `WFM` |

A code outside this table gives `title: null` — but the trimmed original is
always kept in `titleCode`, so an unmapped title is never silently dropped.

## API

| Export | Description |
|---|---|
| `readPlayers(source, options?)` | Players, mapped. `options`: `{ offset, limit }` |
| `readClubs(source, options?)` | Clubs, mapped |
| `streamPlayers(source, batchSize?)` | Generator yielding batches, default 5000 |
| `countPlayers(source)` | Row count, without reading rows |
| `openPapi(buffer)` | Parse once, reuse across calls |
| `mapPlayer(row)` · `mapClub(row)` | Pure row mappers, if you read the tables yourself |
| `mapTitle(code)` · `mapCategory(cat)` | The two field decoders, exported for reuse |

`source` is a `Buffer`, a `Uint8Array`, or a reader from `openPapi`.

Types: `PapiPlayer`, `PapiClub`, `PapiRating`, `PapiRow`, `ReadOptions`.
Enums: `Sex`, `RatingType`, `Licence`, `FideTitle`.

## Scope

Reads the `JOUEUR` and `CLUB` tables of the national PAPI export. Tournament
files produced by the PAPI desktop application have a different schema and are
not supported.

Column names and value domains were taken from a real national file. If the FFE
changes the format, this breaks — `readPlayers` will tell you which tables it
did find.

## Development

```bash
bun install
bun test                                  # unit tests, no data file needed
PAPI_FILE=/path/to/Data.mdb bun test      # plus integration tests
```

The row mappers are pure functions over plain objects, so the unit suite runs
against fixture rows copied out of a real file. The 20 MB database is only
needed for the integration tests, and is not committed.

## Credits

Access parsing is done by [mdb-reader](https://github.com/andipaetzold/mdb-reader).

## License

MIT. See [LICENSE](LICENSE).
