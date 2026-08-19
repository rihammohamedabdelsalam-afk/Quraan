-- ============================================================================
-- FIX PASS — P0 + P1 (Phase 1/2 follow-up)
-- ============================================================================
-- P0#1 Absence/completion parity: mark_lesson_absent advanced `progress`
--   but never checked the collection threshold or cycle-completion, so a
--   7/8 -> absent lesson left the cycle stuck at 8/8 with no next cycle,
--   and a 3/8 -> absent lesson silently skipped the collection entirely.
--   Fix: extract the shared "this lesson consumed a cycle slot" logic
--   (progress++, collection check/insert, wallet txn, cycle completion,
--   next-cycle creation, audit) into `_consume_cycle_slot()` and call it
--   from BOTH complete_lesson() and mark_lesson_absent(). cancel_lesson()
--   intentionally does NOT call it (teacher cancellation doesn't consume
--   the lesson — approved decision, unchanged).
--
-- P0#2 Appointment<->lesson uniqueness: the FK already existed but the
--   partial unique index preventing two lessons from pointing at the same
--   appointment was missing.
--
-- P0#4 Baseline reconciliation, two real bugs:
--   (a) recurring_schedules is missing `duration_minutes` and `day_times`,
--       columns that types.ts / Students.tsx / the history_and_audit
--       migration all already assume exist. The history_and_audit
--       migration's backfill reads `rs.duration_minutes`, which would
--       fail outright on a fresh deploy without this column.
--   (b) fn_create_student_with_cycle's lesson_cycles INSERT omits the
--       NOT NULL `teacher_id` and `collection_trigger` columns -> every
--       student-creation call fails. It also doesn't accept the
--       `p_initial_progress` parameter the frontend already sends, and
--       does the recurring-schedule insert as a second, separate,
--       non-atomic client call.
--
-- P1#7 Direct writes: StudentProfile.tsx's markCompleted/markAbsent/
--   postponeLesson/cancelLesson/deleteLesson all write `lessons` directly
--   ("status" and outright DELETE), both of which the RLS column-grant
--   migration (20260817200500) already revokes from `authenticated` — so
--   these calls fail as written. postpone_lesson and delete_lesson RPCs
--   did not exist yet; this migration adds them.
--
-- P1#8 Student creation atomicity: fn_create_student_with_cycle now
--   optionally creates the recurring schedule in the same transaction and
--   returns the new student's uuid, so Students.tsx needs one RPC call
--   instead of insert-then-insert.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- P0#2 — one lesson per appointment
-- ----------------------------------------------------------------------------
create unique index if not exists uq_lessons_one_per_appointment
  on public.lessons(appointment_id)
  where appointment_id is not null;

-- ----------------------------------------------------------------------------
-- P0#4a — recurring_schedules missing columns
-- ----------------------------------------------------------------------------
alter table public.recurring_schedules
  add column if not exists duration_minutes integer,
  add column if not exists day_times jsonb;

alter table public.recurring_schedules
  alter column duration_minutes set default 60;

update public.recurring_schedules
set duration_minutes = 60
where duration_minutes is null;

alter table public.recurring_schedules
  alter column duration_minutes set not null,
  add constraint recurring_schedules_duration_positive check (duration_minutes > 0);

