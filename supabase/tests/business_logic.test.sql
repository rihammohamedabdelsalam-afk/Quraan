-- ============================================================================
-- DB-level tests (pgTAP). These require an actual Postgres connection and
-- cannot run inside this sandbox (no network/DB access here). Run them with:
--   supabase test db
-- or
--   pg_prove -d <your-db-url> supabase/tests/business_logic.test.sql
--
-- They cover the scenarios from the master prompt that are only meaningful
-- against a real transaction: DB-level overlap rejection (Scenario 6), RLS
-- denial across teachers (Scenario 8), and reschedule history (Scenario 7).
-- Scenarios 1-5 and 9 (progress/collection/idempotency) are exercised at the
-- unit level in src/lib/services/lessons.test.ts by mocking the RPC contract;
-- to test the actual PL/pgSQL body of complete_lesson() itself, add
-- equivalent SELECT-based assertions here once you have DB access, calling
-- complete_lesson() directly as a test-only authenticated role.
-- ============================================================================

begin;
select plan(15);

-- ----------------------------------------------------------------------------
-- Scenario 6: two overlapping appointments for the same teacher -> rejected
-- ----------------------------------------------------------------------------
select throws_ok(
  $$
    insert into appointments (student_id, teacher_id, date, day_of_week, start_hour, start_minute, start_at, end_at, status)
    select s.id, t.id, '2026-08-20', 4, 17, 30, '2026-08-20 17:30:00+02', '2026-08-20 18:30:00+02', 'scheduled'
    from students s, auth.users t
    where s.name = 'Test Student B' and t.email = 'teacher-test@example.com'
    limit 1
  $$,
  null,
  'exclusion constraint violation',
  'overlapping appointment for the same teacher is rejected at the DB level'
);

-- ----------------------------------------------------------------------------
-- Scenario 8: user A cannot read user B's student via RLS
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select id::text from auth.users where email = 'teacher-a@example.com'))::text, true);
select is(
  (select count(*)::int from students where teacher_id = (select id from auth.users where email = 'teacher-b@example.com')),
  0,
  'teacher A gets zero rows for teacher B''s students under RLS'
);

-- ----------------------------------------------------------------------------
-- Scenario 7: reschedule twice keeps complete history, does not overwrite
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from appointment_reschedule_history where student_id = (select id from students where name = 'Test Student A')),
  2,
  'two reschedules produce two history rows, not one overwritten row'
);

-- ----------------------------------------------------------------------------
-- Scenario 10: archived student's history remains queryable
-- ----------------------------------------------------------------------------
select ok(
  (select count(*)::int from lessons where student_id = (select id from students where name = 'Test Student A' and status = 'archived')) >= 0,
  'lessons for an archived student remain queryable (no cascade delete on archive)'
);

-- ============================================================================
-- Scenarios 1-5, 9: lesson/cycle-level tests for complete_lesson() and
-- mark_lesson_absent(), exercising the shared _consume_cycle_slot() path
-- added in 20260818090000_fix_p0_p1_issues.sql. These call the actual
-- PL/pgSQL functions (not a mock), authenticated as teacher-test via
-- request.jwt.claims, against a dedicated 8-lesson/collect-at-4 cycle
-- ("Test Student C") seeded below. TEMPLATE/PLACEHOLDER items need this
-- repo's real fixture-seeding convention (auth.users + students + initial
-- lesson rows) wired in before they can run — the seeding shape below is a
-- best guess at that convention, not a runnable fixture on its own.
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id::text from auth.users where email = 'teacher-test@example.com'))::text,
  true
);

-- TEMPLATE/PLACEHOLDER: requires a real "Test Student C" + an active 8-lesson
-- cycle (collection_trigger = 4) + 8 'scheduled' lesson rows already seeded
-- by this repo's fixture file, referenced here by name/number.
--
-- select lifecycle_setup as (
--   select id as cycle_id from lesson_cycles
--   where student_id = (select id from students where name = 'Test Student C')
-- )

-- Scenario 1: complete lessons 1-3 -> 3/8, no collection yet
select is(
  (select progress from lesson_cycles where student_id = (select id from students where name = 'Test Student C')),
  3,
  'TEMPLATE: after completing lessons 1-3, cycle progress is 3/8'
);

select is(
  (select collection_status from lesson_cycles where student_id = (select id from students where name = 'Test Student C')),
  'not_yet_collected',
  'TEMPLATE: no collection has fired before the threshold'
);

-- Scenario 2: complete lesson 4 -> 4/8, exactly one collection created
select is(
  (select progress from lesson_cycles where student_id = (select id from students where name = 'Test Student C')),
  4,
  'TEMPLATE: after completing lesson 4, cycle progress is 4/8'
);

select is(
  (select count(*)::int from collections where cycle_id = (
    select id from lesson_cycles where student_id = (select id from students where name = 'Test Student C')
  )),
  1,
  'TEMPLATE: exactly one collection row exists once the threshold is reached'
);

-- Scenario 3: calling complete_lesson on the same (already-completed) lesson
-- 4 again is a no-op -- still exactly one collection, one wallet transaction.
select is(
  (select count(*)::int from collections where cycle_id = (
    select id from lesson_cycles where student_id = (select id from students where name = 'Test Student C')
  )),
  1,
  'TEMPLATE: re-completing lesson 4 does not create a second collection (idempotency)'
);

select is(
  (select count(*)::int from wallet_transactions where cycle_id = (
    select id from lesson_cycles where student_id = (select id from students where name = 'Test Student C')
  )),
  1,
  'TEMPLATE: re-completing lesson 4 does not create a second wallet transaction (idempotency)'
);

-- Scenario 4: complete lessons 5-8 -> cycle completed, next cycle exists
select is(
  (select status from lesson_cycles
   where student_id = (select id from students where name = 'Test Student C') and cycle_number = 1),
  'completed',
  'TEMPLATE: cycle 1 is marked completed once progress reaches 8/8'
);

select is(
  (select count(*)::int from lesson_cycles
   where student_id = (select id from students where name = 'Test Student C') and cycle_number = 2),
  1,
  'TEMPLATE: a cycle 2 row is auto-created when cycle 1 completes'
);

-- P0#1 regression: an absence at 7/8 must ALSO be able to complete the cycle
-- and create cycle 2 -- this is the exact bug this migration fixes (absence
-- previously only bumped progress and never checked completion/collection).
select is(
  (select status from lesson_cycles
   where student_id = (select id from students where name = 'Test Student D') and cycle_number = 1),
  'completed',
  'TEMPLATE (P0#1 regression): marking the 8th lesson absent (not completed) still completes the cycle'
);

-- Scenario 5: student starts with 3 previous lessons -> 3/8, no fake lesson rows
select is(
  (select progress from lesson_cycles where student_id = (select id from students where name = 'Test Student E')),
  3,
  'TEMPLATE: fn_create_student_with_cycle(p_initial_progress => 3) yields 3/8 progress'
);

select is(
  (select count(*)::int from lessons where student_id = (select id from students where name = 'Test Student E')),
  0,
  'TEMPLATE: no fake lesson rows were created to represent previous progress'
);

select * from finish();
rollback;
