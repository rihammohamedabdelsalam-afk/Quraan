-- ============================================================================
-- SCHEDULING SOURCE OF TRUTH — final architecture (approved product decision)
-- ============================================================================
-- Student -> Recurring Schedule -> Appointment -> Lesson Execution ->
-- Lesson Cycle -> Collection -> Wallet.
--
-- recurring_schedules is the only source of truth for a student's weekly
-- pattern. appointments are concrete generated instances. student_schedule
-- becomes legacy/read-only as of this migration.
-- ============================================================================

alter table public.appointments
  add column if not exists is_manually_overridden boolean not null default false;

comment on column public.appointments.is_manually_overridden is
  'true once this appointment has been explicitly rescheduled by the teacher — recurring-schedule syncs must never modify or cancel it.';

create unique index if not exists uq_appointments_recurring_schedule_start_at
  on public.appointments(recurring_schedule_id, start_at)
  where recurring_schedule_id is not null;

drop function if exists public.reschedule_appointment(uuid, timestamptz, timestamptz, text);
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
     original_date, original_start_hour, original_start_minute, reschedule_reason,
     is_manually_overridden)
  values
    (v_old.student_id, v_teacher, v_old.recurring_schedule_id,
     p_new_start_at::date, extract(dow from p_new_start_at)::int,
     extract(hour from p_new_start_at)::int, extract(minute from p_new_start_at)::int,
     p_new_start_at, p_new_end_at, 'scheduled',
     v_old.date, v_old.start_hour, v_old.start_minute, p_reason,
     true)
  returning id into v_new_id;

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

