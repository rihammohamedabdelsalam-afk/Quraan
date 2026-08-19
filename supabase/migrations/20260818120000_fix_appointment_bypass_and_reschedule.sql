-- ============================================================================
-- FIX PASS 2 — appointment/lesson bypass + reschedule crash
-- ============================================================================
-- Found while wiring "التطبيق يبقى شغال" (make the app actually work), not
-- part of the original P0/P1 list:
--
-- BUG A — AppointmentCard.tsx's "تسجيل مكتملة"/"إلغاء الحصة" buttons (used
--   from StudentProfile's live "المواعيد والحصص القادمة" section) write
--   appointments.status directly. They never touch `lessons`, so progress,
--   collection-threshold, wallet, and cycle-completion logic never fire.
--   Fix: two new RPCs, complete_appointment()/cancel_appointment(), that
--   resolve (or, if missing, create) the linked `lessons` row and then
--   delegate to the existing complete_lesson()/cancel_lesson(). "Create if
--   missing" also covers the deeper gap that nothing in this codebase ever
--   inserts into `lessons` otherwise.
--
-- BUG B — complete_lesson()/mark_lesson_absent()/cancel_lesson() only ever
--   updated `lessons.status`, never the linked appointment's status, so an
--   appointment stayed 'scheduled' forever even after its lesson was done —
--   it would never leave the "upcoming appointments" list. Fix: sync
--   appointments.status when lessons.appointment_id is set.
--
-- BUG C — appointments.status CHECK constraint only allows
--   ('scheduled','completed','cancelled'), but reschedule_appointment() (and
--   the frontend's own rescheduleAppointment() in scheduling.ts) sets
--   status='rescheduled' on the old row. Every reschedule currently fails
--   outright with a check-constraint violation. Fix: widen the constraint.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BUG C — allow 'rescheduled' as a real appointment status
-- ----------------------------------------------------------------------------
alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled'));

-- ----------------------------------------------------------------------------
-- BUG B — sync appointments.status from the lesson lifecycle RPCs
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

  -- BUG B fix: keep the linked appointment (if any) in sync so it drops out
  -- of "upcoming appointments" once its lesson is actually done.
  if v_lesson.appointment_id is not null then
    update public.appointments
    set status = 'completed', updated_at = now()
    where id = v_lesson.appointment_id and teacher_id = v_teacher
      and status = 'scheduled';
  end if;

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

  -- BUG B fix: the slot still happened (student was a no-show), so the
  -- appointment is done as far as the calendar is concerned.
  if v_lesson.appointment_id is not null then
    update public.appointments
    set status = 'completed', updated_at = now()
    where id = v_lesson.appointment_id and teacher_id = v_teacher
      and status = 'scheduled';
  end if;

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

drop function if exists public.cancel_lesson(uuid, text);
create or replace function public.cancel_lesson(p_lesson_id uuid, p_reason text default null)
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
    raise exception 'cannot cancel a lesson that already happened' using errcode = 'P0001';
  end if;

  update public.lessons
  set status = 'cancelled', notes = coalesce(p_reason, notes)
  where id = v_lesson.id;

  -- BUG B fix.
  if v_lesson.appointment_id is not null then
    update public.appointments
    set status = 'cancelled', updated_at = now()
    where id = v_lesson.appointment_id and teacher_id = v_teacher
      and status = 'scheduled';
  end if;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.cancelled', 'lesson', v_lesson.id,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.cancel_lesson(uuid, text) from public;
grant execute on function public.cancel_lesson(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- BUG A — appointment-level wrappers used by AppointmentCard.tsx. Each
-- resolves the linked lesson (creating one against the student's active
-- cycle if none exists yet — see baseline_reconstruction.sql's note that
-- nothing currently creates `lessons` rows ahead of time) and then delegates
-- to the real lesson RPC so progress/collection/wallet logic always runs.
-- ----------------------------------------------------------------------------
drop function if exists public._resolve_or_create_lesson_for_appointment(uuid, uuid);
create or replace function public._resolve_or_create_lesson_for_appointment(
  p_appointment_id uuid,
  p_teacher_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt   public.appointments%rowtype;
  v_lesson_id uuid;
  v_cycle  public.lesson_cycles%rowtype;
begin
  select * into v_appt from public.appointments
  where id = p_appointment_id and teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'appointment not found or not owned by caller' using errcode = 'P0002';
  end if;

  select id into v_lesson_id from public.lessons
  where appointment_id = p_appointment_id;

  if v_lesson_id is not null then
    return v_lesson_id;
  end if;

  select * into v_cycle from public.lesson_cycles
  where student_id = v_appt.student_id and teacher_id = p_teacher_id and status = 'active'
  order by cycle_number desc
  limit 1
  for update;

  if not found then
    raise exception 'no active lesson cycle for this student' using errcode = 'P0002';
  end if;

  insert into public.lessons
    (student_id, cycle_id, teacher_id, appointment_id, lesson_number_in_cycle,
     scheduled_date, start_time, end_time, status)
  values
    (v_appt.student_id, v_cycle.id, p_teacher_id, p_appointment_id,
     v_cycle.progress + 1, v_appt.date,
     make_time(v_appt.start_hour, v_appt.start_minute, 0), null, 'scheduled')
  returning id into v_lesson_id;

  return v_lesson_id;
end;
$$;

revoke all on function public._resolve_or_create_lesson_for_appointment(uuid, uuid) from public;
-- internal helper only.

drop function if exists public.complete_appointment(uuid);
create or replace function public.complete_appointment(p_appointment_id uuid)
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
  v_teacher uuid := auth.uid();
  v_lesson_id uuid;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_lesson_id := public._resolve_or_create_lesson_for_appointment(p_appointment_id, v_teacher);

  return query select * from public.complete_lesson(v_lesson_id);
end;
$$;

revoke all on function public.complete_appointment(uuid) from public;
grant execute on function public.complete_appointment(uuid) to authenticated;

drop function if exists public.cancel_appointment(uuid, text);
create or replace function public.cancel_appointment(p_appointment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson_id uuid;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_lesson_id from public.lessons
  where appointment_id = p_appointment_id and teacher_id = v_teacher;

  if v_lesson_id is not null then
    -- delegate: cancel_lesson() itself refuses to cancel a completed/absent
    -- lesson, and syncs the appointment status.
    perform public.cancel_lesson(v_lesson_id, p_reason);
  else
    -- no lesson was ever created against this appointment — nothing to
    -- consume, just close the appointment itself.
    update public.appointments
    set status = 'cancelled', updated_at = now(), notes = coalesce(p_reason, notes)
    where id = p_appointment_id and teacher_id = v_teacher and status = 'scheduled';

    if not found then
      raise exception 'appointment not found, not owned by caller, or not scheduled' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

revoke all on function public.cancel_appointment(uuid, text) from public;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
