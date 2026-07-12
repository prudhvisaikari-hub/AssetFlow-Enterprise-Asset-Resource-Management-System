import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth.js';
import departmentRoutes from './routes/departments.js';
import categoryRoutes from './routes/categories.js';
import employeeRoutes from './routes/employees.js';
import assetRoutes from './routes/assets.js';
import allocationRoutes from './routes/allocations.js';
import bookingRoutes from './routes/bookings.js';
import maintenanceRoutes from './routes/maintenance.js';
import auditRoutes from './routes/audits.js';
import activityRoutes from './routes/activity.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'assetflow-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api', activityRoutes); // /api/notifications, /api/activity-logs
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => {
  if (err && err.status) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.conflict ? { conflict: true, currentAllocationId: err.currentAllocationId } : {}),
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AssetFlow API listening on port ${PORT}`));
