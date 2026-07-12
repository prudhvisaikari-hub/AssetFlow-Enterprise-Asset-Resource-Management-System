import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity, notify } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shapeAllocation = (a) => ({
  id: a.id,
  assetId: a.asset_id,
  assetTag: a.asset_tag || null,
  assetName: a.asset_name || null,
  employeeId: a.employee_id,
  employeeName: a.employee_name || null,
  departmentId: a.department_id,
  departmentName: a.department_name || null,
  allocatedDate: a.allocated_date,
  expectedReturnDate: a.expected_return_date,
  actualReturnDate: a.actual_return_date,
  returnConditionNotes: a.return_condition_notes,
  status: a.status,
  isOverdue: a.status === 'ACTIVE' && a.expected_return_date && new Date(a.expected_return_date) < new Date(),
});

const ALLOC_SELECT = `
  SELECT al.*, a.asset_tag, a.name AS asset_name, e.name AS employee_name, d.name AS department_name
  FROM allocations al
  JOIN assets a ON a.id = al.asset_id
  LEFT JOIN employees e ON e.id = al.employee_id
  LEFT JOIN departments d ON d.id = al.department_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const { status, employeeId, departmentId, overdue } = req.query;
  const clauses = []; const params = []; let i = 1;
  if (status) { clauses.push(`al.status = $${i}`); params.push(status); i++; }
  if (employeeId) { clauses.push(`al.employee_id = $${i}`); params.push(employeeId); i++; }
  if (departmentId) { clauses.push(`al.department_id = $${i}`); params.push(departmentId); i++; }
  if (overdue === 'true') { clauses.push(`al.status = 'ACTIVE' AND al.expected_return_date < now()`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`${ALLOC_SELECT} ${where} ORDER BY al.allocated_date DESC`, params);
  res.json(rows.map(shapeAllocation));
}));

// Allocate an asset — blocks if already actively held (conflict rule)
router.post('/', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => {
  const { assetId, employeeId, departmentId, expectedReturnDate } = req.body;
  if (!assetId || (!employeeId && !departmentId)) {
    return res.status(400).json({ error: 'Asset and an employee or department to allocate to are required' });
  }

  const result = await withTransaction(async (client) => {
    const assetRes = await client.query('SELECT * FROM assets WHERE id = $1 FOR UPDATE', [assetId]);
    if (assetRes.rows.length === 0) throw { status: 404, message: 'Asset not found' };
    const asset = assetRes.rows[0];

    const activeRes = await client.query(
      `SELECT al.*, e.name AS employee_name, d.name AS department_name
       FROM allocations al
       LEFT JOIN employees e ON e.id = al.employee_id
       LEFT JOIN departments d ON d.id = al.department_id
       WHERE al.asset_id = $1 AND al.status = 'ACTIVE'`,
      [assetId]
    );
    if (activeRes.rows.length > 0) {
      const holder = activeRes.rows[0].employee_name || activeRes.rows[0].department_name;
      throw {
        status: 409,
        message: `This asset is currently held by ${holder}. Use a transfer request instead.`,
        conflict: true,
        currentAllocationId: activeRes.rows[0].id,
      };
    }
    if (!['AVAILABLE', 'RESERVED'].includes(asset.status)) {
      throw { status: 400, message: `Asset is ${asset.status.toLowerCase().replace('_', ' ')} and cannot be allocated` };
    }

    const allocRes = await client.query(
      `INSERT INTO allocations (asset_id, employee_id, department_id, expected_return_date, status)
       VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING *`,
      [assetId, employeeId || null, departmentId || null, expectedReturnDate || null]
    );
    await client.query(`UPDATE assets SET status = 'ALLOCATED', updated_at = now() WHERE id = $1`, [assetId]);
    return allocRes.rows[0];
  }).catch((e) => { throw e; });

  await logActivity({ employeeId: req.user.id, action: 'ALLOCATE_ASSET', entityType: 'Allocation', entityId: result.id });
  if (employeeId) {
    await notify({ employeeId, type: 'ASSET_ASSIGNED', message: `An asset has been allocated to you.` });
  }
  const { rows } = await query(`${ALLOC_SELECT} WHERE al.id = $1`, [result.id]);
  res.status(201).json(shapeAllocation(rows[0]));
}));

// Return an asset
router.post('/:id/return', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'), asyncHandler(async (req, res) => {
  const { returnConditionNotes } = req.body;
  const result = await withTransaction(async (client) => {
    const allocRes = await client.query('SELECT * FROM allocations WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (allocRes.rows.length === 0) throw { status: 404, message: 'Allocation not found' };
    const alloc = allocRes.rows[0];
    if (alloc.status !== 'ACTIVE') throw { status: 400, message: 'This allocation is not active' };

    const updated = await client.query(
      `UPDATE allocations SET status = 'RETURNED', actual_return_date = now(), return_condition_notes = $1
       WHERE id = $2 RETURNING *`,
      [returnConditionNotes || null, req.params.id]
    );
    await client.query(`UPDATE assets SET status = 'AVAILABLE', updated_at = now() WHERE id = $1`, [alloc.asset_id]);
    return updated.rows[0];
  });
  await logActivity({ employeeId: req.user.id, action: 'RETURN_ASSET', entityType: 'Allocation', entityId: req.params.id });
  const { rows } = await query(`${ALLOC_SELECT} WHERE al.id = $1`, [result.id]);
  res.json(shapeAllocation(rows[0]));
}));

// ---------- TRANSFER REQUESTS ----------

const shapeTransfer = (t) => ({
  id: t.id,
  assetId: t.asset_id,
  assetTag: t.asset_tag || null,
  assetName: t.asset_name || null,
  requestedById: t.requested_by_id,
  requestedByName: t.requested_by_name || null,
  toEmployeeId: t.to_employee_id,
  toEmployeeName: t.to_employee_name || null,
  toDepartmentId: t.to_department_id,
  toDepartmentName: t.to_department_name || null,
  status: t.status,
  approvedById: t.approved_by_id,
  requestNotes: t.request_notes,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

const TRANSFER_SELECT = `
  SELECT t.*, a.asset_tag, a.name AS asset_name,
    rb.name AS requested_by_name, te.name AS to_employee_name, td.name AS to_department_name
  FROM transfer_requests t
  JOIN assets a ON a.id = t.asset_id
  JOIN employees rb ON rb.id = t.requested_by_id
  LEFT JOIN employees te ON te.id = t.to_employee_id
  LEFT JOIN departments td ON td.id = t.to_department_id
