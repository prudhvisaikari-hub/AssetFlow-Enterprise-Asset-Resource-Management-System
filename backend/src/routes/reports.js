import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

// Asset utilization: most-used vs idle, ranked by number of allocations / bookings
router.get('/utilization', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT a.id, a.asset_tag, a.name, a.status,
      (SELECT COUNT(*) FROM allocations al WHERE al.asset_id = a.id) AS allocation_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.asset_id = a.id) AS booking_count
    FROM assets a
    ORDER BY (
      (SELECT COUNT(*) FROM allocations al WHERE al.asset_id = a.id) +
      (SELECT COUNT(*) FROM bookings b WHERE b.asset_id = a.id)
    ) DESC
  `);
  res.json(rows.map(r => ({
    id: r.id, assetTag: r.asset_tag, name: r.name, status: r.status,
    allocationCount: Number(r.allocation_count), bookingCount: Number(r.booking_count),
    usageScore: Number(r.allocation_count) + Number(r.booking_count),
  })));
}));

// Maintenance frequency by category
router.get('/maintenance-frequency', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT c.name AS category, COUNT(m.id) AS request_count
    FROM asset_categories c
    LEFT JOIN assets a ON a.category_id = c.id
    LEFT JOIN maintenance_requests m ON m.asset_id = a.id
    GROUP BY c.name ORDER BY request_count DESC
  `);
  res.json(rows.map(r => ({ category: r.category, requestCount: Number(r.request_count) })));
}));

// Assets due for maintenance (currently under maintenance) or nearing retirement (heuristic: >3 yrs old)
router.get('/upkeep', asyncHandler(async (req, res) => {
  const underMaintenance = await query(`SELECT id, asset_tag, name, status FROM assets WHERE status = 'UNDER_MAINTENANCE'`);
  const nearingRetirement = await query(`
    SELECT id, asset_tag, name, acquisition_date FROM assets
    WHERE acquisition_date IS NOT NULL AND acquisition_date < now() - interval '3 years'
    AND status NOT IN ('RETIRED','DISPOSED')
    ORDER BY acquisition_date ASC
  `);
  res.json({
    underMaintenance: underMaintenance.rows,
    nearingRetirement: nearingRetirement.rows,
  });
}));

// Department-wise allocation summary
router.get('/department-allocation', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT d.name AS department, COUNT(al.id) AS active_allocations
    FROM departments d
    LEFT JOIN allocations al ON al.department_id = d.id AND al.status = 'ACTIVE'
    GROUP BY d.name ORDER BY active_allocations DESC
  `);
  res.json(rows.map(r => ({ department: r.department, activeAllocations: Number(r.active_allocations) })));
}));

// Resource booking heatmap — bookings grouped by day-of-week and hour
router.get('/booking-heatmap', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT EXTRACT(DOW FROM start_time)::int AS day_of_week, EXTRACT(HOUR FROM start_time)::int AS hour, COUNT(*) AS count
    FROM bookings WHERE status != 'CANCELLED'
    GROUP BY day_of_week, hour ORDER BY day_of_week, hour
  `);
  res.json(rows.map(r => ({ dayOfWeek: r.day_of_week, hour: r.hour, count: Number(r.count) })));
}));

// Simple CSV export for any of the above, e.g. /reports/export/utilization
router.get('/export/:report', asyncHandler(async (req, res) => {
  let rows = [];
  let headers = [];
  switch (req.params.report) {
    case 'utilization': {
      const r = await query(`SELECT asset_tag, name, status FROM assets ORDER BY asset_tag`);
      headers = ['asset_tag', 'name', 'status'];
      rows = r.rows;
      break;
    }
    case 'allocations': {
      const r = await query(`
        SELECT a.asset_tag, al.status, e.name AS employee, d.name AS department, al.allocated_date, al.expected_return_date
        FROM allocations al JOIN assets a ON a.id = al.asset_id
        LEFT JOIN employees e ON e.id = al.employee_id LEFT JOIN departments d ON d.id = al.department_id
        ORDER BY al.allocated_date DESC`);
      headers = ['asset_tag', 'status', 'employee', 'department', 'allocated_date', 'expected_return_date'];
      rows = r.rows;
      break;
    }
    default:
      return res.status(400).json({ error: 'Unknown report' });
  }
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.report}.csv"`);
  res.send(csv);
}));

export default router;
