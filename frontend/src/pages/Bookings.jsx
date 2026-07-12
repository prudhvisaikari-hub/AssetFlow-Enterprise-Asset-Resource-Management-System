import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { CalendarDays, Clock, Edit2, Trash2, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Bookings = () => {
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showBook, setShowBook] = useState(searchParams.get('action') === 'new');
  const [showReschedule, setShowReschedule] = useState(null); // id of booking to reschedule
  const [assets, setAssets] = useState([]);
  const [conflictError, setConflictError] = useState('');

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/bookings');
      setBookings(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    api.get('/assets?bookable=true&status=AVAILABLE').then(res => setAssets(res.data)).catch(console.error);
  }, []);

  const handleBook = async (e) => {
    e.preventDefault();
    setConflictError('');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api.post('/bookings', data);
      alert('Resource booked successfully');
      setShowBook(false);
      fetchBookings();
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictError(err.response.data.message);
      } else {
        alert(err.response?.data?.error || 'Failed to book resource');
      }
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await api.post(`/bookings/${id}/cancel`);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    setConflictError('');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      await api.put(`/bookings/${showReschedule}/reschedule`, data);
      alert('Booking rescheduled successfully');
      setShowReschedule(null);
      fetchBookings();
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictError(err.response.data.message);
      } else {
        alert(err.response?.data?.error || 'Failed to reschedule');
      }
    }
  };

  const statusBadge = (status) => {
    const map = {
      UPCOMING: 'bg-blue-100 text-blue-800',
      ONGOING: 'bg-emerald-100 text-emerald-800',
      COMPLETED: 'bg-slate-100 text-slate-800',
      CANCELLED: 'bg-red-100 text-red-800'
    };
    return <span className={clsx("badge", map[status])}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Resource Bookings</h1>
        <button onClick={() => { setConflictError(''); setShowBook(true); }} className="btn-primary flex items-center">
          <CalendarDays className="mr-2 h-4 w-4" /> Book Resource
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Resource</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Booked By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Time Slot</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {bookings.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900">{b.assetName}</div>
                      <div className="text-xs text-slate-500">#{b.assetTag}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {b.requestedByName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      <div className="flex items-center">
                        <Clock className="mr-2 h-4 w-4 text-slate-400" />
                        <div>
                          <div>{format(new Date(b.startTime), 'MMM d, yyyy HH:mm')}</div>
                          <div className="text-xs text-slate-500">to {format(new Date(b.endTime), 'MMM d, yyyy HH:mm')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(b.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {(hasRole(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD']) || user.id === b.requestedById) && (b.status === 'UPCOMING' || b.status === 'ONGOING') && (
                        <div className="flex justify-end gap-2">
                          {b.status === 'UPCOMING' && <button onClick={() => { setConflictError(''); setShowReschedule(b.id); }} className="text-blue-600 hover:text-blue-900 p-1"><Edit2 className="h-4 w-4" /></button>}
                          <button onClick={() => handleCancel(b.id)} className="text-red-600 hover:text-red-900 p-1"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">No bookings found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Book Modal */}
      {showBook && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowBook(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up border-2 border-slate-100">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Book a Resource</h3>
                <button onClick={() => setShowBook(false)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleBook} className="px-6 py-4 space-y-4">
                {conflictError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start text-sm font-medium animate-fade-in">
                    <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span>{conflictError}</span>
                  </div>
                )}
                <div>
                  <label className="label-text">Resource <span className="text-red-500">*</span></label>
                  <select name="assetId" required className="input-field">
                    <option value="">Select Resource...</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} (#{a.assetTag})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Start Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" name="startTime" required className="input-field" />
                  </div>
                  <div>
                    <label className="label-text">End Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" name="endTime" required className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="label-text">Purpose (Optional)</label>
                  <textarea name="purpose" rows="2" className="input-field" placeholder="Why do you need this resource?"></textarea>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowBook(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Confirm Booking</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showReschedule && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowReschedule(null)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up border-2 border-slate-100">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Reschedule Booking</h3>
                <button onClick={() => setShowReschedule(null)} className="text-slate-400 hover:text-slate-500">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleReschedule} className="px-6 py-4 space-y-4">
                {conflictError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-start text-sm font-medium animate-fade-in">
                    <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span>{conflictError}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">New Start Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" name="startTime" required className="input-field" />
                  </div>
                  <div>
                    <label className="label-text">New End Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" name="endTime" required className="input-field" />
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setShowReschedule(null)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Reschedule</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
