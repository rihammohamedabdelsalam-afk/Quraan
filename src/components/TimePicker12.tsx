import React, { useEffect, useState } from 'react';

interface TimePicker12Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function parseTime(value: string) {
  if (!value) {
    return {
      hour: 12,
      minute: 0,
      period: 'AM' as const,
    };
  }

  const [h, m] = value.split(':').map(Number);

  if (h === 0) {
    return {
      hour: 12,
      minute: m || 0,
      period: 'AM' as const,
    };
  }

  if (h === 12) {
    return {
      hour: 12,
      minute: m || 0,
      period: 'PM' as const,
    };
  }

  return {
    hour: h > 12 ? h - 12 : h,
    minute: m || 0,
    period: h >= 12 ? ('PM' as const) : ('AM' as const),
  };
}

function to24Hour(
  hour: number,
  minute: number,
  period: 'AM' | 'PM'
) {
  let h = hour % 12;

  if (period === 'PM') {
    h += 12;
  }

  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function TimePicker12({
  value,
  onChange,
  className = '',
}: TimePicker12Props) {
  const current = parseTime(value);

  const [open, setOpen] = useState(false);

  const [hour, setHour] = useState(current.hour);
  const [minute, setMinute] = useState(current.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(current.period);

  useEffect(() => {
    const next = parseTime(value);

    setHour(next.hour);
    setMinute(next.minute);
    setPeriod(next.period);
  }, [value]);

  function openPicker() {
    const next = parseTime(value);

    setHour(next.hour);
    setMinute(next.minute);
    setPeriod(next.period);

    setOpen(true);
  }

  function handleSet() {
    const newValue = to24Hour(hour, minute, period);

    onChange(newValue);
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  return (
    <>
      {/* زر عرض الوقت */}
      <button
        type="button"
        onClick={openPicker}
        className={`input w-full text-left ${className}`}
      >
        {String(current.hour).padStart(2, '0')}:
        {String(current.minute).padStart(2, '0')} {current.period}
      </button>

      {/* نافذة اختيار الوقت */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-center text-lg font-extrabold text-moss-700">
              اختيار الوقت
            </h3>

            {/* اختيار الساعة والدقيقة */}
            <div className="flex items-center justify-center gap-2">
              <select
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="input w-24 text-center text-lg"
              >
                {Array.from(
                  { length: 12 },
                  (_, i) => i + 1
                ).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <span className="text-xl font-bold">
                :
              </span>

              <select
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="input w-24 text-center text-lg"
              >
                {Array.from(
                  { length: 60 },
                  (_, i) => i
                ).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <select
                value={period}
                onChange={(e) =>
                  setPeriod(
                    e.target.value as 'AM' | 'PM'
                  )
                }
                className="input w-24 text-center text-lg"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>

            {/* الأزرار */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2 text-gray-500"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSet}
                className="btn-primary px-5 py-2"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}