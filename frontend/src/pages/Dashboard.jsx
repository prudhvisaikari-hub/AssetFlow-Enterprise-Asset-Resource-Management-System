import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { 
  Package, 
  CheckCircle, 
  Wrench, 
  Calendar, 
  ArrowRightLeft, 
  Clock, 
  AlertTriangle,
  Plus,
  CalendarPlus,
  AlertOctagon
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

const Dashboard = () => {
  const { hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/dashboard');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const kpis = [
    { name: 'Assets Available', value: data?.kpis.assetsAvailable, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { name: 'Assets Allocated', value: data?.kpis.assetsAllocated, icon: Package, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Maintenance Today', value: data?.kpis.maintenanceToday, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-100' },
    { name: 'Active Bookings', value: data?.kpis.activeBookings, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100' },
    { name: 'Pending Transfers', value: data?.kpis.pendingTransfers, icon: ArrowRightLeft, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { name: 'Upcoming Returns', value: data?.kpis.upcomingReturns, icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100' },
    { name: 'Overdue Returns', value: data?.kpis.overdueReturns, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex gap-2">
          {hasRole(['ADMIN', 'ASSET_MANAGER']) && (
            <Link to="/assets?action=new" className="btn-primary flex items-center">
              <Plus className="mr-2 h-4 w-4" /> Register Asset
            </Link>
          )}
          <Link to="/bookings?action=new" className="btn-secondary flex items-center">
            <CalendarPlus className="mr-2 h-4 w-4" /> Book Resource
          </Link>
          <Link to="/maintenance?action=new" className="btn-secondary flex items-center">
            <AlertOctagon className="mr-2 h-4 w-4" /> Raise Issue
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="card p-6 flex items-center hover:-translate-y-1 transition-transform duration-200">
            <div className={clsx('p-3 rounded-xl mr-4', kpi.bg, kpi.color)}>
              <kpi.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{kpi.name}</p>
              <p className="text-2xl font-bold text-slate-900">{kpi.value || 0}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-6 border-b border-slate-200 bg-red-50/50">
            <h2 className="text-lg font-semibold text-red-700 flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5" /> Overdue Returns
            </h2>
          </div>
          <div className="p-0">
            {data?.overdueReturns?.length > 0 ? (
              <ul className="divide-y divide-slate-200">
                {data.overdueReturns.map((item) => (
                  <li key={item.allocationId} className="p-4 hover:bg-slate-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.assetName}</p>
                        <p className="text-xs text-slate-500">#{item.assetTag} • Holder: {item.holder}</p>
                      </div>
                      <div className="text-right">
                        <span className="badge bg-red-100 text-red-800 font-semibold">
                          Overdue
                        </span>
                        <p className="text-xs text-slate-500 mt-1">Due: {format(new Date(item.expectedReturnDate), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-sm text-slate-500">No overdue returns.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center">
              <Clock className="mr-2 h-5 w-5 text-slate-500" /> Upcoming Returns
            </h2>
          </div>
          <div className="p-0">
            {data?.upcomingReturns?.length > 0 ? (
              <ul className="divide-y divide-slate-200">
                {data.upcomingReturns.map((item) => (
                  <li key={item.allocationId} className="p-4 hover:bg-slate-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.assetName}</p>
                        <p className="text-xs text-slate-500">#{item.assetTag} • Holder: {item.holder}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-900">{format(new Date(item.expectedReturnDate), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-sm text-slate-500">No upcoming returns in the next 7 days.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