drop function if exists public.sync_recurring_schedule(uuid);
create or replace function public.sync_recurring_schedule(p_recurring_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_rs      public.recurring_schedules%rowtype;
  v_created integer := 0;
  v_updated integer := 0;
  v_cancelled integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_day     integer;
  v_week    integer;
  v_occ_date date;
  v_expected_dates date[] := array[]::date[];
  v_time_str text;
  v_hour    integer;
  v_minute  integer;
  v_start_at timestamptz;
  v_end_at   timestamptz;
  v_existing public.appointments%rowtype;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_rs from public.recurring_schedules
  where id = p_recurring_schedule_id and teacher_id = v_teacher;

  if not found then
    raise exception 'recurring schedule not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_rs.status <> 'active' then
    return jsonb_build_object('created', 0, 'updated', 0, 'cancelled', 0, 'conflicts', '[]'::jsonb,
                               'note', 'recurring schedule is not active');
  end if;

  for v_week in 0..greatest(v_rs.num_weeks - 1, 0) loop
    foreach v_day in array v_rs.days_of_week loop
      v_occ_date := v_rs.start_date
        + (v_week * 7)
        + (((v_day - extract(dow from v_rs.start_date)::int) + 7) % 7);

      if v_occ_date >= greatest(v_rs.start_date, current_date) then
        v_expected_dates := array_append(v_expected_dates, v_occ_date);
      end if;
    end loop;
  end loop;

  foreach v_occ_date in array v_expected_dates loop
    v_time_str := v_rs.day_times ->> (extract(dow from v_occ_date)::int)::text;

    if v_time_str is null then
      v_hour := v_rs.start_hour;
      v_minute := v_rs.start_minute;
    else
      v_hour := split_part(v_time_str, ':', 1)::int;
      v_minute := split_part(v_time_str, ':', 2)::int;
    end if;

    v_start_at := v_occ_date::timestamp + make_interval(hours => v_hour, mins => v_minute);
    v_end_at := v_start_at + make_interval(mins => v_rs.duration_minutes);

    select * into v_existing from public.appointments
    where recurring_schedule_id = p_recurring_schedule_id and date = v_occ_date
    limit 1;

    if found then
      if v_existing.status = 'scheduled' and not v_existing.is_manually_overridden
         and (v_existing.start_at <> v_start_at or v_existing.end_at <> v_end_at) then
        begin
          update public.appointments
          set start_hour = v_hour, start_minute = v_minute,
              start_at = v_start_at, end_at = v_end_at,
              day_of_week = extract(dow from v_occ_date)::int,
              updated_at = now()
          where id = v_existing.id;
          v_updated := v_updated + 1;
        exception when exclusion_violation then
          v_conflicts := v_conflicts || jsonb_build_object(
            'date', v_occ_date, 'reason', 'time change conflicts with another appointment');
        end;
      end if;
    else
      begin
        insert into public.appointments
          (student_id, teacher_id, recurring_schedule_id, date, day_of_week,
           start_hour, start_minute, start_at, end_at, status, is_manually_overridden)
        values
          (v_rs.student_id, v_teacher, p_recurring_schedule_id, v_occ_date,
           extract(dow from v_occ_date)::int, v_hour, v_minute, v_start_at, v_end_at,
           'scheduled', false)
        on conflict (recurring_schedule_id, start_at) where recurring_schedule_id is not null
        do nothing;
        v_created := v_created + 1;
      exception when exclusion_violation then
        v_conflicts := v_conflicts || jsonb_build_object(
          'date', v_occ_date, 'reason', 'conflicts with another appointment for this teacher');
      end;
    end if;
  end loop;

  with cancelled as (
    update public.appointments
    set status = 'cancelled', updated_at = now(),
        notes = trim(both from (coalesce(notes, '') ||
          ' [أُلغيت تلقائيًا بعد تعديل الجدول المتكرر]'))
    where recurring_schedule_id = p_recurring_schedule_id
      and status = 'scheduled'
      and is_manually_overridden = false
      and date >= greatest(v_rs.start_date, current_date)
      and not (date = any(v_expected_dates))
    returning 1
  )
  select count(*) into v_cancelled from cancelled;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'recurring_schedule.synced', 'recurring_schedule', p_recurring_schedule_id,
          jsonb_build_object('created', v_created, 'updated', v_updated,
                              'cancelled', v_cancelled, 'conflicts', v_conflicts));

  return jsonb_build_object('created', v_created, 'updated', v_updated,
                             'cancelled', v_cancelled, 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.sync_recurring_schedule(uuid) from public;
grant execute on function public.sync_recurring_schedule(uuid) to authenticated;

drop function if exists public.update_recurring_schedule(uuid, integer[], jsonb, integer, integer, date);
create or replace function public.update_recurring_schedule(
  p_recurring_schedule_id uuid,
  p_days_of_week integer[],
  p_day_times jsonb,
  p_duration_minutes integer,
  p_num_weeks integer default null,
  p_start_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_days_of_week is null or array_length(p_days_of_week, 1) is null then
    raise exception 'at least one day of week is required' using errcode = 'P0001';
  end if;

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid lesson duration' using errcode = 'P0001';
  end if;

  update public.recurring_schedules
  set days_of_week = p_days_of_week,
      day_times = coalesce(p_day_times, '{}'::jsonb),
      duration_minutes = p_duration_minutes,
      num_weeks = coalesce(p_num_weeks, num_weeks),
      start_date = coalesce(p_start_date, start_date),
      updated_at = now()
  where id = p_recurring_schedule_id and teacher_id = v_teacher;

  if not found then
    raise exception 'recurring schedule not found or not owned by caller' using errcode = 'P0002';
  end if;

  return public.sync_recurring_schedule(p_recurring_schedule_id);
end;
$$;

revoke all on function public.update_recurring_schedule(uuid, integer[], jsonb, integer, integer, date) from public;
grant execute on function public.update_recurring_schedule(uuid, integer[], jsonb, integer, integer, date) to authenticated;

drop function if exists public.create_recurring_schedule(uuid, date, integer[], jsonb, integer, integer);
create or replace function public.create_recurring_schedule(
  p_student_id uuid,
  p_start_date date,
  p_days_of_week integer[],
  p_day_times jsonb,
  p_duration_minutes integer,
  p_num_weeks integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_rs_id uuid;
  v_default_time text;
  v_default_hour int;
  v_default_minute int;
  v_sync_result jsonb;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_days_of_week is null or array_length(p_days_of_week, 1) is null then
    raise exception 'at least one day of week is required' using errcode = 'P0001';
  end if;

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid lesson duration' using errcode = 'P0001';
  end if;

  v_default_time := coalesce(p_day_times ->> (p_days_of_week[1])::text, '16:00');
  v_default_hour := split_part(v_default_time, ':', 1)::int;
  v_default_minute := split_part(v_default_time, ':', 2)::int;

  insert into public.recurring_schedules
    (student_id, teacher_id, start_date, days_of_week, start_hour, start_minute,
     num_weeks, duration_minutes, day_times, status)
  values
    (p_student_id, v_teacher, p_start_date, p_days_of_week, v_default_hour, v_default_minute,
     p_num_weeks, p_duration_minutes, coalesce(p_day_times, '{}'::jsonb), 'active')
  returning id into v_rs_id;

  v_sync_result := public.sync_recurring_schedule(v_rs_id);

  return v_sync_result || jsonb_build_object('recurring_schedule_id', v_rs_id);
end;
$$;

revoke all on function public.create_recurring_schedule(uuid, date, integer[], jsonb, integer, integer) from public;
grant execute on function public.create_recurring_schedule(uuid, date, integer[], jsonb, integer, integer) to authenticated;

-- ============================================================================
-- Legacy student_schedule -> recurring_schedules, one-time best-effort
-- migration. LIMITATION: recurring_schedules has a single duration_minutes
-- for the whole pattern; student_schedule allowed a different duration per
-- day. We take max(duration_minutes) per group. Skips any student who
-- already has an active recurring_schedules row.
--
-- Does NOT call sync_recurring_schedule() here (that needs an authenticated
-- session). Appointments for migrated schedules are generated the first
-- time the teacher opens that student's schedule editor and saves.
-- ============================================================================
insert into public.recurring_schedules
  (student_id, teacher_id, start_date, days_of_week, start_hour, start_minute,
   num_weeks, duration_minutes, day_times, status)
select
  ss.student_id,
  ss.teacher_id,
  current_date,
  array_agg(distinct ss.day_of_week order by ss.day_of_week),
  (array_agg(extract(hour from ss.start_time)::int order by ss.day_of_week))[1],
  (array_agg(extract(minute from ss.start_time)::int order by ss.day_of_week))[1],
  52,
  greatest(max(ss.duration_minutes), 1),
  jsonb_object_agg(ss.day_of_week::text, to_char(ss.start_time, 'HH24:MI')),
  'active'
from public.student_schedule ss
where ss.active_to is null
  and not exists (
    select 1 from public.recurring_schedules rs
    where rs.student_id = ss.student_id and rs.teacher_id = ss.teacher_id and rs.status = 'active'
  )
group by ss.student_id, ss.teacher_id;

comment on table public.student_schedule is
  'LEGACY — superseded by recurring_schedules as of migration 20260818130000. Read-only going forward. Kept temporarily for backward compatibility.';
