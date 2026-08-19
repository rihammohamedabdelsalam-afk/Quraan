-- ============================================================================
-- Phase 4 — SECURITY: RLS on every table that carries a teacher_id.
-- Uniform rule: a row is visible/writable only to auth.uid() = teacher_id.
-- Sensitive state transitions (progress, collection_status, wallet, credits)
-- are NOT writable directly by the client at all — only through the
-- SECURITY DEFINER RPCs above, which run as the function owner and bypass
-- these policies safely because they always filter by auth.uid() internally.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'lesson_cycles','lessons','collections','wallet_transactions',
    'outstanding_lesson_balances','student_schedule','teacher_availability',
    'blocked_time','appointment_reschedule_history','audit_log'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- students / recurring_schedules / appointments already have migrations in
-- the repo; ensure RLS is on for them too (idempotent no-op if already set).
alter table public.students enable row level security;
alter table public.recurring_schedules enable row level security;
alter table public.appointments enable row level security;

-- Generic "own rows only" policy for every table above.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'students','lesson_cycles','lessons','collections','wallet_transactions',
    'outstanding_lesson_balances','student_schedule','teacher_availability',
    'blocked_time','recurring_schedules','appointments',
    'appointment_reschedule_history','audit_log'
  ])
  loop
    execute format('drop policy if exists own_rows_select on public.%I', t);
    execute format(
      'create policy own_rows_select on public.%I for select using (teacher_id = auth.uid())', t
    );

    execute format('drop policy if exists own_rows_insert on public.%I', t);
    execute format(
      'create policy own_rows_insert on public.%I for insert with check (teacher_id = auth.uid())', t
    );

    execute format('drop policy if exists own_rows_update on public.%I', t);
    execute format(
      'create policy own_rows_update on public.%I for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid())', t
    );

    execute format('drop policy if exists own_rows_delete on public.%I', t);
    execute format(
      'create policy own_rows_delete on public.%I for delete using (teacher_id = auth.uid())', t
    );
  end loop;
end $$;

-- audit_log: append-only from the client's perspective — no update/delete
-- policy exists for it at all beyond the generic ones above being dropped.
drop policy if exists own_rows_update on public.audit_log;
drop policy if exists own_rows_delete on public.audit_log;

-- Sensitive columns: block direct client writes to fields that must only
-- change through the RPCs, even though row ownership (above) would allow it.
-- We enforce this by revoking column-level UPDATE grants from `authenticated`
-- and only re-granting the columns the UI is allowed to edit directly.
revoke update on public.lesson_cycles from authenticated;
grant update (student_id) on public.lesson_cycles to authenticated; -- effectively none of the sensitive fields

revoke update on public.wallet_transactions from authenticated;
-- no direct client UPDATE at all on wallet_transactions: it's an
-- append-only ledger. Inserts still flow through complete_lesson().
revoke insert, update, delete on public.wallet_transactions from authenticated;

revoke update on public.collections from authenticated;
revoke insert, update, delete on public.collections from authenticated;

revoke update on public.outstanding_lesson_balances from authenticated;

revoke update, delete on public.lessons from authenticated;
grant update (notes, scheduled_date, start_time, end_time) on public.lessons to authenticated;
-- status/completed_at only change via complete_lesson / mark_lesson_absent /
-- cancel_lesson (SECURITY DEFINER, so they bypass this grant restriction).
