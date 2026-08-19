import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../lib/supabase';

import {
  Lesson,
  LessonCycle,
  Student,
  RecurringSchedule,
} from '../lib/types';


// ============================================================
// Types
// ============================================================

type TodayLesson = Lesson & {
  student?: Student;
};

type AvailableDate = {
  date: string;
  dayOfWeek: number;
  startTime: string;
};

type PostponeTarget = {
  lesson: TodayLesson;
  availableDates: AvailableDate[];
};


// ============================================================
// Dashboard
// ============================================================

export default function Dashboard() {
  const [selectedDate, setSelectedDate] =
    useState<string>(getLocalDateString());

  const [today, setToday] =
    useState<TodayLesson[]>([]);

  const [students, setStudents] =
    useState<Student[]>([]);

  const [cycles, setCycles] =
    useState<LessonCycle[]>([]);

  const [schedules, setSchedules] =
    useState<RecurringSchedule[]>([]);

  const [futureLessons, setFutureLessons] =
    useState<Lesson[]>([]);

  const [loading, setLoading] =
    useState<boolean>(true);

  const [changingLessonId, setChangingLessonId] =
    useState<string | null>(null);

  const [postponeTarget, setPostponeTarget] =
    useState<PostponeTarget | null>(null);

  const [postponeLoading, setPostponeLoading] =
    useState<boolean>(false);

  const [error, setError] =
    useState<string | null>(null);


  // ==========================================================
  // Load Dashboard
  // ==========================================================

  async function loadDashboard() {
    setLoading(true);
    setError(null);

    try {
      const todayStr = getLocalDateString();

      const futureEnd = addDays(
        todayStr,
        90
      );

      const [
        {
          data: studentsData,
          error: studentsError,
        },

        {
          data: cyclesData,
          error: cyclesError,
        },

        {
          data: schedulesData,
          error: schedulesError,
        },

        {
          data: selectedLessons,
          error: selectedLessonsError,
        },

        {
          data: futureLessonsData,
          error: futureLessonsError,
        },
      ] = await Promise.all([

        // ------------------------------------------------------
        // Students
        // ------------------------------------------------------

        supabase
          .from('students')
          .select('*')
          .eq('status', 'active')
          .order('name', {
            ascending: true,
          }),

        // ------------------------------------------------------
        // Active Cycles
        // ------------------------------------------------------

        supabase
          .from('lesson_cycles')
          .select('*')
          .eq('status', 'active'),

        // ------------------------------------------------------
        // Student Schedule
        // ------------------------------------------------------

        supabase
          .from('recurring_schedules')
          .select('*')
          .eq('status', 'active'),

        // ------------------------------------------------------
        // Selected Day Lessons
        // ------------------------------------------------------

        supabase
          .from('lessons')
          .select('*')
          .eq('scheduled_date', selectedDate)
          .neq('status', 'cancelled')
          .order('start_time', {
            ascending: true,
          }),

        // ------------------------------------------------------
        // Future Lessons
        // ------------------------------------------------------

        supabase
          .from('lessons')
          .select('*')
          .gte('scheduled_date', todayStr)
          .lte('scheduled_date', futureEnd)
          .neq('status', 'cancelled')
          .order('scheduled_date', {
            ascending: true,
          }),
      ]);


      if (studentsError) {
        throw studentsError;
      }

      if (cyclesError) {
        throw cyclesError;
      }

      if (schedulesError) {
        throw schedulesError;
      }

      if (selectedLessonsError) {
        throw selectedLessonsError;
      }

      if (futureLessonsError) {
        throw futureLessonsError;
      }


      // ========================================================
      // Student Map
      // ========================================================

      const studentMap = new Map<string, Student>(
        (studentsData ?? []).map(
          (student) => [
            student.id,
            student,
          ]
        )
      );


      // ========================================================
      // Attach Student To Lessons
      // ========================================================

      const lessonsWithStudents: TodayLesson[] =
        (selectedLessons ?? []).map(
          (lesson) => ({
            ...lesson,
            student:
              studentMap.get(
                lesson.student_id
              ),
          })
        );


      setStudents(
        studentsData ?? []
      );

      setCycles(
        cyclesData ?? []
      );

      setSchedules(
        schedulesData ?? []
      );

      setToday(
        lessonsWithStudents
      );

      setFutureLessons(
        futureLessonsData ?? []
      );

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تحميل الداشبورد.'
      );
    } finally {
      setLoading(false);
    }
  }


  // ==========================================================
  // Load When Date Changes
  // ==========================================================

  useEffect(() => {
    loadDashboard();
  }, [selectedDate]);


  // ==========================================================
  // Outstanding Lessons
  // ==========================================================

  const totalOutstanding = useMemo(() => {
    return cycles.reduce(
      (sum, cycle) =>
        sum +
        Number(
          cycle.outstanding_lessons ?? 0
        ),
      0
    );
  }, [cycles]);


  // ==========================================================
  // Date Navigation
  // ==========================================================

  function goPreviousDay() {
    setSelectedDate(
      addDays(
        selectedDate,
        -1
      )
    );
  }


  function goNextDay() {
    setSelectedDate(
      addDays(
        selectedDate,
        1
      )
    );
  }


  function goToday() {
    setSelectedDate(
      getLocalDateString()
    );
  }


  function goTomorrow() {
    setSelectedDate(
      addDays(
        getLocalDateString(),
        1
      )
    );
  }


  function goDayAfterTomorrow() {
    setSelectedDate(
      addDays(
        getLocalDateString(),
        2
      )
    );
  }


  // ==========================================================
  // Change Lesson Status
  // ==========================================================

  async function changeLessonStatus(
    lesson: TodayLesson,
    status: 'completed' | 'absent'
  ) {
    if (
      changingLessonId ||
      lesson.status === status
    ) {
      return;
    }

    setChangingLessonId(
      lesson.id
    );

    setError(null);

    try {
      const {
        error: rpcError,
      } = await supabase.rpc(
        'fn_dashboard_update_lesson_status',
        {
          p_lesson_id:
            lesson.id,

          p_status:
            status,

          p_new_date:
            null,

          p_note:
            null,
        }
      );


      if (rpcError) {
        throw rpcError;
      }


      await loadDashboard();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تحديث حالة الحصة.'
      );
    } finally {
      setChangingLessonId(
        null
      );
    }
  }


  // ==========================================================
  // Open Postpone Dialog
  // ==========================================================

  function openPostponeDialog(
    lesson: TodayLesson
  ) {
    setError(null);

    const availableDates =
      getAvailableDates(
        lesson,
        schedules,
        futureLessons
      );


    if (
      availableDates.length === 0
    ) {
      setError(
        'لا توجد أيام متاحة لهذا الطالب للتأجيل حاليًا.'
      );

      return;
    }


    setPostponeTarget({
      lesson,
      availableDates,
    });
  }


  // ==========================================================
  // Confirm Postpone
  // ==========================================================

  async function confirmPostpone(
    targetDate: string
  ) {
    if (!postponeTarget) {
      return;
    }

    setPostponeLoading(true);
    setError(null);

    try {
      const {
        error: rpcError,
      } = await supabase.rpc(
        'fn_dashboard_update_lesson_status',
        {
          p_lesson_id:
            postponeTarget.lesson.id,

          p_status:
            'postponed',

          p_new_date:
            targetDate,

          p_note:
            `تم تأجيل الحصة من ${postponeTarget.lesson.scheduled_date} إلى ${targetDate}`,
        }
      );


      if (rpcError) {
        throw rpcError;
      }


      setPostponeTarget(null);

      await loadDashboard();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء تأجيل الحصة.'
      );
    } finally {
      setPostponeLoading(false);
    }
  }


  // ==========================================================
  // Loading
  // ==========================================================

  if (loading) {
    return (
      <div
        className="py-10 text-center text-ink/50"
        dir="rtl"
      >
        جارِ التحميل...
      </div>
    );
  }


  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div
      className="space-y-8"
      dir="rtl"
    >

      {/* ======================================================
          Header
      ======================================================= */}

      <section>

        <h1 className="text-2xl font-extrabold text-moss-700">
          الرئيسية
        </h1>

        <p className="text-sm text-ink/50 mt-1">
          جدول الحصص ومتابعة حضور الطلاب.
        </p>

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
          Daily Schedule
      ======================================================= */}

      <section className="card p-5 sm:p-6">

        <div className="space-y-4 mb-6">

          <div className="flex items-center justify-between gap-3 flex-wrap">

            <div>

              <h2 className="text-xl font-extrabold text-moss-700">
                الجدول اليومي
              </h2>

              <p className="text-sm text-ink/50 mt-1">
                {formatArabicDate(
                  selectedDate
                )}
              </p>

            </div>

            <span className="pill bg-moss-50 text-moss-700">
              {today.length} حصة
            </span>

          </div>


          {/* ==================================================
              Quick Date Buttons
          =================================================== */}

          <div className="flex gap-2 flex-wrap">

            <button
              type="button"
              onClick={goToday}
              className={
                selectedDate ===
                getLocalDateString()
                  ? 'btn-primary text-xs'
                  : 'btn-secondary text-xs'
              }
            >
              اليوم
            </button>


            <button
              type="button"
              onClick={goTomorrow}
              className={
                selectedDate ===
                addDays(
                  getLocalDateString(),
                  1
                )
                  ? 'btn-primary text-xs'
                  : 'btn-secondary text-xs'
              }
            >
              غدًا
            </button>


            <button
              type="button"
              onClick={
                goDayAfterTomorrow
              }
              className={
                selectedDate ===
                addDays(
                  getLocalDateString(),
                  2
                )
                  ? 'btn-primary text-xs'
                  : 'btn-secondary text-xs'
              }
            >
              بعد غد
            </button>


            <button
              type="button"
              onClick={
                goPreviousDay
              }
              className="btn-secondary text-xs"
            >
              ← اليوم السابق
            </button>


            <button
              type="button"
              onClick={
                goNextDay
              }
              className="btn-secondary text-xs"
            >
              اليوم التالي →
            </button>

          </div>


          {/* ==================================================
              Date Picker
          =================================================== */}

          <div className="flex items-center gap-3 flex-wrap">

            <label className="text-sm font-bold text-ink">
              اختر أي تاريخ:
            </label>

            <input
              type="date"
              className="input max-w-xs"
              value={selectedDate}
              onChange={(e) =>
                setSelectedDate(
                  e.target.value
                )
              }
            />

          </div>

        </div>


        {/* ====================================================
            No Lessons
        ===================================================== */}

        {today.length === 0 ? (

          <div className="bg-moss-50 rounded-2xl p-6 text-center">

            <p className="font-bold text-moss-700">
              لا توجد حصص في هذا اليوم
            </p>

            <p className="text-sm text-ink/50 mt-1">
              يمكنك اختيار يوم آخر من الأعلى.
            </p>

          </div>

        ) : (

          <div className="space-y-3">

            {today.map(
              (lesson) => (
                <DailyLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  changing={
                    changingLessonId ===
                    lesson.id
                  }
                  onCompleted={() =>
                    changeLessonStatus(
                      lesson,
                      'completed'
                    )
                  }
                  onAbsent={() =>
                    changeLessonStatus(
                      lesson,
                      'absent'
                    )
                  }
                  onPostpone={() =>
                    openPostponeDialog(
                      lesson
                    )
                  }
                />
              )
            )}

          </div>

        )}

      </section>


      {/* ======================================================
          General Statistics
          لا يوجد أي فلوس هنا
      ======================================================= */}

      <section className="grid sm:grid-cols-2 gap-4">

        <SummaryCard
          label="حصص اليوم"
          value={`${today.length}`}
          accent="moss"
        />

        <SummaryCard
          label="حصص مستحقة إجمالًا"
          value={`${totalOutstanding}`}
          accent="clay"
        />

      </section>


      {/* ======================================================
          Students Progress
      ======================================================= */}

      <section className="card p-6">

        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">

          <div>

            <h2 className="font-extrabold text-moss-700 text-lg">
              تقدم الطلاب
            </h2>

            <p className="text-xs text-ink/50 mt-1">
              متابعة تقدم كل طالب في دورته الحالية.
            </p>

          </div>

          <span className="pill bg-moss-50 text-moss-700">
            {students.length} طالب
          </span>

        </div>


        {students.length === 0 ? (

          <div className="bg-moss-50 rounded-2xl p-5 text-center">

            <p className="text-sm text-ink/50">
              لا يوجد طلاب نشطون حاليًا.
            </p>

          </div>

        ) : (

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {students.map(
              (student) => {

                const cycle =
                  cycles.find(
                    (item) =>
                      item.student_id ===
                      student.id
                  );


                if (!cycle) {
                  return (
                    <Link
                      key={student.id}
                      to={`/students/${student.id}`}
                      className="border border-moss-50 rounded-2xl p-4 hover:bg-moss-50/50 transition"
                    >

                      <p className="font-bold">
                        {student.name}
                      </p>

                      <p className="text-xs text-ink/50 mt-2">
                        لا توجد دورة نشطة.
                      </p>

                    </Link>
                  );
                }


                const progress =
                  Number(
                    cycle.progress ?? 0
                  );

                const totalLessons =
                  Number(
                    cycle.total_lessons ?? 0
                  );

                const progressPercent =
                  totalLessons > 0
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          (
                            progress /
                            totalLessons
                          ) *
                            100
                        )
                      )
                    : 0;


                return (
                  <Link
                    key={student.id}
                    to={`/students/${student.id}`}
                    className="border border-moss-50 rounded-2xl p-4 hover:bg-moss-50/50 transition"
                  >

                    <div className="flex items-center justify-between gap-2">

                      <p className="font-bold">
                        {student.name}
                      </p>

                      <span className="text-xs text-ink/50">
                        {Math.round(
                          progressPercent
                        )}
                        %
                      </span>

                    </div>


                    <div className="w-full bg-moss-50 rounded-full h-2 mt-3 mb-2 overflow-hidden">

                      <div
                        className="bg-moss-500 h-2 rounded-full transition-all"
                        style={{
                          width:
                            `${progressPercent}%`,
                        }}
                      />

                    </div>


                    <p className="text-xs text-ink/50">

                      {progress}
                      /
                      {totalLessons}

                      {Number(
                        cycle.outstanding_lessons ?? 0
                      ) > 0 && (
                        <>
                          {' · '}
                          {
                            cycle.outstanding_lessons
                          }
                          {' حصة مستحقة'}
                        </>
                      )}

                    </p>

                  </Link>
                );
              }
            )}

          </div>

        )}

      </section>


      {/* ======================================================
          Postpone Modal
      ======================================================= */}

      {postponeTarget && (
        <PostponeModal
          target={postponeTarget}
          loading={postponeLoading}
          onClose={() =>
            setPostponeTarget(null)
          }
          onSelectDate={
            confirmPostpone
          }
        />
      )}

    </div>
  );
}


