import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Appointment, DAY_NAMES_AR } from '../lib/types';
import { formatTimeArabic } from '../lib/scheduling';
import RescheduleModal from './RescheduleModal';

interface AppointmentCardProps {
  appointment: Appointment & { student_name?: string };
  onUpdate: () => void;
  isEditable?: boolean;
}

export default function AppointmentCard({
  appointment,
  onUpdate,
  isEditable = true,
}: AppointmentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [note, setNote] = useState(appointment.notes || '');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [loading, setLoading] = useState(false);

  const getStatusColor = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled':
        return 'bg-moss-100 border-moss-300 text-moss-900';
      case 'completed':
        return 'bg-green-100 border-green-300 text-green-900';
      case 'cancelled':
        return 'bg-red-100 border-red-300 text-red-900';
      case 'rescheduled':
        return 'bg-blue-100 border-blue-300 text-blue-900';
      default:
        return 'bg-ink/5 border-ink/10 text-ink';
    }
  };

  const getStatusLabel = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled':
        return 'مجدولة';
      case 'completed':
        return 'مكتملة';
      case 'cancelled':
        return 'ملغاة';
      case 'rescheduled':
        return 'معاد جدولتها';
      default:
        return status;
    }
  };

  async function handleStatusChange(newStatus: Appointment['status']) {
    setLoading(true);
    try {
      await supabase
        .from('appointments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appointment.id);
      onUpdate();
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setLoading(false);
      setShowMenu(false);
    }
  }

  async function handleSaveNote() {
    setLoading(true);
    try {
      await supabase
        .from('appointments')
        .update({ notes: note || null, updated_at: new Date().toISOString() })
        .eq('id', appointment.id);
      setShowNoteForm(false);
      onUpdate();
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await supabase.from('appointments').delete().eq('id', appointment.id);
      setShowConfirmDelete(false);
      onUpdate();
    } catch (error) {
      console.error('Error deleting appointment:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={`border rounded-lg p-4 space-y-2 relative ${getStatusColor(appointment.status)}`}>
        {/* Header with date and status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <p className="font-bold text-sm">
              {DAY_NAMES_AR[appointment.day_of_week]} — {appointment.date}
            </p>
            <p className="text-sm font-semibold">
              {formatTimeArabic(appointment.start_hour, appointment.start_minute)}
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded bg-white/50">
            {getStatusLabel(appointment.status)}
          </span>
        </div>

        {/* Show original appointment if rescheduled */}
        {appointment.status === 'rescheduled' && appointment.original_date && (
          <div className="text-xs p-2 bg-white/40 rounded border-l-2 border-ink/30">
            <p className="text-ink/70">
              الموعد الأصلي: {DAY_NAMES_AR[new Date(appointment.original_date).getDay()]} —{' '}
              {appointment.original_date} الساعة{' '}
              {formatTimeArabic(appointment.original_start_hour || 0, appointment.original_start_minute || 0)}
            </p>
            {appointment.reschedule_reason && (
              <p className="text-ink/60 mt-1">السبب: {appointment.reschedule_reason}</p>
            )}
          </div>
        )}

        {/* Notes */}
        {appointment.notes && (
          <div className="text-xs p-2 bg-white/40 rounded italic">
            📝 {appointment.notes}
          </div>
        )}

        {/* Action Menu Button */}
        {isEditable && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-lg p-1 rounded hover:bg-white/30 transition"
              title="خيارات"
            >
              ⋮
            </button>

            {showMenu && (
              <div className="absolute left-0 top-8 bg-white border border-ink/20 rounded-lg shadow-lg z-50 min-w-max">
                <button
                  onClick={() => {
                    setShowNoteForm(true);
                    setShowMenu(false);
                  }}
                  className="block w-full text-right px-4 py-2 text-sm hover:bg-moss-50 transition"
                  disabled={loading}
                >
                  📝 {appointment.notes ? 'تعديل ملاحظة' : 'إضافة ملاحظة'}
                </button>

                {appointment.status === 'scheduled' && (
                  <>
                    <button
                      onClick={() => {
                        handleStatusChange('completed');
                      }}
                      className="block w-full text-right px-4 py-2 text-sm hover:bg-green-50 transition border-t border-ink/10"
                      disabled={loading}
                    >
                      ✓ تسجيل مكتملة
                    </button>
                    <button
                      onClick={() => {
                        setShowReschedule(true);
                        setShowMenu(false);
                      }}
                      className="block w-full text-right px-4 py-2 text-sm hover:bg-blue-50 transition border-t border-ink/10"
                      disabled={loading}
                    >
                      📅 تأجيل الحصة
                    </button>
                    <button
                      onClick={() => {
                        handleStatusChange('cancelled');
                      }}
                      className="block w-full text-right px-4 py-2 text-sm hover:bg-red-50 transition border-t border-ink/10"
                      disabled={loading}
                    >
                      ✕ إلغاء الحصة
                    </button>
                  </>
                )}

                {appointment.status !== 'scheduled' && (
                  <button
                    onClick={() => {
                      setShowConfirmDelete(true);
                      setShowMenu(false);
                    }}
                    className="block w-full text-right px-4 py-2 text-sm hover:bg-red-50 transition border-t border-ink/10 text-red-600"
                    disabled={loading}
                  >
                    🗑️ حذف الحصة
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Note Editor Modal */}
      {showNoteForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-40">
          <div className="bg-white w-full sm:max-w-md rounded-t-lg p-6 space-y-4">
            <h3 className="font-extrabold text-moss-700">ملاحظة الحصة</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="أضف ملاحظة عن الحصة..."
              className="input w-full h-24 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNoteForm(false)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveNote}
                className="flex-1 btn-primary"
                disabled={loading}
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 space-y-4 max-w-sm">
            <h3 className="font-extrabold text-red-600">حذف الحصة</h3>
            <p className="text-sm text-ink/70">
              هل أنت متأكد من حذف هذه الحصة؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 btn-primary bg-red-600 hover:bg-red-700"
                disabled={loading}
              >
                {loading ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showReschedule && (
        <RescheduleModal
          appointment={appointment}
          onDone={() => {
            setShowReschedule(false);
            onUpdate();
          }}
          onCancel={() => setShowReschedule(false)}
        />
      )}
    </>
  );
}
