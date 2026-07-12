import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Bell, Activity as ActivityIcon, CheckCircle, Info, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';

const Activity = () => {
  const { hasRole } = useAuth();
  const [logs, setLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [notifRes, logsRes] = await Promise.all([
          api.get('/activity/notifications'),
          hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) ? api.get('/activity') : Promise.resolve({ data: [] })
        ]);
        setNotifications(notifRes.data);
        if (logsRes.data) setLogs(logsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [hasRole]);

  const markRead = async (id) => {
    try {
      await api.post(`/activity/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post(`/activity/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const getActionColor = (action) => {
    if (action.includes('CREATE') || action.includes('REGISTER') || action.includes('APPROVE') || action.includes('RESOLVE')) return 'bg-emerald-50 text-emerald-600 border-emerald-200';
    if (action.includes('REJECT') || action.includes('CANCEL') || action.includes('DISCREPANCY')) return 'bg-red-50 text-red-600 border-red-200';
    if (action.includes('UPDATE') || action.includes('RESCHEDULE') || action.includes('ALLOCATE') || action.includes('TRANSFER')) return 'bg-blue-50 text-blue-600 border-blue-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  const formatAction = (action) => {
    return action.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  };

  if (loading) {
    return <div className="flex justify-center p-24"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Activity & Notifications</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Notifications (All Users) */}
        <div className="card p-0 lg:col-span-1 border-2 border-blue-100 flex flex-col h-[80vh]">
          <div className="p-4 border-b border-slate-200 bg-blue-50/50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-blue-900 flex items-center">
              <Bell className="mr-2 h-5 w-5" /> My Notifications
            </h2>
            {notifications.some(n => !n.isRead) && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline font-medium">Mark all read</button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 p-3 space-y-3">
            {notifications.map(n => (
              <div 
                key={n.id} 
                className={clsx(
                  "p-4 rounded-xl border text-sm transition-all relative cursor-pointer",
                  n.isRead ? "bg-white border-slate-100 opacity-70 hover:opacity-100 shadow-sm" : "bg-blue-50 border-blue-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                )}
                onClick={() => !n.isRead && markRead(n.id)}
              >
                {!n.isRead && <span className="absolute top-4 right-4 h-2.5 w-2.5 bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)]"></span>}
                <div className={clsx("font-medium mb-1 pr-6", n.isRead ? "text-slate-700" : "text-blue-900 font-bold")}>{n.message}</div>
                <div className="text-xs text-slate-500 flex items-center mt-2">
                  <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" /> {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="text-center text-slate-500 p-8 italic text-sm">No notifications yet.</div>
            )}
          </div>
        </div>

        {/* Global Activity Log (Managers/Admin only) */}
        {hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) && (
          <div className="card p-0 lg:col-span-2 flex flex-col h-[80vh] bg-slate-50/50">
            <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center">
                <ActivityIcon className="mr-2 h-5 w-5 text-emerald-600" /> System Activity Log
              </h2>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="relative border-l-2 border-slate-300 ml-4 space-y-6">
                {logs.map((log, idx) => (
                  <div key={log.id} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full bg-white border-4 border-blue-400 shadow-sm"></div>
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-slate-900">{log.employeeName}</div>
                        <div className="text-xs text-slate-400 whitespace-nowrap ml-4 bg-slate-50 px-2 py-1 rounded">
                          {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                        </div>
                      </div>
                      <div className="flex items-center text-sm">
                        <span className={clsx("px-2 py-0.5 rounded border text-xs font-bold mr-3", getActionColor(log.action))}>
                          {formatAction(log.action)}
                        </span>
                        <span className="text-slate-600 font-medium">
                          {log.entityType} <span className="text-slate-400">#{log.entityId}</span>
                        </span>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <pre className="mt-3 bg-slate-900 p-3 rounded-lg text-xs text-slate-300 overflow-x-auto shadow-inner">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="text-center text-slate-500 p-8 italic text-sm border-none">No system activity logged yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Activity;
