import { supabase } from '../supabase';

// ============================================================================
// Data-access layer for lesson lifecycle mutations.
//
// Every function here calls a Postgres RPC (see
// supabase/migrations/20260817200300_rpc_complete_lesson.sql), never a raw
// `supabase.from('lessons').update(...)`. This is the ONE place in the app
// allowed to trigger progress/collection/wallet changes — pages call these
// functions instead of touching those tables directly (Section 30 / "no
// duplicated sensitive business logic across screens").
//
// All functions return a discriminated result instead of throwing, so every
// call site can render a proper error state (Section 33) instead of an
// unhandled raw Postgres error reaching the UI.
// ============================================================================

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CompleteLessonResult = {
  lessonId: string;
  cycleId: string;
  progress: number;
  totalLessons: number;
  collectionCreated: boolean;
  cycleCompleted: boolean;
  nextCycleId: string | null;
  alreadyCompleted: boolean;
};

function friendlyMessage(rawMessage: string): string {
  // Never surface raw Postgres/PostgREST error text to the teacher
  // (Section 33). Map the known error codes our RPCs raise to Arabic.
  if (rawMessage.includes('not authenticated')) return 'انتهت الجلسة. الرجاء تسجيل الدخول مرة أخرى.';
  if (rawMessage.includes('not found or not owned')) return 'لم يتم العثور على العنصر المطلوب.';
  if (rawMessage.includes('already-completed cycle')) return 'الدورة اكتملت بالفعل.';
  if (rawMessage.includes('cancelled lesson')) return 'لا يمكن إكمال حصة ملغاة.';
  if (rawMessage.includes('cannot mark a completed lesson as absent')) return 'لا يمكن تسجيل غياب لحصة مكتملة بالفعل.';
  if (rawMessage.includes('already completed or absent')) return 'لا يمكن تأجيل حصة مكتملة أو مسجل غيابها.';
  if (rawMessage.includes('cannot delete a completed or absent lesson')) return 'لا يمكن حذف حصة مكتملة أو مسجل غيابها. الرجاء الإلغاء بدلًا من الحذف.';
  if (rawMessage.includes('only a scheduled appointment')) return 'لا يمكن إعادة جدولة هذا الموعد.';
  if (rawMessage.includes('exclusion') || rawMessage.includes('no_overlapping')) {
    return 'هذا الموعد يتعارض مع موعد آخر موجود بالفعل.';
  }
  return 'حدث خطأ غير متوقع. حاولي مرة أخرى.';
}

export async function completeLesson(lessonId: string): Promise<ServiceResult<CompleteLessonResult>> {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId });

  if (error) {
    return { ok: false, error: friendlyMessage(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: friendlyMessage('') };
  }

  return {
    ok: true,
    data: {
      lessonId: row.lesson_id,
      cycleId: row.cycle_id,
      progress: row.progress,
      totalLessons: row.total_lessons,
      collectionCreated: row.collection_created,
      cycleCompleted: row.cycle_completed,
      nextCycleId: row.next_cycle_id,
      alreadyCompleted: row.already_completed,
    },
  };
}

export type MarkAbsentResult = {
  lessonId: string;
  cycleId: string;
  progress: number;
  totalLessons: number;
  collectionCreated: boolean;
  cycleCompleted: boolean;
  nextCycleId: string | null;
  alreadyAbsent: boolean;
};

export async function markLessonAbsent(lessonId: string): Promise<ServiceResult<MarkAbsentResult>> {
  const { data, error } = await supabase.rpc('mark_lesson_absent', { p_lesson_id: lessonId });

  if (error) {
    return { ok: false, error: friendlyMessage(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: friendlyMessage('') };
  }

  return {
    ok: true,
    data: {
      lessonId: row.lesson_id,
      cycleId: row.cycle_id,
      progress: row.progress,
      totalLessons: row.total_lessons,
      collectionCreated: row.collection_created,
      cycleCompleted: row.cycle_completed,
      nextCycleId: row.next_cycle_id,
      alreadyAbsent: row.already_absent,
    },
  };
}

export async function cancelLesson(lessonId: string, reason?: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('cancel_lesson', {
    p_lesson_id: lessonId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: null };
}

export async function postponeLesson(lessonId: string, reason?: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('postpone_lesson', {
    p_lesson_id: lessonId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: null };
}

export async function deleteLesson(lessonId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('delete_lesson', { p_lesson_id: lessonId });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: null };
}

export async function rescheduleAppointment(
  appointmentId: string,
  newStartAt: Date,
  newEndAt: Date,
  reason?: string
): Promise<ServiceResult<{ newAppointmentId: string }>> {
  const { data, error } = await supabase.rpc('reschedule_appointment', {
    p_appointment_id: appointmentId,
    p_new_start_at: newStartAt.toISOString(),
    p_new_end_at: newEndAt.toISOString(),
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: { newAppointmentId: data as string } };
}

export async function archiveStudent(studentId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('archive_student', { p_student_id: studentId });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: null };
}

export async function reactivateStudent(studentId: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.rpc('reactivate_student', { p_student_id: studentId });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true, data: null };
}
