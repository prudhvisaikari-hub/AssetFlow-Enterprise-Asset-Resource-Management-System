import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ClipboardCheck, Plus, X, Play, CheckCircle, AlertTriangle, Scan, Search, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Audit = () => {
  const { hasRole, user } = useAuth();
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showCreate, setShowCreate] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Active view state
  const [activeCycle, setActiveCycle] = useState(null); // the full object
  const [scanTag, setScanTag] = useState('');

  const fetchCycles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audits');
      setCycles(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDependencies = async () => {
    if (hasRole(['ADMIN', 'ASSET_MANAGER'])) {
      const [depRes, empRes] = await Promise.all([
        api.get('/departments'),
        api.get('/employees')
      ]);
      setDepartments(depRes.data);
      setEmployees(empRes.data);
    }
  };

  useEffect(() => {
    fetchCycles();
    loadDependencies();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      scopeDepartmentId: formData.get('scopeDepartmentId'),
      scopeLocation: formData.get('scopeLocation'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      auditorIds: Array.from(formData.getAll('auditorIds'))
    };
    try {
      await api.post('/audits', data);
      setShowCreate(false);
      fetchCycles();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create audit cycle');
    }
  };

  const openCycle = async (id) => {
    try {
      const res = await api.get(`/audits/${id}`);
      setActiveCycle(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to open cycle');
    }
  };

  const handleStart = async (id) => {
    try {
      await api.post(`/audits/${id}/start`);
      fetchCycles();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start cycle');
    }
  };

  const handleClose = async (id) => {
    if (!window.confirm('Are you sure you want to close this audit cycle? Missing items will be marked as LOST.')) return;
    try {
      await api.post(`/audits/${id}/close`);
      fetchCycles();
      setActiveCycle(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to close cycle');
    }
  };

  const markItem = async (itemId, result, notes = '') => {
    try {
      await api.put(`/audits/items/${itemId}`, { result, notes });
      // update local state
      setActiveCycle(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === itemId ? { ...i, result, notes, verifiedAt: new Date().toISOString() } : i)
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark item');
    }
  };

  const handleScan = (e) => {
    e.preventDefault();
    if (!scanTag) return;
    const item = activeCycle.items.find(i => i.assetTag === scanTag);
    if (item) {
      markItem(item.id, 'VERIFIED');
      setScanTag('');
    } else {
      alert(`Asset tag ${scanTag} is not part of this audit scope.`);
    }
  };

  const statusBadge = (status) => {
    const map = {
      PLANNED: 'bg-slate-100 text-slate-800',
      IN_PROGRESS: 'bg-blue-100 text-blue-800',
      CLOSED: 'bg-emerald-100 text-emerald-800'
    };
    return <span className={clsx("badge font-bold", map[status])}>{status.replace('_', ' ')}</span>;
  };

  if (activeCycle) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center text-sm text-slate-500 mb-2">
          <button onClick={() => { setActiveCycle(null); fetchCycles(); }} className="hover:text-slate-900 flex items-center transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Audits
          </button>
        </div>
        <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center">
              <ClipboardCheck className="mr-3 h-6 w-6 text-blue-600" /> {activeCycle.name}
            </h1>
            <div className="text-sm text-slate-500 mt-1 font-medium">
              Scope: {activeCycle.scopeDepartmentName || 'All Depts'} • {activeCycle.scopeLocation || 'All Locations'}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {statusBadge(activeCycle.status)}
            {hasRole(['ADMIN', 'ASSET_MANAGER']) && activeCycle.status === 'IN_PROGRESS' && (
              <button onClick={() => handleClose(activeCycle.id)} className="btn-primary bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200">Close Audit</button>
            )}
          </div>
        </div>

        {activeCycle.status === 'IN_PROGRESS' && (
          <div className="card p-6 border-2 border-blue-100 bg-blue-50/50">
            <form onSubmit={handleScan} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="label-text flex items-center text-blue-900 font-bold mb-2">
                  <Scan className="h-5 w-5 mr-2" /> Scan Asset Tag
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={scanTag}
                    onChange={e => setScanTag(e.target.value)}
                    className="input-field pl-10 border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white"
                    placeholder="Enter or scan tag..."
                    autoFocus
                  />
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                </div>
              </div>
              <button type="submit" className="btn-primary h-[42px] px-8 bg-blue-600 text-white font-bold">Verify</button>
            </form>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">Audit Items ({activeCycle.items.length})</h3>
            <div className="flex gap-4 text-sm font-bold">
              <span className="text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">Verified: {activeCycle.items.filter(i => i.result === 'VERIFIED').length}</span>
              <span className="text-amber-600 bg-amber-100 px-3 py-1 rounded-full">Pending: {activeCycle.items.filter(i => i.result === 'PENDING').length}</span>
              <span className="text-red-600 bg-red-100 px-3 py-1 rounded-full">Discrepancy: {activeCycle.items.filter(i => i.result === 'MISSING' || i.result === 'DAMAGED').length}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Verified At</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {activeCycle.items.map(item => (
                  <tr key={item.id} className={clsx(
                    "transition-colors",
                    item.result === 'VERIFIED' && 'bg-emerald-50/50',
                    (item.result === 'MISSING' || item.result === 'DAMAGED') && 'bg-red-50/50 hover:bg-red-50/80',
                    item.result === 'PENDING' && 'hover:bg-slate-50'
                  )}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900">{item.assetName}</div>
                      <div className="text-xs text-slate-500">#{item.assetTag}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx("badge font-bold", 
                        item.result === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                        item.result === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-red-100 text-red-800'
                      )}>{item.result}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">
                      {item.verifiedAt ? format(new Date(item.verifiedAt), 'MMM d, HH:mm') : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {activeCycle.status === 'IN_PROGRESS' && (
                        <>
                          <button onClick={() => markItem(item.id, 'VERIFIED')} className="text-emerald-600 hover:text-emerald-900 mr-2 bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200">Verify</button>
                          <button onClick={() => {
                            const notes = window.prompt('Enter damage notes (optional):');
                            if (notes !== null) markItem(item.id, 'DAMAGED', notes);
                          }} className="text-amber-600 hover:text-amber-900 mr-2 bg-amber-50 px-3 py-1 rounded-md border border-amber-200">Damaged</button>
                          <button onClick={() => markItem(item.id, 'MISSING')} className="text-red-600 hover:text-red-900 bg-red-50 px-3 py-1 rounded-md border border-red-200">Missing</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Asset Audit</h1>
        {hasRole(['ADMIN', 'ASSET_MANAGER']) && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center shadow-md">
            <Plus className="mr-2 h-4 w-4" /> New Audit Cycle
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
           <div className="col-span-full flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : cycles.length === 0 ? (
          <div className="col-span-full card p-12 flex flex-col items-center justify-center text-slate-500 border-dashed border-2 bg-slate-50">
            <ClipboardCheck className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-lg font-bold text-slate-700">No audit cycles found</p>
            <p className="text-sm">Create a new audit cycle to start auditing assets.</p>
          </div>
        ) : (
          cycles.map(c => (
            <div key={c.id} className="card p-6 flex flex-col hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer border-2 border-transparent" onClick={() => openCycle(c.id)}>
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-lg text-slate-900 line-clamp-1">{c.name}</h3>
                {statusBadge(c.status)}
              </div>
              <div className="space-y-2 text-sm text-slate-600 flex-1 bg-slate-50 p-4 rounded-lg">
                <p><strong>Scope:</strong> {c.scopeDepartmentName || 'All Departments'}</p>
                <p><strong>Items:</strong> {c.itemCount}</p>
                {c.discrepancyCount > 0 && (
                  <p className="text-red-600 font-bold flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" /> {c.discrepancyCount} Discrepancies
                  </p>
                )}
                <p><strong>Timeline:</strong> {format(new Date(c.startDate), 'MMM d')} - {format(new Date(c.endDate), 'MMM d, yyyy')}</p>
              </div>
              <div className="pt-4 mt-4 flex justify-between items-center">
                <span className="text-blue-600 text-sm font-bold hover:underline">View Details &rarr;</span>
                {hasRole(['ADMIN', 'ASSET_MANAGER']) && c.status === 'PLANNED' && (
                  <button onClick={(e) => { e.stopPropagation(); handleStart(c.id); }} className="btn-primary py-1.5 px-4 text-xs flex items-center bg-indigo-600 hover:bg-indigo-700">
                    <Play className="h-3 w-3 mr-1" /> Start
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Create Audit Cycle</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Audit Name <span className="text-red-500">*</span></label>
                  <input name="name" required className="input-field" placeholder="Q3 Tech Audit" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Department Scope</label>
                    <select name="scopeDepartmentId" className="input-field">
                      <option value="">All Departments</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label-text">Location Scope</label>
                    <input name="scopeLocation" className="input-field" placeholder="e.g. Floor 3" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Start Date <span className="text-red-500">*</span></label>
                    <input type="date" name="startDate" required className="input-field" />
                  </div>
                  <div>
                    <label className="label-text">End Date <span className="text-red-500">*</span></label>
                    <input type="date" name="endDate" required className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="label-text flex justify-between">Assign Auditors
                    <span className="text-xs text-slate-500 font-normal">Hold Ctrl to select multiple</span>
                  </label>
                  <select name="auditorIds" multiple className="input-field min-h-[100px]" required>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}
                  </select>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Create Cycle</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Audit;
