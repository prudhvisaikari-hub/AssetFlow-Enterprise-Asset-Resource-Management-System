import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, Filter, X, ChevronRight, Package, Calendar, Tag } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Assets = () => {
  const { hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Registration Modal State
  const [showRegister, setShowRegister] = useState(searchParams.get('action') === 'new');
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Detail Modal State
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assetHistory, setAssetHistory] = useState(null);

  useEffect(() => {
    fetchAssets();
    if (hasRole(['ADMIN', 'ASSET_MANAGER'])) {
      api.get('/categories').then(res => setCategories(res.data));
      api.get('/departments').then(res => setDepartments(res.data));
    }
  }, []);

  const fetchAssets = async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      if (searchQuery) params.append('search', searchQuery);
      const res = await api.get(`/assets?${params.toString()}`);
      setAssets(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAssets();
  };

  const viewDetails = async (id) => {
    try {
      const [assetRes, historyRes] = await Promise.all([
        api.get(`/assets/${id}`),
        api.get(`/assets/${id}/history`)
      ]);
      setSelectedAsset(assetRes.data);
      setAssetHistory(historyRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.isBookable = data.isBookable === 'on';
    
    try {
      const res = await api.post('/assets', data);
      alert(`Asset registered successfully! Tag: ${res.data.assetTag}`);
      setShowRegister(false);
      fetchAssets();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to register asset');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Assets Directory</h1>
        {hasRole(['ADMIN', 'ASSET_MANAGER']) && (
          <button onClick={() => setShowRegister(true)} className="btn-primary flex items-center">
            <Plus className="mr-2 h-4 w-4" /> Register Asset
          </button>
        )}
      </div>

      <div className="card p-4 flex gap-4 items-center">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="input-field pl-10 bg-slate-50"
            placeholder="Search by tag, name, or serial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
        <button onClick={() => fetchAssets()} className="btn-secondary flex items-center">
          <Filter className="mr-2 h-4 w-4" /> Filter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Asset Tag & Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Location/Holder</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-blue-600">#{asset.assetTag}</div>
                      <div className="text-sm text-slate-900 font-medium">{asset.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{asset.categoryName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx("badge", 
                        asset.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' :
                        asset.status === 'ALLOCATED' ? 'bg-blue-100 text-blue-800' :
                        asset.status === 'UNDER_MAINTENANCE' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      )}>
                        {asset.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {asset.currentHolder ? (
                        <span className="font-medium text-slate-900">{asset.currentHolder}</span>
                      ) : (
                        asset.location || '—'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => viewDetails(asset.id)} className="text-blue-600 hover:text-blue-900 flex items-center justify-end w-full">
                        View <ChevronRight className="ml-1 h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-sm text-slate-500">No assets found matching the criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedAsset(null)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900 flex items-center">
                  <Package className="mr-2 h-5 w-5 text-blue-600" /> #{selectedAsset.assetTag} - {selectedAsset.name}
                </h3>
                <button onClick={() => setSelectedAsset(null)} className="text-slate-400 hover:text-slate-500 transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Category</p><p className="font-medium text-slate-900">{selectedAsset.categoryName}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Status</p><p className="font-medium text-slate-900">{selectedAsset.status.replace('_', ' ')}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Serial</p><p className="font-medium text-slate-900">{selectedAsset.serialNumber || '—'}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Condition</p><p className="font-medium text-slate-900">{selectedAsset.condition || '—'}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Location</p><p className="font-medium text-slate-900">{selectedAsset.location || '—'}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase tracking-wider">Acquired</p><p className="font-medium text-slate-900">{selectedAsset.acquisitionDate ? format(new Date(selectedAsset.acquisitionDate), 'MMM d, yyyy') : '—'}</p></div>
                </div>
                
                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-4">Allocation History</h4>
                {assetHistory?.allocations?.length > 0 ? (
                  <ul className="space-y-3 mb-6">
                    {assetHistory.allocations.map(a => (
                      <li key={a.id} className="text-sm bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex justify-between font-medium text-slate-900">
                          <span>{a.holder}</span>
                          <span className={clsx("badge", a.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800')}>{a.status}</span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          {format(new Date(a.allocatedDate), 'MMM d, yyyy')} — {a.actualReturnDate ? format(new Date(a.actualReturnDate), 'MMM d, yyyy') : 'Present'}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500 mb-6 italic">No allocation history.</p>}

                <h4 className="font-bold text-slate-900 border-b border-slate-200 pb-2 mb-4">Maintenance History</h4>
                {assetHistory?.maintenance?.length > 0 ? (
                  <ul className="space-y-3">
                    {assetHistory.maintenance.map(m => (
                      <li key={m.id} className="text-sm bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex justify-between font-medium text-slate-900">
                          <span>{m.issueDescription}</span>
                          <span className={clsx("badge", m.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{m.status.replace('_', ' ')}</span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          Reported by {m.raisedBy} on {format(new Date(m.createdAt), 'MMM d, yyyy')}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500 italic">No maintenance history.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowRegister(false)} />
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-slide-up">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Register New Asset</h3>
                <button onClick={() => setShowRegister(false)} className="text-slate-400 hover:text-slate-500 transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleRegister} className="px-6 py-4 space-y-4">
                <div>
                  <label className="label-text">Name <span className="text-red-500">*</span></label>
                  <input name="name" required className="input-field" placeholder="e.g. MacBook Pro M2" />
                </div>
                <div>
                  <label className="label-text">Category <span className="text-red-500">*</span></label>
                  <select name="categoryId" required className="input-field">
                    <option value="">Select Category...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-text">Serial Number</label>
                  <input name="serialNumber" className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Acquisition Date</label>
                    <input type="date" name="acquisitionDate" className="input-field" />
                  </div>
                  <div>
                    <label className="label-text">Cost</label>
                    <input type="number" step="0.01" name="acquisitionCost" className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="label-text">Condition</label>
                  <input name="condition" className="input-field" placeholder="e.g. New, Good, Fair" />
                </div>
                <div>
                  <label className="label-text">Department (Optional)</label>
                  <select name="departmentId" className="input-field">
                    <option value="">None (General Pool)</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <input type="checkbox" name="isBookable" id="isBookable" className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                  <label htmlFor="isBookable" className="ml-2 block text-sm font-medium text-slate-900">
                    Available for resource booking
                  </label>
                </div>
                <div className="pt-4 mt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowRegister(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Register Asset</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;
