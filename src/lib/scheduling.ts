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
 * NOTE: appointment generation from a recurring schedule now goes through
 * the create_recurring_schedule() / sync_recurring_schedule() RPCs (see
 * migration 20260818130000_scheduling_source_of_truth.sql), which handle
 * conflict detection and idempotency server-side. There is intentionally no
 * client-side "create appointments from a preview" helper anymore — a
 * second, divergent generation path is exactly what the scheduling
 * architecture decision ruled out.
 */

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

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const {
    data: blockedRanges,
    error: blockedError,
  } = await supabase
    .from('blocked_time')
    .select('start_at, end_at')
    .eq('teacher_id', teacherId)
    .lt('start_at', dayEnd.toISOString())
    .gt('end_at', dayStart.toISOString());

  if (blockedError) {
    throw blockedError;
  }

  const blockedSlots = (blockedRanges || []).map(
    (b: { start_at: string; end_at: string }) => {
      const start = new Date(b.start_at);
      const end = new Date(b.end_at);
      return {
        startMinutes:
          start.getHours() * 60 + start.getMinutes(),
        endMinutes: end.getHours() * 60 + end.getMinutes(),
      };
    }
  );

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

      const slotStart = hour * 60 + minute;
      const slotEnd = slotStart + durationMinutes;

      const isBlocked = blockedSlots.some(
        (b: { startMinutes: number; endMinutes: number }) =>
          slotStart < b.endMinutes && b.startMinutes < slotEnd
      );

      if (!hasConflict && !isBlocked) {
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

  newDateObj.setHours(newHour, newMinute, 0, 0);

  const durationMs =
    current.end_at && current.start_at
      ? new Date(current.end_at).getTime() -
        new Date(current.start_at).getTime()
      : 60 * 60000;

  const newEndAt = new Date(
    newDateObj.getTime() + durationMs
  );

  // Goes through reschedule_appointment(): it creates a new appointment,
  // closes this one as 'rescheduled', and records the move in
  // appointment_reschedule_history + audit_log — a raw UPDATE here would
  // silently skip all of that (and would also violate the appointments
  // status CHECK constraint before it was widened for 'rescheduled').
  const { error: rpcError } = await supabase.rpc(
    'reschedule_appointment',
    {
      p_appointment_id: appointmentId,
      p_new_start_at: newDateObj.toISOString(),
      p_new_end_at: newEndAt.toISOString(),
      p_reason: reason || null,
    }
  );

  if (rpcError) {
    throw rpcError;
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