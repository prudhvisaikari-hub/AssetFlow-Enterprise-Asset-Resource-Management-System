import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { BarChart3, Download, PieChart, Activity, AlertTriangle, ArrowRight, Wrench } from 'lucide-react';
import { format } from 'date-fns';

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [utilization, setUtilization] = useState([]);
  const [deptAllocation, setDeptAllocation] = useState([]);
  const [maintenanceFreq, setMaintenanceFreq] = useState([]);
  const [upkeep, setUpkeep] = useState({ underMaintenance: [], nearingRetirement: [] });

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const [utilRes, deptRes, maintRes, upkeepRes] = await Promise.all([
          api.get('/reports/utilization'),
          api.get('/reports/department-allocation'),
          api.get('/reports/maintenance-frequency'),
          api.get('/reports/upkeep')
        ]);
        setUtilization(utilRes.data.slice(0, 5)); // Top 5
        setDeptAllocation(deptRes.data);
        setMaintenanceFreq(maintRes.data);
        setUpkeep(upkeepRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  const handleExport = (report) => {
    window.open(`http://localhost:4000/api/reports/export/${report}?token=${localStorage.getItem('token')}`, '_blank');
  };

  if (loading) {
    return <div className="flex justify-center p-24"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  const maxDept = Math.max(...deptAllocation.map(d => d.activeAllocations), 1);
  const maxMaint = Math.max(...maintenanceFreq.map(m => m.requestCount), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
        <div className="flex gap-3">
          <button onClick={() => handleExport('utilization')} className="btn-secondary flex items-center bg-white border-slate-300 shadow-sm hover:border-slate-400">
            <Download className="mr-2 h-4 w-4 text-slate-600" /> Export Utilization
          </button>
          <button onClick={() => handleExport('allocations')} className="btn-secondary flex items-center bg-white border-slate-300 shadow-sm hover:border-slate-400">
            <Download className="mr-2 h-4 w-4 text-slate-600" /> Export Allocations
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Department Allocation (Bar) */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center mb-6">
            <PieChart className="mr-2 h-5 w-5 text-blue-600" /> Allocation by Department
          </h2>
          <div className="space-y-5">
            {deptAllocation.map(dept => (
              <div key={dept.department}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">{dept.department || 'Unassigned'}</span>
                  <span className="text-slate-500 font-bold">{dept.activeAllocations} assets</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div className="bg-blue-600 h-3 rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${(dept.activeAllocations / maxDept) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {deptAllocation.length === 0 && <p className="text-slate-500 text-sm italic">No data available.</p>}
          </div>
        </div>

        {/* Maintenance Frequency */}
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center mb-6">
            <Wrench className="mr-2 h-5 w-5 text-amber-600" /> Maintenance by Category
          </h2>
          <div className="space-y-5">
            {maintenanceFreq.map(freq => (
              <div key={freq.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700">{freq.category}</span>
                  <span className="text-slate-500 font-bold">{freq.requestCount} requests</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3">
                  <div className="bg-amber-500 h-3 rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${(freq.requestCount / maxMaint) * 100}%` }}></div>
                </div>
              </div>
            ))}
            {maintenanceFreq.length === 0 && <p className="text-slate-500 text-sm italic">No data available.</p>}
          </div>
        </div>

        {/* Most Utilized Assets */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900 flex items-center mb-4">
            <Activity className="mr-2 h-5 w-5 text-emerald-600" /> Top Utilized Assets
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Allocations</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Bookings</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {utilization.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-bold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">#{u.assetTag}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded-full text-xs font-medium">{u.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{u.allocationCount}</td>
                    <td className="px-4 py-3 text-right text-sm">{u.bookingCount}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600 bg-emerald-50/50">{u.usageScore}</td>
                  </tr>
                ))}
                {utilization.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-6 text-center text-sm text-slate-500">No utilization data available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upkeep Alerts */}
        <div className="card p-6 lg:col-span-2 border-2 border-amber-100 bg-amber-50/30">
          <h2 className="text-lg font-bold text-amber-900 flex items-center mb-6">
            <AlertTriangle className="mr-2 h-5 w-5 text-amber-600" /> Upkeep & Retirement Alerts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm">
              <h3 className="font-bold text-amber-800 border-b border-amber-100 pb-2 mb-3 flex justify-between">
                <span>Under Maintenance</span>
                <span className="bg-amber-100 text-amber-800 px-2 rounded-full text-sm">{upkeep.underMaintenance.length}</span>
              </h3>
              <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                {upkeep.underMaintenance.map(a => (
                  <li key={a.id} className="text-sm flex justify-between hover:bg-slate-50 p-2 rounded transition-colors border-b border-slate-50 last:border-0">
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <span className="text-slate-500 font-mono text-xs">#{a.assetTag}</span>
                  </li>
                ))}
                {upkeep.underMaintenance.length === 0 && <li className="text-sm text-slate-500 italic p-2">None currently</li>}
              </ul>
            </div>
            <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm">
              <h3 className="font-bold text-amber-800 border-b border-amber-100 pb-2 mb-3 flex justify-between">
                <span>Nearing Retirement</span>
                <span className="bg-amber-100 text-amber-800 px-2 rounded-full text-sm">{upkeep.nearingRetirement.length}</span>
              </h3>
              <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                {upkeep.nearingRetirement.map(a => (
                  <li key={a.id} className="text-sm flex justify-between hover:bg-slate-50 p-2 rounded transition-colors border-b border-slate-50 last:border-0">
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <span className="text-slate-500 text-xs bg-slate-100 px-2 py-0.5 rounded">Acq: {format(new Date(a.acquisitionDate), 'yyyy')}</span>
                  </li>
                ))}
                {upkeep.nearingRetirement.length === 0 && <li className="text-sm text-slate-500 italic p-2">None currently</li>}
              </ul>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default Reports;
