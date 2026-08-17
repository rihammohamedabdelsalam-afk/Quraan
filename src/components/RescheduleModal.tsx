import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, DAY_NAMES_AR } from '../lib/types';
import { getAvailableDates, getAvailableSlots, formatTimeArabic, rescheduleAppointment } from '../lib/scheduling';

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
    Array<{ hour: number; minute: number; formatted: string }>
  >([]);
  const [selectedTime, setSelectedTime] = useState<{ hour: number; minute: number } | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current user and load available dates
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error('Not authenticated');

        // Get available dates (next 14 days, excluding Fri/Sat and past dates)
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

  // Load available slots when date changes
  useEffect(() => {
    async function loadSlots() {
      if (!selectedDate) return;

      setLoading(true);
      try {
        const slots = await getAvailableSlots(
          supabase,
          appointment.teacher_id,
          selectedDate,
          appointment.id
        );
        setAvailableSlots(slots);
        setSelectedTime(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadSlots();
  }, [selectedDate, appointment.teacher_id, appointment.id]);

  async function handleConfirmReschedule() {
    if (!selectedTime) return;

    setLoading(true);
    try {
      await rescheduleAppointment(
        supabase,
        appointment.id,
        selectedDate,
        selectedTime.hour,
        selectedTime.minute,
        reason || undefined
      );
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40">
      <div className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-6 space-y-4 max-h-screen overflow-y-auto">
        <h2 className="font-extrabold text-moss-700">تأجيل الحصة</h2>

        {/* Current appointment info */}
        <div className="bg-moss-50 p-3 rounded text-sm">
          <p className="text-ink/70">الموعد الحالي:</p>
          <p className="font-bold">
            {DAY_NAMES_AR[appointment.day_of_week]} — {appointment.date} الساعة{' '}
            {formatTimeArabic(appointment.start_hour, appointment.start_minute)}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">{error}</div>}

        {/* Step 1: Date Selection */}
        {step === 'date' && (
          <div className="space-y-3">
            <label className="label">اختر التاريخ الجديد</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableDates.map((date) => (
                <button
                  key={date}
                  onClick={() => {
                    setSelectedDate(date);
                    setStep('time');
                  }}
                  className={`w-full text-right p-3 rounded border-2 transition ${
                    selectedDate === date
                      ? 'border-moss-500 bg-moss-50'
                      : 'border-ink/10 bg-white hover:border-moss-300'
                  }`}
                  disabled={loading}
                >
                  <p className="font-bold text-sm">{formatDateDisplay(date)}</p>
                  <p className="text-xs text-ink/50">{date}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Time Selection */}
        {step === 'time' && (
          <div className="space-y-3">
            <p className="text-sm font-bold">التاريخ المختار:</p>
            <div className="bg-moss-50 p-3 rounded text-sm">
              <p className="font-bold">{formatDateDisplay(selectedDate)}</p>
            </div>

            <label className="label">اختر الوقت المتاح</label>
            {availableSlots.length === 0 ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                لا توجد أوقات متاحة في هذا التاريخ. اختر تاريخ آخر.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {availableSlots.map((slot, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedTime(slot)}
                    className={`p-3 rounded border-2 transition text-sm font-bold ${
                      selectedTime?.hour === slot.hour && selectedTime?.minute === slot.minute
                        ? 'border-moss-500 bg-moss-100'
                        : 'border-ink/10 bg-white hover:border-moss-300'
                    }`}
                    disabled={loading}
                  >
                    {slot.formatted}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep('date')} className="flex-1 btn-secondary" disabled={loading}>
                السابق
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 btn-primary"
                disabled={loading || !selectedTime}
              >
                التالي
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-3">
            <p className="text-sm font-bold">تأكيد إعادة الجدولة</p>

            <div className="bg-red-50 border border-red-200 p-3 rounded space-y-2">
              <p className="font-bold text-sm">الموعد القديم:</p>
              <p className="text-sm">
                {DAY_NAMES_AR[appointment.day_of_week]} — {appointment.date} الساعة{' '}
                {formatTimeArabic(appointment.start_hour, appointment.start_minute)}
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 p-3 rounded space-y-2">
              <p className="font-bold text-sm">الموعد الجديد:</p>
              <p className="text-sm">
                {formatDateDisplay(selectedDate)} الساعة {selectedTime && formatTimeArabic(selectedTime.hour, selectedTime.minute)}
              </p>
            </div>

            <div>
              <label className="label">سبب التأجيل (اختياري)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: غياب الطالب، ظرف طارئ"
                className="input"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep('time')} className="flex-1 btn-secondary" disabled={loading}>
                السابق
              </button>
              <button
                onClick={handleConfirmReschedule}
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? 'جاري التأجيل...' : 'تأكيد إعادة الجدولة'}
              </button>
            </div>
          </div>
        )}

        {/* Cancel button (always visible) */}
        {!loading && (
          <button onClick={onCancel} className="w-full btn-secondary" disabled={loading}>
            إلغاء
          </button>
        )}
      </div>
    </div>
  );
}
