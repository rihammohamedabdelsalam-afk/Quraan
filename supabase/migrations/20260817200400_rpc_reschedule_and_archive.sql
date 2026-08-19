-- ============================================================================
-- Approved decision #6: reschedule never overwrites — creates a new
-- appointment, closes the old one as 'rescheduled', and records the move.
-- The GIST exclusion constraint on appointments (previous migration) rejects
-- this at the DB level if the new slot conflicts with anything else.
-- ============================================================================

create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_start_at timestamptz,
  p_new_end_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_old public.appointments%rowtype;
  v_new_id uuid;
begin
  select * into v_old from public.appointments
  where id = p_appointment_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'appointment not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_old.status not in ('scheduled') then
    raise exception 'only a scheduled appointment can be rescheduled' using errcode = 'P0001';
  end if;

  if p_new_end_at <= p_new_start_at then
    raise exception 'end must be after start' using errcode = 'P0001';
  end if;

  insert into public.appointments
    (student_id, teacher_id, recurring_schedule_id, date, day_of_week,
     start_hour, start_minute, start_at, end_at, status,
     original_date, original_start_hour, original_start_minute, reschedule_reason)
  values
    (v_old.student_id, v_teacher, v_old.recurring_schedule_id,
     p_new_start_at::date, extract(dow from p_new_start_at)::int,
     extract(hour from p_new_start_at)::int, extract(minute from p_new_start_at)::int,
     p_new_start_at, p_new_end_at, 'scheduled',
     v_old.date, v_old.start_hour, v_old.start_minute, p_reason)
  returning id into v_new_id;
  -- ^ if this new slot overlaps another live appointment for this teacher,
  --   the EXCLUDE constraint from the previous migration raises here and
  --   the whole transaction (including v_old's update below) rolls back.

  update public.appointments
  set status = 'rescheduled'
  where id = v_old.id;

  insert into public.appointment_reschedule_history
    (teacher_id, student_id, original_appointment_id, new_appointment_id,
     original_start_at, original_end_at, new_start_at, new_end_at, reason, changed_by)
  values
    (v_teacher, v_old.student_id, v_old.id, v_new_id,
     v_old.start_at, v_old.end_at, p_new_start_at, p_new_end_at, p_reason, v_teacher);

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'appointment.rescheduled', 'appointment', v_old.id,
          jsonb_build_object('new_appointment_id', v_new_id, 'reason', p_reason));

  return v_new_id;
end;
$$;

revoke all on function public.reschedule_appointment(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.reschedule_appointment(uuid, timestamptz, timestamptz, text) to authenticated;


-- ============================================================================
-- Section 23: archive, never hard-delete, in normal operation.
-- ============================================================================

create or replace function public.archive_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
begin
  update public.students
  set status = 'archived'
  where id = p_student_id and teacher_id = v_teacher;

  if not found then
    raise exception 'student not found or not owned by caller' using errcode = 'P0002';
  end if;

  -- cancel any still-scheduled future appointments; history stays intact.
  update public.appointments
  set status = 'cancelled', archived_at = now()
  where student_id = p_student_id and teacher_id = v_teacher and status = 'scheduled';

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'student.archived', 'student', p_student_id, '{}'::jsonb);
end;
$$;

revoke all on function public.archive_student(uuid) from public;
grant execute on function public.archive_student(uuid) to authenticated;

create or replace function public.reactivate_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
begin
  update public.students set status = 'active'
  where id = p_student_id and teacher_id = v_teacher;

  if not found then
    raise exception 'student not found or not owned by caller' using errcode = 'P0002';
  end if;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'student.reactivated', 'student', p_student_id, '{}'::jsonb);
end;
$$;

revoke all on function public.reactivate_student(uuid) from public;
grant execute on function public.reactivate_student(uuid) to authenticated;
