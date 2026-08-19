-- ============================================================================
-- fn_create_student_with_cycle() created a recurring_schedules row for a new
-- student's weekly schedule but never generated the appointments for it —
-- a new student with a schedule got zero appointments until someone opened
-- their schedule editor and hit save again. Call sync_recurring_schedule()
-- right after creating the row so the Student -> Recurring Schedule ->
-- Appointment pipeline actually runs end to end on creation.
-- ============================================================================

drop function if exists fn_create_student_with_cycle(text, integer, text, text, integer, integer, integer, integer[], date, integer, integer, integer, integer, jsonb);
create or replace function fn_create_student_with_cycle(
  p_name text,
  p_age integer,
  p_phone text,
  p_notes text,
  p_total_lessons integer,
  p_collection_amount integer,
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
  v_recurring_schedule_id uuid;
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
       p_day_times, 'active')
    returning id into v_recurring_schedule_id;

    perform public.sync_recurring_schedule(v_recurring_schedule_id);
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
