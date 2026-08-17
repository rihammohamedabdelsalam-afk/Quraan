/**
 * Scheduling utilities for recurring appointments and schedule management
 */

import { Appointment, RecurringSchedule } from './types';

export type SchedulePreview = {
  date: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  dayNameAr: string;
  formattedDate: string;
  formattedTime: string;
};

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Generate appointment previews for a recurring schedule
 * Simulates what appointments will be created without actually creating them
 */
export function generateSchedulePreview(
  startDate: string,
  daysOfWeek: number[],
  startHour: number,
  startMinute: number,
  numWeeks: number
): SchedulePreview[] {
  const previews: SchedulePreview[] = [];
  const start = new Date(startDate);

  // Ensure we start from the correct date
  const startDayOfWeek = start.getDay();

  // For each week
  for (let week = 0; week < numWeeks; week++) {
    // For each selected day of week
    for (const dayOfWeek of daysOfWeek) {
      // Calculate days to add
      let daysToAdd = dayOfWeek - startDayOfWeek;
      if (daysToAdd < 0) {
        daysToAdd += 7;
      }
      if (week > 0 || daysToAdd > 0) {
        daysToAdd = startDayOfWeek === dayOfWeek && week === 0 ? 0 : daysToAdd;
      }

      // Calculate actual date
      const appointmentDate = new Date(start);
      appointmentDate.setDate(start.getDate() + week * 7 + (dayOfWeek >= startDayOfWeek ? dayOfWeek - startDayOfWeek : 7 - startDayOfWeek + dayOfWeek));

      // Format the date string (YYYY-MM-DD)
      const dateStr = appointmentDate.toISOString().split('T')[0];
      const dayName = DAY_NAMES_AR[appointmentDate.getDay()];
      const formattedDate = appointmentDate.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const formattedTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;

      previews.push({
        date: dateStr,
        dayOfWeek: appointmentDate.getDay(),
        hour: startHour,
        minute: startMinute,
        dayNameAr: dayName,
        formattedDate,
        formattedTime,
      });
    }
  }

  // Sort by date
  previews.sort((a, b) => a.date.localeCompare(b.date));

  return previews;
}

/**
 * Create multiple appointments from a preview
 */
export async function createAppointmentsFromPreview(
  supabase: any,
  studentId: string,
  recurringScheduleId: string,
  previews: SchedulePreview[]
): Promise<void> {
  const appointments = previews.map((preview) => ({
    student_id: studentId,
    recurring_schedule_id: recurringScheduleId,
    date: preview.date,
    day_of_week: preview.dayOfWeek,
    start_hour: preview.hour,
    start_minute: preview.minute,
    status: 'scheduled',
  }));

  const { error } = await supabase
    .from('appointments')
    .insert(appointments);

  if (error) throw error;
}

/**
 * Check for appointment conflicts on a specific date and time
 */
export async function checkConflicts(
  supabase: any,
  teacherId: string,
  date: string,
  startHour: number,
  startMinute: number,
  excludeAppointmentId?: string
): Promise<Appointment | null> {
  let query = supabase
    .from('appointments')
    .select('*, students(name)')
    .eq('teacher_id', teacherId)
    .eq('date', date)
    .eq('start_hour', startHour)
    .eq('start_minute', startMinute)
    .eq('status', 'scheduled');

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId);
  }

  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

/**
 * Format time for display
 */
export function formatTime(hour: number, minute: number, amPm: 'am' | 'pm' = 'am'): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${amPm === 'am' ? 'ص' : 'م'}`;
}

/**
 * Convert 24-hour time to 12-hour time
 */
export function convertTo12Hour(hour: number): { hour: number; period: 'am' | 'pm' } {
  if (hour === 0) return { hour: 12, period: 'am' };
  if (hour === 12) return { hour: 12, period: 'pm' };
  if (hour < 12) return { hour, period: 'am' };
  return { hour: hour - 12, period: 'pm' };
}

/**
 * Convert 12-hour time to 24-hour time
 */
export function convertTo24Hour(hour: number, period: 'am' | 'pm'): number {
  if (period === 'am') {
    return hour === 12 ? 0 : hour;
  }
  return hour === 12 ? 12 : hour + 12;
}

/**
 * Get week number options
 */
export const WEEK_OPTIONS = [
  { label: '1 أسبوع', value: 1 },
  { label: '2 أسبوع', value: 2 },
  { label: '3 أسابيع', value: 3 },
  { label: '4 أسابيع', value: 4 },
  { label: '5 أسابيع', value: 5 },
  { label: '6 أسابيع', value: 6 },
  { label: '8 أسابيع', value: 8 },
  { label: '12 أسبوع', value: 12 },
];
