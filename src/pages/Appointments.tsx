import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, Student, DAY_NAMES_AR } from '../lib/types';
import RecurringScheduleForm from '../components/RecurringScheduleForm';
import { formatTime, convertTo12Hour, rescheduleAppointment } from '../lib/scheduling';

export default function Appointments() {
  const [appointments, setAppointments] = useState<(Appointment & { students?: Student })[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'completed' | 'cancelled'>('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState(0);
  const [editMinute, setEditMinute] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // Load appointments
      const { data: appts } = await supabase
        .from('appointments')
        .select('*, students(name)')
        .eq('teacher_id', user.user.id)
        .order('date', { ascending: true })
        .order('start_hour', { ascending: true })
        .order('start_minute', { ascending: true });

      // Load students
      const { data: stds } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', user.user.id)
        .eq('status', 'active');

      setAppointments(appts ?? []);
      setStudents(stds ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = appointments.filter((a) => {
    const dateMatch = !selectedDate || a.date === selectedDate;
    const statusMatch = filterStatus === 'all' || a.status === filterStatus;
    const studentMatch = !selectedStudent || a.student_id === selectedStudent;
    return dateMatch && statusMatch && studentMatch;
  });

  async function handleStatusChange(id: string, newStatus: Appointment['status']) {
    try {
      // Goes through complete_appointment()/cancel_appointment() rather than
      // a raw status update, so progress/collection/wallet logic (for
      // completion) and the audit trail (for cancellation) actually run.
      const rpcName =
        newStatus === 'completed' ? 'complete_appointment' : 'cancel_appointment';
      const { error } = await supabase.rpc(rpcName, {
        p_appointment_id: id,
        ...(rpcName === 'cancel_appointment' ? { p_reason: null } : {}),
      });
      if (error) throw error;
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      const current = appointments.find((a) => a.id === id);
      if (!current) throw new Error('لم يتم العثور على الموعد.');

      // Goes through reschedule_appointment() (creates a new appointment,
      // closes this one, marks the new one as manually overridden) rather
      // than a raw in-place time edit, so it can never be silently
      // overwritten later by a recurring-schedule sync.
      await rescheduleAppointment(
        supabase,
        id,
        current.date,
        editHour,
        editMinute
      );
      setEditingId(null);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const todayAppointments = appointments.filter((a) => a.status === 'scheduled' && a.date === new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-extrabold text-moss-700">المواعيد والجدول</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + جدول جديد
        </button>
      </div>

      {/* Today's Schedule */}
      {todayAppointments.length > 0 && (
        <div className="card p-6 bg-moss-50 border border-moss-200">
          <h2 className="font-extrabold text-moss-700 mb-3">حصص اليوم</h2>
          <p className="text-xs text-ink/50 mb-3">عدد الحصص: {todayAppointments.length}</p>
          <div className="space-y-2">
            {todayAppointments.map((a) => {
              const { hour, period } = convertTo12Hour(a.start_hour);
              return (
                <div key={a.id} className="flex items-center justify-between p-3 bg-white rounded border border-moss-100">
                  <div>
                    <p className="font-bold text-sm">{a.students?.name}</p>
                    <p className="text-xs text-ink/50">
                      {String(hour).padStart(2, '0')}:{String(a.start_minute).padStart(2, '0')} {period === 'am' ? 'ص' : 'م'}
                    </p>
                  </div>
                  <span className={`pill ${a.status === 'scheduled' ? 'bg-moss-500/10 text-moss-700' : a.status === 'completed' ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-600'}`}>
                    {a.status === 'scheduled' ? 'مجدولة' : a.status === 'completed' ? 'مكتملة' : 'ملغاة'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">التاريخ</label>
            <input
              className="input text-sm"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">الطالب</label>
            <select
              className="input text-sm"
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
            >
              <option value="">جميع الطلاب</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">الحالة</label>
            <select
              className="input text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">جميع الحالات</option>
              <option value="scheduled">مجدولة</option>
              <option value="completed">مكتملة</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </div>
        </div>
      </div>

      {/* Show Form */}
      {showForm && (
        <div className="card p-6">
          {selectedStudent ? (
            <RecurringScheduleForm
              studentId={selectedStudent}
              onDone={() => {
                setShowForm(false);
                setSelectedStudent('');
                loadData();
              }}
              onCancel={() => {
                setShowForm(false);
              }}
            />
          ) : (
            <div className="space-y-4">
              <h2 className="font-extrabold text-moss-700">اختر طالبًا</h2>
              <select
                className="input"
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                <option value="">-- اختر طالبًا --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowForm(false)}
                className="btn-secondary w-full"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      )}

      {/* Appointments List */}
      {loading ? (
        <p className="text-ink/50">جارِ التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink/50">لا توجد مواعيد.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const { hour, period } = convertTo12Hour(a.start_hour);
            const isEditing = editingId === a.id;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-extrabold text-ink">{a.students?.name}</h3>
                      <span className={`pill text-xs ${
                        a.status === 'scheduled'
                          ? 'bg-moss-500/10 text-moss-700'
                          : a.status === 'completed'
                          ? 'bg-green-500/10 text-green-700'
                          : 'bg-red-500/10 text-red-600'
                      }`}>
                        {a.status === 'scheduled' ? 'مجدولة' : a.status === 'completed' ? 'مكتملة' : 'ملغاة'}
                      </span>
                    </div>
                    <p className="text-sm text-ink/50 mb-2">
                      {DAY_NAMES_AR[a.day_of_week]} — {a.date}
                    </p>
                    {isEditing ? (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="label text-xs">الساعة</label>
                          <input
                            className="input text-sm"
                            type="number"
                            min={0}
                            max={23}
                            value={editHour}
                            onChange={(e) => setEditHour(Number(e.target.value))}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="label text-xs">الدقيقة</label>
                          <input
                            className="input text-sm"
                            type="number"
                            min={0}
                            max={59}
                            value={editMinute}
                            onChange={(e) => setEditMinute(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-moss-700">
                        {String(hour).padStart(2, '0')}:{String(a.start_minute).padStart(2, '0')} {period === 'am' ? 'ص' : 'م'}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {a.status === 'scheduled' && (
                      <>
                        {!isEditing ? (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(a.id);
                                setEditHour(a.start_hour);
                                setEditMinute(a.start_minute);
                              }}
                              className="btn-secondary text-xs"
                            >
                              تعديل
                            </button>
                            <button
                              onClick={() => handleStatusChange(a.id, 'completed')}
                              className="btn-primary text-xs"
                            >
                              مكتملة
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSaveEdit(a.id)}
                              className="btn-primary text-xs"
                            >
                              حفظ
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="btn-secondary text-xs"
                            >
                              إلغاء
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {a.status !== 'cancelled' && (
                      <button
                        onClick={() => handleStatusChange(a.id, 'cancelled')}
                        className="text-red-600 text-xs hover:underline"
                      >
                        ملغاة
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
