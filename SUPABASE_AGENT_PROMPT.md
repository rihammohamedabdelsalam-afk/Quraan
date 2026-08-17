# Supabase Database Setup Instructions

This document contains instructions for a Supabase Agent to implement database changes for the appointment and recurring schedule management system.

## Overview

The application needs the following database changes:
1. Add age column to existing students table (safe migration)
2. Create recurring_schedules table for managing recurring appointment patterns
3. Create appointments table for individual scheduled lessons
4. Update RPC function to use age instead of grade/subject

## Important Principles

- **Data Preservation**: All existing data must be preserved. Do NOT drop tables or columns.
- **Safe Migrations**: Use ADD COLUMN IF NOT EXISTS and other safe operations.
- **RLS Security**: Row-level security policies must be configured for each new table.
- **Backward Compatibility**: Existing grade and subject columns remain for backward compatibility.

---

## Migration 1: Add age column to students table

**File**: `supabase/migrations/20260817_add_age_to_students.sql`

**Purpose**: Add age field to student records while keeping existing grade and subject fields

**SQL Operations**:
```sql
-- Add age column (nullable for backward compatibility)
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS age integer;

-- Constraint: age must be realistic if provided
ALTER TABLE students
ADD CONSTRAINT age_reasonable CHECK (age IS NULL OR (age >= 5 AND age <= 80));

-- Index for filtering/searching by age
CREATE INDEX IF NOT EXISTS idx_students_age ON students(age);
```

**Changes**:
- New column: `age` (integer, nullable)
- New constraint: `age_reasonable` (ensures age is between 5 and 80 if provided)
- New index: `idx_students_age`

**Result**: Students can now have an age field while grade and subject remain optional.

---

## Migration 2: Create recurring_schedules table

**File**: `supabase/migrations/20260817_create_recurring_schedules.sql`

**Purpose**: Store recurring appointment patterns for students

**Table Schema**:
```
recurring_schedules
├── id (uuid, primary key)
├── student_id (uuid, FK → students)
├── teacher_id (uuid, FK → auth.users)
├── start_date (date)
├── days_of_week (integer[], e.g., [1,3,5] for Mon/Wed/Fri)
├── start_hour (integer, 0-23)
├── start_minute (integer, 0-59)
├── num_weeks (integer, 1-52)
├── status (text: 'active' | 'archived')
├── created_at (timestamp)
└── updated_at (timestamp)
```

**Indexes**:
- `idx_recurring_schedules_student_id` - Filter by student
- `idx_recurring_schedules_teacher_id` - Filter by teacher
- `idx_recurring_schedules_status` - Filter by status

**RLS Policies**:
1. **recurring_schedules_teacher_access**: Teachers can only see schedules for their own students
   - Condition: `teacher_id = auth.uid()`
2. **recurring_schedules_insert**: Can only create schedules for own students
   - Condition: `teacher_id = auth.uid()`

**Example Data**:
```json
{
  "student_id": "uuid1",
  "teacher_id": "teacher-uuid",
  "start_date": "2026-08-22",
  "days_of_week": [2, 4],
  "start_hour": 17,
  "start_minute": 30,
  "num_weeks": 4,
  "status": "active"
}
```

This creates a recurring schedule for Monday and Wednesday at 5:30 PM for 4 weeks.

---

## Migration 3: Create appointments table

**File**: `supabase/migrations/20260817_create_appointments.sql`

**Purpose**: Store individual appointments generated from recurring schedules

**Table Schema**:
```
appointments
├── id (uuid, primary key)
├── student_id (uuid, FK → students)
├── teacher_id (uuid, FK → auth.users)
├── recurring_schedule_id (uuid, FK → recurring_schedules, nullable)
├── date (date)
├── day_of_week (integer, 0-6)
├── start_hour (integer, 0-23)
├── start_minute (integer, 0-59)
├── status (text: 'scheduled' | 'completed' | 'cancelled')
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)
```

**Indexes**:
- `idx_appointments_student_id` - Filter by student
- `idx_appointments_teacher_id` - Filter by teacher
- `idx_appointments_recurring_schedule_id` - Link to recurring schedule
- `idx_appointments_date` - Filter by date
- `idx_appointments_status` - Filter by status
- `idx_appointments_unique_scheduled` - UNIQUE constraint to prevent double-booking
  - Condition: `WHERE status = 'scheduled'`
  - Fields: `(student_id, date, start_hour, start_minute)`

**RLS Policies**:
1. **appointments_teacher_access**: Teachers can only see appointments for their students
   - Condition: `teacher_id = auth.uid()`
2. **appointments_insert**: Can only create appointments for own students
   - Condition: `teacher_id = auth.uid()`

