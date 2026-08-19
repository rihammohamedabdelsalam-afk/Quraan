-- ============================================================================
-- BASELINE RECONSTRUCTION
-- ============================================================================
-- Phase 1 / Section: "8 of 11 core tables have no migration file in the repo".
--
-- This migration reconstructs, in idempotent form (CREATE TABLE IF NOT EXISTS),
-- the tables the running application already depends on: lesson_cycles,
-- lessons, collections, wallet_transactions, outstanding_lesson_balances,
-- student_schedule, teacher_availability, blocked_time.
--
-- SOURCE OF TRUTH FOR THIS RECONSTRUCTION: src/lib/types.ts + actual
-- `supabase.from(...)` usage across pages (Dashboard.tsx, StudentProfile.tsx,
-- Students.tsx, Wallet.tsx, OutstandingLessons.tsx). Column names/types below
-- match those exactly.
--
-- SAFE TO RUN AGAINST THE LIVE DB: every statement is guarded so that if the
-- live table already exists with a compatible shape, this migration is a
-- no-op for that table. It does NOT drop or rename anything.
--
-- ASSUMPTION (documented per your instruction, not blocking): the live DB's
-- `fn_handle_lesson_completed` trigger (mentioned in README.md, file itself
-- absent from the repo) currently implements collection-threshold logic
-- directly on `lessons` UPDATE. This migration does not touch that trigger.
-- Phase 2's `complete_lesson` RPC (next migration) is the new, single
-- entrypoint going forward; the old trigger is left in place for backward
-- compatibility until Phase 5 verifies nothing else calls raw UPDATE.
-- ============================================================================

create extension if not exists "btree_gist";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- lesson_cycles
-- ----------------------------------------------------------------------------
create table if not exists public.lesson_cycles (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students(id) on delete cascade,
  teacher_id         uuid not null references auth.users(id) on delete cascade,

  cycle_number       integer not null,
  total_lessons      integer not null check (total_lessons > 0),

  -- lessons the student had already taken before onboarding onto the app
  initial_progress   integer not null default 0 check (initial_progress >= 0),

  collection_trigger integer not null,
  collection_amount  numeric(12,2) not null check (collection_amount >= 0),

  progress           integer not null default 0 check (progress >= 0),
  outstanding_lessons integer not null default 0 check (outstanding_lessons >= 0),

  status             text not null default 'active' check (status in ('active','completed')),
  collection_status  text not null default 'not_yet_collected'
                        check (collection_status in ('not_yet_collected','collected')),

  started_at         timestamptz not null default now(),
  completed_at       timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (progress <= total_lessons),
  check (collection_trigger <= total_lessons),
  unique (student_id, cycle_number)
);

create index if not exists idx_lesson_cycles_student on public.lesson_cycles(student_id);
create index if not exists idx_lesson_cycles_teacher_active on public.lesson_cycles(teacher_id, status);

-- exactly one active cycle per student
create unique index if not exists uq_lesson_cycles_one_active_per_student
  on public.lesson_cycles(student_id)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- lessons
-- ----------------------------------------------------------------------------
create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  cycle_id        uuid not null references public.lesson_cycles(id) on delete cascade,
  teacher_id      uuid not null references auth.users(id) on delete cascade,

  -- link to the appointment this lesson was executed from, if any.
  -- nullable: legacy lessons created before appointments existed have none.
  appointment_id  uuid references public.appointments(id) on delete set null,

  lesson_number_in_cycle integer not null check (lesson_number_in_cycle > 0),

  original_date   date,
  scheduled_date  date not null,

  start_time      time,
  end_time        time,

  status          text not null default 'scheduled'
                    check (status in ('scheduled','completed','absent','postponed','cancelled')),

  completed_at    timestamptz,
  notes           text,

  created_at      timestamptz not null default now(),

  unique (cycle_id, lesson_number_in_cycle)
);

create index if not exists idx_lessons_student on public.lessons(student_id);
create index if not exists idx_lessons_cycle on public.lessons(cycle_id);
create index if not exists idx_lessons_teacher_date on public.lessons(teacher_id, scheduled_date);
create index if not exists idx_lessons_appointment on public.lessons(appointment_id);

