import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, logActivity } from '../utils/helpers.js';

const router = Router();

function signToken(employee) {
  return jwt.sign(
    {
      id: employee.id,
      email: employee.email,
      role: employee.role,
      departmentId: employee.department_id,
      name: employee.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicEmployee(e) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role,
    status: e.status,
    departmentId: e.department_id,
    createdAt: e.created_at,
  };
}

// Signup — always creates an Employee. No role selection here, ever.
router.post('/signup', asyncHandler(async (req, res) => {
  const { name, email, password, departmentId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = await query('SELECT id FROM employees WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO employees (name, email, password_hash, role, status, department_id)
     VALUES ($1,$2,$3,'EMPLOYEE','ACTIVE',$4) RETURNING *`,
    [name, email.toLowerCase(), passwordHash, departmentId || null]
  );
  const employee = rows[0];
  await logActivity({ employeeId: employee.id, action: 'SIGNUP', entityType: 'Employee', entityId: employee.id });
  const token = signToken(employee);
  res.status(201).json({ token, user: publicEmployee(employee) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await query('SELECT * FROM employees WHERE email = $1', [email.toLowerCase()]);
  const employee = rows[0];
  if (!employee) return res.status(401).json({ error: 'Invalid email or password' });
  if (employee.status === 'INACTIVE') return res.status(403).json({ error: 'This account has been deactivated' });
  const valid = await bcrypt.compare(password, employee.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
  await logActivity({ employeeId: employee.id, action: 'LOGIN', entityType: 'Employee', entityId: employee.id });
  const token = signToken(employee);
  res.json({ token, user: publicEmployee(employee) });
}));

// Forgot password — hackathon-scope: issues a reset token and returns it directly
// (in production this would be emailed, not returned in the response).
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const { rows } = await query('SELECT id FROM employees WHERE email = $1', [(email || '').toLowerCase()]);
  if (rows.length === 0) {
    // Do not reveal whether the email exists
    return res.json({ message: 'If that email exists, a reset link has been generated.' });
  }
  const resetToken = jwt.sign({ id: rows[0].id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '30m' });
  res.json({ message: 'Reset token generated', resetToken });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) return res.status(400).json({ error: 'Reset token and new password are required' });
  let payload;
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Reset token is invalid or expired' });
  }
  if (payload.purpose !== 'reset') return res.status(400).json({ error: 'Invalid reset token' });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE employees SET password_hash = $1 WHERE id = $2', [passwordHash, payload.id]);
  res.json({ message: 'Password updated successfully' });
}));

// Session validation
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM employees WHERE id = $1', [req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicEmployee(rows[0]) });
}));

export default router;
