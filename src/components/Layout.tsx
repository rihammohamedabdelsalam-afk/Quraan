import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const links = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/students', label: 'الطلاب' },
  { to: '/wallet', label: 'المحفظة' },
  { to: '/outstanding', label: 'الحصص المستحقة' },
  { to: '/availability', label: 'مواعيد عملي' },
];

export default function Layout() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 md:min-h-screen bg-moss-700 text-white flex md:flex-col">
        <div className="p-4 font-extrabold text-lg">إدارة الحصص</div>
        <nav className="flex md:flex-col flex-1 overflow-x-auto md:overflow-visible">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-bold whitespace-nowrap border-r-4 md:border-r-0 md:border-r-4 ${
                  isActive
                    ? 'bg-moss-600 border-clay-500'
                    : 'border-transparent hover:bg-moss-600/60'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="p-4 text-sm text-moss-100 hover:text-white text-right"
        >
          تسجيل الخروج
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
