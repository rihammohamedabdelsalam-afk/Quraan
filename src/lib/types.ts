// ============================================================
// Student
// ============================================================

export type Student = {
  id: string;
  teacher_id: string;

  name: string;
  age: number | null;
  phone: string | null;
  notes: string | null;

  start_date: string;
  status: 'active' | 'archived';

  created_at: string;
};


// ============================================================
// Lesson Cycle
// ============================================================

export type LessonCycle = {
  id: string;
  student_id: string;

  cycle_number: number;

  total_lessons: number;

  collection_trigger: number;
  collection_amount: number;

  progress: number;

  outstanding_lessons: number;

  status: 'active' | 'completed';

  collection_status:
    | 'not_yet_collected'
    | 'collected';

  started_at: string;
  completed_at: string | null;
};


// ============================================================
// Lesson Status
// ============================================================

export type LessonStatus =
  | 'scheduled'
  | 'completed'
  | 'absent'
  | 'postponed'
  | 'cancelled';


// ============================================================
// Lesson
// ============================================================

export type Lesson = {
  id: string;

  student_id: string;
  cycle_id: string;

  // التاريخ الأصلي للحصة في حالة التأجيل
  original_date: string | null;

  scheduled_date: string;

  start_time: string | null;
  end_time: string | null;

  status: LessonStatus;

  notes: string | null;

  created_at: string;
};


// ============================================================
// Collection
// ============================================================

export type Collection = {
  id: string;

  student_id: string;
  cycle_id: string;

  amount: number;

  // رقم الحصة التي حدث عندها التحصيل
  trigger_lesson_number: number;

  collected_at: string;
};


// ============================================================
// Outstanding Balance
// ============================================================

export type OutstandingBalance = {
  id: string;

  student_id: string;
  cycle_id: string;

  total_outstanding: number;
  completed_outstanding: number;
  remaining_outstanding: number;

  cleared_at: string | null;

  created_at: string;
};


// ============================================================
// Wallet Transaction
// ============================================================

export type WalletTransaction = {
  id: string;

  teacher_id: string;
  student_id: string;

  cycle_id: string | null;
  collection_id: string | null;

  amount: number;

  type: string;

  date: string;

  description: string | null;
};


// ============================================================
// Student Weekly Schedule
// ============================================================

export type StudentSchedule = {
  id: string;

  student_id: string;

  // 0 = الأحد
  // 1 = الاثنين
  // 2 = الثلاثاء
  // 3 = الأربعاء
  // 4 = الخميس
  // 5 = الجمعة
  // 6 = السبت
  day_of_week: number;

  start_time: string;

  // مدة الحصة بالدقائق
  // مثال: 30 / 45 / 60
  duration_minutes: number;

  active_from: string;

  active_to: string | null;
};


// ============================================================
// Recurring Schedule
// ============================================================

export type RecurringScheduleStatus =
  | 'active'
  | 'archived';

export type RecurringSchedule = {
  id: string;

  student_id: string;
  teacher_id: string;

  start_date: string;

  days_of_week: number[];

  start_hour: number;
  start_minute: number;

  num_weeks: number;

  status: RecurringScheduleStatus;

  created_at: string;
  updated_at: string;
};


// ============================================================
// Appointment
// ============================================================

export type AppointmentStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'rescheduled';

export type Appointment = {
  id: string;

  student_id: string;
  teacher_id: string;

  recurring_schedule_id: string | null;

  date: string;

  day_of_week: number;

  start_hour: number;
  start_minute: number;

  status: AppointmentStatus;

  notes: string | null;

  // ==========================================================
  // بيانات الموعد الأصلي في حالة إعادة الجدولة
  // ==========================================================

  original_date: string | null;

  original_start_hour: number | null;
  original_start_minute: number | null;

  reschedule_reason: string | null;

  created_at: string;
  updated_at: string;
};


// ============================================================
// أسماء أيام الأسبوع بالعربي
// ============================================================

export const DAY_NAMES_AR = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;


// ============================================================
// Schedule Day
// ============================================================

export type ScheduleDay = {
  day_of_week: number;

  start_time: string;

  duration_minutes: number;
};


// ============================================================
// بيانات الجدول عند إنشاء الطالب
// ============================================================

export type StudentScheduleInput = {
  days_of_week: number[];

  start_time: string;

  duration_minutes: number;
};


// ============================================================
// بيانات إنشاء طالب جديد
// ============================================================

export type CreateStudentInput = {
  name: string;

  age: number | null;

  phone: string | null;

  notes: string | null;

  total_lessons: number;

  collection_amount: number;

  // جدول الطالب
  schedule: StudentScheduleInput | null;
};


// ============================================================
// Student + Active Cycle
// ============================================================

export type StudentWithCycle = Student & {
  cycle?: LessonCycle;
};


// ============================================================
// Student + Schedule
// ============================================================

export type StudentWithSchedule = Student & {
  schedule?: StudentSchedule[];
};


// ============================================================
// بيانات الطالب الكاملة
// ============================================================

export type StudentFullProfile = Student & {
  cycle: LessonCycle | null;

  pastCycles: LessonCycle[];

  lessons: Lesson[];

  collections: Collection[];

  schedule: StudentSchedule[];

  appointments: Appointment[];

  recurringSchedules: RecurringSchedule[];
};