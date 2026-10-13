-- Enable Row Level Security on every table in the public schema, with NO policies.
--
-- Why: Supabase exposes the public schema through its auto-generated REST/GraphQL
-- APIs to the `anon` and `authenticated` roles. With RLS on and no policies, those
-- roles can read and write nothing. Only apps/api, which connects as the table
-- owner (postgres), may access data; table owners bypass RLS unless it is FORCEd.
--
-- New tables added by later migrations must also run
--   ALTER TABLE "<Table>" ENABLE ROW LEVEL SECURITY;
-- (or re-run this block) so they are not exposed.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