// ============================================================
// Daily Lesson Card
// ============================================================

function DailyLessonCard({
  lesson,
  changing,
  onCompleted,
  onAbsent,
  onPostpone,
}: {
  lesson: TodayLesson;
  changing: boolean;
  onCompleted: () => void;
  onAbsent: () => void;
  onPostpone: () => void;
}) {
  const isCompleted =
    lesson.status === 'completed';

  const isAbsent =
    lesson.status === 'absent';

  const isPostponed =
    lesson.status === 'postponed';


  return (
    <div
      className={`border rounded-2xl p-4 transition ${
        isCompleted
          ? 'border-green-200 bg-green-50/40'
          : isAbsent
          ? 'border-red-200 bg-red-50/30'
          : isPostponed
          ? 'border-clay-200 bg-clay-500/5'
          : 'border-moss-100'
      }`}
    >

      <div className="flex items-center justify-between gap-4 flex-wrap">

        <Link
          to={`/students/${lesson.student_id}`}
          className="min-w-0 flex-1"
        >

          <p className="font-extrabold text-lg text-ink truncate">
            {lesson.student?.name ??
              'طالب غير معروف'}
          </p>

          <p className="text-sm text-ink/60 mt-1">
            الساعة{' '}

            <span className="font-bold text-moss-700">
              {formatTime(
                lesson.start_time
              )}
            </span>
          </p>

        </Link>


        <StatusPill
          status={lesson.status}
        />

      </div>


      {/* ======================================================
          Three Check Options
      ======================================================= */}

      <div className="grid grid-cols-3 gap-2 mt-4">

        {/* حضر */}

        <button
          type="button"
          onClick={onCompleted}
          disabled={
            changing ||
            isCompleted
          }
          className={`min-h-14 rounded-xl border text-sm font-extrabold transition ${
            isCompleted
              ? 'border-green-300 bg-green-100 text-green-700'
              : 'border-moss-100 bg-white text-ink hover:bg-green-50 hover:border-green-200'
          } disabled:opacity-70`}
        >

          <span className="block text-lg">
            {isCompleted
              ? '✓'
              : '○'}
          </span>

          <span>
            حضر
          </span>

        </button>


        {/* غاب */}

        <button
          type="button"
          onClick={onAbsent}
          disabled={
            changing ||
            isAbsent
          }
          className={`min-h-14 rounded-xl border text-sm font-extrabold transition ${
            isAbsent
              ? 'border-red-300 bg-red-100 text-red-700'
              : 'border-moss-100 bg-white text-ink hover:bg-red-50 hover:border-red-200'
          } disabled:opacity-70`}
        >

          <span className="block text-lg">
            {isAbsent
              ? '✓'
              : '○'}
          </span>

          <span>
            غاب
          </span>

        </button>


        {/* أجل */}

        <button
          type="button"
          onClick={onPostpone}
          disabled={
            changing ||
            isPostponed
          }
          className={`min-h-14 rounded-xl border text-sm font-extrabold transition ${
            isPostponed
              ? 'border-clay-300 bg-clay-500/15 text-clay-500'
              : 'border-moss-100 bg-white text-ink hover:bg-clay-500/10 hover:border-clay-200'
          } disabled:opacity-70`}
        >

          <span className="block text-lg">
            {isPostponed
              ? '✓'
              : '○'}
          </span>

          <span>
            أجل
          </span>

        </button>

      </div>


      {changing && (
        <p className="text-xs text-ink/40 text-center mt-3">
          جارِ تحديث الحصة...
        </p>
      )}

    </div>
  );
}


