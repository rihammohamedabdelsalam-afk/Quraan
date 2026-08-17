-- Update fn_create_student_with_cycle to use age instead of grade/subject
-- This is a safe update as the function is created with "CREATE OR REPLACE"

CREATE OR REPLACE FUNCTION fn_create_student_with_cycle(
  p_name text,
  p_age integer DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_total_lessons integer DEFAULT 8,
  p_collection_amount integer DEFAULT 1000
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id uuid;
  v_teacher_id uuid;
BEGIN
  -- Get current user
  v_teacher_id := auth.uid();
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert student (keeping grade and subject as NULL for backward compatibility)
  INSERT INTO students (teacher_id, name, age, phone, notes, start_date, status)
  VALUES (v_teacher_id, p_name, p_age, p_phone, p_notes, now()::date, 'active')
  RETURNING id INTO v_student_id;

  -- Create initial lesson cycle
  INSERT INTO lesson_cycles (student_id, cycle_number, total_lessons, collection_trigger, collection_amount, progress, outstanding_lessons, status, collection_status, started_at)
  VALUES (v_student_id, 1, p_total_lessons, p_total_lessons / 2, p_collection_amount, 0, 0, 'active', 'not_yet_collected', now());
END;
$$;
