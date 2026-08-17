import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Collection, Lesson, LessonCycle, Student, StudentSchedule, DAY_NAMES_AR, Appointment, RecurringSchedule } from '../lib/types';
import { estimateCompletionDate, formatDate } from '../lib/dates';
import RecurringScheduleForm from '../components/RecurringScheduleForm';
import AppointmentCard from '../components/AppointmentCard';
import { convertTo12Hour } from '../lib/scheduling';
import TimePicker12 from '../components/TimePicker12';
export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [cycle, setCycle] = useState<LessonCycle | null>(null);
  const [pastCycles, setPastCycles] = useState<LessonCycle[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [schedule, setSchedule] = useState<StudentSchedule[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState(0);
  const [editMinute, setEditMinute] = useState(0);

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    
    const [{ data: st }, { data: cycles }, { data: lsn }, { data: cols }, { data: sched }, { data: appts }, { data: recurring }] = await Promise.all([
      supabase.from('students').select('*').eq('id', id).single(),
      supabase.from('lesson_cycles').select('*').eq('student_id', id).order('cycle_number', { ascending: false }),
      supabase.from('lessons').select('*').eq('student_id', id).order('scheduled_date', { ascending: true }),
      supabase.from('collections').select('*').eq('student_id', id).order('collected_at', { ascending: false }),
      supabase.from('student_schedule').select('*').eq('student_id', id),
      supabase.from('appointments').select('*').eq('student_id', id).order('date', { ascending: true }).order('start_hour', { ascending: true }),
      supabase.from('recurring_schedules').select('*').eq('student_id', id).eq('status', 'active'),
    ]);
    
    setStudent(st ?? null);
    const active = (cycles ?? []).find((c) => c.status === 'active') ?? null;
    setCycle(active);
    setPastCycles((cycles ?? []).filter((c) => c.status === 'completed'));
    setLessons(lsn ?? []);
    setCollections(cols ?? []);
    setSchedule(sched ?? []);
    setAppointments(appts ?? []);
    setRecurringSchedules(recurring ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function markCompleted(lessonId: string) {
    await supabase.from('lessons').update({ status: 'completed' }).eq('id', lessonId);
    load();
  }

  async function postpone(lessonId: string) {
    await supabase.from('lessons').update({ status: 'postponed' }).eq('id', lessonId);
    load();
  }

  async function handleAppointmentStatusChange(appointmentId: string, newStatus: Appointment['status']) {
    await supabase.from('appointments').update({ status: newStatus }).eq('id', appointmentId);
    load();
  }

  async function handleSaveAppointmentEdit(appointmentId: string) {
    await supabase.from('appointments').update({ start_hour: editHour, start_minute: editMinute }).eq('id', appointmentId);
    setEditingAppointmentId(null);
    load();
  }

  if (loading) return <p className="text-ink/50">جارِ التحميل...</p>;
  if (!student) return <p className="text-ink/50">لم يتم العثور على الطالب.</p>;

  const upcoming = lessons.filter((l) => l.cycle_id === cycle?.id && l.status === 'scheduled');
  const currentCycleLessons = lessons.filter((l) => l.cycle_id === cycle?.id);
  const remainingToCycleEnd = cycle ? cycle.total_lessons - cycle.progress : 0;
  const remainingToCollection =
    cycle && cycle.collection_status === 'not_yet_collected'
      ? cycle.collection_trigger - cycle.progress
      : 0;
  const estCompletion = estimateCompletionDate(schedule, remainingToCycleEnd);
  
  // Filter today's appointments
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => a.date === today && a.status === 'scheduled');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-moss-700">{student.name}</h1>
        <p className="text-sm text-ink/50">
          {student.age ? `${student.age} سنة` : '—'} {student.phone ? `· ${student.phone}` : ''}
        </p>
      </div>

      {/* Today's Appointments */}
      {todayAppointments.length > 0 && (
        <div className="card p-6 bg-moss-50 border border-moss-200">
          <h2 className="font-extrabold text-moss-700 mb-2">حصص اليوم</h2>
          <p className="text-xs text-ink/50 mb-3">عدد الحصص المجدولة: {todayAppointments.length}</p>
          <div className="space-y-2">
            {todayAppointments.map((a) => {
              const { hour, period } = convertTo12Hour(a.start_hour);
              return (
                <div key={a.id} className="flex items-center justify-between p-3 bg-white rounded border border-moss-100">
                  <div>
                    <p className="font-bold text-sm">{student.name}</p>
                    <p className="text-xs text-ink/50">
                      {String(hour).padStart(2, '0')}:{String(a.start_minute).padStart(2, '0')} {period === 'am' ? 'ص' : 'م'}
                    </p>
                  </div>
                  <span className="pill bg-moss-500/10 text-moss-700 text-xs">مجدولة</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cycle && (
        <>
          {/* Cycle overview */}
          <div className="card p-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Stat label={`تقدم الدورة #${cycle.cycle_number}`} value={`${cycle.progress} / ${cycle.total_lessons}`} />
            <Stat
              label="حالة التحصيل"
              value={cycle.collection_status === 'collected' ? 'تم التحصيل ✓' : `باقي ${remainingToCollection} لنقطة التحصيل`}
            />
            <Stat label="حصص مستحقة للطالب" value={`${cycle.outstanding_lessons}`} />
            <Stat
              label="موعد إكمال الدورة المتوقع"
              value={estCompletion ? formatDate(estCompletion) : '—'}
            />
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="w-full bg-moss-50 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-moss-500 h-3 rounded-full transition-all"
                  style={{ width: `${(cycle.progress / cycle.total_lessons) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Schedule lessons */}
          <ScheduleLessonForm cycleId={cycle.id} studentId={student.id} onDone={load} />

          {/* Upcoming lessons */}
          <div className="card p-6">
            <h2 className="font-extrabold text-moss-700 mb-3">حصص الدورة الحالية</h2>
            {currentCycleLessons.length === 0 ? (
              <p className="text-sm text-ink/50">لا توجد حصص مضافة بعد.</p>
            ) : (
              <div className="space-y-2">
                {currentCycleLessons.map((l) => (
                  <div key={l.id} className="flex items-center justify-between border-b border-moss-50 py-2">
                    <div className="text-sm">
                      <span className="font-bold">{formatDate(l.scheduled_date)}</span>{' '}
                      {l.start_time && <span className="text-ink/50">{l.start_time}</span>}
                      <StatusPill status={l.status} />
                    </div>
                    {l.status === 'scheduled' && (
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => markCompleted(l.id)}>
                          تسجيل كمكتملة
                        </button>
                        <button className="btn-secondary" onClick={() => postpone(l.id)}>
                          تأجيل
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collection history */}
          <div className="card p-6">
            <h2 className="font-extrabold text-moss-700 mb-3">سجل التحصيل</h2>
            {collections.length === 0 ? (
              <p className="text-sm text-ink/50">لا يوجد تحصيل بعد.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-ink/50">
                    <th className="py-1">التاريخ</th>
                    <th>المبلغ</th>
                    <th>عند الحصة رقم</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((c) => (
                    <tr key={c.id} className="border-t border-moss-50">
                      <td className="py-2">{formatDate(c.collected_at)}</td>
                      <td className="font-bold text-moss-700">{c.amount} جنيه</td>
                      <td>{c.trigger_lesson_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Cycle history */}
          {pastCycles.length > 0 && (
            <div className="card p-6">
              <h2 className="font-extrabold text-moss-700 mb-3">تاريخ الدورات</h2>
              <div className="space-y-2">
                {pastCycles.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm border-t border-moss-50 pt-2">
                    <span>دورة #{c.cycle_number}</span>
                    <span>{c.total_lessons} حصص</span>
                    <span className="text-moss-700 font-bold">{c.collection_amount} جنيه</span>
                    <span className="pill bg-moss-50 text-moss-700">مكتملة</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recurring Schedules Section */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-extrabold text-moss-700">الجداول المتكررة</h2>
          <button className="btn-primary text-sm" onClick={() => setShowRecurringForm(!showRecurringForm)}>
            {showRecurringForm ? 'إغلاق' : '+ جدول جديد'}
          </button>
        </div>

        {showRecurringForm && (
          <div className="mb-4">
            <RecurringScheduleForm
              studentId={student.id}
              onDone={() => {
                setShowRecurringForm(false);
                load();
              }}
              onCancel={() => setShowRecurringForm(false)}
            />
          </div>
        )}

        {recurringSchedules.length === 0 ? (
          <p className="text-sm text-ink/50">لا توجد جداول متكررة.</p>
        ) : (
          <div className="space-y-2">
            {recurringSchedules.map((rs) => (
              <div key={rs.id} className="p-3 bg-moss-50 rounded border border-moss-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-bold">
                      {rs.days_of_week.map(d => DAY_NAMES_AR[d]).join('، ')}
                    </p>
                    <p className="text-xs text-ink/50">
                      {String(rs.start_hour).padStart(2, '0')}:{String(rs.start_minute).padStart(2, '0')} — {rs.num_weeks} أسابيع
                    </p>
                  </div>
                  <span className="pill bg-moss-500/10 text-moss-700 text-xs">نشط</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointments Management */}
      <div className="card p-6">
        <h2 className="font-extrabold text-moss-700 mb-3">المواعيد والحصص</h2>
        
        {appointments.length === 0 ? (
          <p className="text-sm text-ink/50">لا توجد مواعيد.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {appointments.map((a) => (
              <AppointmentCard key={a.id} appointment={a} onUpdate={load} isEditable={true} />
            ))}
          </div>
        )}
      </div>

      {/* Student schedule */}
      <StudentScheduleEditor studentId={student.id} schedule={schedule} onDone={load} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink/50 mb-1">{label}</p>
      <p className="text-lg font-extrabold text-ink">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Lesson['status'] }) {
  const map: Record<Lesson['status'], string> = {
    scheduled: 'bg-moss-50 text-moss-700',
    completed: 'bg-moss-500/10 text-moss-700',
    postponed: 'bg-clay-500/10 text-clay-500',
    cancelled: 'bg-red-50 text-red-600',
  };
  const labels: Record<Lesson['status'], string> = {
    scheduled: 'مجدولة',
    completed: 'مكتملة',
    postponed: 'مؤجلة',
    cancelled: 'ملغاة',
  };
  return <span className={`pill ${map[status]} mr-2`}>{labels[status]}</span>;
}

function ScheduleLessonForm({
  cycleId,
  studentId,
  onDone,
}: {
  cycleId: string;
  studentId: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    await supabase.from('lessons').insert({
      student_id: studentId,
      cycle_id: cycleId,
      scheduled_date: date,
      start_time: time || null,
      status: 'scheduled',
    });
    setSaving(false);
    setDate('');
    setTime('');
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 flex flex-wrap items-end gap-3">
      <div>
        <label className="label">تاريخ حصة جديدة</label>
        <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label">الوقت</label>
        <TimePicker12 value={time}onChange={setTime}/>
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        إضافة حصة
      </button>
    </form>
  );
}

function StudentScheduleEditor({
  studentId,
  schedule,
  onDone,
}: {
  studentId: string;
  schedule: StudentSchedule[];
  onDone: () => void;
}) {
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('16:00');
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);

  async function addSlot(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('student_schedule').insert({
      student_id: studentId,
      day_of_week: day,
      start_time: time,
      duration_minutes: duration,
    });
    setSaving(false);
    onDone();
  }

  async function removeSlot(id: string) {
    await supabase.from('student_schedule').delete().eq('id', id);
    onDone();
  }

  return (
    <div className="card p-6">
      <h2 className="font-extrabold text-moss-700 mb-3">جدول الطالب الأسبوعي</h2>
      <div className="space-y-2 mb-4">
        {schedule.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm border-b border-moss-50 py-1">
            <span>
              {DAY_NAMES_AR[s.day_of_week]} — {s.start_time} ({s.duration_minutes} دقيقة)
            </span>
            <button className="text-red-500 text-xs" onClick={() => removeSlot(s.id)}>
              حذف
            </button>
          </div>
        ))}
        {schedule.length === 0 && <p className="text-sm text-ink/50">لا يوجد موعد أسبوعي محدد.</p>}
      </div>
      <form onSubmit={addSlot} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">اليوم</label>
          <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAY_NAMES_AR.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">الوقت</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="label">المدة (دقيقة)</label>
          <input
            className="input w-24"
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <button type="submit" disabled={saving} className="btn-secondary">
          إضافة موعد
        </button>
      </form>
    </div>
  );
}
