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

/**
 * Format time as Arabic (e.g., 10:00 ص)
 * Input: hour (24), minute
 * Output: "10:00 ص" or "5:30 م"
 */
export function formatTimeArabic(hour: number, minute: number): string {
  const { hour: h12, period } = convertTo12Hour(hour);
  const periodAr = period === 'am' ? 'ص' : 'م';
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${periodAr}`;
}

/**
 * Check if appointment times overlap (for conflict detection)
 * Assumes each appointment is 1 hour long by default
 * Returns true if there's a conflict
 */
export function hasTimeConflict(
  existingHour: number,
  existingMinute: number,
  newHour: number,
  newMinute: number,
  durationMinutes: number = 60
): boolean {
  // Convert to minutes from midnight
  const existingStart = existingHour * 60 + existingMinute;
  const existingEnd = existingStart + durationMinutes;
  
  const newStart = newHour * 60 + newMinute;
  const newEnd = newStart + durationMinutes;

  // Check for overlap
  return !(newEnd <= existingStart || newStart >= existingEnd);
}

/**
 * Get next N available days for rescheduling
 * Returns dates excluding past dates and optionally specific days
 */
export function getAvailableDates(
  startDate: string,
  numDays: number = 14,
  excludeDates?: string[]
): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  // Ensure we don't include past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (current < today) {
    current.setTime(today.getTime());
  }

  while (dates.length < numDays) {
    const dateStr = current.toISOString().split('T')[0];
    const isDayOfWeek6Or5 = current.getDay() === 5 || current.getDay() === 6; // Friday and Saturday
    
    if (!excludeDates?.includes(dateStr) && !isDayOfWeek6Or5) {
      dates.push(dateStr);
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Get available time slots for a specific date
 * Filters out times with existing appointments
 * Returns slots as array of {hour, minute, formatted}
 */
export async function getAvailableSlots(
  supabase: any,
  teacherId: string,
  date: string,
  excludeAppointmentId?: string,
  durationMinutes: number = 60
): Promise<Array<{ hour: number; minute: number; formatted: string }>> {
  // Get all appointments for this teacher on this date
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('start_hour, start_minute')
    .eq('teacher_id', teacherId)
    .eq('date', date)
    .neq('status', 'cancelled')
    .neq('status', 'rescheduled');

  if (error) throw error;

  const bookedSlots = (appointments || [])
    .filter((a: any) => a.id !== excludeAppointmentId)
    .map((a: any) => ({
      hour: a.start_hour,
      minute: a.start_minute,
    }));

  // Generate all possible slots (every 30 minutes from 8 AM to 8 PM)
  const slots: Array<{ hour: number; minute: number; formatted: string }> = [];
  
  for (let hour = 8; hour < 20; hour++) {
    for (let minute of [0, 30]) {
      // Check if this slot conflicts with any booked slot
      const hasConflict = bookedSlots.some((booked: any) =>
        hasTimeConflict(booked.hour, booked.minute, hour, minute, durationMinutes)
      );

      if (!hasConflict) {
        slots.push({
          hour,
          minute,
          formatted: formatTimeArabic(hour, minute),
        });
      }
    }
  }

  return slots;
}

/**
 * Reschedule an appointment to a new date and time
 * Preserves original appointment info
 * Does NOT modify recurring_schedule
 */
export async function rescheduleAppointment(
  supabase: any,
  appointmentId: string,
  newDate: string,
  newHour: number,
  newMinute: number,
  reason?: string
): Promise<void> {
  // First, fetch the current appointment to preserve original info
  const { data: current, error: fetchError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (fetchError) throw fetchError;

  // Calculate new day of week
  const newDateObj = new Date(newDate);
  const newDayOfWeek = newDateObj.getDay();

  // Update the appointment
  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      date: newDate,
      day_of_week: newDayOfWeek,
      start_hour: newHour,
      start_minute: newMinute,
      // Preserve original appointment info (only if not already rescheduled)
      original_date: current.original_date || current.date,
      original_start_hour: current.original_start_hour !== null ? current.original_start_hour : current.start_hour,
      original_start_minute: current.original_start_minute !== null ? current.original_start_minute : current.start_minute,
      reschedule_reason: reason || null,
      status: 'rescheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (updateError) throw updateError;
}
