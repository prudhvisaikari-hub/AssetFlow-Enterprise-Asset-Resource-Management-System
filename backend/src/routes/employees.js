import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity, notify } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shape = (e) => ({
  id: e.id,
  name: e.name,
  email: e.email,
  role: e.role,
  status: e.status,
  departmentId: e.department_id,
  departmentName: e.department_name || null,
  createdAt: e.created_at,
});

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT e.*, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    ORDER BY e.name
  `);
  res.json(rows.map(shape));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT e.*, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.id = $1
  `, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
  res.json(shape(rows[0]));
}));

// Admin creates an employee directly (rare path — normal path is signup)
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, email, password, departmentId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  const existing = await query('SELECT id FROM employees WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO employees (name, email, password_hash, role, status, department_id)
     VALUES ($1,$2,$3,'EMPLOYEE','ACTIVE',$4) RETURNING *`,
    [name, email.toLowerCase(), passwordHash, departmentId || null]
  );
  await logActivity({ employeeId: req.user.id, action: 'CREATE_EMPLOYEE', entityType: 'Employee', entityId: rows[0].id });
  res.status(201).json(shape(rows[0]));
}));

// Update basic profile fields / department
router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, departmentId, status } = req.body;
  const { rows } = await query(
    `UPDATE employees SET
       name = COALESCE($1, name),
       department_id = $2,
       status = COALESCE($3, status)
     WHERE id = $4 RETURNING *`,
    [name, departmentId ?? null, status, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
  await logActivity({ employeeId: req.user.id, action: 'UPDATE_EMPLOYEE', entityType: 'Employee', entityId: req.params.id });
  res.json(shape(rows[0]));
}));

// The ONLY place roles are assigned. Admin-only.
router.post('/:id/promote', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { role } = req.body;
  const allowed = ['EMPLOYEE', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'ADMIN'];
  if (!allowed.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const { rows } = await query(
    `UPDATE employees SET role = $1 WHERE id = $2 RETURNING *`,
    [role, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
  await logActivity({
    employeeId: req.user.id,
    action: 'PROMOTE_EMPLOYEE',
    entityType: 'Employee',
    entityId: req.params.id,
    metadata: { newRole: role },
  });
  await notify({ employeeId: req.params.id, type: 'GENERAL', message: `Your role has been updated to ${role.replace('_', ' ')}` });
  res.json(shape(rows[0]));
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { rows } = await query(`UPDATE employees SET status = 'INACTIVE' WHERE id = $1 RETURNING *`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
  await logActivity({ employeeId: req.user.id, action: 'DEACTIVATE_EMPLOYEE', entityType: 'Employee', entityId: req.params.id });
  res.json({ message: 'Employee deactivated' });
}));

export default router;
