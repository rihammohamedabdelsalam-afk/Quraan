import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LessonCycle, Student } from '../lib/types';

type Row = Student & { cycle?: LessonCycle };

export default function Students() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const { data: students } = await supabase
      .from('students')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const { data: cycles } = await supabase
      .from('lesson_cycles')
      .select('*')
      .eq('status', 'active');

    const merged = (students ?? []).map((s) => ({
      ...s,
      cycle: (cycles ?? []).find((c) => c.student_id === s.id),
    }));
    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => r.name.includes(search));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold text-moss-700">الطلاب</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + إضافة طالب
        </button>
      </div>

      <input
        className="input max-w-xs"
        placeholder="بحث بالاسم..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && <AddStudentForm onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />}

      {loading ? (
        <p className="text-ink/50">جارِ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink/50">لا يوجد طلاب بعد.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link key={s.id} to={`/students/${s.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-extrabold text-ink">{s.name}</h3>
                {s.cycle?.collection_status === 'collected' && (
                  <span className="pill bg-clay-500/10 text-clay-500">تم التحصيل</span>
                )}
              </div>
              <p className="text-xs text-ink/50 mb-3">
                {s.age ? `${s.age} سنة` : '—'}
              </p>
              {s.cycle && (
                <>
                  <div className="w-full bg-moss-50 rounded-full h-2 mb-1 overflow-hidden">
                    <div
                      className="bg-moss-500 h-2 rounded-full"
                      style={{ width: `${(s.cycle.progress / s.cycle.total_lessons) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm font-bold text-moss-700">
                    {s.cycle.progress} / {s.cycle.total_lessons} حصة
                  </p>
                  {s.cycle.outstanding_lessons > 0 && (
                    <p className="text-xs text-clay-500 mt-1">
                      {s.cycle.outstanding_lessons} حصة مستحقة للطالب
                    </p>
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AddStudentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [totalLessons, setTotalLessons] = useState(8);
  const [amount, setAmount] = useState(1000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (totalLessons % 2 !== 0) {
      setError('عدد الحصص يجب أن يكون رقمًا زوجيًا.');
      return;
    }
    const ageNum = age ? parseInt(age, 10) : null;
    if (ageNum !== null && (ageNum < 5 || ageNum > 80)) {
      setError('السن يجب أن تكون بين 5 و 80 سنة.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc('fn_create_student_with_cycle', {
      p_name: name,
      p_age: ageNum,
      p_phone: phone || null,
      p_notes: null,
      p_total_lessons: totalLessons,
      p_collection_amount: amount,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4 max-w-lg">
      <h2 className="font-extrabold text-moss-700">بيانات الطالب</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">الاسم</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">السن (اختياري)</label>
          <input
            className="input"
            type="number"
            min={5}
            max={80}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="مثال: 10"
          />
        </div>
        <div>
          <label className="label">رقم الهاتف</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label">عدد الحصص المتفق عليها (رقم زوجي)</label>
          <input
            className="input"
            type="number"
            min={2}
            step={2}
            required
            value={totalLessons}
            onChange={(e) => setTotalLessons(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">قيمة التحصيل (جنيه)</label>
          <input
            className="input"
            type="number"
            min={0}
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
      </div>
      <p className="text-xs text-ink/50">
        سيتم التحصيل تلقائيًا عند إكمال الحصة رقم {Math.floor(totalLessons / 2) || '—'}.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'جارِ الحفظ...' : 'حفظ'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          إلغاء
        </button>
      </div>
    </form>
  );
}
