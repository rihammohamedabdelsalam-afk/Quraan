-- Create recurring_schedules table for managing recurring appointment patterns

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Schedule configuration
  start_date date NOT NULL,
  days_of_week integer[] NOT NULL,  -- Array of 0-6 for Sun-Sat
  start_hour integer NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute <= 59),
  num_weeks integer NOT NULL CHECK (num_weeks >= 1 AND num_weeks <= 52),
  
  -- Status and metadata
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_recurring_schedules_student_id ON recurring_schedules(student_id);
CREATE INDEX idx_recurring_schedules_teacher_id ON recurring_schedules(teacher_id);
CREATE INDEX idx_recurring_schedules_status ON recurring_schedules(status);

-- Enable RLS
ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Teachers can only see their own recurring schedules
CREATE POLICY recurring_schedules_teacher_access ON recurring_schedules
FOR ALL USING (teacher_id = auth.uid());

-- RLS Policy: Insert - can only create for own students
CREATE POLICY recurring_schedules_insert ON recurring_schedules
FOR INSERT WITH CHECK (teacher_id = auth.uid());
