import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LessonCycle, Student, DAY_NAMES_AR } from '../lib/types';
import TimePicker12 from '../components/TimePicker12';

type Row = Student & {
  cycle?: LessonCycle | null;
};

export default function Students() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);

    try {
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (studentsError) {
        throw studentsError;
      }

      const { data: cycles, error: cyclesError } = await supabase
        .from('lesson_cycles')
        .select('*')
        .eq('status', 'active');

      if (cyclesError) {
        throw cyclesError;
      }

      const merged: Row[] = (students ?? []).map((student) => ({
        ...student,
        cycle:
          (cycles ?? []).find(
            (cycle) => cycle.student_id === student.id
          ) ?? null,
      }));

      setRows(merged);
    } catch (error) {
      console.error('Error loading students:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = rows.filter((student) =>
    student.name
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold text-moss-700">
          الطلاب
        </h1>

        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowForm(true)}
        >
          + إضافة طالب
        </button>
      </div>

      {/* Search */}
      <input
        className="input max-w-xs"
        placeholder="بحث بالاسم..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Add Student Form */}
      {showForm && (
        <AddStudentForm
          onDone={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => {
            setShowForm(false);
          }}
        />
      )}

      {/* Students */}
      {loading ? (
        <p className="text-ink/50">جارِ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink/50">
          لا يوجد طلاب بعد.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((student) => {
            const progress =
              student.cycle &&
              student.cycle.total_lessons > 0
                ? Math.min(
                    100,
                    (student.cycle.progress /
                      student.cycle.total_lessons) *
                      100
                  )
                : 0;

            return (
              <Link
                key={student.id}
                to={`/students/${student.id}`}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="font-extrabold text-ink">
                    {student.name}
                  </h3>

                  {student.cycle?.collection_status ===
                    'collected' && (
                    <span className="pill bg-clay-500/10 text-clay-500 whitespace-nowrap">
                      تم التحصيل
                    </span>
                  )}
                </div>

                <p className="text-xs text-ink/50 mb-3">
                  {student.age
                    ? `${student.age} سنة`
                    : '—'}
                </p>

                {student.cycle && (
                  <>
                    <div className="w-full bg-moss-50 rounded-full h-2 mb-1 overflow-hidden">
                      <div
                        className="bg-moss-500 h-2 rounded-full"
                        style={{
                          width: `${progress}%`,
                        }}
                      />
                    </div>

                    <p className="text-sm font-bold text-moss-700">
                      {student.cycle.progress} /{' '}
                      {student.cycle.total_lessons} حصة
                    </p>

                    {student.cycle.outstanding_lessons >
                      0 && (
                      <p className="text-xs text-clay-500 mt-1">
                        {
                          student.cycle
                            .outstanding_lessons
                        }{' '}
                        حصة مستحقة للطالب
                      </p>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddStudentForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  // =========================
  // بيانات الطالب
  // =========================

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');

  // =========================
  // الدورة
  // =========================

  const [totalLessons, setTotalLessons] = useState(8);
  const [amount, setAmount] = useState(1000);

  // =========================
  // الجدول
  // =========================

  const [selectedDays, setSelectedDays] = useState<number[]>(
    []
  );

  const [startTime, setStartTime] = useState('16:00');

  const [duration, setDuration] = useState(60);

  const [numWeeks, setNumWeeks] = useState(4);

  // =========================
  // الحالة
  // =========================

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    null
  );

  // =========================
  // اختيار اليوم
  // =========================

  function toggleDay(day: number) {
    setSelectedDays((current) => {
      if (current.includes(day)) {
        return current.filter((d) => d !== day);
      }

      return [...current, day].sort(
        (a, b) => a - b
      );
    });
  }

  // =========================
  // حفظ الطالب
  // =========================

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError(null);

    // -------------------------
    // Validation
    // -------------------------

    if (!name.trim()) {
      setError('اكتب اسم الطالب.');
      return;
    }

    if (
      !Number.isFinite(totalLessons) ||
      totalLessons < 2 ||
      totalLessons % 2 !== 0
    ) {
      setError(
        'عدد الحصص يجب أن يكون رقمًا زوجيًا.'
      );
      return;
    }

    const ageNum = age
      ? parseInt(age, 10)
      : null;

    if (
      ageNum !== null &&
      (!Number.isFinite(ageNum) ||
        ageNum < 5 ||
        ageNum > 80)
    ) {
      setError(
        'السن يجب أن تكون بين 5 و 80 سنة.'
      );
      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      setError(
        'قيمة التحصيل يجب أن تكون صفر أو أكثر.'
      );
      return;
    }

    if (selectedDays.length === 0) {
      setError(
        'اختر يومًا واحدًا على الأقل للجدول.'
      );
      return;
    }

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      setError(
        'مدة الحصة يجب أن تكون أكبر من صفر.'
      );
      return;
    }

    if (
      !Number.isFinite(numWeeks) ||
      numWeeks < 1 ||
      numWeeks > 52
    ) {
      setError(
        'عدد الأسابيع يجب أن يكون بين 1 و 52 أسبوعًا.'
      );
      return;
    }

    // -------------------------
    // تحويل الوقت
    // -------------------------

    const [hourString, minuteString] =
      startTime.split(':');

    const startHour = Number(hourString);
    const startMinute = Number(minuteString);

    if (
      !Number.isInteger(startHour) ||
      !Number.isInteger(startMinute) ||
      startHour < 0 ||
      startHour > 23 ||
      startMinute < 0 ||
      startMinute > 59
    ) {
      setError('وقت الحصة غير صحيح.');
      return;
    }

    setSaving(true);

    try {
      // =========================
      // 1. إنشاء الطالب + الدورة
      // =========================

      const {
        data: studentId,
        error: rpcError,
      } = await supabase.rpc(
        'fn_create_student_with_cycle',
        {
          p_name: name.trim(),
          p_age: ageNum,
          p_phone: phone.trim() || null,
          p_notes: null,
          p_total_lessons: totalLessons,
          p_collection_amount: amount,
        }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!studentId) {
        throw new Error(
          'تم إنشاء الطالب لكن لم يتم استلام رقم الطالب من قاعدة البيانات.'
        );
      }

      // =========================
      // 2. إنشاء الجدول المتكرر
      // =========================

      const today = new Date()
        .toISOString()
        .slice(0, 10);

      const {
        error: scheduleError,
      } = await supabase
        .from('recurring_schedules')
        .insert({
          student_id: studentId,
          start_date: today,
          days_of_week: selectedDays,
          start_hour: startHour,
          start_minute: startMinute,
          num_weeks: numWeeks,
          status: 'active',
        });

      if (scheduleError) {
        throw scheduleError;
      }

      // =========================
      // تم الحفظ
      // =========================

      onDone();
    } catch (err) {
      console.error(
        'Error creating student:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء إضافة الطالب.'
      );
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // الواجهة
  // =========================

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-6 space-y-6 max-w-2xl"
    >
      {/* =========================
          العنوان
      ========================= */}

      <div>
        <h2 className="font-extrabold text-xl text-moss-700">
          إضافة طالب جديد
        </h2>

        <p className="text-sm text-ink/50 mt-1">
          أدخل بيانات الطالب وجدوله من البداية.
        </p>
      </div>

      {/* =========================
          بيانات الطالب
      ========================= */}

      <div>
        <h3 className="font-extrabold text-ink mb-3">
          بيانات الطالب
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* الاسم */}
          <div>
            <label className="label">
              الاسم
            </label>

            <input
              className="input"
              required
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="اسم الطالب"
            />
          </div>

          {/* السن */}
          <div>
            <label className="label">
              السن (اختياري)
            </label>

            <input
              className="input"
              type="number"
              min={5}
              max={80}
              value={age}
              onChange={(e) =>
                setAge(e.target.value)
              }
              placeholder="مثال: 10"
            />
          </div>

          {/* الهاتف */}
          <div>
            <label className="label">
              رقم الهاتف
            </label>

            <input
              className="input"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="رقم الهاتف"
            />
          </div>

          {/* عدد الحصص */}
          <div>
            <label className="label">
              عدد الحصص المتفق عليها
            </label>

            <input
              className="input"
              type="number"
              min={2}
              step={2}
              required
              value={totalLessons}
              onChange={(e) =>
                setTotalLessons(
                  Number(e.target.value)
                )
              }
            />
          </div>

          {/* قيمة التحصيل */}
          <div>
            <label className="label">
              قيمة التحصيل (جنيه)
            </label>

            <input
              className="input"
              type="number"
              min={0}
              step="any"
              required
              value={amount}
              onChange={(e) =>
                setAmount(
                  Number(e.target.value)
                )
              }
            />
          </div>
        </div>
      </div>

      {/* =========================
          الجدول
      ========================= */}

      <div className="border-t border-moss-100 pt-5">
        <h3 className="font-extrabold text-ink mb-1">
          الجدول
        </h3>

        <p className="text-sm text-ink/50 mb-4">
          اختر أيام الحصص ووقت البداية ومدة الحصة.
        </p>

        {/* =========================
            الأيام
        ========================= */}

        <div className="mb-5">
          <label className="label">
            أيام الحصة
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {DAY_NAMES_AR.map(
              (day, index) => {
                const selected =
                  selectedDays.includes(index);

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      toggleDay(index)
                    }
                    className={`p-3 rounded-xl border-2 text-sm font-bold transition ${
                      selected
                        ? 'border-moss-500 bg-moss-50 text-moss-700'
                        : 'border-ink/10 bg-white hover:border-moss-300'
                    }`}
                  >
                    {day}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* =========================
            الوقت + المدة + الأسابيع
        ========================= */}

        <div className="grid sm:grid-cols-3 gap-4">
          {/* الوقت */}
          <div>
            <label className="label">
              وقت الحصة
            </label>

            <TimePicker12
              value={startTime}
              onChange={setStartTime}
            />
          </div>

          {/* المدة */}
          <div>
            <label className="label">
              مدة الحصة بالدقائق
            </label>

            <input
              className="input"
              type="number"
              min={1}
              step={1}
              value={duration}
              onChange={(e) =>
                setDuration(
                  Number(e.target.value)
                )
              }
              required
            />

            <p className="text-xs text-ink/40 mt-1">
              مثال: 30 أو 40 أو 60
            </p>
          </div>

          {/* الأسابيع */}
          <div>
            <label className="label">
              عدد الأسابيع
            </label>

            <input
              className="input"
              type="number"
              min={1}
              max={52}
              value={numWeeks}
              onChange={(e) =>
                setNumWeeks(
                  Number(e.target.value)
                )
              }
              required
            />
          </div>
        </div>
      </div>

      {/* =========================
          ملخص الجدول
      ========================= */}

      {selectedDays.length > 0 && (
        <div className="bg-moss-50 border border-moss-100 rounded-2xl p-4">
          <p className="text-xs text-ink/50 mb-1">
            ملخص الجدول
          </p>

          <p className="font-bold text-moss-700">
            {selectedDays
              .map(
                (day) =>
                  DAY_NAMES_AR[day]
              )
              .join('، ')}
          </p>

          <p className="text-sm text-ink/60 mt-1">
            الساعة {startTime} · مدة الحصة{' '}
            {duration} دقيقة · {numWeeks}{' '}
            أسابيع
          </p>
        </div>
      )}

      {/* =========================
          التحصيل
      ========================= */}

      <p className="text-xs text-ink/50">
        سيتم التحصيل تلقائيًا عند إكمال الحصة رقم{' '}
        {Math.floor(totalLessons / 2) || '—'}.
      </p>

      {/* =========================
          خطأ
      ========================= */}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* =========================
          الأزرار
      ========================= */}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving
            ? 'جارِ الحفظ...'
            : 'حفظ الطالب'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}