// ============================================================
// Status Pill
// ============================================================

function StatusPill({
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
      'bg-green-100 text-green-700',

    absent:
      'bg-red-100 text-red-700',

    postponed:
      'bg-clay-500/15 text-clay-500',

    cancelled:
      'bg-gray-100 text-gray-500',
  };


  const labels: Record<
    Lesson['status'],
    string
  > = {
    scheduled:
      'مجدولة',

    completed:
      'حضر ✓',

    absent:
      'غاب',

    postponed:
      'مؤجلة',

    cancelled:
      'ملغاة',
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
// Postpone Modal
// ============================================================

function PostponeModal({
  target,
  loading,
  onClose,
  onSelectDate,
}: {
  target: PostponeTarget;
  loading: boolean;
  onClose: () => void;
  onSelectDate: (
    date: string
  ) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">

      <div
        className="bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >

        {/* Header */}

        <div className="p-5 border-b border-moss-50">

          <div className="flex items-start justify-between gap-4">

            <div>

              <h2 className="font-extrabold text-xl text-moss-700">
                تأجيل الحصة
              </h2>

              <p className="text-sm text-ink/50 mt-1">
                {target.lesson.student?.name ??
                  'الطالب'}
              </p>

            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 font-bold"
            >
              ×
            </button>

          </div>


          <div className="mt-4 bg-clay-500/10 rounded-2xl p-4">

            <p className="text-xs text-ink/50">
              الحصة الحالية
            </p>

            <p className="font-bold text-ink mt-1">
              {formatArabicDate(
                target.lesson.scheduled_date
              )}
            </p>

            <p className="text-sm text-ink/60 mt-1">
              الساعة{' '}
              {formatTime(
                target.lesson.start_time
              )}
            </p>

          </div>

        </div>


        {/* Available Dates */}

        <div className="p-5">

          <p className="font-extrabold text-ink mb-3">
            اختر اليوم البديل
          </p>

          <p className="text-xs text-ink/50 mb-4">
            الأيام التالية هي الأيام المتاحة حسب جدول الطالب، مع استبعاد الأيام التي يوجد بها موعد آخر.
          </p>


          <div className="space-y-2">

            {target.availableDates.map(
              (item) => (

                <button
                  key={`${item.date}-${item.startTime}`}
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onSelectDate(
                      item.date
                    )
                  }
                  className="w-full border border-moss-100 rounded-2xl p-4 text-right hover:bg-moss-50 hover:border-moss-200 transition disabled:opacity-50"
                >

                  <div className="flex items-center justify-between gap-3">

                    <div>

                      <p className="font-extrabold text-moss-700">
                        {formatArabicDate(
                          item.date
                        )}
                      </p>

                      <p className="text-xs text-ink/50 mt-1">
                        الساعة{' '}
                        {formatTime(
                          item.startTime
                        )}
                      </p>

                    </div>

                    <span className="text-moss-700 font-bold">
                      →
                    </span>

                  </div>

                </button>

              )
            )}

          </div>


          {target.availableDates.length === 0 && (
            <div className="bg-moss-50 rounded-2xl p-5 text-center">

              <p className="text-sm text-ink/50">
                لا توجد أيام متاحة حاليًا.
              </p>

            </div>
          )}


          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-secondary w-full mt-5"
          >
            إلغاء
          </button>

        </div>

      </div>

    </div>
  );
}


// ============================================================
// Get Available Dates
// ============================================================

function getAvailableDates(
  lesson: TodayLesson,
  schedules: RecurringSchedule[],
  futureLessons: Lesson[]
): AvailableDate[] {
  const studentSchedule = schedules.find(
    (item) => item.student_id === lesson.student_id
  );

  if (!studentSchedule) {
    return [];
  }

  const result: AvailableDate[] = [];

  for (
    let offset = 1;
    offset <= 60;
    offset++
  ) {
    const date = addDays(
      lesson.scheduled_date,
      offset
    );

    const dayOfWeek =
      getDayOfWeek(date);

    if (
      !studentSchedule.days_of_week.includes(
        dayOfWeek
      )
    ) {
      continue;
    }

    const startTime =
      studentSchedule.day_times?.[
        String(dayOfWeek)
      ] ??
      `${String(
        studentSchedule.start_hour
      ).padStart(2, '0')}:${String(
        studentSchedule.start_minute
      ).padStart(2, '0')}`;


    const hasConflict =
      futureLessons.some(
        (existingLesson) => {

          if (
            existingLesson.id ===
            lesson.id
          ) {
            return false;
          }

          if (
            existingLesson.student_id !==
            lesson.student_id
          ) {
            return false;
          }

          if (
            existingLesson.scheduled_date !==
            date
          ) {
            return false;
          }

          return (
            existingLesson.status !==
            'cancelled'
          );
        }
      );


    if (hasConflict) {
      continue;
    }


    result.push({
      date,
      dayOfWeek,
      startTime,
    });


    if (
      result.length >= 10
    ) {
      break;
    }
  }


  return result;
}


// ============================================================
// Summary Card
// ============================================================

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'moss' | 'clay';
}) {
  return (
    <div className="card p-5">

      <p className="text-xs text-ink/50 mb-1">
        {label}
      </p>

      <p
        className={`text-2xl font-extrabold ${
          accent === 'moss'
            ? 'text-moss-700'
            : 'text-clay-500'
        }`}
      >
        {value}
      </p>

    </div>
  );
}


