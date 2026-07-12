import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const [available, allocated, maintenanceToday, activeBookings, pendingTransfers, upcomingReturns, overdueReturns] = await Promise.all([
    query(`SELECT COUNT(*) FROM assets WHERE status = 'AVAILABLE'`),
    query(`SELECT COUNT(*) FROM assets WHERE status = 'ALLOCATED'`),
    query(`SELECT COUNT(*) FROM maintenance_requests WHERE status IN ('APPROVED','TECHNICIAN_ASSIGNED','IN_PROGRESS') AND created_at::date = CURRENT_DATE`),
    query(`SELECT COUNT(*) FROM bookings WHERE status IN ('UPCOMING','ONGOING')`),
    query(`SELECT COUNT(*) FROM transfer_requests WHERE status = 'REQUESTED'`),
    query(`SELECT COUNT(*) FROM allocations WHERE status = 'ACTIVE' AND expected_return_date >= now() AND expected_return_date < now() + interval '7 days'`),
    query(`SELECT COUNT(*) FROM allocations WHERE status = 'ACTIVE' AND expected_return_date < now()`),
  ]);

  const overdueList = await query(`
    SELECT al.id, a.asset_tag, a.name AS asset_name, e.name AS employee_name, al.expected_return_date
    FROM allocations al JOIN assets a ON a.id = al.asset_id LEFT JOIN employees e ON e.id = al.employee_id
    WHERE al.status = 'ACTIVE' AND al.expected_return_date < now()
    ORDER BY al.expected_return_date ASC LIMIT 20
  `);
  const upcomingList = await query(`
    SELECT al.id, a.asset_tag, a.name AS asset_name, e.name AS employee_name, al.expected_return_date
    FROM allocations al JOIN assets a ON a.id = al.asset_id LEFT JOIN employees e ON e.id = al.employee_id
    WHERE al.status = 'ACTIVE' AND al.expected_return_date >= now() AND al.expected_return_date < now() + interval '7 days'
    ORDER BY al.expected_return_date ASC LIMIT 20
  `);

  res.json({
    kpis: {
      assetsAvailable: Number(available.rows[0].count),
      assetsAllocated: Number(allocated.rows[0].count),
      maintenanceToday: Number(maintenanceToday.rows[0].count),
      activeBookings: Number(activeBookings.rows[0].count),
      pendingTransfers: Number(pendingTransfers.rows[0].count),
      upcomingReturns: Number(upcomingReturns.rows[0].count),
      overdueReturns: Number(overdueReturns.rows[0].count),
    },
    overdueReturns: overdueList.rows.map(r => ({
      allocationId: r.id, assetTag: r.asset_tag, assetName: r.asset_name, holder: r.employee_name, expectedReturnDate: r.expected_return_date,
    })),
    upcomingReturns: upcomingList.rows.map(r => ({
      allocationId: r.id, assetTag: r.asset_tag, assetName: r.asset_name, holder: r.employee_name, expectedReturnDate: r.expected_return_date,
    })),
  });
}));

export default router;
