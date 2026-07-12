import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import OrgSetup from './pages/OrgSetup';
import Assets from './pages/Assets';
import Allocations from './pages/Allocations';
import Bookings from './pages/Bookings';
import Maintenance from './pages/Maintenance';
import Audit from './pages/Audit';
import Reports from './pages/Reports';
import Activity from './pages/Activity';

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<div className="p-8 text-center mt-20">Forgot Password - Not fully implemented</div>} />
      <Route path="/reset-password" element={<div className="p-8 text-center mt-20">Reset Password - Not fully implemented</div>} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/allocations" element={<Allocations />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/activity" element={<Activity />} />
      </Route>

      {/* Admin Only Route */}
      <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
        <Route path="/org-setup" element={<OrgSetup />} />
      </Route>
    </Routes>
  );
}

export default App;
