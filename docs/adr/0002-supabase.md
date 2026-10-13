# ADR 0002 — Supabase for Postgres, Auth and Storage (no Docker)

- Status: accepted; **login part superseded by ADR 0004** (Clerk). Postgres and Storage still apply.
- Date: 2026-09-27

## Context
We want a managed Postgres, login (OTP, Google, Apple) and file storage without
running infrastructure ourselves.

## Decision
- Supabase Postgres accessed only through Prisma from `apps/api`.
  Runtime uses the transaction pooler (6543, `pgbouncer=true`); migrations use
  the session connection (5432) via `directUrl`.
- Supabase Auth for login on every client; the API verifies the JWT and keeps
  roles in our own `User` table.
- Supabase Storage with a public `designs` bucket and a private `private`
  bucket; uploads/downloads via API-issued signed URLs.
- Clients never read Supabase tables directly. Row Level Security is enabled on
  all tables with no policies, so the anon key cannot read data even by mistake.
- Separate projects for development and production; production on the Pro plan
  (free projects pause after a week of inactivity and have no backups).

## Consequences
- No Docker needed for development.
- Redis is not included: Phase 2 uses Upstash Redis for BullMQ.
- We depend on Supabase availability; Prisma keeps us portable to any Postgres.
