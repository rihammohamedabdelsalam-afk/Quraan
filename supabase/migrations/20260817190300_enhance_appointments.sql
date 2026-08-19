-- Safely enhance appointments table with notes and rescheduling support
-- This migration adds columns to support notes and tracking original appointment times
-- Safe to run multiple times - uses IF NOT EXISTS where applicable

-- 1. Add notes column (for lesson-specific notes/observations)
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

-- 2. Add original appointment info (for tracking rescheduled appointments)
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS original_date date DEFAULT NULL;

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS original_start_hour integer DEFAULT NULL;

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS original_start_minute integer DEFAULT NULL;

-- 3. Add reason for rescheduling (optional, for documentation)
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS reschedule_reason text DEFAULT NULL;

-- 4. Create index on notes for searching (future use)
CREATE INDEX IF NOT EXISTS idx_appointments_notes ON appointments USING gin(to_tsvector('english', notes));

-- 5. Create indexes for original date queries (to find rescheduled appointments)
CREATE INDEX IF NOT EXISTS idx_appointments_original_date ON appointments(original_date);

-- 6. Add comment documenting the changes
COMMENT ON COLUMN appointments.notes IS 'Lesson-specific notes, e.g., topics covered, student feedback, remedial needs';
COMMENT ON COLUMN appointments.original_date IS 'Original appointment date before rescheduling (null if never rescheduled)';
COMMENT ON COLUMN appointments.original_start_hour IS 'Original start hour (24-hour format, null if never rescheduled)';
COMMENT ON COLUMN appointments.original_start_minute IS 'Original start minute (null if never rescheduled)';
COMMENT ON COLUMN appointments.reschedule_reason IS 'Reason for rescheduling, e.g., student absence, teacher unavailable';

-- Verification query (uncomment to verify):
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'appointments'
-- ORDER BY ordinal_position;
