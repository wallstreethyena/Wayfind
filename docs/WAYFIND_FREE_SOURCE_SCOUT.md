# Wayfind free-source scout pilot

This is a private, dry-run research assistant for up to 500 existing Wayfind
places. It reads manually approved official structured sources and produces
evidence-bearing candidates. It does not publish, merge places, change scores,
call paid providers, or alter the production refresh/shuffle system.

## What it scouts

The first pilot accepts:

- official venue or operator JSON-LD (`Event`, `Place`, selected place subtypes)
- official civic, library, government, venue, or tourism ICS calendars
- official RSS/Atom feeds as discovery leads only

RSS and Atom publication timestamps are **not event dates**. A lead still needs
an explicit date from an authoritative event page, ICS record, ticket system, or
other approved source before publication review.

Yelp and Tripadvisor hosts are blocked. Their public webpages are not a free
replacement for their APIs. This pilot may use facts independently verified on
an approved official venue, government, tourism, or library source; it never
copies Yelp or Tripadvisor pages.

## Safety contract

Every manifest is rejected unless all of these are true:

- 1–500 operational, unflagged, already-owned places
- 1–25 manually approved sources with credential-free HTTPS URLs
- an explicit host allowlist, source class, format, retention window and current
  rights review
- a hard ceiling of at most 100 parsed records per source; hitting it fails the
  source instead of presenting a truncated scan as complete
- internal use and derived-fact permission are true
- provider cost is exactly zero and a finite daily ceiling exists
- raw redistribution and commercial API use are false for the pilot

Live fetching re-checks every redirect, rejects private/local network targets,
caps each response at 1 MB, and times out. Outputs remain `candidate`,
`publishable: false`, and `paid_calls: 0`. An unavailable source is reported
separately from a healthy source containing zero records.

An event is linked only when its literal location name matches exactly one of
the owned places assigned to that source. A single-place source may link a
location-less record as a candidate. Multi-place feeds never spray one event
across every venue.
RSS/Atom leads from multi-place feeds remain source-scoped and unassigned until
an authoritative event page supplies a unique venue identity.

## Run a reviewed pilot

Copy `examples/scout-manifest.json` to a private ignored directory and replace
the placeholder with reviewed Wayfind place IDs and real approved source policy.
Then run:

```bash
cd tools/python
uv sync --locked --no-dev
uv run --locked --no-dev wayfind-scout \
  --manifest private/scout-manifest.json \
  --out reports/scout-YYYYMMDD.json
```

Choose a new output path every time. The CLI never overwrites evidence.
Candidate output may contain source URLs and descriptions, so keep it private
and delete it by the shortest source retention deadline.

## How descriptions improve

The scout creates an editorial research packet for each place. A packet marked
`research_ready` means approved evidence exists; it does not mean the prose is
approved. A human or a model may draft from that packet, but every new claim must
remain traceable to evidence and a human must review it before `wf_editorial` can
serve it. Missing evidence produces `insufficient_evidence`, not invented copy.
The deterministic scout itself uses zero model tokens. Model drafting is a later,
separately metered step rather than a hidden cost of collection.

## Pilot scoreboard

Start in Manatee–Sarasota with official libraries, museums, parks, theatres,
public venues, tourism boards, and government calendars. Use up to 25 approved
domains and no more than 500 matching owned places. Measure:

- sources fetched, unavailable, and healthy-empty
- event candidates and RSS discovery leads
- duplicate-candidate groups
- places with enough evidence for an editorial draft
- candidates accepted or rejected by a human reviewer
- stale/incorrect fact rate
- paid provider calls (must remain zero)

The next release step is a reviewed source registry and private candidate table.
Do not stretch the social-candidate tables into this job and do not schedule or
publish until the dry-run precision and source-rights review are accepted.
