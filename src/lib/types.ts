export type Student = {
  id: string;
  teacher_id: string;
  name: string;
  grade: string | null;
  subject: string | null;
  phone: string | null;
  notes: string | null;
  start_date: string;
  status: 'active' | 'archived';
  created_at: string;
};

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
  collection_status: 'not_yet_collected' | 'collected';
  started_at: string;
  completed_at: string | null;
};

export type Lesson = {
  id: string;
  student_id: string;
  cycle_id: string;
  original_date: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: 'scheduled' | 'completed' | 'postponed' | 'cancelled';
  notes: string | null;
  created_at: string;
};

export type Collection = {
  id: string;
  student_id: string;
  cycle_id: string;
  amount: number;
  trigger_lesson_number: number;
  collected_at: string;
};

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

export type StudentSchedule = {
  id: string;
  student_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  active_from: string;
  active_to: string | null;
};

export const DAY_NAMES_AR = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];
