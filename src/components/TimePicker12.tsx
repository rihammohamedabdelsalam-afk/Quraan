import React from 'react';

interface TimePicker12Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function parseTime(value: string) {
  if (!value) {
    return { hour: 12, minute: 0, period: 'AM' as const };
  }

  const [h, m] = value.split(':').map(Number);

  if (h === 0) {
    return { hour: 12, minute: m || 0, period: 'AM' as const };
  }

  if (h === 12) {
    return { hour: 12, minute: m || 0, period: 'PM' as const };
  }

  return {
    hour: h > 12 ? h - 12 : h,
    minute: m || 0,
    period: h >= 12 ? ('PM' as const) : ('AM' as const),
  };
}

function to24Hour(hour: number, minute: number, period: 'AM' | 'PM') {
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

  const update = (
    hour: number,
    minute: number,
    period: 'AM' | 'PM'
  ) => {
    onChange(to24Hour(hour, minute, period));
  };

  return (
    <div className={`flex gap-2 ${className}`} dir="ltr">
      <select
        value={current.hour}
        onChange={(e) =>
          update(Number(e.target.value), current.minute, current.period)
        }
        className="input flex-1"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>

      <select
        value={current.minute}
        onChange={(e) =>
          update(current.hour, Number(e.target.value), current.period)
        }
        className="input flex-1"
      >
        {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
          <option key={minute} value={minute}>
            {String(minute).padStart(2, '0')}
          </option>
        ))}
      </select>

      <select
        value={current.period}
        onChange={(e) =>
          update(
            current.hour,
            current.minute,
            e.target.value as 'AM' | 'PM'
          )
        }
        className="input flex-1"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}