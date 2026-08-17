import { StudentSchedule } from './types';

/**
 * Estimate the date the remaining `lessonsNeeded` lessons will be finished,
 * based on the student's weekly schedule slots. This is a simplified version
 * of PRD section 27/28: it looks at scheduled weekdays only (blocked time /
 * existing postponed lessons should be layered on top by whoever wires this
 * up to real calendar data).
 */
export function estimateCompletionDate(
  schedule: StudentSchedule[],
  lessonsNeeded: number,
  from: Date = new Date()
): Date | null {
  if (lessonsNeeded <= 0) return from;
  const activeDays = schedule
    .filter((s) => !s.active_to || new Date(s.active_to) >= from)
    .map((s) => s.day_of_week);
  if (activeDays.length === 0) return null;

  const cursor = new Date(from);
  let found = 0;
  let safety = 0;
  while (found < lessonsNeeded && safety < 400) {
    cursor.setDate(cursor.getDate() + 1);
    safety += 1;
    if (activeDays.includes(cursor.getDay())) {
      found += 1;
    }
  }
  return found === lessonsNeeded ? cursor : null;
}

export function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}
