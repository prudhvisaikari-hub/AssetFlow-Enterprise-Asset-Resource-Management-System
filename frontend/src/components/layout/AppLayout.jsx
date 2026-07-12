import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Settings, 
  Package, 
  ArrowRightLeft, 
  CalendarDays, 
  Wrench, 
  ClipboardCheck, 
  BarChart3, 
  Activity,
  LogOut,
  Bell
} from 'lucide-react';
import clsx from 'clsx';

const AppLayout = ({ children }) => {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Assets', path: '/assets', icon: Package },
    { name: 'Allocations & Transfers', path: '/allocations', icon: ArrowRightLeft },
    { name: 'Resource Booking', path: '/bookings', icon: CalendarDays },
    { name: 'Maintenance', path: '/maintenance', icon: Wrench },
    { name: 'Asset Audit', path: '/audit', icon: ClipboardCheck },
    { name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
    { name: 'Activity & Notifications', path: '/activity', roles: ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'], icon: Activity },
    { name: 'Organization Setup', path: '/org-setup', roles: ['ADMIN'], icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            AssetFlow
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => {
              if (item.roles && !hasRole(item.roles)) return null;
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => clsx(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center mb-4">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
              {user?.name?.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col ml-64 min-w-0">
        <header className="h-16 bg-white/70 backdrop-blur-md border-b border-slate-200 sticky top-0 z-10 flex items-center justify-end px-8">
          <button className="p-2 text-slate-400 hover:text-slate-500 relative transition-colors">
            <span className="sr-only">View notifications</span>
            <Bell className="h-6 w-6" />
            <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white" />
          </button>
        </header>
        <div className="flex-1 p-8 overflow-y-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
