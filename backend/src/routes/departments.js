import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shape = (d) => ({
  id: d.id,
  name: d.name,
  headId: d.head_id,
  headName: d.head_name || null,
  parentId: d.parent_id,
  parentName: d.parent_name || null,
  status: d.status,
  employeeCount: d.employee_count !== undefined ? Number(d.employee_count) : undefined,
  createdAt: d.created_at,
});

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT d.*, h.name AS head_name, p.name AS parent_name,
      (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employee_count
    FROM departments d
    LEFT JOIN employees h ON h.id = d.head_id
    LEFT JOIN departments p ON p.id = d.parent_id
    ORDER BY d.name
  `);
  res.json(rows.map(shape));
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, headId, parentId } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const { rows } = await query(
    `INSERT INTO departments (name, head_id, parent_id) VALUES ($1,$2,$3) RETURNING *`,
    [name, headId || null, parentId || null]
  );
  await logActivity({ employeeId: req.user.id, action: 'CREATE_DEPARTMENT', entityType: 'Department', entityId: rows[0].id });
  res.status(201).json(shape(rows[0]));
}));

router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, headId, parentId, status } = req.body;
  const { rows } = await query(
    `UPDATE departments SET
       name = COALESCE($1, name),
       head_id = $2,
       parent_id = $3,
       status = COALESCE($4, status)
     WHERE id = $5 RETURNING *`,
    [name, headId ?? null, parentId ?? null, status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
  await logActivity({ employeeId: req.user.id, action: 'UPDATE_DEPARTMENT', entityType: 'Department', entityId: req.params.id });
  res.json(shape(rows[0]));
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE departments SET status = 'INACTIVE' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
  await logActivity({ employeeId: req.user.id, action: 'DEACTIVATE_DEPARTMENT', entityType: 'Department', entityId: req.params.id });
  res.json({ message: 'Department deactivated' });
}));

export default router;
