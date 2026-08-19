import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { supabase } from '../lib/supabase';

import {
  Appointment,
  Collection,
  DAY_NAMES_AR,
  Lesson,
  LessonCycle,
  RecurringSchedule,
  Student,
} from '../lib/types';

import { formatDate } from '../lib/dates';
import { convertTo12Hour } from '../lib/scheduling';
import TimePicker12 from '../components/TimePicker12';
import AppointmentCard from '../components/AppointmentCard';
import {
  completeLesson as completeLessonRpc,
  markLessonAbsent,
  cancelLesson as cancelLessonRpc,
  postponeLesson as postponeLessonRpc,
  deleteLesson as deleteLessonRpc,
} from '../lib/services/lessons';


// ============================================================
// Student Profile
// ============================================================

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<Student | null>(null);
  const [cycle, setCycle] = useState<LessonCycle | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [recurringSchedule, setRecurringSchedule] =
    useState<RecurringSchedule | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==========================================================
  // Student editing
  // ملاحظة: الملاحظات تم حذفها من تعديل البيانات الأساسية
  // ==========================================================

  const [editingStudent, setEditingStudent] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);

  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState('');
  const [studentPhone, setStudentPhone] = useState('');

  // ==========================================================
  // Delete student
  // ==========================================================

  const [deletingStudent, setDeletingStudent] = useState(false);

  // ==========================================================
  // Lesson editing
  // ==========================================================

  const [editingLessonId, setEditingLessonId] =
    useState<string | null>(null);

  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editLessonNotes, setEditLessonNotes] = useState('');
  const [savingLesson, setSavingLesson] = useState(false);
  const [deletingLessonId, setDeletingLessonId] =
    useState<string | null>(null);

  // ==========================================================
  // Schedule editing
  // ==========================================================

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftDayTimes, setDraftDayTimes] =
    useState<Record<number, string>>({});
  const [draftDuration, setDraftDuration] = useState(60);
  const [draftNumWeeks, setDraftNumWeeks] = useState(52);

  const [syncSummary, setSyncSummary] = useState<{
    created: number;
    updated: number;
    cancelled: number;
    conflicts: Array<{ date: string; reason: string }>;
  } | null>(null);

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
          .order('cycle_number', {
            ascending: false,
          }),

        supabase
          .from('lessons')
          .select('*')
          .eq('student_id', id)
          .order('scheduled_date', {
            ascending: true,
          })
          .order('start_time', {
            ascending: true,
          }),

        supabase
          .from('collections')
          .select('*')
          .eq('student_id', id)
          .order('collected_at', {
            ascending: false,
          }),

        supabase
          .from('recurring_schedules')
          .select('*')
          .eq('student_id', id)
          .eq('status', 'active')
          .maybeSingle(),

        supabase
          .from('appointments')
          .select('*')
          .eq('student_id', id)
          .order('date', {
            ascending: true,
          })
          .order('start_hour', {
            ascending: true,
          })
          .order('start_minute', {
            ascending: true,
          }),
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
      setRecurringSchedule(sched ?? null);
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

  const today = new Date()
    .toISOString()
    .split('T')[0];

  // ==========================================================
  // Lesson groups
  // ==========================================================

  const previousLessons = useMemo(() => {
    return lessons
      .filter(
        (lesson) =>
          lesson.scheduled_date <= today
      )
      .sort((a, b) => {
        const dateCompare =
          a.scheduled_date.localeCompare(
            b.scheduled_date
          );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (
          a.start_time ?? ''
        ).localeCompare(
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
          a.scheduled_date.localeCompare(
            b.scheduled_date
          );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return (
          a.start_time ?? ''
        ).localeCompare(
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
            (cycle.progress /
              cycle.total_lessons) *
              100
          )
        )
      : 0;

  const remainingToCollection =
    cycle &&
    cycle.collection_status ===
      'not_yet_collected'
      ? Math.max(
          0,
          cycle.collection_trigger -
            cycle.progress
        )
      : 0;

  // ==========================================================
  // Start editing student
  // ==========================================================

  function startEditStudent() {
    if (!student) return;

    setStudentName(student.name);

    setStudentAge(
      student.age !== null
        ? String(student.age)
        : ''
    );

    setStudentPhone(student.phone ?? '');

    setEditingStudent(true);
    setError(null);
  }

  // ==========================================================
  // Cancel student edit
  // ==========================================================

  function cancelEditStudent() {
    if (savingStudent) return;

    setEditingStudent(false);
  }

  // ==========================================================
  // Save student
  // ==========================================================

  async function saveStudent(e: FormEvent) {
    e.preventDefault();

    if (!id) return;

    if (!studentName.trim()) {
      setError('اسم الطالب مطلوب.');
      return;
    }

    setSavingStudent(true);
    setError(null);

    try {
      const ageValue =
        studentAge.trim() === ''
          ? null
          : Number(studentAge);

      if (
        ageValue !== null &&
        (!Number.isFinite(ageValue) ||
          ageValue < 0)
      ) {
        setError('السن غير صحيح.');
        return;
      }

      const { error: updateError } =
        await supabase
          .from('students')
          .update({
            name: studentName.trim(),
            age: ageValue,
            phone:
              studentPhone.trim() || null,
          })
          .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      setEditingStudent(false);

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تعديل بيانات الطالب.'
      );
    } finally {
      setSavingStudent(false);
    }
  }

  // ==========================================================
  // Delete student
  // ==========================================================

  async function deleteStudent() {
    if (!id || !student) return;

    const firstConfirm =
      window.confirm(
        `هل أنت متأكد من حذف الطالب "${student.name}" نهائيًا؟`
      );

    if (!firstConfirm) return;

    const secondConfirm =
      window.confirm(
        'هذا الإجراء سيحذف بيانات الطالب المرتبطة به إذا كانت قاعدة البيانات تسمح بالحذف المتسلسل. هل تريد المتابعة؟'
      );

    if (!secondConfirm) return;

    setDeletingStudent(true);
    setError(null);

    try {
      const { error: deleteError } =
        await supabase
          .from('students')
          .delete()
          .eq('id', id);

      if (deleteError) {
        throw deleteError;
      }

      navigate(-1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء حذف الطالب.'
      );
    } finally {
      setDeletingStudent(false);
    }
  }

  // ==========================================================
  // Mark lesson completed
  // ==========================================================

  async function markCompleted(
    lessonId: string
  ) {
    setError(null);

    const result = await completeLessonRpc(lessonId);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await load();
  }

  // ==========================================================
  // Mark lesson absent
  // ==========================================================

  async function markAbsent(
    lessonId: string
  ) {
    setError(null);

    const result = await markLessonAbsent(lessonId);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await load();
  }

  // ==========================================================
  // Postpone lesson
  // ==========================================================

  async function postponeLesson(
    lessonId: string
  ) {
    setError(null);

    const result = await postponeLessonRpc(lessonId);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await load();
  }

  // ==========================================================
  // Cancel lesson
  // ==========================================================

  async function cancelLesson(
    lessonId: string
  ) {
    setError(null);

    const result = await cancelLessonRpc(lessonId);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await load();
  }

  // ==========================================================
  // Start editing lesson
  // ==========================================================

  function startEditLesson(
    lesson: Lesson
  ) {
    setEditingLessonId(lesson.id);

    setEditDate(
      lesson.scheduled_date
    );

    setEditTime(
      lesson.start_time ?? ''
    );

    setEditLessonNotes(
      lesson.notes ?? ''
    );

    setError(null);
  }

  // ==========================================================
  // Cancel edit lesson
  // ==========================================================

  function cancelEditLesson() {
    if (savingLesson) return;

    setEditingLessonId(null);
    setEditDate('');
    setEditTime('');
    setEditLessonNotes('');
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
      const endTime =
        calculateEndTime(
          editTime,
          findLessonDuration(
            lessons,
            lessonId
          )
        );

      const { error } =
        await supabase
          .from('lessons')
          .update({
            scheduled_date: editDate,
            start_time:
              editTime || null,
            end_time: endTime,
            notes:
              editLessonNotes.trim() ||
              null,
          })
          .eq('id', lessonId);

      if (error) {
        throw error;
      }

      setEditingLessonId(null);
      setEditDate('');
      setEditTime('');
      setEditLessonNotes('');

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

  async function deleteLesson(
    lessonId: string
  ) {
    const confirmed =
      window.confirm(
        'هل أنت متأكد من حذف هذه الحصة نهائيًا؟'
      );

    if (!confirmed) return;

    setDeletingLessonId(lessonId);
    setError(null);

    try {
      const result = await deleteLessonRpc(lessonId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      await load();
    } finally {
      setDeletingLessonId(null);
    }
  }

  // ==========================================================
  // Start schedule editing
  // ==========================================================

  function startEditSchedule() {
    if (recurringSchedule) {
      setDraftDays([...recurringSchedule.days_of_week]);
      setDraftDayTimes(
        Object.fromEntries(
          Object.entries(
            recurringSchedule.day_times || {}
          ).map(([k, v]) => [Number(k), v as string])
        )
      );
      setDraftDuration(recurringSchedule.duration_minutes);
      setDraftNumWeeks(recurringSchedule.num_weeks);
    } else {
      setDraftDays([]);
      setDraftDayTimes({});
      setDraftDuration(60);
      setDraftNumWeeks(52);
    }

    setSyncSummary(null);
    setEditingSchedule(true);
    setError(null);
  }

  // ==========================================================
  // Cancel schedule edit
  // ==========================================================

  function cancelEditSchedule() {
    if (savingSchedule) return;

    setEditingSchedule(false);
  }

  // ==========================================================
  // Toggle a day on/off in the draft
  // ==========================================================

  function toggleDraftDay(day: number) {
    setDraftDays((current) => {
      if (current.includes(day)) {
        return current.filter((d) => d !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });

    setDraftDayTimes((current) => {
      if (current[day]) return current;
      const fallback =
        Object.values(current)[0] || '16:00';
      return { ...current, [day]: fallback };
    });
  }

  // ==========================================================
  // Update draft day time
  // ==========================================================

  function updateDraftDayTime(day: number, value: string) {
    setDraftDayTimes((current) => ({
      ...current,
      [day]: value,
    }));
  }

  // ==========================================================
  // Save schedule (recurring_schedules — single source of truth)
  // ==========================================================

  async function saveSchedule() {
    setSavingSchedule(true);
    setError(null);

    try {
      if (draftDays.length === 0) {
        throw new Error('اختر يومًا واحدًا على الأقل.');
      }

      for (const day of draftDays) {
        if (!draftDayTimes[day]) {
          throw new Error(
            `اختر وقت يوم ${DAY_NAMES_AR[day]}.`
          );
        }
      }

      if (
        !Number.isFinite(draftDuration) ||
        draftDuration <= 0
      ) {
        throw new Error('مدة الحصة غير صحيحة.');
      }

      const dayTimesPayload: Record<string, string> = {};
      for (const day of draftDays) {
        dayTimesPayload[String(day)] = draftDayTimes[day];
      }

      let result;

      if (recurringSchedule) {
        const { data, error } = await supabase.rpc(
          'update_recurring_schedule',
          {
            p_recurring_schedule_id: recurringSchedule.id,
            p_days_of_week: draftDays,
            p_day_times: dayTimesPayload,
            p_duration_minutes: draftDuration,
            p_num_weeks: draftNumWeeks,
            p_start_date: null,
          }
        );

        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase.rpc(
          'create_recurring_schedule',
          {
            p_student_id: id,
            p_start_date: new Date()
              .toISOString()
              .split('T')[0],
            p_days_of_week: draftDays,
            p_day_times: dayTimesPayload,
            p_duration_minutes: draftDuration,
            p_num_weeks: draftNumWeeks,
          }
        );

        if (error) throw error;
        result = data;
      }

      setSyncSummary(result ?? null);
      setEditingSchedule(false);

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تعديل الجدول.'
      );
    } finally {
      setSavingSchedule(false);
    }
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

      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
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

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={startEditStudent}
              className="btn-secondary"
            >
              تعديل بيانات الطالب
            </button>

            <button
              type="button"
              onClick={deleteStudent}
              disabled={deletingStudent}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {deletingStudent
                ? 'جارِ الحذف...'
                : 'حذف الطالب'}
            </button>
          </div>
        </div>

        {/* ====================================================
            Student Edit
        ===================================================== */}

        {editingStudent && (
          <form
            onSubmit={saveStudent}
            className="mt-6 border-t border-moss-50 pt-6 space-y-4"
          >
            <div>
              <h2 className="font-extrabold text-moss-700">
                تعديل البيانات الأساسية
              </h2>

              <p className="text-xs text-ink/50 mt-1">
                يمكنك تعديل الاسم والسن ورقم الهاتف.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  الاسم
                </label>

                <input
                  className="input"
                  value={studentName}
                  onChange={(e) =>
                    setStudentName(
                      e.target.value
                    )
                  }
                  disabled={savingStudent}
                  required
                />
              </div>

              <div>
                <label className="label">
                  السن
                </label>

                <input
                  className="input"
                  type="number"
                  min="0"
                  value={studentAge}
                  onChange={(e) =>
                    setStudentAge(
                      e.target.value
                    )
                  }
                  disabled={savingStudent}
                />
              </div>

              <div>
                <label className="label">
                  رقم الهاتف
                </label>

                <input
                  className="input"
                  value={studentPhone}
                  onChange={(e) =>
                    setStudentPhone(
                      e.target.value
                    )
                  }
                  disabled={savingStudent}
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="submit"
                disabled={savingStudent}
                className="btn-primary"
              >
                {savingStudent
                  ? 'جارِ الحفظ...'
                  : 'حفظ بيانات الطالب'}
              </button>

              <button
                type="button"
                onClick={cancelEditStudent}
                disabled={savingStudent}
                className="btn-secondary"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </section>

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
                  cycle.collection_status ===
                  'collected'
                    ? 'تم التحصيل ✓'
                    : 'لم يتم التحصيل'
                }
              />

              <Stat
                label="المتبقي لنقطة التحصيل"
                value={
                  cycle.collection_status ===
                  'collected'
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
                  {Math.round(
                    progressPercent
                  )}
                  %
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
            {previousLessons.map(
              (lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  editing={
                    editingLessonId ===
                    lesson.id
                  }
                  editDate={editDate}
                  editTime={editTime}
                  editLessonNotes={
                    editLessonNotes
                  }
                  saving={savingLesson}
                  deleting={
                    deletingLessonId ===
                    lesson.id
                  }
                  onEdit={() =>
                    startEditLesson(
                      lesson
                    )
                  }
                  onDelete={() =>
                    deleteLesson(
                      lesson.id
                    )
                  }
                  onCancelEdit={
                    cancelEditLesson
                  }
                  onSaveEdit={(e) =>
                    saveLessonEdit(
                      e,
                      lesson.id
                    )
                  }
                  onDateChange={
                    setEditDate
                  }
                  onTimeChange={
                    setEditTime
                  }
                  onLessonNotesChange={
                    setEditLessonNotes
                  }
                  onCompleted={() =>
                    markCompleted(
                      lesson.id
                    )
                  }
                  onAbsent={() =>
                    markAbsent(
                      lesson.id
                    )
                  }
                  onPostponed={() =>
                    postponeLesson(
                      lesson.id
                    )
                  }
                  onCancelled={() =>
                    cancelLesson(
                      lesson.id
                    )
                  }
                />
              )
            )}
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
              {upcomingLessons.map(
                (lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    editing={
                      editingLessonId ===
                      lesson.id
                    }
                    editDate={editDate}
                    editTime={editTime}
                    editLessonNotes={
                      editLessonNotes
                    }
                    saving={savingLesson}
                    deleting={
                      deletingLessonId ===
                      lesson.id
                    }
                    onEdit={() =>
                      startEditLesson(
                        lesson
                      )
                    }
                    onDelete={() =>
                      deleteLesson(
                        lesson.id
                      )
                    }
                    onCancelEdit={
                      cancelEditLesson
                    }
                    onSaveEdit={(e) =>
                      saveLessonEdit(
                        e,
                        lesson.id
                      )
                    }
                    onDateChange={
                      setEditDate
                    }
                    onTimeChange={
                      setEditTime
                    }
                    onLessonNotesChange={
                      setEditLessonNotes
                    }
                    onCompleted={() =>
                      markCompleted(
                        lesson.id
                      )
                    }
                    onAbsent={() =>
                      markAbsent(
                        lesson.id
                      )
                    }
                    onPostponed={() =>
                      postponeLesson(
                        lesson.id
                      )
                    }
                    onCancelled={() =>
                      cancelLesson(
                        lesson.id
                      )
                    }
                  />
                )
              )}
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
                  <th className="py-3">
                    التاريخ
                  </th>
                  <th>المبلغ</th>
                  <th>
                    عند الحصة رقم
                  </th>
                </tr>
              </thead>

              <tbody>
                {collections.map(
                  (collection) => (
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
                        {collection.amount}{' '}
                        جنيه
                      </td>

                      <td>
                        {
                          collection.trigger_lesson_number
                        }
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ======================================================
          ④ الجدول والحصص
      ====================================================== */}

      <section className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <h2 className="font-extrabold text-moss-700 text-lg">
            الجدول والحصص
          </h2>

          {!editingSchedule && (
            <button
              type="button"
              onClick={
                startEditSchedule
              }
              className="btn-secondary"
            >
              {recurringSchedule
                ? 'تعديل الجدول'
                : 'إنشاء جدول أسبوعي'}
            </button>
          )}
        </div>

        {/* ====================================================
            Sync summary (after saving)
        ===================================================== */}

        {syncSummary && (
          <div className="bg-moss-50 border border-moss-200 rounded-2xl p-4 mb-4 text-sm">
            <p className="font-bold text-moss-700 mb-1">
              تم تحديث الجدول
            </p>
            <p className="text-ink/70">
              مواعيد جديدة: {syncSummary.created} — مواعيد
              معدَّلة: {syncSummary.updated} — مواعيد
              أُلغيت: {syncSummary.cancelled}
            </p>
            {syncSummary.conflicts.length > 0 && (
              <div className="mt-2 text-red-700">
                <p className="font-bold">
                  تعارضات لم تُطبَّق:
                </p>
                {syncSummary.conflicts.map((c, i) => (
                  <p key={i}>
                    {c.date}: {c.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================
            Weekly Schedule
        ===================================================== */}

        <div>
          <h3 className="font-bold text-ink mb-3">
            الجدول الأسبوعي
          </h3>

          {!editingSchedule ? (
            !recurringSchedule ||
            recurringSchedule.days_of_week.length === 0 ? (
              <div className="bg-moss-50 rounded-2xl p-4">
                <p className="text-sm text-ink/50">
                  لا يوجد جدول أسبوعي مسجل لهذا الطالب.
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recurringSchedule.days_of_week.map(
                  (day) => (
                    <div
                      key={day}
                      className="border border-moss-100 bg-moss-50 rounded-2xl p-4"
                    >
                      <p className="font-extrabold text-moss-700">
                        {DAY_NAMES_AR[day]}
                      </p>

                      <p className="text-lg font-bold text-ink mt-1">
                        {formatTimeValue(
                          recurringSchedule.day_times?.[
                            String(day)
                          ] ??
                            `${String(
                              recurringSchedule.start_hour
                            ).padStart(2, '0')}:${String(
                              recurringSchedule.start_minute
                            ).padStart(2, '0')}`
                        )}
                      </p>

                      <p className="text-xs text-ink/50 mt-1">
                        مدة الحصة:{' '}
                        {recurringSchedule.duration_minutes}{' '}
                        دقيقة
                      </p>
                    </div>
                  )
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <p className="label mb-2">أيام الأسبوع</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {DAY_NAMES_AR.map((name, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDraftDay(day)}
                      disabled={savingSchedule}
                      className={`px-2 py-2 rounded-xl text-xs font-bold border-2 transition ${
                        draftDays.includes(day)
                          ? 'border-moss-500 bg-moss-100 text-moss-700'
                          : 'border-ink/10 bg-white'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {draftDays.map((day) => (
                <div
                  key={day}
                  className="border border-moss-100 rounded-2xl p-4"
                >
                  <p className="font-extrabold text-moss-700 mb-3">
                    {DAY_NAMES_AR[day]}
                  </p>

                  <TimePicker12
                    value={draftDayTimes[day] || ''}
                    onChange={(value) =>
                      updateDraftDayTime(day, value)
                    }
                  />
                </div>
              ))}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    مدة الحصة (دقيقة)
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={draftDuration}
                    onChange={(e) =>
                      setDraftDuration(
                        Number(e.target.value)
                      )
                    }
                    disabled={savingSchedule}
                  />
                </div>

                <div>
                  <label className="label">
                    عدد الأسابيع
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="52"
                    value={draftNumWeeks}
                    onChange={(e) =>
                      setDraftNumWeeks(
                        Number(e.target.value)
                      )
                    }
                    disabled={savingSchedule}
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={saveSchedule}
                  disabled={
                    savingSchedule
                  }
                  className="btn-primary"
                >
                  {savingSchedule
                    ? 'جارِ الحفظ...'
                    : 'حفظ الجدول'}
                </button>

                <button
                  type="button"
                  onClick={
                    cancelEditSchedule
                  }
                  disabled={
                    savingSchedule
                  }
                  className="btn-secondary"
                >
                  إلغاء
                </button>
              </div>
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
              {upcomingAppointments.length}{' '}
              موعد
            </span>
          </div>

          {upcomingAppointments.length ===
          0 ? (
            <div className="bg-moss-50 rounded-2xl p-4">
              <p className="text-sm text-ink/50">
                لا توجد حصص قادمة مجدولة.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map(
                (appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={
                      appointment
                    }
                    onUpdate={load}
                    isEditable={true}
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* ====================================================
            All Appointments
        ===================================================== */}

        {appointments.length >
          upcomingAppointments.length && (
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
                        upcoming.id ===
                        appointment.id
                    )
                )
                .map(
                  (appointment) => (
                    <AppointmentCard
                      key={
                        appointment.id
                      }
                      appointment={
                        appointment
                      }
                      onUpdate={load}
                      isEditable={true}
                    />
                  )
                )}
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
  editLessonNotes,
  saving,
  deleting,
  onEdit,
  onDelete,
  onCancelEdit,
  onSaveEdit,
  onDateChange,
  onTimeChange,
  onLessonNotesChange,
  onCompleted,
  onAbsent,
  onPostponed,
  onCancelled,
}: {
  lesson: Lesson;
  editing: boolean;

  editDate: string;
  editTime: string;
  editLessonNotes: string;

  saving: boolean;
  deleting: boolean;

  onEdit: () => void;
  onDelete: () => void;

  onCancelEdit: () => void;

  onSaveEdit: (
    e: FormEvent<HTMLFormElement>
  ) => void;

  onDateChange: (
    value: string
  ) => void;

  onTimeChange: (
    value: string
  ) => void;

  onLessonNotesChange: (
    value: string
  ) => void;

  onCompleted: () => void;
  onAbsent: () => void;
  onPostponed: () => void;
  onCancelled: () => void;
}) {
  return (
    <div className="border border-moss-100 rounded-2xl p-4">
      {!editing ? (
        <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-extrabold text-ink">
                  {formatDate(
                    lesson.scheduled_date
                  )}
                </p>

                <LessonStatusPill
                  status={
                    lesson.status
                  }
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
                <div className="mt-3 bg-moss-50 rounded-xl p-3">
                  <p className="text-xs text-ink/40 mb-1">
                    ملاحظات
                  </p>

                  <p className="text-xs text-ink/60 whitespace-pre-wrap">
                    {lesson.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {lesson.status !==
                'completed' && (
                <button
                  type="button"
                  onClick={
                    onCompleted
                  }
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100"
                >
                  ✓ مكتملة
                </button>
              )}

              {lesson.status !==
                'absent' && (
                <button
                  type="button"
                  onClick={onAbsent}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100"
                >
                  ✕ غياب
                </button>
              )}

              {lesson.status !==
                'postponed' && (
                <button
                  type="button"
                  onClick={
                    onPostponed
                  }
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-clay-500/10 text-clay-500 hover:bg-clay-500/20"
                >
                  🟠 مؤجلة
                </button>
              )}

              {lesson.status !==
                'cancelled' && (
                <button
                  type="button"
                  onClick={
                    onCancelled
                  }
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-500 hover:bg-gray-200"
                >
                  إلغاء
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
                {deleting
                  ? 'جارِ الحذف...'
                  : 'حذف'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <form
          onSubmit={onSaveEdit}
          className="space-y-4"
        >
          <div>
            <h3 className="font-extrabold text-moss-700">
              تعديل الحصة
            </h3>

            <p className="text-xs text-ink/50 mt-1">
              يمكنك تعديل تاريخ ووقت وملاحظات الحصة.
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
                  onDateChange(
                    e.target.value
                  )
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

          <div>
            <label className="label">
              ملاحظات الحصة
              <span className="text-ink/40 mr-1">
                (اختياري)
              </span>
            </label>

            <textarea
              className="input min-h-20"
              value={editLessonNotes}
              onChange={(e) =>
                onLessonNotesChange(
                  e.target.value
                )
              }
              disabled={saving}
              placeholder="مثال: تم تغيير الموعد بناءً على طلب الطالب..."
            />
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
              onClick={
                onCancelEdit
              }
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
      className={`pill text-xs ${
        styles[status]
      }`}
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

  const parts =
    time.split(':');

  const hour = Number(
    parts[0]
  );

  const minute = Number(
    parts[1] ?? 0
  );

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return time;
  }

  const converted =
    convertTo12Hour(hour);

  return `${String(
    converted.hour
  ).padStart(2, '0')}:${String(
    minute
  ).padStart(2, '0')} ${
    converted.period === 'am'
      ? 'ص'
      : 'م'
  }`;
}


// ============================================================
// Find lesson duration
// ============================================================

function findLessonDuration(
  lessons: Lesson[],
  lessonId: string
): number {
  const lesson =
    lessons.find(
      (item) =>
        item.id === lessonId
    );

  if (!lesson) {
    return 60;
  }

  if (
    lesson.start_time &&
    lesson.end_time
  ) {
    const start =
      timeToMinutes(
        lesson.start_time
      );

    const end =
      timeToMinutes(
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

  const start =
    timeToMinutes(
      startTime
    );

  if (Number.isNaN(start)) {
    return null;
  }

  const end =
    start + durationMinutes;

  const hour =
    Math.floor(end / 60) % 24;

  const minute =
    end % 60;

  return `${String(
    hour
  ).padStart(
    2,
    '0'
  )}:${String(
    minute
  ).padStart(
    2,
    '0'
  )}:00`;
}


// ============================================================
// Time to minutes
// ============================================================

function timeToMinutes(
  time: string
): number {
  const [
    hours,
    minutes,
  ] = time
    .split(':')
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return NaN;
  }

  return (
    hours * 60 +
    minutes
  );
}