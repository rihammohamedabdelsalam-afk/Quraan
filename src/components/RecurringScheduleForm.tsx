import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DAY_NAMES_AR } from '../lib/types';
import TimePicker12 from './TimePicker12';
import {
  createAppointmentsFromPreview,
  generateSchedulePreview,
  SchedulePreview,
  WEEK_OPTIONS,
  parseTime,
} from '../lib/scheduling';

type DayTimes = Record<number, string>;

export default function RecurringScheduleForm({
  studentId,
  onDone,
  onCancel,
}: {
  studentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [startDate, setStartDate] =
    useState('');

  const [selectedDays, setSelectedDays] =
    useState<number[]>([]);

  const [dayTimes, setDayTimes] =
    useState<DayTimes>({});

  const [duration, setDuration] =
    useState(60);

  const [numWeeks, setNumWeeks] =
    useState(4);

  const [customWeeks, setCustomWeeks] =
    useState('');

  const [useCustom, setUseCustom] =
    useState(false);

  const [preview, setPreview] =
    useState<SchedulePreview[] | null>(
      null
    );

  const [error, setError] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);

  const actualNumWeeks =
    useCustom
      ? parseInt(customWeeks, 10) || 0
      : numWeeks;

  /**
   * Toggle a day.
   */
  function handleDayToggle(
    day: number
  ) {
    setSelectedDays((current) => {
      if (current.includes(day)) {
        setDayTimes((times) => {
          const next = {
            ...times,
          };

          delete next[day];

          return next;
        });

        setPreview(null);

        return current.filter(
          (item) => item !== day
        );
      }

      setDayTimes((times) => ({
        ...times,
        [day]:
          times[day] ??
          '16:00',
      }));

      setPreview(null);

      return [
        ...current,
        day,
      ].sort(
        (a, b) => a - b
      );
    });
  }

  /**
   * Change the time for one day.
   */
  function handleDayTimeChange(
    day: number,
    value: string
  ) {
    setDayTimes((current) => ({
      ...current,
      [day]: value,
    }));

    setPreview(null);
  }

  /**
   * Validate all form data.
   */
  function validateForm(): boolean {
    if (!startDate) {
      setError(
        'الرجاء اختيار تاريخ البداية.'
      );

      return false;
    }

    if (
      selectedDays.length === 0
    ) {
      setError(
        'الرجاء اختيار يوم واحد على الأقل.'
      );

      return false;
    }

    if (
      actualNumWeeks < 1 ||
      actualNumWeeks > 52
    ) {
      setError(
        'عدد الأسابيع يجب أن يكون بين 1 و 52.'
      );

      return false;
    }

    if (
      !Number.isInteger(
        duration
      ) ||
      duration < 1 ||
      duration > 480
    ) {
      setError(
        'مدة الحصة يجب أن تكون بين 1 و 480 دقيقة.'
      );

      return false;
    }

    for (const day of selectedDays) {
      const time =
        dayTimes[day];

      if (!time) {
        setError(
          `حدد وقت الحصة يوم ${DAY_NAMES_AR[day]}.`
        );

        return false;
      }

      const parsed =
        parseTime(time);

      if (!parsed) {
        setError(
          `وقت الحصة يوم ${DAY_NAMES_AR[day]} غير صحيح.`
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Generate preview.
   */
  function handleGeneratePreview(
    e: FormEvent
  ) {
    e.preventDefault();

    setError(null);

    if (!validateForm()) {
      return;
    }

    const generated =
      generateSchedulePreview(
        startDate,
        selectedDays,
        dayTimes,
        actualNumWeeks
      );

    if (
      generated.length === 0
    ) {
      setError(
        'لم يتم إنشاء أي مواعيد. تأكد من البيانات.'
      );

      return;
    }

    setPreview(generated);
  }

  /**
   * Save recurring schedule
   * and create appointments.
   */
  async function handleSave() {
    if (
      !preview ||
      preview.length === 0
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const user =
        userData.user;

      if (!user) {
        throw new Error(
          'يجب تسجيل الدخول أولًا.'
        );
      }

      /**
       * Use the first selected day
       * as the legacy start_hour/start_minute.
       *
       * The real per-day times are stored
       * in day_times.
       */
      const firstDay =
        selectedDays[0];

      const firstTime =
        dayTimes[firstDay];

      const firstParsed =
        parseTime(firstTime);

      if (!firstParsed) {
        throw new Error(
          `وقت يوم ${DAY_NAMES_AR[firstDay]} غير صحيح.`
        );
      }

      /**
       * Store day times as JSON object.
       *
       * Example:
       *
       * {
       *   "0": "16:00",
       *   "2": "18:30",
       *   "4": "17:00"
       * }
       */
      const dayTimesJson: Record<
        string,
        string
      > = {};

      for (const day of selectedDays) {
        dayTimesJson[
          String(day)
        ] = dayTimes[day];
      }

      /**
       * Create recurring schedule.
       */
      const {
        data: schedule,
        error:
          scheduleError,
      } = await supabase
        .from(
          'recurring_schedules'
        )
        .insert({
          student_id:
            studentId,
          teacher_id:
            user.id,
          start_date:
            startDate,
          days_of_week:
            selectedDays,
          start_hour:
            firstParsed.hour,
          start_minute:
            firstParsed.minute,
          num_weeks:
            actualNumWeeks,
          duration_minutes:
            duration,
          day_times:
            dayTimesJson,
          status:
            'active',
        })
        .select()
        .single();

      if (scheduleError) {
        throw scheduleError;
      }

      if (!schedule) {
        throw new Error(
          'تم إنشاء الجدول لكن لم يتم استلام بياناته.'
        );
      }

      /**
       * Create appointments.
       */
      await createAppointmentsFromPreview(
        supabase,
        studentId,
        schedule.id,
        preview
      );

      /**
       * Reset form.
       */
      setStartDate('');
      setSelectedDays([]);
      setDayTimes({});
      setDuration(60);
      setNumWeeks(4);
      setCustomWeeks('');
      setUseCustom(false);
      setPreview(null);

      onDone();
    } catch (err) {
      console.error(
        'Error saving recurring schedule:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء حفظ الجدول.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="space-y-6"
      dir="rtl"
    >
      {/* ========================================================
          Form
      ======================================================== */}

      <form
        onSubmit={
          handleGeneratePreview
        }
        className="card p-6 space-y-5"
      >
        <div>
          <h2 className="font-extrabold text-moss-700 text-xl">
            إنشاء جدول متكرر
          </h2>

          <p className="text-sm text-ink/50 mt-1">
            يمكنك تحديد وقت مختلف لكل يوم.
          </p>
        </div>

        {/* ======================================================
            Start Date
        ====================================================== */}

        <div>
          <label className="label">
            تاريخ بداية الجدول
          </label>

          <input
            className="input"
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(
                e.target.value
              );

              setPreview(null);
            }}
          />
        </div>

        {/* ======================================================
            Days
        ====================================================== */}

        <div>
          <label className="label mb-2">
            أيام الأسبوع
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DAY_NAMES_AR.map(
              (day, index) => {
                const selected =
                  selectedDays.includes(
                    index
                  );

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      handleDayToggle(
                        index
                      )
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

        {/* ======================================================
            Different time for every selected day
        ====================================================== */}

        {selectedDays.length >
          0 && (
          <div className="space-y-3">
            <div>
              <label className="label">
                وقت كل يوم
              </label>

              <p className="text-xs text-ink/40 mt-1">
                كل يوم يمكن أن يكون له موعد مختلف.
              </p>
            </div>

            {selectedDays.map(
              (day) => (
                <div
                  key={day}
                  className="rounded-2xl border border-moss-100 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="font-extrabold text-moss-700">
                        {
                          DAY_NAMES_AR[
                            day
                          ]
                        }
                      </p>

                      <p className="text-xs text-ink/40 mt-1">
                        وقت الحصة لهذا اليوم
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleDayToggle(
                          day
                        )
                      }
                      className="text-xs text-red-500"
                    >
                      إزالة
                    </button>
                  </div>

                  <TimePicker12
                    value={
                      dayTimes[
                        day
                      ] ??
                      '16:00'
                    }
                    onChange={(
                      value
                    ) =>
                      handleDayTimeChange(
                        day,
                        value
                      )
                    }
                  />
                </div>
              )
            )}
          </div>
        )}

        {/* ======================================================
            Duration
        ====================================================== */}

        <div>
          <label className="label">
            مدة الحصة بالدقائق
          </label>

          <input
            className="input"
            type="number"
            min={1}
            max={480}
            step={1}
            required
            value={duration}
            onChange={(e) => {
              setDuration(
                Number(
                  e.target.value
                )
              );

              setPreview(null);
            }}
          />

          <p className="text-xs text-ink/40 mt-1">
            مثال: 30 أو 45 أو 60 دقيقة
          </p>
        </div>

        {/* ======================================================
            Weeks
        ====================================================== */}

        <div className="grid sm:grid-cols-2 gap-4">
          {!useCustom ? (
            <div>
              <label className="label">
                عدد الأسابيع
              </label>

              <select
                className="input"
                value={numWeeks}
                onChange={(e) => {
                  setNumWeeks(
                    Number(
                      e.target.value
                    )
                  );

                  setPreview(null);
                }}
              >
                {WEEK_OPTIONS.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {
                        option.label
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">
                عدد الأسابيع (مخصص)
              </label>

              <input
                className="input"
                type="number"
                min={1}
                max={52}
                required
                value={
                  customWeeks
                }
                onChange={(e) => {
                  setCustomWeeks(
                    e.target.value
                  );

                  setPreview(null);
                }}
              />
            </div>
          )}

          <div>
            <label className="label">
              &nbsp;
            </label>

            <button
              type="button"
              onClick={() => {
                setUseCustom(
                  !useCustom
                );

                setPreview(null);
              }}
              className="btn-secondary w-full"
            >
              {useCustom
                ? 'استخدام الخيارات الجاهزة'
                : 'عدد مخصص'}
            </button>
          </div>
        </div>

        {/* ======================================================
            Summary
        ====================================================== */}

        {selectedDays.length >
          0 && (
          <div className="bg-moss-50 border border-moss-100 rounded-2xl p-4">
            <p className="text-xs text-ink/50 mb-3">
              ملخص الجدول
            </p>

            <div className="space-y-2">
              {selectedDays.map(
                (day) => (
                  <div
                    key={day}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="font-bold text-moss-700">
                      {
                        DAY_NAMES_AR[
                          day
                        ]
                      }
                    </span>

                    <span className="font-mono text-sm font-bold">
                      {dayTimes[
                        day
                      ] ??
                        '—'}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-moss-100 text-xs text-ink/50">
              مدة الحصة:{' '}
              {duration}{' '}
              دقيقة
              {' · '}
              {actualNumWeeks}{' '}
              أسبوع
            </div>
          </div>
        )}

        {/* ======================================================
            Error
        ====================================================== */}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* ======================================================
            Preview Button
        ====================================================== */}

        <button
          type="submit"
          className="btn-primary w-full"
        >
          عرض المعاينة
        </button>
      </form>

      {/* ========================================================
          Preview
      ======================================================== */}

      {preview && (
        <div className="card p-6 space-y-4">
          <div>
            <h3 className="font-extrabold text-moss-700 text-lg">
              معاينة المواعيد
            </h3>

            <p className="text-sm text-ink/50 mt-1">
              سيتم إنشاء{' '}
              {preview.length}{' '}
              موعد.
            </p>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {preview.map(
              (
                item,
                index
              ) => (
                <div
                  key={`${item.date}-${item.hour}-${item.minute}-${index}`}
                  className="flex items-center justify-between gap-3 p-3 bg-moss-50 rounded-xl border border-moss-200"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm text-moss-700">
                      {
                        item.dayNameAr
                      }
                    </span>

                    <span className="text-xs text-ink/50">
                      {
                        item.formattedDate
                      }
                    </span>
                  </div>

                  <span className="text-sm font-mono font-bold">
                    {
                      item.formattedTime
                    }
                  </span>
                </div>
              )
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t border-moss-200">
            <button
              type="button"
              onClick={() => {
                setPreview(
                  null
                );

                setError(null);
              }}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              العودة للتعديل
            </button>

            <button
              type="button"
              onClick={
                handleSave
              }
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving
                ? 'جارِ الحفظ...'
                : 'حفظ الجدول'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          Cancel
      ======================================================== */}

      {!preview && (
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary w-full"
        >
          إلغاء
        </button>
      )}
    </div>
  );
}