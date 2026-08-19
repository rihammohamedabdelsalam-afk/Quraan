-- ============================================================================
-- APPOINTMENT RESCHEDULE HISTORY + AUDIT LOG
-- Approved decision #6: rescheduling never overwrites the original
-- appointment — it creates a new appointment row and records the move here.
-- ============================================================================

create table if not exists public.appointment_reschedule_history (
  id                    uuid primary key default gen_random_uuid(),
  teacher_id            uuid not null references auth.users(id) on delete cascade,
  student_id            uuid not null references public.students(id) on delete cascade,

  original_appointment_id uuid not null references public.appointments(id) on delete cascade,
  new_appointment_id      uuid not null references public.appointments(id) on delete cascade,

  original_start_at    timestamptz not null,
  original_end_at       timestamptz not null,
  new_start_at          timestamptz not null,
  new_end_at             timestamptz not null,

  reason                text,
  changed_at             timestamptz not null default now(),
  changed_by             uuid not null references auth.users(id)
);

create index if not exists idx_reschedule_history_original
  on public.appointment_reschedule_history(original_appointment_id);
create index if not exists idx_reschedule_history_student
  on public.appointment_reschedule_history(student_id, changed_at desc);

-- ----------------------------------------------------------------------------
-- audit_log — Section 24: sensitive-operation audit trail
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  actor       uuid not null references auth.users(id),

  action      text not null,      -- e.g. 'lesson.completed', 'student.archived'
  entity      text not null,      -- e.g. 'lesson', 'student', 'cycle'
  entity_id   uuid not null,

  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_log_teacher_time on public.audit_log(teacher_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity, entity_id);

-- ----------------------------------------------------------------------------
-- appointments: make sure exact start/end + audit columns exist
-- (Section 14: no more relying on hour/minute alone for overlap math)
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists start_at timestamptz,
  add column if not exists end_at   timestamptz,
  add column if not exists archived_at timestamptz;

-- backfill start_at/end_at from the legacy date + start_hour/start_minute
-- columns for any existing rows that don't have them yet. duration comes
-- from the linked recurring_schedule when present, else defaults to 60 min.
update public.appointments a
set
  start_at = (a.date::timestamp + make_interval(hours => a.start_hour, mins => a.start_minute)),
  end_at = (a.date::timestamp + make_interval(hours => a.start_hour, mins => a.start_minute))
    + make_interval(mins => coalesce(
        (select rs.duration_minutes from public.recurring_schedules rs where rs.id = a.recurring_schedule_id),
        60
      ))
where a.start_at is null;

alter table public.appointments
  alter column start_at set not null,
  alter column end_at set not null;

create index if not exists idx_appointments_teacher_start on public.appointments(teacher_id, start_at);

-- ----------------------------------------------------------------------------
-- DATABASE-LEVEL scheduling conflict protection (Section 15).
-- No two non-cancelled appointments for the same teacher may overlap in time.
-- This is enforced at the constraint level, not just app code.
-- ----------------------------------------------------------------------------
alter table public.appointments
  add constraint no_overlapping_teacher_appointments
  exclude using gist (
    teacher_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status in ('scheduled','completed'));
