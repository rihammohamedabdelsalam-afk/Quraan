import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Student, WalletTransaction } from '../lib/types';
import { formatDate } from '../lib/dates';

export default function Wallet() {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState<'all' | 'today' | 'month' | 'year'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: tx }, { data: st }] = await Promise.all([
        supabase.from('wallet_transactions').select('*').order('date', { ascending: false }),
        supabase.from('students').select('*'),
      ]);
      setTransactions(tx ?? []);
      setStudents(st ?? []);
      setLoading(false);
    })();
  }, []);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    const yearStr = todayStr.slice(0, 4);
    return transactions.filter((t) => {
      if (filter === 'today') return t.date === todayStr;
      if (filter === 'month') return t.date.startsWith(monthStr);
      if (filter === 'year') return t.date.startsWith(yearStr);
      return true;
    });
  }, [transactions, filter]);

  const total = filtered.reduce((s, t) => s + Number(t.amount), 0);

  const byStudent = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((t) => map.set(t.student_id, (map.get(t.student_id) ?? 0) + Number(t.amount)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  if (loading) return <p className="text-ink/50">جارِ التحميل...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-moss-700">المحفظة</h1>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'today', label: 'اليوم' },
          { key: 'month', label: 'الشهر' },
          { key: 'year', label: 'السنة' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as typeof filter)}
            className={filter === f.key ? 'btn-primary' : 'btn-secondary'}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card p-6">
        <p className="text-sm text-ink/50 mb-1">إجمالي التحصيل</p>
        <p className="text-3xl font-extrabold text-moss-700">{total.toLocaleString()} جنيه</p>
      </div>

      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-3">تفصيل حسب الطالب</h2>
        {byStudent.length === 0 ? (
          <p className="text-sm text-ink/50">لا يوجد تحصيل في هذه الفترة.</p>
        ) : (
          <div className="space-y-2">
            {byStudent.map(([studentId, amount]) => (
              <div key={studentId} className="flex justify-between border-b border-moss-50 py-2 text-sm">
                <span className="font-bold">{studentMap.get(studentId) ?? '—'}</span>
                <span className="text-moss-700 font-bold">+{amount.toLocaleString()} جنيه</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-3">كل الحركات</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-ink/50">
              <th className="py-1">التاريخ</th>
              <th>الطالب</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-moss-50">
                <td className="py-2">{formatDate(t.date)}</td>
                <td>{studentMap.get(t.student_id) ?? '—'}</td>
                <td className="font-bold text-moss-700">+{Number(t.amount).toLocaleString()} جنيه</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
