import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, DAY_NAMES_AR } from '../lib/types';
import {
  getAvailableDates,
  getAvailableSlots,
  formatTimeArabic,
  rescheduleAppointment,
} from '../lib/scheduling';

interface RescheduleModalProps {
  appointment: Appointment;
  onDone: () => void;
  onCancel: () => void;
}

export default function RescheduleModal({
  appointment,
  onDone,
  onCancel,
}: RescheduleModalProps) {
  const [step, setStep] = useState<'date' | 'time' | 'confirm'>('date');

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');

  const [availableSlots, setAvailableSlots] = useState<
    Array<{
      hour: number;
      minute: number;
      formatted: string;
    }>
  >([]);

  const [selectedTime, setSelectedTime] = useState<{
    hour: number;
    minute: number;
  } | null>(null);

  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // =========================
  // تحميل التواريخ
  // =========================
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);

      try {
        const { data: user } = await supabase.auth.getUser();

        if (!user.user) {
          throw new Error('Not authenticated');
        }

        const dates = getAvailableDates(appointment.date, 14);

        setAvailableDates(dates);

        if (dates.length > 0) {
          setSelectedDate(dates[0]);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [appointment.date]);

  // =========================
  // تحميل الأوقات المتاحة
  // =========================
  useEffect(() => {
    async function loadSlots() {
      if (!selectedDate) return;

      setLoading(true);
      setError(null);

      try {
        const slots = await getAvailableSlots(
          supabase,
          appointment.teacher_id,
          selectedDate,
          appointment.id
        );

        setAvailableSlots(slots);

        // تصفير الوقت عند تغيير التاريخ
        setSelectedTime(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadSlots();
  }, [selectedDate, appointment.teacher_id, appointment.id]);

  // =========================
  // تأكيد إعادة الجدولة
  // =========================
  async function handleConfirmReschedule() {
    if (!selectedTime) return;

    setLoading(true);
    setError(null);

    try {
      await rescheduleAppointment(
        supabase,
        appointment.id,
        selectedDate,
        selectedTime.hour,
        selectedTime.minute,
        reason.trim() || undefined
      );

      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // تنسيق التاريخ
  // =========================
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';

    const date = new Date(dateStr);

    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  // =========================
  // الرجوع
  // =========================
  function handleBack() {
    if (loading) return;

    if (step === 'time') {
      setStep('date');
    } else if (step === 'confirm') {
      setStep('time');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto">

        {/* =========================
            Header
        ========================= */}
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold text-xl text-moss-700">
            تأجيل الحصة
          </h2>

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* =========================
            Current Appointment
        ========================= */}
        <div className="bg-moss-50 p-4 rounded-2xl text-sm">
          <p className="text-ink/60 mb-1">
            الموعد الحالي:
          </p>

          <p className="font-bold text-ink">
            {DAY_NAMES_AR[appointment.day_of_week]} — {appointment.date}
          </p>

          <p className="font-bold text-moss-700 mt-1">
            الساعة{' '}
            {formatTimeArabic(
              appointment.start_hour,
              appointment.start_minute
            )}
          </p>
        </div>

        {/* =========================
            Error
        ========================= */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* =========================
            Progress
        ========================= */}
        <div className="flex items-center gap-2">
          <div
            className={`h-2 flex-1 rounded-full ${
              step === 'date' ||
              step === 'time' ||
              step === 'confirm'
                ? 'bg-moss-500'
                : 'bg-gray-200'
            }`}
          />

          <div
            className={`h-2 flex-1 rounded-full ${
              step === 'time' || step === 'confirm'
                ? 'bg-moss-500'
                : 'bg-gray-200'
            }`}
          />

          <div
            className={`h-2 flex-1 rounded-full ${
              step === 'confirm'
                ? 'bg-moss-500'
                : 'bg-gray-200'
            }`}
          />
        </div>

        {/* =====================================================
            STEP 1 - DATE
        ===================================================== */}
        {step === 'date' && (
          <div className="space-y-4">

            <div>
              <p className="font-bold text-lg">
                اختر التاريخ الجديد
              </p>

              <p className="text-sm text-ink/50 mt-1">
                اختر اليوم المناسب لإعادة جدولة الحصة.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-8 text-ink/60">
                جاري تحميل التواريخ...
              </div>
            ) : availableDates.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
                لا توجد تواريخ متاحة حالياً.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {availableDates.map((date) => (
                  <button
                    type="button"
                    key={date}
                    onClick={() => {
                      setSelectedDate(date);
                      setStep('time');
                    }}
                    disabled={loading}
                    className={`w-full text-right p-4 rounded-2xl border-2 transition ${
                      selectedDate === date
                        ? 'border-moss-500 bg-moss-50'
                        : 'border-ink/10 bg-white hover:border-moss-300'
                    }`}
                  >
                    <p className="font-bold">
                      {formatDateDisplay(date)}
                    </p>

                    <p className="text-xs text-ink/50 mt-1">
                      {date}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="w-full btn-secondary"
            >
              إلغاء
            </button>
          </div>
        )}

        {/* =====================================================
            STEP 2 - TIME
        ===================================================== */}
        {step === 'time' && (
          <div className="space-y-4">

            <div>
              <p className="font-bold text-lg">
                اختر الوقت الجديد
              </p>

              <p className="text-sm text-ink/50 mt-1">
                اضغط على الوقت المناسب ثم اضغط «حفظ الوقت».
              </p>
            </div>

            {/* Selected Date */}
            <div className="bg-moss-50 rounded-2xl p-4">
              <p className="text-xs text-ink/50 mb-1">
                التاريخ المختار
              </p>

              <p className="font-bold text-moss-700">
                {formatDateDisplay(selectedDate)}
              </p>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="text-center py-8 text-ink/60">
                جاري تحميل الأوقات المتاحة...
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
                لا توجد أوقات متاحة في هذا التاريخ.
                <br />
                اختر تاريخاً آخر.
              </div>
            ) : (
              <>
                {/* =========================
                    Custom Clock Area
                ========================= */}
                <div className="bg-gray-50 rounded-3xl p-5">

                  <div className="flex flex-col items-center">

                    {/* Clock Circle */}
                    <div className="relative w-52 h-52 rounded-full bg-white border-4 border-moss-100 shadow-sm flex items-center justify-center">

                      {/* Center */}
                      <div className="absolute w-5 h-5 rounded-full bg-moss-600 z-10" />

                      {/* Clock Hand */}
                      {selectedTime && (
                        <div
                          className="absolute w-[3px] h-20 bg-moss-500 origin-bottom rounded-full"
                          style={{
                            transform: `rotate(${
                              ((selectedTime.hour % 12) * 30) +
                              selectedTime.minute * 0.5
                            }deg)`,
                            bottom: '50%',
                          }}
                        />
                      )}

                      {/* 12 */}
                      <span className="absolute top-3 font-bold text-sm">
                        12
                      </span>

                      {/* 3 */}
                      <span className="absolute right-3 font-bold text-sm">
                        3
                      </span>

                      {/* 6 */}
                      <span className="absolute bottom-3 font-bold text-sm">
                        6
                      </span>

                      {/* 9 */}
                      <span className="absolute left-3 font-bold text-sm">
                        9
                      </span>

                      {/* Selected Time */}
                      <div className="text-center z-20">
                        <p className="text-2xl font-extrabold text-moss-700">
                          {selectedTime
                            ? formatTimeArabic(
                                selectedTime.hour,
                                selectedTime.minute
                              )
                            : '--:--'}
                        </p>

                        <p className="text-xs text-ink/50 mt-1">
                          الوقت المختار
                        </p>
                      </div>
                    </div>

                    {/* =========================
                        Available Times
                    ========================= */}
                    <div className="w-full mt-5">

                      <p className="font-bold text-sm mb-3 text-center">
                        الأوقات المتاحة
                      </p>

                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">

                        {availableSlots.map((slot, idx) => {
                          const isSelected =
                            selectedTime?.hour === slot.hour &&
                            selectedTime?.minute === slot.minute;

                          return (
                            <button
                              type="button"
                              key={`${slot.hour}-${slot.minute}-${idx}`}
                              onClick={() => setSelectedTime(slot)}
                              disabled={loading}
                              className={`p-3 rounded-xl border-2 transition text-sm font-bold ${
                                isSelected
                                  ? 'border-moss-500 bg-moss-100 text-moss-700'
                                  : 'border-ink/10 bg-white hover:border-moss-300'
                              }`}
                            >
                              {slot.formatted}
                            </button>
                          );
                        })}

                      </div>
                    </div>
                  </div>
                </div>

                {/* =========================
                    Save Time Button
                ========================= */}
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedTime) return;
                    setStep('confirm');
                  }}
                  disabled={loading || !selectedTime}
                  className="w-full btn-primary py-3 text-base"
                >
                  {selectedTime
                    ? `حفظ الوقت: ${formatTimeArabic(
                        selectedTime.hour,
                        selectedTime.minute
                      )}`
                    : 'اختر وقتاً أولاً'}
                </button>
              </>
            )}

            {/* Navigation */}
            <div className="flex gap-2">

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="flex-1 btn-secondary"
              >
                السابق
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 btn-secondary"
              >
                إلغاء
              </button>

            </div>
          </div>
        )}

        {/* =====================================================
            STEP 3 - CONFIRM
        ===================================================== */}
        {step === 'confirm' && (
          <div className="space-y-4">

            <div>
              <p className="font-bold text-lg">
                تأكيد إعادة الجدولة
              </p>

              <p className="text-sm text-ink/50 mt-1">
                راجع الموعد الجديد قبل الحفظ.
              </p>
            </div>

            {/* Old Appointment */}
            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl">
              <p className="font-bold text-sm text-red-700 mb-2">
                الموعد القديم
              </p>

              <p className="text-sm">
                {DAY_NAMES_AR[appointment.day_of_week]} —{' '}
                {appointment.date}
              </p>

              <p className="text-sm font-bold mt-1">
                الساعة{' '}
                {formatTimeArabic(
                  appointment.start_hour,
                  appointment.start_minute
                )}
              </p>
            </div>

            {/* New Appointment */}
            <div className="bg-green-50 border border-green-200 p-4 rounded-2xl">
              <p className="font-bold text-sm text-green-700 mb-2">
                الموعد الجديد
              </p>

              <p className="text-sm font-bold">
                {formatDateDisplay(selectedDate)}
              </p>

              {selectedTime && (
                <p className="text-sm font-bold mt-1">
                  الساعة{' '}
                  {formatTimeArabic(
                    selectedTime.hour,
                    selectedTime.minute
                  )}
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="label">
                سبب التأجيل (اختياري)
              </label>

              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: غياب الطالب، ظرف طارئ"
                className="input w-full"
                disabled={loading}
              />
            </div>

            {/* Confirm */}
            <button
              type="button"
              onClick={handleConfirmReschedule}
              disabled={loading || !selectedTime}
              className="w-full btn-primary py-3 text-base"
            >
              {loading
                ? 'جاري التأجيل...'
                : 'حفظ وإعادة جدولة الحصة'}
            </button>

            {/* Back + Cancel */}
            <div className="flex gap-2">

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="flex-1 btn-secondary"
              >
                تعديل الوقت
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 btn-secondary"
              >
                إلغاء
              </button>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}