-- ----------------------------------------------------------------------------
-- collections  (idempotency guarantee: one collection per cycle, DB-enforced)
-- ----------------------------------------------------------------------------
create table if not exists public.collections (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students(id) on delete cascade,
  cycle_id               uuid not null references public.lesson_cycles(id) on delete cascade,
  teacher_id             uuid not null references auth.users(id) on delete cascade,

  amount                 numeric(12,2) not null check (amount >= 0),
  trigger_lesson_number  integer not null,

  collected_at           timestamptz not null default now()
);

-- THE database-level guarantee against duplicate collections (Section 11 / 8):
create unique index if not exists uq_collections_one_per_cycle
  on public.collections(cycle_id);

create index if not exists idx_collections_student on public.collections(student_id);

-- ----------------------------------------------------------------------------
-- wallet_transactions  (real ledger — balance is always SUM(amount), never a
-- standalone mutable column)
-- ----------------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references auth.users(id) on delete cascade,
  student_id     uuid references public.students(id) on delete set null,

  cycle_id       uuid references public.lesson_cycles(id) on delete set null,
  collection_id  uuid references public.collections(id) on delete set null,
  lesson_id      uuid references public.lessons(id) on delete set null,

  amount         numeric(12,2) not null,
  type           text not null,
  reference      text,
  description    text,

  date           timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- idempotency guarantee for the "wallet transaction per collection" case:
create unique index if not exists uq_wallet_txn_one_per_collection
  on public.wallet_transactions(collection_id)
  where collection_id is not null;

create index if not exists idx_wallet_txn_teacher_date on public.wallet_transactions(teacher_id, date desc);
create index if not exists idx_wallet_txn_student on public.wallet_transactions(student_id);

-- ----------------------------------------------------------------------------
-- outstanding_lesson_balances
-- NOTE: this is a *lesson credit* concept (paid-but-unconsumed lessons), not
-- financial debt — kept under its existing name for now per "gradual
-- migration, don't rename/break what's live" (README already documents this
-- distinction clearly to end users; a rename is a pure-labeling change we can
-- do safely in a later, isolated migration once UI copy is updated to match).
-- ----------------------------------------------------------------------------
create table if not exists public.outstanding_lesson_balances (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students(id) on delete cascade,
  cycle_id               uuid not null references public.lesson_cycles(id) on delete cascade,
  teacher_id             uuid not null references auth.users(id) on delete cascade,

  total_outstanding      integer not null default 0 check (total_outstanding >= 0),
  completed_outstanding  integer not null default 0 check (completed_outstanding >= 0),
  remaining_outstanding  integer not null default 0 check (remaining_outstanding >= 0),

  cleared_at             timestamptz,
  created_at             timestamptz not null default now(),

  check (completed_outstanding <= total_outstanding)
);

create index if not exists idx_outstanding_student on public.outstanding_lesson_balances(student_id);

-- ----------------------------------------------------------------------------
-- student_schedule (legacy weekly schedule — superseded going forward by
-- recurring_schedules, kept read/write for historical + not-yet-migrated
-- students per the approved gradual-migration decision)
-- ----------------------------------------------------------------------------
create table if not exists public.student_schedule (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  teacher_id        uuid not null references auth.users(id) on delete cascade,

  day_of_week       integer not null check (day_of_week between 0 and 6),
  start_time        time not null,
  duration_minutes  integer not null check (duration_minutes > 0),

  active_from       date not null default current_date,
  active_to         date,

  created_at        timestamptz not null default now()
);

create index if not exists idx_student_schedule_student on public.student_schedule(student_id);

-- ----------------------------------------------------------------------------
-- teacher_availability / blocked_time
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_availability (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references auth.users(id) on delete cascade,

  day_of_week       integer not null check (day_of_week between 0 and 6),
  start_time        time not null,
  end_time          time not null,

  created_at        timestamptz not null default now(),

  check (end_time > start_time),
  unique (teacher_id, day_of_week, start_time, end_time)
);

create table if not exists public.blocked_time (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references auth.users(id) on delete cascade,

  start_at      timestamptz not null,
  end_at        timestamptz not null,
  reason        text,

  created_at    timestamptz not null default now(),

  check (end_at > start_at)
);

create index if not exists idx_blocked_time_teacher on public.blocked_time(teacher_id, start_at);
