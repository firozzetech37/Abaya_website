# ADR 0001 — Modular monolith API

- Status: accepted
- Date: 2026-09-27

## Context
A small team is building catalog, pricing, orders, payments and production
features that change together while the product is young.

## Decision
One NestJS application (`apps/api`) split into modules with strict boundaries:
each module owns its tables, exposes an application service, and communicates
through that service or domain events. Clean-architecture layers inside each
module.

## Consequences
- One deploy, one database, simple transactions across modules when needed.
- Any module (e.g. production, notify) can be extracted into its own service
  later without rewriting business rules.
- Boundaries must be policed in review and with lint rules.
