-- ============================================================================
-- PHASE 2 — ATOMIC LESSON COMPLETION
--
-- Single entrypoint for finishing a lesson. Replaces any direct
-- `update lessons set status = 'completed'` from the frontend. Everything
-- below runs in ONE transaction (a Postgres function body is implicitly
-- transactional) and is idempotent: calling it twice on the same lesson
-- produces exactly one completed lesson, at most one collection, at most
-- one wallet transaction.
-- ============================================================================

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
  v_lesson       public.lessons%rowtype;
  v_cycle        public.lesson_cycles%rowtype;
  v_teacher      uuid := auth.uid();
  v_collection_id uuid;
  v_collection_created boolean := false;
  v_cycle_completed boolean := false;
  v_next_cycle_id uuid;
begin
  if v_teacher is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the lesson row for the duration of this transaction so a second,
  -- concurrent "Complete" click (or a retried network request) blocks here
  -- instead of racing past the idempotency check below.
  select * into v_lesson
  from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher
  for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  -- IDEMPOTENCY: already completed -> return current state, do nothing else.
  if v_lesson.status = 'completed' then
    select * into v_cycle from public.lesson_cycles where id = v_lesson.cycle_id;
    return query select
      v_lesson.id, v_lesson.cycle_id, v_cycle.progress, v_cycle.total_lessons,
      false, (v_cycle.status = 'completed'), null::uuid, true;
    return;
  end if;

  if v_lesson.status in ('cancelled') then
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

  -- 1/2/3: validate + mark lesson completed
  update public.lessons
  set status = 'completed', completed_at = now()
  where id = v_lesson.id;

  -- 4: advance progress (never reset by collection — only 8/8 ends the cycle)
  update public.lesson_cycles
  set progress = progress + 1, updated_at = now()
  where id = v_cycle.id
  returning * into v_cycle;

  -- 5/6/7: collection threshold — DB-unique index on collections(cycle_id)
  -- backstops this even under a race, but we also check explicitly so the
  -- common path never even attempts a duplicate insert.
  if v_cycle.collection_status = 'not_yet_collected'
     and v_cycle.progress >= v_cycle.collection_trigger then

    insert into public.collections (student_id, cycle_id, teacher_id, amount, trigger_lesson_number)
    values (v_cycle.student_id, v_cycle.id, v_teacher, v_cycle.collection_amount, v_cycle.progress)
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
        (v_teacher, v_cycle.student_id, v_cycle.id, v_collection_id, v_lesson.id,
         v_cycle.collection_amount, 'collection', 'تحصيل تلقائي عند الوصول لنقطة التحصيل')
      on conflict (collection_id) do nothing;

      insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
      values (v_teacher, v_teacher, 'collection.created', 'collection', v_collection_id,
              jsonb_build_object('cycle_id', v_cycle.id, 'amount', v_cycle.collection_amount));
    end if;
  end if;

  -- 9/10: cycle completion + automatic next cycle
  if v_cycle.progress >= v_cycle.total_lessons and v_cycle.status <> 'completed' then
    update public.lesson_cycles
    set status = 'completed', completed_at = now()
    where id = v_cycle.id;

    v_cycle_completed := true;

    insert into public.lesson_cycles
      (student_id, teacher_id, cycle_number, total_lessons, collection_trigger,
       collection_amount, initial_progress, progress, status, collection_status)
    values
      (v_cycle.student_id, v_teacher, v_cycle.cycle_number + 1, v_cycle.total_lessons,
       v_cycle.collection_trigger, v_cycle.collection_amount, 0, 0, 'active', 'not_yet_collected')
    returning id into v_next_cycle_id;

    insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
    values (v_teacher, v_teacher, 'cycle.completed', 'lesson_cycle', v_cycle.id,
            jsonb_build_object('next_cycle_id', v_next_cycle_id));
  end if;

  -- 11: audit event for the completion itself
  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.completed', 'lesson', v_lesson.id,
          jsonb_build_object('cycle_id', v_cycle.id, 'progress', v_cycle.progress));

  return query select
    v_lesson.id, v_cycle.id, v_cycle.progress, v_cycle.total_lessons,
    v_collection_created, v_cycle_completed, v_next_cycle_id, false;
end;
$$;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;


-- ============================================================================
-- Approved decision #4/#5: absence consumes the lesson, teacher cancellation
-- does not. Two distinct, explicit RPCs so the frontend can't blur them.
-- ============================================================================

create or replace function public.mark_lesson_absent(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status in ('completed','absent') then
    return; -- idempotent no-op
  end if;

  update public.lessons set status = 'absent' where id = v_lesson.id;

  -- absence CONSUMES the lesson: same progress advancement as completion,
  -- but no financial/collection side effects trigger from absence alone —
  -- it still counts toward collection threshold because it consumed a slot.
  update public.lesson_cycles
  set progress = least(progress + 1, total_lessons), updated_at = now()
  where id = v_lesson.cycle_id;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.absent', 'lesson', v_lesson.id, '{}'::jsonb);
end;
$$;

revoke all on function public.mark_lesson_absent(uuid) from public;
grant execute on function public.mark_lesson_absent(uuid) to authenticated;


create or replace function public.cancel_lesson(p_lesson_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid := auth.uid();
  v_lesson public.lessons%rowtype;
begin
  select * into v_lesson from public.lessons
  where id = p_lesson_id and teacher_id = v_teacher for update;

  if not found then
    raise exception 'lesson not found or not owned by caller' using errcode = 'P0002';
  end if;

  if v_lesson.status in ('completed','cancelled') then
    return; -- idempotent no-op
  end if;

  -- teacher cancellation does NOT consume the lesson: no progress change.
  update public.lessons
  set status = 'cancelled', notes = coalesce(p_reason, notes)
  where id = v_lesson.id;

  insert into public.audit_log (teacher_id, actor, action, entity, entity_id, metadata)
  values (v_teacher, v_teacher, 'lesson.cancelled', 'lesson', v_lesson.id,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.cancel_lesson(uuid, text) from public;
grant execute on function public.cancel_lesson(uuid, text) to authenticated;