**Example Data**:
```json
{
  "student_id": "uuid1",
  "teacher_id": "teacher-uuid",
  "recurring_schedule_id": "recurring-uuid",
  "date": "2026-08-24",
  "day_of_week": 2,
  "start_hour": 17,
  "start_minute": 30,
  "status": "scheduled",
  "notes": null
}
```

**Appointment Lifecycle**:
- `scheduled` → `completed` (after the lesson is conducted)
- `scheduled` → `cancelled` (if the lesson is cancelled)
- `completed` or `cancelled` → stays (historical record)

---

## Migration 4: Update RPC Function

**File**: `supabase/migrations/20260817_update_rpc_create_student.sql`

**Purpose**: Update the student creation function to use age instead of grade/subject

**Function**: `fn_create_student_with_cycle`

**Changes**:
- Remove parameters: `p_grade`, `p_subject`
- Add parameter: `p_age` (nullable integer)
- Insert student with `age` column (keeping grade/subject as NULL for backward compatibility)

**Function Signature**:
```sql
fn_create_student_with_cycle(
  p_name text,
  p_age integer DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_total_lessons integer DEFAULT 8,
  p_collection_amount integer DEFAULT 1000
)
```

**Behavior**:
1. Get current authenticated user (teacher_id)
2. Insert student with age (grade and subject will be NULL)
3. Create initial lesson cycle with status 'active'

---

## Application Integration

The frontend application integrates these changes as follows:

### StudentProfile Page (`src/pages/StudentProfile.tsx`):
- Shows student age instead of grade/subject
- Displays today's scheduled appointments
- Manages recurring schedules for the student
- Edit individual appointments
- Cancel appointments (changes status to 'cancelled')

### RecurringScheduleForm Component (`src/components/RecurringScheduleForm.tsx`):
- Allows creating recurring schedules with:
  - Student selection
  - Start date
  - Days of week selection (checkboxes)
  - Time selection (hour, minute, AM/PM)
  - Number of weeks (predefined + custom option)
- Shows preview of generated appointments before saving
- Creates both the recurring_schedule and appointments records

### Scheduling Utilities (`src/lib/scheduling.ts`):
- `generateSchedulePreview()`: Simulates appointment generation
- `createAppointmentsFromPreview()`: Bulk creates appointments
- `checkConflicts()`: Prevents double-booking
- Time conversion utilities for 12-hour/24-hour format

---

## Database Schema Diagram

```
teachers (auth.users)
├── many recurring_schedules
│   ├── one student
│   └── many appointments

students
├── many recurring_schedules
├── many appointments
├── many lesson_cycles (existing)
└── many lessons (existing)

recurring_schedules
└── many appointments

appointments (has status: scheduled|completed|cancelled)
```

---

## Implementation Checklist

When applying these migrations, verify:

- [ ] `age` column added to students table
- [ ] `age_reasonable` constraint created
- [ ] `idx_students_age` index created
- [ ] `recurring_schedules` table created
- [ ] `recurring_schedules` indexes created
- [ ] `recurring_schedules` RLS policies created
- [ ] `appointments` table created
- [ ] `appointments` indexes created
- [ ] `appointments` unique constraint for scheduled appointments created
- [ ] `appointments` RLS policies created
- [ ] `fn_create_student_with_cycle` function updated
- [ ] No data loss in students table
- [ ] RLS enabled on both new tables
- [ ] Functions have proper error handling

---

## Testing Checklist

After migrations:

1. **Create Student**: Test creating a student with age (no grade/subject)
2. **Create Recurring Schedule**: 
   - Select student
   - Set dates, days, time, weeks
   - Verify preview shows correct dates
   - Verify appointments are created
3. **View Appointments**:
   - Check today's appointments display
   - Verify correct times and student names
4. **Edit Appointment**:
   - Change time of a scheduled appointment
   - Verify only that appointment changes
5. **Cancel Appointment**:
   - Mark appointment as cancelled
   - Verify status shows as "ملغاة" (cancelled)
   - Verify it doesn't appear in scheduled list
6. **Verify No Double-Booking**:
   - Try creating overlapping appointments
   - System should show a warning

---

## Rollback Plan

If issues arise, the following tables/columns can be safely rolled back:
- Drop `recurring_schedules` table (no dependent application data)
- Drop `appointments` table (no dependent application data)
- Drop `age` column from students (but keep grade/subject)

Since we used safe migration practices, no data loss should occur.

---

## Notes for Supabase Agent

1. Execute migrations in order (1 → 2 → 3 → 4)
2. Verify each migration succeeds before proceeding
3. Test the RLS policies after creation
4. The application expects appointments to be queryable by `student_id`, `date`, and `status`
5. Conflict checking uses the unique index on scheduled appointments
6. The `days_of_week` array in recurring_schedules uses 0-6 (Sunday = 0)
7. All timestamps should be in UTC
8. The `start_hour` and `start_minute` in appointments are in 24-hour format (0-23)
