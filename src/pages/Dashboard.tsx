import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lesson, LessonCycle, Student, WalletTransaction } from '../lib/types';

type TodayLesson = Lesson & { student?: Student };

export default function Dashboard() {
  const [today, setToday] = useState<TodayLesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [cycles, setCycles] = useState<LessonCycle[]>([]);
  const [walletToday, setWalletToday] = useState(0);
  const [walletMonth, setWalletMonth] = useState(0);
  const [walletTotal, setWalletTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);
      const monthStart = todayStr.slice(0, 7) + '-01';

      const [{ data: lsn }, { data: st }, { data: cy }, { data: wallet }] = await Promise.all([
        supabase.from('lessons').select('*').eq('scheduled_date', todayStr).eq('status', 'scheduled'),
        supabase.from('students').select('*').eq('status', 'active'),
        supabase.from('lesson_cycles').select('*').eq('status', 'active'),
        supabase.from('wallet_transactions').select('*'),
      ]);

      const studentMap = new Map((st ?? []).map((s) => [s.id, s]));
      setToday((lsn ?? []).map((l) => ({ ...l, student: studentMap.get(l.student_id) })));
      setStudents(st ?? []);
      setCycles(cy ?? []);

      const w = (wallet ?? []) as WalletTransaction[];
      setWalletTotal(w.reduce((sum, t) => sum + Number(t.amount), 0));
      setWalletToday(w.filter((t) => t.date === todayStr).reduce((s, t) => s + Number(t.amount), 0));
      setWalletMonth(w.filter((t) => t.date >= monthStart).reduce((s, t) => s + Number(t.amount), 0));
      setLoading(false);
    })();
  }, []);

  const totalOutstanding = cycles.reduce((s, c) => s + c.outstanding_lessons, 0);

  if (loading) return <p className="text-ink/50">جارِ التحميل...</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold text-moss-700">الرئيسية</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="تحصيل اليوم" value={`${walletToday} جنيه`} accent="moss" />
        <SummaryCard label="تحصيل الشهر" value={`${walletMonth} جنيه`} accent="moss" />
        <SummaryCard label="إجمالي المحفظة" value={`${walletTotal} جنيه`} accent="moss" />
        <SummaryCard label="حصص مستحقة إجمالًا" value={`${totalOutstanding}`} accent="clay" />
      </div>

      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-4">حصص اليوم</h2>
        {today.length === 0 ? (
          <p className="text-sm text-ink/50">لا توجد حصص مجدولة اليوم.</p>
        ) : (
          <div className="space-y-2">
            {today.map((l) => (
              <Link
                key={l.id}
                to={`/students/${l.student_id}`}
                className="flex items-center justify-between border-b border-moss-50 py-2 hover:bg-moss-50/50 -mx-2 px-2 rounded"
              >
                <span className="font-bold">{l.student?.name ?? '—'}</span>
                <span className="text-sm text-ink/50">{l.start_time ?? ''}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-4">تقدم الطلاب</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => {
            const c = cycles.find((c) => c.student_id === s.id);
            if (!c) return null;
            return (
              <Link key={s.id} to={`/students/${s.id}`} className="border border-moss-50 rounded-xl p-4 hover:shadow-sm">
                <p className="font-bold mb-1">{s.name}</p>
                <div className="w-full bg-moss-50 rounded-full h-2 mb-1 overflow-hidden">
                  <div className="bg-moss-500 h-2 rounded-full" style={{ width: `${(c.progress / c.total_lessons) * 100}%` }} />
                </div>
                <p className="text-xs text-ink/50">
                  {c.progress}/{c.total_lessons}
                  {c.outstanding_lessons > 0 && ` · ${c.outstanding_lessons} حصة مستحقة`}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: 'moss' | 'clay' }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-ink/50 mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${accent === 'moss' ? 'text-moss-700' : 'text-clay-500'}`}>{value}</p>
    </div>
  );
}
