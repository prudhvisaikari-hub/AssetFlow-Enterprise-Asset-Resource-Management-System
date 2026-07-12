import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { AlertOctagon, Plus, X, Wrench, CheckCircle, Clock, ChevronRight, Play, Check } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Maintenance = () => {
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showRaise, setShowRaise] = useState(searchParams.get('action') === 'new');
  const [assets, setAssets] = useState([]);
  
  // Technician Modal
  const [showAssign, setShowAssign] = useState(null); // id of request
  // Resolve Modal
  const [showResolve, setShowResolve] = useState(null); // id of request

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/maintenance');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    api.get('/assets').then(res => setAssets(res.data)).catch(console.error);
  }, []);

  const handleRaise = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api.post('/maintenance', data);
      alert('Maintenance request raised successfully');
      setShowRaise(false);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to raise request');
    }
  };

  const handleDecision = async (id, decision) => {
    try {
      await api.post(`/maintenance/${id}/decision`, { decision });
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to process decision');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      await api.post(`/maintenance/${showAssign}/assign-technician`, { technicianName: formData.get('technicianName') });
      setShowAssign(null);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign technician');
    }
  };

  const handleStart = async (id) => {
    try {
      await api.post(`/maintenance/${id}/start`);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start maintenance');
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      await api.post(`/maintenance/${showResolve}/resolve`, { resolutionNotes: formData.get('resolutionNotes') });
      setShowResolve(null);
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to resolve maintenance');
    }
  };

  const statusBadge = (status) => {
    const map = {
      PENDING: 'bg-slate-100 text-slate-800',
      APPROVED: 'bg-blue-100 text-blue-800',
      REJECTED: 'bg-red-100 text-red-800',
      TECHNICIAN_ASSIGNED: 'bg-indigo-100 text-indigo-800',
      IN_PROGRESS: 'bg-amber-100 text-amber-800',
      RESOLVED: 'bg-emerald-100 text-emerald-800'
    };
    return <span className={clsx("badge font-bold", map[status])}>{status.replace('_', ' ')}</span>;
  };

  const priorityBadge = (priority) => {
    const map = {
      LOW: 'bg-slate-100 text-slate-800',
      MEDIUM: 'bg-blue-100 text-blue-800',
      HIGH: 'bg-amber-100 text-amber-800',
      CRITICAL: 'bg-red-100 text-red-800'
    };
    return <span className={clsx("badge", map[priority])}>{priority}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Maintenance Management</h1>
        <button onClick={() => setShowRaise(true)} className="btn-primary flex items-center">
          <AlertOctagon className="mr-2 h-4 w-4" /> Raise Request
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
           <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Issue & Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Technician</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 line-clamp-2">{req.issueDescription}</div>
                      <div className="text-xs text-slate-500 mt-1">{req.assetName} (#{req.assetTag}) • Reported by {req.raisedByName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {priorityBadge(req.priority)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(req.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {req.technicianName || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {hasRole(['ADMIN', 'ASSET_MANAGER']) && (
                        <div className="flex justify-end gap-2">
                          {req.status === 'PENDING' && (
                            <>
                              <button onClick={() => handleDecision(req.id, 'APPROVED')} className="btn-primary py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700">Approve</button>
                              <button onClick={() => handleDecision(req.id, 'REJECTED')} className="btn-danger py-1.5 px-3 text-xs">Reject</button>
                            </>
                          )}
                          {req.status === 'APPROVED' && (
                            <button onClick={() => setShowAssign(req.id)} className="btn-primary py-1.5 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 flex items-center">Assign</button>
                          )}
                          {req.status === 'TECHNICIAN_ASSIGNED' && (
                            <button onClick={() => handleStart(req.id)} className="btn-primary py-1.5 px-3 text-xs bg-amber-600 hover:bg-amber-700 flex items-center">Start</button>
                          )}
                          {(req.status === 'IN_PROGRESS' || req.status === 'TECHNICIAN_ASSIGNED') && (
                            <button onClick={() => setShowResolve(req.id)} className="btn-primary py-1.5 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 flex items-center">Resolve</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">No maintenance requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Raise Request Modal */}
      {showRaise && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowRaise(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Raise Maintenance Request</h3>
                <button onClick={() => setShowRaise(false)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleRaise} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Asset <span className="text-red-500">*</span></label>
                  <select name="assetId" required className="input-field">
                    <option value="">Select Asset...</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} (#{a.assetTag})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Issue Description <span className="text-red-500">*</span></label>
                  <textarea name="issueDescription" required rows="3" className="input-field" placeholder="What's wrong with it?"></textarea>
                </div>
                <div>
                  <label className="label-text">Priority</label>
                  <select name="priority" className="input-field">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Photo URL (Optional)</label>
                  <input type="url" name="photoUrl" className="input-field" placeholder="https://..." />
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowRaise(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary bg-amber-600 hover:bg-amber-700">Submit Request</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Technician Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowAssign(null)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Assign Technician</h3>
                <button onClick={() => setShowAssign(null)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleAssign} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Technician Name <span className="text-red-500">*</span></label>
                  <input type="text" name="technicianName" required className="input-field" placeholder="John Doe" />
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowAssign(null)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Assign</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolve && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowResolve(null)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Resolve Maintenance</h3>
                <button onClick={() => setShowResolve(null)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleResolve} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Resolution Notes (Optional)</label>
                  <textarea name="resolutionNotes" rows="3" className="input-field" placeholder="How was it fixed?"></textarea>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowResolve(null)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary bg-emerald-600 hover:bg-emerald-700">Mark as Resolved</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Maintenance;
