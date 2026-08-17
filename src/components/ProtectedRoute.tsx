import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-ink/50">جارِ التحميل...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
