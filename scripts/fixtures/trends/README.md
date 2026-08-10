# Synthetic trend fixtures

**Every row in this directory is invented.** None of it came from Semrush, from
Exploding Topics, or from any real export. These files exist so the importer,
the taxonomy, the matcher and the ranking term can be tested and red-proved
without depending on private source data.

The numbers are chosen to exercise decision boundaries, not to resemble reality:

| fixture | what it proves |
|---|---|
| `valid.csv` | the happy path, plus one row per rejection class |
| `unknown-schema.csv` | a file that is not an Exploding Topics export fails loudly |
| `missing-growth.csv` | required columns present but no observed-growth column |
| `empty-required.csv` | an empty required cell is a malformed row, never a zero |
| `duplicate.csv` | the same `topic id` twice — deterministic first-wins dedup |
| `formula-injection.csv` | `=`, `+`, `@`-prefixed cells are neutralised |
| `malformed.csv` | an unterminated quoted field is a hard failure |

**The column headers here are a HYPOTHESIS.** They were written without ever
opening the owner's export. When the first real import runs, `validateSchema()`
will name any header it does not recognise, and the fix is to add the real
spelling to `COLUMN_SPECS` in `lib/trendCsv.js`. Do not rename headers in the
real export by hand to make them fit — that makes the import unreproducible.

Real exports must never be committed. `.gitignore` covers the private import
path and `*-exploding-topics*.csv`.
