import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const links = [
  { to: '/', label: 'الرئيسية', icon: '🏠', end: true },
  { to: '/students', label: 'الطلاب', icon: '👨‍🎓' },
  { to: '/wallet', label: 'المحفظة', icon: '💰' },
  { to: '/outstanding', label: 'الحصص المستحقة', icon: '📋' },
  { to: '/availability', label: 'مواعيد عملي', icon: '📅' },
];

export default function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 rounded-lg bg-moss-600 text-white hover:bg-moss-700 transition-colors"
        aria-label="تبديل القائمة"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={sidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
          />
        </svg>
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30 transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 right-0 z-40 w-64 md:w-64 bg-gradient-to-b from-moss-700 to-moss-800 text-white
          flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          shadow-xl md:shadow-none
        `}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-moss-800 to-moss-700 p-6 border-b-4 border-clay-500">
          <h1 className="font-extrabold text-xl text-white">إدارة الحصص</h1>
          <p className="text-moss-100 text-xs mt-1">نظام إدارة حصص المعلمة</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold
                  transition-all duration-200 ease-out
                  ${
                    isActive
                      ? 'bg-clay-500 text-white shadow-lg scale-105'
                      : 'text-moss-100 hover:bg-moss-600 hover:text-white'
                  }
                `
              }
            >
              <span className="text-lg">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Logout Button */}
        <div className="border-t border-moss-600 p-4">
          <button
            onClick={() => {
              closeSidebar();
              handleLogout();
            }}
            className="w-full flex items-center justify-end gap-2 px-4 py-3 rounded-xl text-sm font-bold text-moss-100 hover:bg-moss-600 hover:text-white transition-colors duration-200"
          >
            <span>تسجيل الخروج</span>
            <span>🚪</span>
          </button>
        </div>

        {/* Close button for mobile */}
        <button
          onClick={closeSidebar}
          className="md:hidden p-4 text-moss-100 hover:text-white text-center text-xs"
        >
          إغلاق القائمة
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full pt-20 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
