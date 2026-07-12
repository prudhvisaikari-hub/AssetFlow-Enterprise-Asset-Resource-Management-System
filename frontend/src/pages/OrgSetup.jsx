import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { Building2, Tags, Users, Plus, Edit } from 'lucide-react';
import clsx from 'clsx';

const OrgSetup = () => {
  const [activeTab, setActiveTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [depRes, catRes, empRes] = await Promise.all([
        api.get('/departments'),
        api.get('/categories'),
        api.get('/employees')
      ]);
      setDepartments(depRes.data);
      setCategories(catRes.data);
      setEmployees(empRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePromote = async (id, newRole) => {
    if (!window.confirm(`Are you sure you want to change this employee's role to ${newRole}?`)) return;
    try {
      await api.post(`/employees/${id}/promote`, { role: newRole });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to promote');
    }
  };

  const tabs = [
    { id: 'departments', name: 'Departments', icon: Building2 },
    { id: 'categories', name: 'Asset Categories', icon: Tags },
    { id: 'employees', name: 'Employee Directory', icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Organization Setup</h1>
      </div>

      <div className="card overflow-visible">
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'group inline-flex items-center px-6 py-4 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className={clsx('mr-2 h-5 w-5', activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500')} />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="p-6">
          {loading ? (
             <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : (
            <>
              {activeTab === 'departments' && (
                <div className="animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium text-slate-900">Departments</h2>
                    <button className="btn-primary flex items-center text-sm"><Plus className="mr-2 h-4 w-4"/> Add Department</button>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Head</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {departments.map((dept) => (
                          <tr key={dept.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{dept.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{dept.headName || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={clsx("badge", dept.status === 'ACTIVE' ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800")}>
                                {dept.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button className="text-blue-600 hover:text-blue-900 mr-3"><Edit className="h-4 w-4"/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'categories' && (
                <div className="animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium text-slate-900">Asset Categories</h2>
                    <button className="btn-primary flex items-center text-sm"><Plus className="mr-2 h-4 w-4"/> Add Category</button>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Custom Fields</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {categories.map((cat) => (
                          <tr key={cat.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{cat.name}</td>
                            <td className="px-6 py-4 text-sm text-slate-500 max-w-md truncate">
                              {cat.customFields && Object.keys(cat.customFields).length > 0 ? JSON.stringify(cat.customFields) : '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button className="text-blue-600 hover:text-blue-900 mr-3"><Edit className="h-4 w-4"/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'employees' && (
                <div className="animate-fade-in">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium text-slate-900">Employee Directory</h2>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name & Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Department</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Change Role</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {employees.map((emp) => (
                          <tr key={emp.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-slate-900">{emp.name}</div>
                              <div className="text-sm text-slate-500">{emp.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={clsx("badge", 
                                emp.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                                emp.role === 'ASSET_MANAGER' ? 'bg-blue-100 text-blue-800' :
                                emp.role === 'DEPARTMENT_HEAD' ? 'bg-amber-100 text-amber-800' :
                                'bg-slate-100 text-slate-800'
                              )}>
                                {emp.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{emp.departmentName || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={clsx("badge", emp.status === 'ACTIVE' ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                                {emp.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <select 
                                className="input-field py-1 px-2 text-sm inline-block w-auto"
                                value={emp.role}
                                onChange={(e) => handlePromote(emp.id, e.target.value)}
                              >
                                <option value="EMPLOYEE">Employee</option>
                                <option value="DEPARTMENT_HEAD">Department Head</option>
                                <option value="ASSET_MANAGER">Asset Manager</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrgSetup;
