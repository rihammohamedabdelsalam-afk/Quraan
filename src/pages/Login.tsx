import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('بيانات الدخول غير صحيحة، حاولي مرة أخرى.');
      return;
    }
    navigate('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <form onSubmit={handleSubmit} className="card p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-extrabold text-moss-700 text-center mb-2">
          تسجيل دخول المعلمة
        </h1>
        <div>
          <label className="label">البريد الإلكتروني</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">كلمة المرور</label>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'جارِ الدخول...' : 'دخول'}
        </button>
        <p className="text-xs text-ink/50 text-center">
          يتم إنشاء حساب المعلمة من لوحة تحكم Supabase (Authentication → Users).
        </p>
      </form>
    </div>
  );
}
