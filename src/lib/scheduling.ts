/**
 * Scheduling utilities for recurring appointments and schedule management
 */

import { Appointment } from './types';

export type DayTimeMap = Record<number, string>;

export type SchedulePreview = {
  date: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  dayNameAr: string;
  formattedDate: string;
  formattedTime: string;
};

const DAY_NAMES_AR = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

/**
 * Generate appointment previews for a recurring schedule.
 *
 * Each selected day can have its own time.
 *
 * Example:
 * {
 *   0: '16:00',
 *   2: '18:30',
 *   4: '17:00'
 * }
 */
export function generateSchedulePreview(
  startDate: string,
  daysOfWeek: number[],
  dayTimes: DayTimeMap,
  numWeeks: number
): SchedulePreview[] {
  const previews: SchedulePreview[] = [];

  if (!startDate || daysOfWeek.length === 0 || numWeeks < 1) {
    return previews;
  }

  const start = new Date(`${startDate}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return previews;
  }

  const startDayOfWeek = start.getDay();

  for (let week = 0; week < numWeeks; week++) {
    for (const dayOfWeek of daysOfWeek) {
      const time = dayTimes[dayOfWeek];

      if (!time) {
        continue;
      }

      const [hourString, minuteString] = time.split(':');

      const hour = Number(hourString);
      const minute = Number(minuteString);

      if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
      ) {
        continue;
      }

      let daysUntilSelectedDay =
        dayOfWeek - startDayOfWeek;

      if (daysUntilSelectedDay < 0) {
        daysUntilSelectedDay += 7;
      }

      const appointmentDate = new Date(start);

      appointmentDate.setDate(
        start.getDate() +
          week * 7 +
          daysUntilSelectedDay
      );

      const dateStr = formatDateOnly(appointmentDate);

      const actualDayOfWeek =
        appointmentDate.getDay();

      const formattedDate =
        appointmentDate.toLocaleDateString('ar-EG', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

      const formattedTime = formatTimeArabic(
        hour,
        minute
      );

      previews.push({
        date: dateStr,
        dayOfWeek: actualDayOfWeek,
        hour,
        minute,
        dayNameAr:
          DAY_NAMES_AR[actualDayOfWeek],
        formattedDate,
        formattedTime,
      });
    }
  }

  previews.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    if (a.hour !== b.hour) {
      return a.hour - b.hour;
    }

    return a.minute - b.minute;
  });

  return previews;
}

/**
 * Create multiple appointments from a preview.
 */
export async function createAppointmentsFromPreview(
  supabase: any,
  studentId: string,
  recurringScheduleId: string,
  previews: SchedulePreview[]
): Promise<void> {
  if (previews.length === 0) {
    return;
  }

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

  if (error) {
    throw error;
  }
}

/**
 * Check for appointment conflicts on a specific date and time.
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
    query = query.neq(
      'id',
      excludeAppointmentId
    );
  }

  const { data, error } =
    await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Format time for display.
 */
export function formatTime(
  hour: number,
  minute: number,
  amPm: 'am' | 'pm' = 'am'
): string {
  return `${String(hour).padStart(2, '0')}:${String(
    minute
  ).padStart(2, '0')} ${
    amPm === 'am' ? 'ص' : 'م'
  }`;
}

/**
 * Convert 24-hour time to 12-hour time.
 */
export function convertTo12Hour(hour: number): {
  hour: number;
  period: 'am' | 'pm';
} {
  if (hour === 0) {
    return {
      hour: 12,
      period: 'am',
    };
  }

  if (hour === 12) {
    return {
      hour: 12,
      period: 'pm',
    };
  }

  if (hour < 12) {
    return {
      hour,
      period: 'am',
    };
  }

  return {
    hour: hour - 12,
    period: 'pm',
  };
}

/**
 * Convert 12-hour time to 24-hour time.
 */
export function convertTo24Hour(
  hour: number,
  period: 'am' | 'pm'
): number {
  if (period === 'am') {
    return hour === 12 ? 0 : hour;
  }

  return hour === 12 ? 12 : hour + 12;
}

/**
 * Get week number options.
 */
export const WEEK_OPTIONS = [
  {
    label: '1 أسبوع',
    value: 1,
  },
  {
    label: '2 أسبوع',
    value: 2,
  },
  {
    label: '3 أسابيع',
    value: 3,
  },
  {
    label: '4 أسابيع',
    value: 4,
  },
  {
    label: '5 أسابيع',
    value: 5,
  },
  {
    label: '6 أسابيع',
    value: 6,
  },
  {
    label: '8 أسابيع',
    value: 8,
  },
  {
    label: '12 أسبوع',
    value: 12,
  },
];

/**
 * Format time as Arabic.
 *
 * Input:
 * hour = 17
 * minute = 30
 *
 * Output:
 * 05:30 م
 */
export function formatTimeArabic(
  hour: number,
  minute: number
): string {
  const {
    hour: h12,
    period,
  } = convertTo12Hour(hour);

  const periodAr =
    period === 'am' ? 'ص' : 'م';

  return `${String(h12).padStart(
    2,
    '0'
  )}:${String(minute).padStart(
    2,
    '0'
  )} ${periodAr}`;
}

/**
 * Check if appointment times overlap.
 */
export function hasTimeConflict(
  existingHour: number,
  existingMinute: number,
  newHour: number,
  newMinute: number,
  durationMinutes: number = 60
): boolean {
  const existingStart =
    existingHour * 60 +
    existingMinute;

  const existingEnd =
    existingStart + durationMinutes;

  const newStart =
    newHour * 60 +
    newMinute;

  const newEnd =
    newStart + durationMinutes;

  return !(
    newEnd <= existingStart ||
    newStart >= existingEnd
  );
}

/**
 * Get next N available days for rescheduling.
 */
export function getAvailableDates(
  startDate: string,
  numDays: number = 14,
  excludeDates?: string[]
): string[] {
  const dates: string[] = [];

  const current = new Date(
    `${startDate}T00:00:00`
  );

  if (Number.isNaN(current.getTime())) {
    return dates;
  }

  current.setHours(0, 0, 0, 0);

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  if (current < today) {
    current.setTime(today.getTime());
  }

  while (dates.length < numDays) {
    const dateStr =
      formatDateOnly(current);

    const isFridayOrSaturday =
      current.getDay() === 5 ||
      current.getDay() === 6;

    if (
      !excludeDates?.includes(dateStr) &&
      !isFridayOrSaturday
    ) {
      dates.push(dateStr);
    }

    current.setDate(
      current.getDate() + 1
    );
  }

  return dates;
}

/**
 * Get available time slots for a specific date.
 */
export async function getAvailableSlots(
  supabase: any,
  teacherId: string,
  date: string,
  excludeAppointmentId?: string,
  durationMinutes: number = 60
): Promise<
  Array<{
    hour: number;
    minute: number;
    formatted: string;
  }>
> {
  const {
    data: appointments,
    error,
  } = await supabase
    .from('appointments')
    .select(
      'id, start_hour, start_minute'
    )
    .eq('teacher_id', teacherId)
    .eq('date', date)
    .neq('status', 'cancelled')
    .neq('status', 'rescheduled');

  if (error) {
    throw error;
  }

  const bookedSlots = (
    appointments || []
  )
    .filter(
      (appointment: any) =>
        appointment.id !==
        excludeAppointmentId
    )
    .map((appointment: any) => ({
      hour: appointment.start_hour,
      minute:
        appointment.start_minute,
    }));

  const slots: Array<{
    hour: number;
    minute: number;
    formatted: string;
  }> = [];

  for (
    let hour = 8;
    hour < 20;
    hour++
  ) {
    for (const minute of [0, 30]) {
      const hasConflict =
        bookedSlots.some(
          (booked: any) =>
            hasTimeConflict(
              booked.hour,
              booked.minute,
              hour,
              minute,
              durationMinutes
            )
        );

      if (!hasConflict) {
        slots.push({
          hour,
          minute,
          formatted:
            formatTimeArabic(
              hour,
              minute
            ),
        });
      }
    }
  }

  return slots;
}

/**
 * Reschedule an appointment.
 */
export async function rescheduleAppointment(
  supabase: any,
  appointmentId: string,
  newDate: string,
  newHour: number,
  newMinute: number,
  reason?: string
): Promise<void> {
  const {
    data: current,
    error: fetchError,
  } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  if (!current) {
    throw new Error(
      'لم يتم العثور على الموعد.'
    );
  }

  const newDateObj = new Date(
    `${newDate}T00:00:00`
  );

  if (Number.isNaN(newDateObj.getTime())) {
    throw new Error(
      'تاريخ الموعد الجديد غير صحيح.'
    );
  }

  const newDayOfWeek =
    newDateObj.getDay();

  const {
    error: updateError,
  } = await supabase
    .from('appointments')
    .update({
      date: newDate,
      day_of_week: newDayOfWeek,
      start_hour: newHour,
      start_minute: newMinute,
      original_date:
        current.original_date ||
        current.date,
      original_start_hour:
        current.original_start_hour !==
        null
          ? current.original_start_hour
          : current.start_hour,
      original_start_minute:
        current.original_start_minute !==
        null
          ? current.original_start_minute
          : current.start_minute,
      reschedule_reason:
        reason || null,
      status: 'rescheduled',
      updated_at:
        new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (updateError) {
    throw updateError;
  }
}

/**
 * Convert a HH:mm string into hour/minute.
 */
export function parseTime(
  time: string
): {
  hour: number;
  minute: number;
} | null {
  const match =
    /^(\d{1,2}):(\d{2})$/.exec(
      time
    );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return {
    hour,
    minute,
  };
}

/**
 * Format a Date as YYYY-MM-DD
 * without UTC conversion problems.
 */
function formatDateOnly(
  date: Date
): string {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}