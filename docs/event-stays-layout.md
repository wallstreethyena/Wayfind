# Event layout and nearby stays

Prepared on `fix/event-layout-nearby-stays`, based on main `4d0f572`.

The curated event ticket wrapper used a negative top margin, pulling the ticket button into a wrapped verdict. It now has 16px separation. The shared event actions stack below 560px; the official website label and domain occupy separate lines.

Both event page families use EventWhere, which now streams a separate Stay near this event section. It reuses IconicPlaceCard, the owned Stays source and the existing hotel inventory reader. It filters real lodging to 12 miles of the venue and orders by displayed Wayfind Score. Owned Stays content wins identity duplicates. Database reads have a 2.5 second deadline and do not call a discovery API. Empty inventory hides the rail; failed retrieval with no usable fallback displays an unavailable message.

BookingCTA remains the sole booking control. Current bookingResolve deliberately blocks the old untracked hotel URL, so ordinary hotel cards do not gain an earning Check rates button. A verified, attributable hotel booking path is still needed to complete that part of the owner request. No affiliate identifiers or rates were invented. A hotel with a real Google identity opens its place page; unmatched owned IDs open a labeled Apple Maps destination instead of a broken place page.

## Verification

- Hotel tests pass: venue radius, lodging identity, score order, deduplication, source precedence, valid place destinations, invalid coordinates, empty versus failed retrieval, partial fallback and raw inventory mapping.
- 64 assertions pass across eight real event page renders with mocked integrations. Reintroducing the negative ticket margin makes this test fail.
- Existing event hero/directions, booking component and booking integrity checks pass.
- JSX checks pass, including an explicit check of the new components.
- Read-only production query confirms Orlando hotel inventory exists. This does not verify the new end-to-end page retrieval.
- Full guard suite is blocked at required image assets omitted from the sparse checkout.
- Next compilation and type checks completed, but page-data collection failed resolving react/jsx-runtime from the temporary build directory. Full build is not verified.
- Browser installation timed out. Phone and desktop visual acceptance, hotel card interactions and live deployment checks remain required.

No remote branch, PR, merge or deployment was made. Preserve the local branch until hosted verification completes. Refresh/shuffle settings, scoring formulas, Apple map behavior, database contents and existing booking attribution rules are unchanged.