`;

router.get('/transfers/all', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status ? 'WHERE t.status = $1' : '';
  const { rows } = await query(`${TRANSFER_SELECT} ${where} ORDER BY t.created_at DESC`, status ? [status] : []);
  res.json(rows.map(shapeTransfer));
}));

router.post('/transfers', asyncHandler(async (req, res) => {
  const { assetId, toEmployeeId, toDepartmentId, requestNotes } = req.body;
  if (!assetId || (!toEmployeeId && !toDepartmentId)) {
    return res.status(400).json({ error: 'Asset and a destination employee or department are required' });
  }
  const activeAlloc = await query(`SELECT id FROM allocations WHERE asset_id = $1 AND status = 'ACTIVE'`, [assetId]);
  const { rows } = await query(
    `INSERT INTO transfer_requests (asset_id, from_allocation_id, requested_by_id, to_employee_id, to_department_id, request_notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [assetId, activeAlloc.rows[0]?.id || null, req.user.id, toEmployeeId || null, toDepartmentId || null, requestNotes || null]
  );
  await logActivity({ employeeId: req.user.id, action: 'REQUEST_TRANSFER', entityType: 'TransferRequest', entityId: rows[0].id });
  const full = await query(`${TRANSFER_SELECT} WHERE t.id = $1`, [rows[0].id]);
  res.status(201).json(shapeTransfer(full.rows[0]));
}));

router.post('/transfers/:id/decision', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => {
  const { decision } = req.body; // 'APPROVED' | 'REJECTED'
  if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });

  const result = await withTransaction(async (client) => {
    const tRes = await client.query('SELECT * FROM transfer_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (tRes.rows.length === 0) throw { status: 404, message: 'Transfer request not found' };
    const transfer = tRes.rows[0];
    if (transfer.status !== 'REQUESTED') throw { status: 400, message: 'This transfer request has already been decided' };

    if (decision === 'REJECTED') {
      const upd = await client.query(
        `UPDATE transfer_requests SET status = 'REJECTED', approved_by_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      return upd.rows[0];
    }

    // Approved: close old allocation, re-allocate to new holder, history updates automatically
    if (transfer.from_allocation_id) {
      await client.query(`UPDATE allocations SET status = 'TRANSFERRED', actual_return_date = now() WHERE id = $1`, [transfer.from_allocation_id]);
    }
    const newAlloc = await client.query(
      `INSERT INTO allocations (asset_id, employee_id, department_id, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`,
      [transfer.asset_id, transfer.to_employee_id || null, transfer.to_department_id || null]
    );
    await client.query(`UPDATE assets SET status = 'ALLOCATED', updated_at = now() WHERE id = $1`, [transfer.asset_id]);
    const upd = await client.query(
      `UPDATE transfer_requests SET status = 'COMPLETED', approved_by_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    return { ...upd.rows[0], newAllocationId: newAlloc.rows[0].id };
  });

  await logActivity({ employeeId: req.user.id, action: `TRANSFER_${decision}`, entityType: 'TransferRequest', entityId: req.params.id });
  if (decision === 'APPROVED' && result.to_employee_id) {
    await notify({ employeeId: result.to_employee_id, type: 'TRANSFER_APPROVED', message: 'An asset transfer to you has been approved.' });
  }
  const full = await query(`${TRANSFER_SELECT} WHERE t.id = $1`, [req.params.id]);
  res.json(shapeTransfer(full.rows[0]));
}));

export default router;
