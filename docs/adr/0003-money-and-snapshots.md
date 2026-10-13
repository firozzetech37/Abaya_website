# ADR 0003 — Integer paise and order snapshots

- Status: accepted
- Date: 2026-09-27

## Decision
- All money is stored and computed as integer paise. Only the UI formats rupees.
- Pricing is implemented once (`calculatePrice` in `@abaya/contracts`) and used
  by every client and the API; the API recalculates at checkout.
- Order items copy the design, chosen options, measurements and price breakdown
  at checkout (JSON snapshots).

## Consequences
- No floating-point rounding errors.
- Editing a design, a surcharge or a measurement profile never changes an order
  already in production, and disputes can be checked against the snapshot.
