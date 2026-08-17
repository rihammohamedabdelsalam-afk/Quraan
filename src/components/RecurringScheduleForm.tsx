import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RecurringSchedule, DAY_NAMES_AR } from '../lib/types';
import {
  generateSchedulePreview,
  createAppointmentsFromPreview,
  SchedulePreview,
  WEEK_OPTIONS,
  convertTo24Hour,
} from '../lib/scheduling';

export default function RecurringScheduleForm({
  studentId,
  onDone,
  onCancel,
}: {
  studentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [startDate, setStartDate] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hour, setHour] = useState(5);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'am' | 'pm'>('pm');
  const [numWeeks, setNumWeeks] = useState(4);
  const [customWeeks, setCustomWeeks] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [preview, setPreview] = useState<SchedulePreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const actualNumWeeks = useCustom ? parseInt(customWeeks, 10) || 1 : numWeeks;

  function handleDayToggle(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setPreview(null);
  }

  function handleGeneratePreview(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate) {
      setError('الرجاء اختيار تاريخ البداية');
      return;
    }

    if (selectedDays.length === 0) {
      setError('الرجاء اختيار على الأقل يوم واحد');
      return;
    }

    if (actualNumWeeks < 1 || actualNumWeeks > 52) {
      setError('عدد الأسابيع يجب أن يكون بين 1 و 52');
      return;
    }

    const hour24 = convertTo24Hour(hour, period);
    const generated = generateSchedulePreview(startDate, selectedDays, hour24, minute, actualNumWeeks);

    if (generated.length === 0) {
      setError('لم يتم إنشاء أي مواعيد');
      return;
    }

    setPreview(generated);
  }

  async function handleSave() {
    if (!preview || preview.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const hour24 = convertTo24Hour(hour, period);

      // Create recurring schedule
      const { data: schedule, error: scheduleError } = await supabase
        .from('recurring_schedules')
        .insert({
          student_id: studentId,
          teacher_id: user.user.id,
          start_date: startDate,
          days_of_week: selectedDays,
          start_hour: hour24,
          start_minute: minute,
          num_weeks: actualNumWeeks,
          status: 'active',
        })
        .select()
        .single();

      if (scheduleError) throw scheduleError;

      // Create appointments
      await createAppointmentsFromPreview(supabase, studentId, schedule.id, preview);

      setSaving(false);
      setStartDate('');
      setSelectedDays([]);
      setHour(5);
      setMinute(0);
      setPeriod('pm');
      setNumWeeks(4);
      setCustomWeeks('');
      setUseCustom(false);
      setPreview(null);

      onDone();
    } catch (err) {
      setSaving(false);
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Form Section */}
      <form onSubmit={handleGeneratePreview} className="card p-6 space-y-4">
        <h2 className="font-extrabold text-moss-700">إنشاء جدول متكرر</h2>

        {/* Start Date */}
        <div>
          <label className="label">تاريخ بداية الجدول</label>
          <input
            className="input"
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPreview(null);
            }}
          />
        </div>

        {/* Days of Week */}
        <div>
          <label className="label mb-2">أيام الأسبوع</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DAY_NAMES_AR.map((day, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(index)}
                  onChange={() => handleDayToggle(index)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">{day}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label">الساعة</label>
            <input
              className="input"
              type="number"
              min={1}
              max={12}
              required
              value={hour}
              onChange={(e) => {
                setHour(Math.min(12, Math.max(1, Number(e.target.value))));
                setPreview(null);
              }}
            />
          </div>
          <div>
            <label className="label">الدقيقة</label>
            <input
              className="input"
              type="number"
              min={0}
              max={59}
              step={15}
              required
              value={minute}
              onChange={(e) => {
                setMinute(Math.min(59, Math.max(0, Number(e.target.value))));
                setPreview(null);
              }}
            />
          </div>
          <div>
            <label className="label">ص/م</label>
            <select
              className="input"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value as 'am' | 'pm');
                setPreview(null);
              }}
            >
              <option value="am">صباحًا</option>
              <option value="pm">مساءً</option>
            </select>
          </div>
        </div>

        {/* Weeks */}
        <div className="grid sm:grid-cols-2 gap-4">
          {!useCustom ? (
            <div>
              <label className="label">عدد الأسابيع</label>
              <select
                className="input"
                value={numWeeks}
                onChange={(e) => {
                  setNumWeeks(Number(e.target.value));
                  setPreview(null);
                }}
              >
                {WEEK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">عدد الأسابيع (مخصص)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={52}
                required
                value={customWeeks}
                onChange={(e) => {
                  setCustomWeeks(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
          )}
          <div>
            <label className="label">&nbsp;</label>
            <button
              type="button"
              onClick={() => {
                setUseCustom(!useCustom);
                setPreview(null);
              }}
              className="btn-secondary w-full"
            >
              {useCustom ? 'خيارات معرفة مسبقًا' : 'عدد مخصص'}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="btn-primary w-full">
          عرض المعاينة
        </button>
      </form>

      {/* Preview Section */}
      {preview && (
        <div className="card p-6 space-y-4">
          <h3 className="font-extrabold text-moss-700">معاينة المواعيد</h3>
          <p className="text-sm text-ink/50">سيتم إنشاء {preview.length} موعد:</p>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {preview.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-moss-50 rounded border border-moss-200"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-sm">{p.dayNameAr}</span>
                  <span className="text-xs text-ink/50">{p.formattedDate}</span>
                </div>
                <span className="text-sm font-mono">{p.formattedTime}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-4 border-t border-moss-200">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="btn-secondary flex-1"
            >
              العودة للتعديل
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? 'جارِ الحفظ...' : 'حفظ الجدول'}
            </button>
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {!preview && (
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary w-full"
        >
          إلغاء
        </button>
      )}
    </div>
  );
}