-- day_times (per-weekday start time, Section 19: "not every day needs the
-- same time") stays nullable: legacy rows only had one start_hour/minute for
-- every selected day, so there is nothing correct to backfill it with.

-- ----------------------------------------------------------------------------
-- P0#1 — shared cycle-slot consumption, used by both completion and absence
-- ----------------------------------------------------------------------------
drop function if exists public._consume_cycle_slot(uuid, uuid, uuid, text);
create or replace function public._consume_cycle_slot(
  p_cycle_id uuid,
  p_teacher_id uuid,
  p_lesson_id uuid,
  p_source text  -- 'completion' | 'absence', for the audit trail only
)
returns table (
  cycle_id uuid,
  progress integer,
  total_lessons integer,
  collection_created boolean,
  cycle_completed boolean,
  next_cycle_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle        public.lesson_cycles%rowtype;
  v_collection_id uuid;
  v_collection_created boolean := false;
  v_cycle_completed boolean := false;
  v_next_cycle_id uuid;
begin
  select * into v_cycle
  from public.lesson_cycles
  where id = p_cycle_id and teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'cycle not found for lesson' using errcode = 'P0002';
  end if;

  -- advance progress (never reset by collection — only total_lessons ends it)
  update public.lesson_cycles
  set progress = least(progress + 1, total_lessons), updated_at = now()
  where id = v_cycle.id
  returning * into v_cycle;

  -- collection threshold — same check regardless of whether the slot was
  -- consumed by completion or by absence. DB-unique index on
  -- collections(cycle_id) backstops this under a race.
  if v_cycle.collection_status = 'not_yet_collected'
     and v_cycle.progress >= v_cycle.collection_trigger then

    insert into public.collections (student_id, cycle_id, teacher_id, amount, trigger_lesson_number)
    values (v_cycle.student_id, v_cycle.id, p_teacher_id, v_cycle.collection_amount, v_cycle.progress)
    on conflict (cycle_id) do nothing
    returning id into v_collection_id;

    if v_collection_id is not null then
      v_collection_created := true;

      update public.lesson_cycles
      set collection_status = 'collected'
      where id = v_cycle.id
      returning * into v_cycle;

      insert into public.wallet_transactions
        (teacher_id, student_id, cycle_id, collection_id, lesson_id, amount, type, description)
      values
        (p_teacher_id, v_cycle.student_id, v_cycle.id, v_collection_id, p_lesson_id,
         v_cycle.collection_amount, 'collection', 'تحصيل تلقائي عند الوصول لنقطة التحصيل')
      on conflict (collection_id) do nothing;

      insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
      values (p_teacher_id, p_teacher_id, 'collection.created', 'collection', v_collection_id,
              jsonb_build_object('cycle_id', v_cycle.id, 'amount', v_cycle.collection_amount, 'source', p_source));
    end if;
  end if;

  -- cycle completion + automatic next cycle — also independent of source
  if v_cycle.progress >= v_cycle.total_lessons and v_cycle.status <> 'completed' then
    update public.lesson_cycles
    set status = 'completed', completed_at = now()
    where id = v_cycle.id;

    v_cycle_completed := true;

    insert into public.lesson_cycles
      (student_id, teacher_id, cycle_number, total_lessons, collection_trigger,
       collection_amount, initial_progress, progress, status, collection_status)
    values
      (v_cycle.student_id, p_teacher_id, v_cycle.cycle_number + 1, v_cycle.total_lessons,
       v_cycle.collection_trigger, v_cycle.collection_amount, 0, 0, 'active', 'not_yet_collected')
    returning id into v_next_cycle_id;

    insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
    values (p_teacher_id, p_teacher_id, 'cycle.completed', 'lesson_cycle', v_cycle.id,
            jsonb_build_object('next_cycle_id', v_next_cycle_id, 'source', p_source));
  end if;

  return query select
    v_cycle.id, v_cycle.progress, v_cycle.total_lessons,
    v_collection_created, v_cycle_completed, v_next_cycle_id;
end;
$$;

revoke all on function public._consume_cycle_slot(uuid, uuid, uuid, text) from public;
-- internal helper only — no direct grant to `authenticated`.

-- ----------------------------------------------------------------------------
-- complete_lesson: now delegates the slot-consumption side effects to the
-- shared helper. Behavior is unchanged for this path; this is a refactor.
-- ----------------------------------------------------------------------------
drop function if exists public.complete_lesson(uuid);
create or replace function public.complete_lesson(p_lesson_id uuid)
returns table (
  lesson_id uuid,
  cycle_id uuid,
  progress integer,
  total_lessons integer,
  collection_created boolean,
  cycle_completed boolean,
  next_cycle_id uuid,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson  public.lessons%rowtype;
  v_cycle   public.lesson_cycles%rowtype;
  v_teacher uuid := auth.uid();
  v_slot    record;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher
  for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status = 'completed' then
    select * into v_cycle from public.lesson_cycles where id = v_lesson.cycle_id;
    return query select
      v_lesson.id, v_lesson.cycle_id, v_cycle.progress, v_cycle.total_lessons,
      false, (v_cycle.status = 'completed'), null::uuid, true;
    return;
  end if;

  if v_lesson.status = 'cancelled' then
    raise exception 'cannot complete a cancelled lesson' using errcode = 'P0001';
  end if;

  select * into v_cycle
  from public.lesson_cycles
  where id = v_lesson.cycle_id and teacher_id = v_teacher
  for update;

  if not found then
    raise exception 'cycle not found for lesson' using errcode = 'P0002';
  end if;

  if v_cycle.status = 'completed' then
    raise exception 'cannot complete a lesson on an already-completed cycle' using errcode = 'P0001';
  end if;

  update public.lessons
  set status = 'completed', completed_at = now()
  where id = v_lesson.id;

  select * into v_slot from public._consume_cycle_slot(v_cycle.id, v_teacher, v_lesson.id, 'completion');

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.completed', 'lesson', v_lesson.id,
          jsonb_build_object('cycle_id', v_slot.cycle_id, 'progress', v_slot.progress));

  return query select
    v_lesson.id, v_slot.cycle_id, v_slot.progress, v_slot.total_lessons,
    v_slot.collection_created, v_slot.cycle_completed, v_slot.next_cycle_id, false;
end;
$$;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- P0#1 fix — mark_lesson_absent now goes through the same slot-consumption
-- path as completion, so absence can trigger a collection / cycle-completion
-- exactly like completion does, instead of only bumping `progress`.
-- ----------------------------------------------------------------------------
drop function if exists public.mark_lesson_absent(uuid);
create or replace function public.mark_lesson_absent(p_lesson_id uuid)
returns table (
  lesson_id uuid,
  cycle_id uuid,
  progress integer,
  total_lessons integer,
  collection_created boolean,
  cycle_completed boolean,
  next_cycle_id uuid,
  already_absent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson  public.lessons%rowtype;
  v_cycle   public.lesson_cycles%rowtype;
  v_slot    record;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_lesson from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status = 'completed' then
    raise exception 'cannot mark a completed lesson as absent' using errcode = 'P0001';
  end if;

  if v_lesson.status = 'absent' then
    select * into v_cycle from public.lesson_cycles where id = v_lesson.cycle_id;
    return query select
      v_lesson.id, v_lesson.cycle_id, v_cycle.progress, v_cycle.total_lessons,
      false, (v_cycle.status = 'completed'), null::uuid, true;
    return;
  end if;

  update public.lessons set status = 'absent' where id = v_lesson.id;

  select * into v_slot from public._consume_cycle_slot(v_lesson.cycle_id, v_teacher, v_lesson.id, 'absence');

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.absent', 'lesson', v_lesson.id,
          jsonb_build_object('cycle_id', v_slot.cycle_id, 'progress', v_slot.progress));

  return query select
    v_lesson.id, v_slot.cycle_id, v_slot.progress, v_slot.total_lessons,
    v_slot.collection_created, v_slot.cycle_completed, v_slot.next_cycle_id, false;
end;
$$;

revoke all on function public.mark_lesson_absent(uuid) from public;
grant execute on function public.mark_lesson_absent(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- P1#7 — postpone_lesson: status change only, no cycle-slot consumption
-- (postponing keeps the lesson "owed" — approved absence/cancellation
-- decisions only cover absence-consumes / cancellation-doesn't; postponing
-- is neither, it's "still to be delivered", so it doesn't touch progress).
-- ----------------------------------------------------------------------------
drop function if exists public.postpone_lesson(uuid, text);
create or replace function public.postpone_lesson(p_lesson_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson  public.lessons%rowtype;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_lesson from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status in ('completed', 'absent') then
    raise exception 'cannot postpone a lesson that is already completed or absent' using errcode = 'P0001';
  end if;

  if v_lesson.status = 'postponed' then
    return; -- idempotent no-op
  end if;

  update public.lessons
  set status = 'postponed', notes = coalesce(p_reason, notes)
  where id = v_lesson.id;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.postponed', 'lesson', v_lesson.id,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.postpone_lesson(uuid, text) from public;
grant execute on function public.postpone_lesson(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- P1#7 — delete_lesson: replaces the unguarded raw `.delete()`. Refuses to
-- delete a completed/absent lesson so it can never silently orphan
-- collection/wallet state that was created from it.
-- ----------------------------------------------------------------------------
drop function if exists public.delete_lesson(uuid);
create or replace function public.delete_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson  public.lessons%rowtype;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_lesson from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status in ('completed', 'absent') then
    raise exception 'cannot delete a completed or absent lesson — it may already have a collection/wallet transaction attached; cancel or archive instead' using errcode = 'P0001';
  end if;

  delete from public.lessons where id = v_lesson.id;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.deleted', 'lesson', v_lesson.id, '{}'::jsonb);
end;
$$;

revoke all on function public.delete_lesson(uuid) from public;
grant execute on function public.delete_lesson(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- P0#4b / P1#8 — fn_create_student_with_cycle:
--   * fixes the missing NOT NULL teacher_id / collection_trigger insert
--     (this previously made every student-creation call fail outright)
--   * accepts p_initial_progress (already sent by Students.tsx)
--   * optionally creates the recurring schedule in the SAME transaction
--     when day/time params are supplied, so student+cycle+schedule become
--     one atomic operation instead of two separate client round-trips
--   * returns the new student's uuid (Students.tsx expects `data: studentId`)
-- ----------------------------------------------------------------------------
-- the old 6-arg, RETURNS void overload (20260817_update_rpc_create_student.sql)
-- is a distinct signature from the one below and would otherwise stick
-- around as dead, still-callable, still-broken dead code.
drop function if exists fn_create_student_with_cycle(text, integer, text, text, integer, integer);

drop function if exists fn_create_student_with_cycle(text, integer, text, text, integer, integer, integer, integer[], date, integer, integer, integer, integer, jsonb);
create or replace function fn_create_student_with_cycle(
  p_name text,
  p_age integer default null,
  p_phone text default null,
  p_notes text default null,
  p_total_lessons integer default 8,
  p_collection_amount integer default 1000,
  p_initial_progress integer default 0,
  p_days_of_week integer[] default null,
  p_start_date date default null,
  p_start_hour integer default null,
  p_start_minute integer default null,
  p_num_weeks integer default null,
  p_duration_minutes integer default null,
  p_day_times jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_teacher_id uuid;
  v_collection_trigger integer;
begin
  v_teacher_id := auth.uid();
  if v_teacher_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_total_lessons is null or p_total_lessons <= 0 then
    raise exception 'p_total_lessons must be a positive integer';
  end if;

  if p_initial_progress is null or p_initial_progress < 0 then
    p_initial_progress := 0;
  end if;

  if p_initial_progress > p_total_lessons then
    raise exception 'p_initial_progress (%) cannot exceed p_total_lessons (%)', p_initial_progress, p_total_lessons;
  end if;

  -- collection point: half the cycle (matches the UI's displayed value —
  -- Section 4's example: 8 lessons -> collection after lesson 4).
  v_collection_trigger := greatest(1, p_total_lessons / 2);

  insert into students (teacher_id, name, age, phone, notes, start_date, status)
  values (v_teacher_id, p_name, p_age, p_phone, p_notes, now()::date, 'active')
  returning id into v_student_id;

  insert into lesson_cycles
    (student_id, teacher_id, cycle_number, total_lessons, collection_trigger,
     collection_amount, initial_progress, progress, outstanding_lessons,
     status, collection_status)
  values
    (v_student_id, v_teacher_id, 1, p_total_lessons, v_collection_trigger,
     p_collection_amount, p_initial_progress, p_initial_progress, 0,
     'active', 'not_yet_collected');

  if p_days_of_week is not null and array_length(p_days_of_week, 1) > 0 then
    if p_start_hour is null or p_start_minute is null or p_num_weeks is null then
      raise exception 'p_start_hour, p_start_minute and p_num_weeks are required when p_days_of_week is supplied';
    end if;

    insert into recurring_schedules
      (student_id, teacher_id, start_date, days_of_week, start_hour, start_minute,
       num_weeks, duration_minutes, day_times, status)
    values
      (v_student_id, v_teacher_id, coalesce(p_start_date, now()::date), p_days_of_week,
       p_start_hour, p_start_minute, p_num_weeks, coalesce(p_duration_minutes, 60),
       p_day_times, 'active');
  end if;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher_id, v_teacher_id, 'student.created', 'student', v_student_id,
          jsonb_build_object('total_lessons', p_total_lessons, 'initial_progress', p_initial_progress));

  return v_student_id;
end;
$$;

revoke all on function fn_create_student_with_cycle(
  text, integer, text, text, integer, integer, integer,
  integer[], date, integer, integer, integer, integer, jsonb
) from public;
grant execute on function fn_create_student_with_cycle(
  text, integer, text, text, integer, integer, integer,
  integer[], date, integer, integer, integer, integer, jsonb
) to authenticated;
