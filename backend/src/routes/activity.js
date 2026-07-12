import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

router.get('/notifications', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.id]
  );
  res.json(rows.map(n => ({
    id: n.id, type: n.type, message: n.message, isRead: n.is_read, createdAt: n.created_at,
  })));
}));

router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = true WHERE id = $1 AND employee_id = $2`, [req.params.id, req.user.id]);
  res.json({ message: 'Marked as read' });
}));

router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read = true WHERE employee_id = $1 AND is_read = false`, [req.user.id]);
  res.json({ message: 'All notifications marked as read' });
}));

// Full activity log — admin/manager visibility across the org
router.get('/activity-logs', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => {
  const { entityType, employeeId } = req.query;
  const clauses = []; const params = []; let i = 1;
  if (entityType) { clauses.push(`al.entity_type = $${i}`); params.push(entityType); i++; }
  if (employeeId) { clauses.push(`al.employee_id = $${i}`); params.push(employeeId); i++; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`
    SELECT al.*, e.name AS employee_name
    FROM activity_logs al LEFT JOIN employees e ON e.id = al.employee_id
    ${where} ORDER BY al.created_at DESC LIMIT 300
  `, params);
  res.json(rows.map(l => ({
    id: l.id, employeeId: l.employee_id, employeeName: l.employee_name || 'System',
    action: l.action, entityType: l.entity_type, entityId: l.entity_id,
    metadata: l.metadata, createdAt: l.created_at,
  })));
}));

export default router;