// ============================================================
// Local Date
// ============================================================

function getLocalDateString(
  date: Date = new Date()
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


// ============================================================
// Add Days
// ============================================================

function addDays(
  dateString: string,
  days: number
): string {
  const date =
    parseLocalDate(
      dateString
    );

  date.setDate(
    date.getDate() + days
  );

  return getLocalDateString(
    date
  );
}


// ============================================================
// Parse Local Date
// ============================================================

function parseLocalDate(
  dateString: string
): Date {
  const [
    year,
    month,
    day,
  ] = dateString
    .split('-')
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}


// ============================================================
// Day Of Week
// ============================================================

function getDayOfWeek(
  dateString: string
): number {
  return parseLocalDate(
    dateString
  ).getDay();
}


// ============================================================
// Arabic Date
// ============================================================

function formatArabicDate(
  dateString: string
): string {
  const date =
    parseLocalDate(
      dateString
    );

  return new Intl.DateTimeFormat(
    'ar-EG',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  ).format(date);
}


// ============================================================
// Format Time
// ============================================================

function formatTime(
  time: string | null
): string {
  if (!time) {
    return '—';
  }

  const [
    hourString,
    minuteString,
  ] = time.split(':');

  const hour =
    Number(hourString);

  const minute =
    Number(
      minuteString ?? 0
    );

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return time;
  }

  const period =
    hour >= 12
      ? 'م'
      : 'ص';

  const hour12 =
    hour % 12 || 12;

  return `${hour12}:${String(
    minute
  ).padStart(2, '0')} ${period}`;
}