import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { OutstandingBalance, Student } from '../lib/types';

export default function OutstandingLessons() {
  const [balances, setBalances] = useState<OutstandingBalance[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: b }, { data: st }] = await Promise.all([
        supabase.from('outstanding_lesson_balances').select('*').is('cleared_at', null).gt('remaining_outstanding', 0),
        supabase.from('students').select('*'),
      ]);
      setBalances(b ?? []);
      setStudents(st ?? []);
      setLoading(false);
    })();
  }, []);

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const total = balances.reduce((s, b) => s + b.remaining_outstanding, 0);

  if (loading) return <p className="text-ink/50">جارِ التحميل...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-moss-700">الحصص المستحقة للطلاب</h1>
      <p className="text-sm text-ink/50 max-w-xl">
        هذا رصيد حصص، وليس مديونية مالية — يعني عدد الحصص التي تم تحصيل قيمتها ولكن لم تُقدَّم للطالب بعد.
      </p>

      <div className="card p-6">
        <p className="text-sm text-ink/50 mb-1">إجمالي الحصص المستحقة</p>
        <p className="text-3xl font-extrabold text-clay-500">{total} حصة</p>
      </div>

      {balances.length === 0 ? (
        <p className="text-ink/50">لا توجد حصص مستحقة حاليًا.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map((b) => {
            const s = studentMap.get(b.student_id);
            return (
              <Link key={b.id} to={`/students/${b.student_id}`} className="card p-5 hover:shadow-md">
                <p className="font-extrabold mb-2">{s?.name ?? '—'}</p>
                <p className="text-sm text-ink/50">
                  أُنجز {b.completed_outstanding} من أصل {b.total_outstanding}
                </p>
                <p className="text-lg font-extrabold text-clay-500 mt-1">
                  متبقي {b.remaining_outstanding} حصة
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
