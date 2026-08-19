-- Add age column to students table (safe migration)
-- Keep existing grade and subject columns for backward compatibility

ALTER TABLE students 
ADD COLUMN IF NOT EXISTS age integer;

-- Add constraint to ensure age is reasonable if provided
ALTER TABLE students
ADD CONSTRAINT age_reasonable CHECK (age IS NULL OR (age >= 5 AND age <= 80));

-- Create index on age for filtering/searching
CREATE INDEX IF NOT EXISTS idx_students_age ON students(age);
