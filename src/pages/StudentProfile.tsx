import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { supabase } from '../lib/supabase';

import {
  Appointment,
  Collection,
  DAY_NAMES_AR,
  Lesson,
  LessonCycle,
  Student,
  StudentSchedule,
} from '../lib/types';

import { formatDate } from '../lib/dates';
import { convertTo12Hour } from '../lib/scheduling';
import TimePicker12 from '../components/TimePicker12';
import AppointmentCard from '../components/AppointmentCard';


// ============================================================
// Student Profile
// ============================================================

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();

  const [student, setStudent] = useState<Student | null>(null);
  const [cycle, setCycle] = useState<LessonCycle | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [schedule, setSchedule] = useState<StudentSchedule[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  const [savingLesson, setSavingLesson] = useState(false);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);

  // ==========================================================
  // Load
  // ==========================================================

  async function load() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const [
        { data: st, error: studentError },
        { data: cycles, error: cycleError },
        { data: lsn, error: lessonsError },
        { data: cols, error: collectionsError },
        { data: sched, error: scheduleError },
        { data: appts, error: appointmentsError },
      ] = await Promise.all([
        supabase
          .from('students')
          .select('*')
          .eq('id', id)
          .single(),

        supabase
          .from('lesson_cycles')
          .select('*')
          .eq('student_id', id)
          .eq('status', 'active')
          .order('cycle_number', { ascending: false }),

        supabase
          .from('lessons')
          .select('*')
          .eq('student_id', id)
          .order('scheduled_date', { ascending: true })
          .order('start_time', { ascending: true }),

        supabase
          .from('collections')
          .select('*')
          .eq('student_id', id)
          .order('collected_at', { ascending: false }),

        supabase
          .from('student_schedule')
          .select('*')
          .eq('student_id', id)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),

        supabase
          .from('appointments')
          .select('*')
          .eq('student_id', id)
          .order('date', { ascending: true })
          .order('start_hour', { ascending: true })
          .order('start_minute', { ascending: true }),
      ]);

      if (studentError) throw studentError;
      if (cycleError) throw cycleError;
      if (lessonsError) throw lessonsError;
      if (collectionsError) throw collectionsError;
      if (scheduleError) throw scheduleError;
      if (appointmentsError) throw appointmentsError;

      setStudent(st ?? null);
      setCycle(cycles?.[0] ?? null);
      setLessons(lsn ?? []);
      setCollections(cols ?? []);
      setSchedule(sched ?? []);
      setAppointments(appts ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تحميل بيانات الطالب.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // ==========================================================
  // Current date
  // ==========================================================

  const today = new Date().toISOString().split('T')[0];

  // ==========================================================
  // Lesson groups
  // ==========================================================

  const previousLessons = useMemo(() => {
    return lessons
      .filter((lesson) => lesson.scheduled_date <= today)
      .sort((a, b) => {
        const dateCompare =
          a.scheduled_date.localeCompare(b.scheduled_date);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (a.start_time ?? '').localeCompare(
          b.start_time ?? ''
        );
      });
  }, [lessons, today]);

  const upcomingLessons = useMemo(() => {
    return lessons
      .filter(
        (lesson) =>
          lesson.scheduled_date > today &&
          lesson.status === 'scheduled'
      )
      .sort((a, b) => {
        const dateCompare =
          a.scheduled_date.localeCompare(b.scheduled_date);

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (a.start_time ?? '').localeCompare(
          b.start_time ?? ''
        );
      });
  }, [lessons, today]);

  // ==========================================================
  // Upcoming appointments
  // ==========================================================

  const upcomingAppointments = useMemo(() => {
    return appointments.filter(
      (appointment) =>
        appointment.status === 'scheduled' &&
        appointment.date >= today
    );
  }, [appointments, today]);

  // ==========================================================
  // Progress
  // ==========================================================

  const progressPercent =
    cycle && cycle.total_lessons > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (cycle.progress / cycle.total_lessons) * 100
          )
        )
      : 0;

  const remainingToCollection =
    cycle &&
    cycle.collection_status === 'not_yet_collected'
      ? Math.max(
          0,
          cycle.collection_trigger - cycle.progress
        )
      : 0;

  // ==========================================================
  // Mark lesson completed
  // ==========================================================

  async function markCompleted(lessonId: string) {
    setError(null);

    const { error } = await supabase
      .from('lessons')
      .update({
        status: 'completed',
      })
      .eq('id', lessonId);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  // ==========================================================
  // Mark lesson absent
  // ==========================================================

  async function markAbsent(lessonId: string) {
    setError(null);

    const { error } = await supabase
      .from('lessons')
      .update({
        status: 'absent',
      })
      .eq('id', lessonId);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  // ==========================================================
  // Postpone lesson
  // ==========================================================

  async function postponeLesson(lessonId: string) {
    setError(null);

    const { error } = await supabase
      .from('lessons')
      .update({
        status: 'postponed',
      })
      .eq('id', lessonId);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  // ==========================================================
  // Cancel lesson
  // ==========================================================

  async function cancelLesson(lessonId: string) {
    setError(null);

    const { error } = await supabase
      .from('lessons')
      .update({
        status: 'cancelled',
      })
      .eq('id', lessonId);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  // ==========================================================
  // Start editing lesson
  // ==========================================================

  function startEditLesson(lesson: Lesson) {
    setEditingLessonId(lesson.id);

    setEditDate(lesson.scheduled_date);
    setEditTime(lesson.start_time ?? '');
  }

  // ==========================================================
  // Cancel edit
  // ==========================================================

  function cancelEditLesson() {
    if (savingLesson) return;

    setEditingLessonId(null);
    setEditDate('');
    setEditTime('');
  }

  // ==========================================================
  // Save lesson edit
  // ==========================================================

  async function saveLessonEdit(
    e: FormEvent,
    lessonId: string
  ) {
    e.preventDefault();

    if (!editDate) {
      setError('اختر تاريخ الحصة.');
      return;
    }

    setSavingLesson(true);
    setError(null);

    try {
      const endTime = calculateEndTime(
        editTime,
        findLessonDuration(lessons, lessonId)
      );

      const { error } = await supabase
        .from('lessons')
        .update({
          scheduled_date: editDate,
          start_time: editTime || null,
          end_time: endTime,
        })
        .eq('id', lessonId);

      if (error) {
        throw error;
      }

      setEditingLessonId(null);
      setEditDate('');
      setEditTime('');

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تعديل الحصة.'
      );
    } finally {
      setSavingLesson(false);
    }
  }

  // ==========================================================
  // Delete lesson
  // ==========================================================

  async function deleteLesson(lessonId: string) {
    const confirmed = window.confirm(
      'هل أنت متأكد من حذف هذه الحصة نهائيًا؟'
    );

    if (!confirmed) return;

    setDeletingLessonId(lessonId);
    setError(null);

    try {
      const { error } = await supabase
        .from('lessons')
        .delete()
        .eq('id', lessonId);

      if (error) {
        throw error;
      }

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء حذف الحصة.'
      );
    } finally {
      setDeletingLessonId(null);
    }
  }

  // ==========================================================
  // Appointment update
  // ==========================================================

  async function handleAppointmentStatusChange(
    appointmentId: string,
    status: Appointment['status']
  ) {
    setError(null);

    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appointmentId);

    if (error) {
      setError(error.message);
      return;
    }

    await load();
  }

  // ==========================================================
  // Loading
  // ==========================================================

  if (loading) {
    return (
      <div className="py-10 text-center text-ink/50">
        جارِ التحميل...
      </div>
    );
  }

  // ==========================================================
  // Student not found
  // ==========================================================

  if (!student) {
    return (
      <div className="py-10 text-center text-ink/50">
        لم يتم العثور على الطالب.
      </div>
    );
  }

  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div
      className="space-y-6"
      dir="rtl"
    >
      {/* ======================================================
          Header
      ======================================================= */}

      <div>
        <h1 className="text-2xl font-extrabold text-moss-700">
          {student.name}
        </h1>

        <p className="text-sm text-ink/50 mt-1">
          {student.age
            ? `${student.age} سنة`
            : 'السن غير محدد'}

          {student.phone && (
            <>
              {' '}
              · {student.phone}
            </>
          )}
        </p>
      </div>

      {/* ======================================================
          Error
      ======================================================= */}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* ======================================================
          ① تقدم الدورة
      ======================================================= */}

      <section className="card p-6">
        <h2 className="font-extrabold text-moss-700 text-lg mb-5">
          تقدم الدورة
        </h2>

        {!cycle ? (
          <p className="text-sm text-ink/50">
            لا توجد دورة نشطة لهذا الطالب.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">

              <Stat
                label={`الحصص - الدورة #${cycle.cycle_number}`}
                value={`${cycle.progress} / ${cycle.total_lessons}`}
              />

              <Stat
                label="حالة التحصيل"
                value={
                  cycle.collection_status === 'collected'
                    ? 'تم التحصيل ✓'
                    : 'لم يتم التحصيل'
                }
              />

              <Stat
                label="المتبقي لنقطة التحصيل"
                value={
                  cycle.collection_status === 'collected'
                    ? 'تم التحصيل'
                    : `${remainingToCollection} حصة`
                }
              />

              <Stat
                label="حصص مستحقة للطالب"
                value={`${cycle.outstanding_lessons}`}
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-moss-700">
                  نسبة التقدم
                </span>

                <span className="text-sm font-bold text-ink">
                  {Math.round(progressPercent)}%
                </span>
              </div>

              <div className="w-full bg-moss-50 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-moss-500 h-3 rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 bg-moss-50 rounded-2xl p-4">
              <p className="text-xs text-ink/50 mb-1">
                قيمة التحصيل
              </p>

              <p className="font-extrabold text-moss-700">
                {cycle.collection_amount} جنيه
              </p>

              <p className="text-xs text-ink/50 mt-2">
                التحصيل عند الحصة رقم{' '}
                {cycle.collection_trigger}
              </p>
            </div>
          </>
        )}
      </section>

      {/* ======================================================
          ② الحصص السابقة / الحالية
      ======================================================= */}

      <section className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h2 className="font-extrabold text-moss-700 text-lg">
              الحصص السابقة / الحالية
            </h2>

            <p className="text-xs text-ink/50 mt-1">
              تسجيل الحضور والغياب والتأجيل وإدارة الحصص.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap text-xs">
            <span className="pill bg-green-500/10 text-green-700">
              مكتملة
            </span>

            <span className="pill bg-red-500/10 text-red-600">
              غياب
            </span>

            <span className="pill bg-clay-500/10 text-clay-500">
              مؤجلة
            </span>
          </div>
        </div>

        {previousLessons.length === 0 ? (
          <div className="bg-moss-50 rounded-2xl p-5 text-center">
            <p className="text-sm text-ink/50">
              لا توجد حصص سابقة حتى الآن.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {previousLessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                editing={editingLessonId === lesson.id}
                editDate={editDate}
                editTime={editTime}
                saving={savingLesson}
                deleting={deletingLessonId === lesson.id}
                onEdit={() => startEditLesson(lesson)}
                onDelete={() => deleteLesson(lesson.id)}
                onCancelEdit={cancelEditLesson}
                onSaveEdit={(e) =>
                  saveLessonEdit(e, lesson.id)
                }
                onDateChange={setEditDate}
                onTimeChange={setEditTime}
                onCompleted={() =>
                  markCompleted(lesson.id)
                }
                onAbsent={() =>
                  markAbsent(lesson.id)
                }
                onPostponed={() =>
                  postponeLesson(lesson.id)
                }
                onCancelled={() =>
                  cancelLesson(lesson.id)
                }
              />
            ))}
          </div>
        )}

        {/* ====================================================
            Upcoming Lessons
        ===================================================== */}

        {upcomingLessons.length > 0 && (
          <div className="mt-8">
            <h3 className="font-extrabold text-moss-700 mb-3">
              الحصص القادمة
            </h3>

            <div className="space-y-2">
              {upcomingLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  editing={editingLessonId === lesson.id}
                  editDate={editDate}
                  editTime={editTime}
                  saving={savingLesson}
                  deleting={deletingLessonId === lesson.id}
                  onEdit={() => startEditLesson(lesson)}
                  onDelete={() => deleteLesson(lesson.id)}
                  onCancelEdit={cancelEditLesson}
                  onSaveEdit={(e) =>
                    saveLessonEdit(e, lesson.id)
                  }
                  onDateChange={setEditDate}
                  onTimeChange={setEditTime}
                  onCompleted={() =>
                    markCompleted(lesson.id)
                  }
                  onAbsent={() =>
                    markAbsent(lesson.id)
                  }
                  onPostponed={() =>
                    postponeLesson(lesson.id)
                  }
                  onCancelled={() =>
                    cancelLesson(lesson.id)
                  }
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ======================================================
          ③ سجل التحصيل
      ======================================================= */}

      <section className="card p-6">
        <h2 className="font-extrabold text-moss-700 text-lg mb-4">
          سجل التحصيل
        </h2>

        {collections.length === 0 ? (
          <p className="text-sm text-ink/50">
            لا يوجد تحصيل بعد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-ink/50 border-b border-moss-50">
                  <th className="py-3">التاريخ</th>
                  <th>المبلغ</th>
                  <th>عند الحصة رقم</th>
                </tr>
              </thead>

              <tbody>
                {collections.map((collection) => (
                  <tr
                    key={collection.id}
                    className="border-b border-moss-50"
                  >
                    <td className="py-3">
                      {formatDate(
                        collection.collected_at
                      )}
                    </td>

                    <td className="font-bold text-moss-700">
                      {collection.amount} جنيه
                    </td>

                    <td>
                      {collection.trigger_lesson_number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ======================================================
          ④ الجدول والحصص
      ======================================================= */}

      <section className="card p-6">
        <h2 className="font-extrabold text-moss-700 text-lg mb-5">
          الجدول والحصص
        </h2>

        {/* ====================================================
            Weekly Schedule
        ===================================================== */}

        <div>
          <h3 className="font-bold text-ink mb-3">
            الجدول الأسبوعي
          </h3>

          {schedule.length === 0 ? (
            <div className="bg-moss-50 rounded-2xl p-4">
              <p className="text-sm text-ink/50">
                لا يوجد جدول أسبوعي مسجل لهذا الطالب.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {schedule.map((slot) => (
                <div
                  key={slot.id}
                  className="border border-moss-100 bg-moss-50 rounded-2xl p-4"
                >
                  <p className="font-extrabold text-moss-700">
                    {DAY_NAMES_AR[slot.day_of_week]}
                  </p>

                  <p className="text-lg font-bold text-ink mt-1">
                    {formatTimeValue(slot.start_time)}
                  </p>

                  <p className="text-xs text-ink/50 mt-1">
                    مدة الحصة: {slot.duration_minutes} دقيقة
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ====================================================
            Appointments
        ===================================================== */}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-ink">
              المواعيد والحصص القادمة
            </h3>

            <span className="text-xs text-ink/50">
              {upcomingAppointments.length} موعد
            </span>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="bg-moss-50 rounded-2xl p-4">
              <p className="text-sm text-ink/50">
                لا توجد حصص قادمة مجدولة.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onUpdate={load}
                  isEditable={true}
                />
              ))}
            </div>
          )}
        </div>

        {/* ====================================================
            All Appointments
        ===================================================== */}

        {appointments.length > upcomingAppointments.length && (
          <div className="mt-8">
            <h3 className="font-bold text-ink mb-3">
              كل المواعيد
            </h3>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {appointments
                .filter(
                  (appointment) =>
                    !upcomingAppointments.some(
                      (upcoming) =>
                        upcoming.id === appointment.id
                    )
                )
                .map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onUpdate={load}
                    isEditable={true}
                  />
                ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


// ============================================================
// Lesson Row
// ============================================================

function LessonRow({
  lesson,
  editing,
  editDate,
  editTime,
  saving,
  deleting,
  onEdit,
  onDelete,
  onCancelEdit,
  onSaveEdit,
  onDateChange,
  onTimeChange,
  onCompleted,
  onAbsent,
  onPostponed,
  onCancelled,
}: {
  lesson: Lesson;
  editing: boolean;

  editDate: string;
  editTime: string;

  saving: boolean;
  deleting: boolean;

  onEdit: () => void;
  onDelete: () => void;

  onCancelEdit: () => void;

  onSaveEdit: (
    e: FormEvent<HTMLFormElement>
  ) => void;

  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;

  onCompleted: () => void;
  onAbsent: () => void;
  onPostponed: () => void;
  onCancelled: () => void;
}) {
  return (
    <div className="border border-moss-100 rounded-2xl p-4">
      {!editing ? (
        <>
          {/* ==================================================
              Normal Lesson
          =================================================== */}

          <div className="flex items-start justify-between gap-4 flex-wrap">

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-extrabold text-ink">
                  {formatDate(lesson.scheduled_date)}
                </p>

                <LessonStatusPill
                  status={lesson.status}
                />
              </div>

              <div className="mt-2 text-sm text-ink/60">
                {lesson.start_time ? (
                  <>
                    الساعة{' '}
                    <span className="font-bold text-ink">
                      {formatTimeValue(
                        lesson.start_time
                      )}
                    </span>
                  </>
                ) : (
                  'الوقت غير محدد'
                )}
              </div>

              {lesson.notes && (
                <p className="text-xs text-ink/50 mt-2">
                  {lesson.notes}
                </p>
              )}
            </div>

            {/* =================================================
                Actions
            ================================================== */}

            <div className="flex flex-wrap gap-2">

              {lesson.status !== 'completed' && (
                <button
                  type="button"
                  onClick={onCompleted}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100"
                >
                  ✓ مكتملة
                </button>
              )}

              {lesson.status !== 'absent' && (
                <button
                  type="button"
                  onClick={onAbsent}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100"
                >
                  ✕ غياب
                </button>
              )}

              {lesson.status !== 'postponed' && (
                <button
                  type="button"
                  onClick={onPostponed}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-clay-500/10 text-clay-500 hover:bg-clay-500/20"
                >
                  🟠 مؤجلة
                </button>
              )}

              <button
                type="button"
                onClick={onEdit}
                className="btn-secondary text-xs"
              >
                تعديل
              </button>

              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {deleting ? 'جارِ الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* =====================================================
           Edit Lesson
        ====================================================== */

        <form
          onSubmit={onSaveEdit}
          className="space-y-4"
        >
          <div>
            <h3 className="font-extrabold text-moss-700">
              تعديل الحصة
            </h3>

            <p className="text-xs text-ink/50 mt-1">
              يمكنك تعديل تاريخ ووقت الحصة.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">

            <div>
              <label className="label">
                التاريخ
              </label>

              <input
                className="input"
                type="date"
                value={editDate}
                onChange={(e) =>
                  onDateChange(e.target.value)
                }
                disabled={saving}
                required
              />
            </div>

            <div>
              <label className="label">
                الوقت
              </label>

              <TimePicker12
                value={editTime}
                onChange={onTimeChange}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving
                ? 'جارِ الحفظ...'
                : 'حفظ التعديل'}
            </button>

            <button
              type="button"
              onClick={onCancelEdit}
              disabled={saving}
              className="btn-secondary"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}
    </div>
  );
}


// ============================================================
// Lesson Status Pill
// ============================================================

function LessonStatusPill({
  status,
}: {
  status: Lesson['status'];
}) {
  const styles: Record<
    Lesson['status'],
    string
  > = {
    scheduled:
      'bg-moss-50 text-moss-700',

    completed:
      'bg-green-500/10 text-green-700',

    absent:
      'bg-red-500/10 text-red-600',

    postponed:
      'bg-clay-500/10 text-clay-500',

    cancelled:
      'bg-gray-100 text-gray-500',
  };

  const labels: Record<
    Lesson['status'],
    string
  > = {
    scheduled: 'مجدولة',
    completed: 'مكتملة',
    absent: 'غياب',
    postponed: 'مؤجلة',
    cancelled: 'ملغاة',
  };

  return (
    <span
      className={`pill text-xs ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}


// ============================================================
// Stat
// ============================================================

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-ink/50 mb-1">
        {label}
      </p>

      <p className="text-lg font-extrabold text-ink">
        {value}
      </p>
    </div>
  );
}


// ============================================================
// Format time
// ============================================================

function formatTimeValue(
  time: string | null
): string {
  if (!time) return '—';

  const parts = time.split(':');

  const hour = Number(parts[0]);
  const minute = Number(parts[1] ?? 0);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return time;
  }

  const converted = convertTo12Hour(hour);

  return `${String(converted.hour).padStart(
    2,
    '0'
  )}:${String(minute).padStart(2, '0')} ${
    converted.period === 'am' ? 'ص' : 'م'
  }`;
}


// ============================================================
// Find lesson duration
// ============================================================

function findLessonDuration(
  lessons: Lesson[],
  lessonId: string
): number {
  const lesson = lessons.find(
    (item) => item.id === lessonId
  );

  if (!lesson) {
    return 60;
  }

  if (
    lesson.start_time &&
    lesson.end_time
  ) {
    const start = timeToMinutes(
      lesson.start_time
    );

    const end = timeToMinutes(
      lesson.end_time
    );

    if (end > start) {
      return end - start;
    }
  }

  return 60;
}


// ============================================================
// Calculate end time
// ============================================================

function calculateEndTime(
  startTime: string,
  durationMinutes: number
): string | null {
  if (!startTime) {
    return null;
  }

  const start = timeToMinutes(startTime);

  if (Number.isNaN(start)) {
    return null;
  }

  const end = start + durationMinutes;

  const hour = Math.floor(end / 60) % 24;
  const minute = end % 60;

  return `${String(hour).padStart(
    2,
    '0'
  )}:${String(minute).padStart(2, '0')}:00`;
}


// ============================================================
// Time to minutes
// ============================================================

function timeToMinutes(
  time: string
): number {
  const [hours, minutes] = time
    .split(':')
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return NaN;
  }

  return hours * 60 + minutes;
}