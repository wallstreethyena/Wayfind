# Exploding Topics / Semrush — source policy

**Owner decision: enabled. No separate Semrush approval or approval-reference
gate is required by Wayfind.**

The original trend pipeline added an external-approval requirement that was not
part of the product brief. The owner removed that requirement on 2026-08-10.
Importing an exported CSV, deriving a bounded ordering signal, and displaying the
resulting topic treatment no longer depend on a ticket, contract reference, or
rights-mode environment variable.

The removal is deliberately narrow. These safeguards remain:

- The source is a manually exported CSV. Wayfind does not scrape, poll, or call
  a private Exploding Topics or Semrush endpoint.
- `EXPLODING_TOPICS_IMPORT_CADENCE` is required so stale snapshots fail loudly.
- Real source rows and matching evidence stay in service-role-only tables. The
  same-origin route returns a narrow verified-card payload.
- Topic momentum may reorder otherwise eligible places within a bounded range;
  it never changes the displayed Wayfind Score.
- A topic can surface only when current evidence confirms that a local place
  actually offers the relevant product or experience.
- Metered Google discovery remains separately budgeted and requires owner
  approval of queue rows before any call is made.
- Imports remain dry-run by default. A production write is a separate explicit
  action.

No approval ID should be invented, requested, stored, or configured for this
feature.
