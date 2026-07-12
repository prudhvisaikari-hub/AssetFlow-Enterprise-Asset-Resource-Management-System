import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { ArrowRightLeft, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Allocations = () => {
  const { hasRole, user } = useAuth();
  const [activeTab, setActiveTab] = useState('allocations'); // 'allocations' or 'transfers'
  const [allocations, setAllocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Allocate Modal
  const [showAllocate, setShowAllocate] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Transfer Request Modal
  const [showTransferReq, setShowTransferReq] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null); // The conflicting asset info

  // Return Modal
  const [showReturn, setShowReturn] = useState(false);
  const [returnAlloc, setReturnAlloc] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [allocRes, transRes] = await Promise.all([
        api.get('/allocations?status=ACTIVE'),
        api.get('/allocations/transfers/all?status=REQUESTED')
      ]);
      setAllocations(allocRes.data);
      setTransfers(transRes.data);
      
      if (hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'])) {
        const [empRes, depRes] = await Promise.all([
          api.get('/employees'),
          api.get('/departments')
        ]);
        setEmployees(empRes.data);
        setDepartments(depRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAllocate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api.post('/allocations', data);
      alert('Asset allocated successfully');
      setShowAllocate(false);
      fetchData();
    } catch (err) {
      if (err.response?.status === 409) {
        setTransferTarget({
          assetId: data.assetId,
          message: err.response.data.message,
          toEmployeeId: data.employeeId,
          toDepartmentId: data.departmentId
        });
        setShowAllocate(false);
        setShowTransferReq(true);
      } else {
        alert(err.response?.data?.error || 'Failed to allocate');
      }
    }
  };

  const handleTransferRequest = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      await api.post('/allocations/transfers', {
        assetId: transferTarget.assetId,
        toEmployeeId: transferTarget.toEmployeeId,
        toDepartmentId: transferTarget.toDepartmentId,
        requestNotes: formData.get('requestNotes')
      });
      alert('Transfer request submitted successfully');
      setShowTransferReq(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to request transfer');
    }
  };

  const handleDecision = async (id, decision) => {
    try {
      await api.post(`/allocations/transfers/${id}/decision`, { decision });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process decision');
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    const notes = new FormData(e.target).get('returnConditionNotes');
    try {
      await api.post(`/allocations/${returnAlloc.id}/return`, { returnConditionNotes: notes });
      setShowReturn(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to return asset');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Allocations & Transfers</h1>
        {hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) && (
          <button onClick={() => setShowAllocate(true)} className="btn-primary flex items-center">
            <ArrowRightLeft className="mr-2 h-4 w-4" /> New Allocation
          </button>
        )}
      </div>

      <div className="card overflow-visible">
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px px-6">
            <button
              onClick={() => setActiveTab('allocations')}
              className={clsx(
                'inline-flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'allocations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              Active Allocations
            </button>
            <button
              onClick={() => setActiveTab('transfers')}
              className={clsx(
                'inline-flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'transfers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              Transfer Requests
              {transfers.length > 0 && (
                <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs font-bold">{transfers.length}</span>
              )}
            </button>
          </nav>
        </div>

        <div className="p-0">
          {loading ? (
             <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : activeTab === 'allocations' ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Asset</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Assigned To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Return Date</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {allocations.map(al => (
                    <tr key={al.id} className={clsx("transition-colors", al.isOverdue ? "bg-red-50/50 hover:bg-red-50/70" : "hover:bg-slate-50")}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-900">{al.assetName}</div>
                        <div className="text-xs text-slate-500">#{al.assetTag}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        {al.employeeName || al.departmentName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {al.expectedReturnDate ? (
                          <div className={al.isOverdue ? "text-red-700 font-bold flex items-center" : "text-slate-900"}>
                            {al.isOverdue && <AlertTriangle className="h-4 w-4 mr-1" />}
                            {format(new Date(al.expectedReturnDate), 'MMM d, yyyy')}
                          </div>
                        ) : 'Indefinite'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {(hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) || user.id === al.employeeId) && (
                          <button onClick={() => { setReturnAlloc(al); setShowReturn(true); }} className="text-blue-600 hover:text-blue-900 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                            Return Asset
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {allocations.length === 0 && (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-slate-500">No active allocations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Asset</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Requested By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Transfer To</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Decide</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {transfers.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-900">{t.assetName}</div>
                        <div className="text-xs text-slate-500">#{t.assetTag}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {t.requestedByName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium bg-blue-50/50">
                        {t.toEmployeeName || t.toDepartmentName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleDecision(t.id, 'APPROVED')} className="btn-primary py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 flex items-center">Approve</button>
                            <button onClick={() => handleDecision(t.id, 'REJECTED')} className="btn-danger py-1.5 px-3 text-xs flex items-center">Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {transfers.length === 0 && (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-slate-500">No pending transfer requests.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Allocate Modal */}
      {showAllocate && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowAllocate(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Allocate Asset</h3>
                <button onClick={() => setShowAllocate(false)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleAllocate} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Asset ID</label>
                  <input type="text" name="assetId" required className="input-field" placeholder="Enter Asset ID (e.g. 1)" />
                  <p className="text-xs text-slate-500 mt-1">Enter the internal ID of the asset.</p>
                </div>
                <div>
                  <label className="label-text">Assign To Employee (Optional)</label>
                  <select name="employeeId" className="input-field">
                    <option value="">-- None --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Assign To Department (Optional)</label>
                  <select name="departmentId" className="input-field">
                    <option value="">-- None --</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Expected Return Date</label>
                  <input type="date" name="expectedReturnDate" className="input-field" />
                </div>
                <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 mt-6">
                  <button type="button" onClick={() => setShowAllocate(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Allocate</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Request Fallback Modal */}
      {showTransferReq && transferTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowTransferReq(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up border-2 border-amber-200">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-amber-50">
                <h3 className="text-lg font-bold text-slate-900 text-amber-700 flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2" /> Asset Conflict
                </h3>
              </div>
              <form onSubmit={handleTransferRequest} className="px-6 py-4 space-y-4">
                <p className="text-sm text-amber-900 bg-amber-100 p-4 rounded-lg font-medium">
                  {transferTarget.message}
                </p>
                <div>
                  <label className="label-text">Request Notes</label>
                  <textarea name="requestNotes" rows="3" className="input-field" placeholder="Why do you need this asset transferred?"></textarea>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => setShowTransferReq(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 shadow-amber-200 shadow-lg">Request Transfer</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturn && returnAlloc && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowReturn(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between">
                <h3 className="text-lg font-bold text-slate-900">Return Asset: {returnAlloc.assetName}</h3>
                <button onClick={() => setShowReturn(false)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleReturn} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Condition Notes (Optional)</label>
                  <textarea name="returnConditionNotes" rows="3" className="input-field" placeholder="e.g. Scratched screen, works fine"></textarea>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowReturn(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Confirm Return</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Allocations;
