import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentProfile from './pages/StudentProfile';
import Wallet from './pages/Wallet';
import OutstandingLessons from './pages/OutstandingLessons';
import Availability from './pages/Availability';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentProfile />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="outstanding" element={<OutstandingLessons />} />
        <Route path="availability" element={<Availability />} />
      </Route>
    </Routes>
  );
}
