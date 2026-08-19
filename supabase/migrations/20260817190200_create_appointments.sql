-- Create appointments table for individual scheduled lessons

CREATE TABLE IF NOT EXISTS appointments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recurring_schedule_id uuid REFERENCES recurring_schedules(id) ON DELETE SET NULL,
  
  -- Appointment details
  date date NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_hour integer NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute <= 59),
  
  -- Status
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes text,
  
  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_appointments_student_id ON appointments(student_id);
CREATE INDEX idx_appointments_teacher_id ON appointments(teacher_id);
CREATE INDEX idx_appointments_recurring_schedule_id ON appointments(recurring_schedule_id);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE UNIQUE INDEX idx_appointments_unique_scheduled ON appointments(student_id, date, start_hour, start_minute)
  WHERE status = 'scheduled';

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Teachers can only see appointments for their students
CREATE POLICY appointments_teacher_access ON appointments
FOR ALL USING (teacher_id = auth.uid());

-- RLS Policy: Insert - can only create appointments for own students
CREATE POLICY appointments_insert ON appointments
FOR INSERT WITH CHECK (teacher_id = auth.uid());
