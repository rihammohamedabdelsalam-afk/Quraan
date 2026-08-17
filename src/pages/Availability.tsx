import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DAY_NAMES_AR } from '../lib/types';
import TimePicker12 from '../components/TimePicker12';

type AvailabilitySlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  status: string;
};

type Blocked = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
};

export default function Availability() {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const [{ data: s }, { data: b }] = await Promise.all([
      supabase
        .from('teacher_availability')
        .select('*')
        .order('day_of_week'),

      supabase
        .from('blocked_time')
        .select('*')
        .order('date'),
    ]);

    setSlots(s ?? []);
    setBlocked(b ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function removeSlot(id: string) {
    await supabase
      .from('teacher_availability')
      .delete()
      .eq('id', id);

    load();
  }

  async function removeBlocked(id: string) {
    await supabase
      .from('blocked_time')
      .delete()
      .eq('id', id);

    load();
  }

  if (loading) {
    return <p className="text-ink/50">جارِ التحميل...</p>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold text-moss-700">
        مواعيد عملي
      </h1>

      {/* أيام وساعات العمل */}
      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-3">
          أيام وساعات العمل
        </h2>

        <div className="space-y-2 mb-4">
          {slots.map((s) => (
            <div
              key={s.id}
              className="flex justify-between items-center border-b border-moss-50 py-2 text-sm"
            >
              <span>
                {DAY_NAMES_AR[s.day_of_week]} — {s.start_time} إلى{' '}
                {s.end_time}
              </span>

              <button
                className="text-red-500 text-xs"
                onClick={() => removeSlot(s.id)}
              >
                حذف
              </button>
            </div>
          ))}

          {slots.length === 0 && (
            <p className="text-sm text-ink/50">
              لم يتم تحديد مواعيد عمل بعد.
            </p>
          )}
        </div>

        <AvailabilityForm onDone={load} />
      </div>

      {/* أوقات محجوبة */}
      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-3">
          أوقات محجوبة
        </h2>

        <div className="space-y-2 mb-4">
          {blocked.map((b) => (
            <div
              key={b.id}
              className="flex justify-between items-center border-b border-moss-50 py-2 text-sm"
            >
              <span>
                {b.date} — {b.start_time} إلى {b.end_time}{' '}
                {b.reason ? `(${b.reason})` : ''}
              </span>

              <button
                className="text-red-500 text-xs"
                onClick={() => removeBlocked(b.id)}
              >
                حذف
              </button>
            </div>
          ))}

          {blocked.length === 0 && (
            <p className="text-sm text-ink/50">
              لا يوجد وقت محجوب.
            </p>
          )}
        </div>

        <BlockedTimeForm onDone={load} />
      </div>
    </div>
  );
}

/* =========================
   Availability Form
========================= */

function AvailabilityForm({ onDone }: { onDone: () => void }) {
  const [day, setDay] = useState(0);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('19:00');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setSaving(true);

    await supabase
      .from('teacher_availability')
      .insert({
        day_of_week: day,
        start_time: start,
        end_time: end,
      });

    setSaving(false);
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="label">اليوم</label>

        <select
          className="input"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          {DAY_NAMES_AR.map((d, i) => (
            <option key={i} value={i}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">من</label>

        <TimePicker12
          value={start}
          onChange={setStart}
        />
      </div>

      <div>
        <label className="label">إلى</label>

        <TimePicker12
          value={end}
          onChange={setEnd}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="btn-primary"
      >
        إضافة
      </button>
    </form>
  );
}

/* =========================
   Blocked Time Form
========================= */

function BlockedTimeForm({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState('');
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('18:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!date) return;

    setSaving(true);

    await supabase
      .from('blocked_time')
      .insert({
        date,
        start_time: start,
        end_time: end,
        reason: reason || null,
      });

    setSaving(false);
    setDate('');
    setReason('');

    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="label">التاريخ</label>

        <input
          className="input"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label">من</label>

        <TimePicker12
          value={start}
          onChange={setStart}
        />
      </div>

      <div>
        <label className="label">إلى</label>

        <TimePicker12
          value={end}
          onChange={setEnd}
        />
      </div>

      <div>
        <label className="label">السبب</label>

        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="btn-secondary"
      >
        حجب الوقت
      </button>
    </form>
  );
}