import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity, notify } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shape = (m) => ({
  id: m.id,
  assetId: m.asset_id,
  assetTag: m.asset_tag || null,
  assetName: m.asset_name || null,
  raisedById: m.raised_by_id,
  raisedByName: m.raised_by_name || null,
  issueDescription: m.issue_description,
  priority: m.priority,
  photoUrl: m.photo_url,
  status: m.status,
  approvedById: m.approved_by_id,
  approvedByName: m.approved_by_name || null,
  technicianName: m.technician_name,
  resolutionNotes: m.resolution_notes,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
  resolvedAt: m.resolved_at,
});

const SELECT = `
  SELECT m.*, a.asset_tag, a.name AS asset_name, r.name AS raised_by_name, ap.name AS approved_by_name
  FROM maintenance_requests m
  JOIN assets a ON a.id = m.asset_id
  JOIN employees r ON r.id = m.raised_by_id
  LEFT JOIN employees ap ON ap.id = m.approved_by_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const { status, assetId, priority } = req.query;
  const clauses = []; const params = []; let i = 1;
  if (status) { clauses.push(`m.status = $${i}`); params.push(status); i++; }
  if (assetId) { clauses.push(`m.asset_id = $${i}`); params.push(assetId); i++; }
  if (priority) { clauses.push(`m.priority = $${i}`); params.push(priority); i++; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${where} ORDER BY m.created_at DESC`, params);
  res.json(rows.map(shape));
}));

// Raise a request
router.post('/', asyncHandler(async (req, res) => {
  const { assetId, issueDescription, priority, photoUrl } = req.body;
  if (!assetId || !issueDescription) return res.status(400).json({ error: 'Asset and issue description are required' });
  const { rows } = await query(
    `INSERT INTO maintenance_requests (asset_id, raised_by_id, issue_description, priority, photo_url, status)
     VALUES ($1,$2,$3,$4,$5,'PENDING') RETURNING *`,
    [assetId, req.user.id, issueDescription, priority || 'MEDIUM', photoUrl || null]
  );
  await logActivity({ employeeId: req.user.id, action: 'RAISE_MAINTENANCE', entityType: 'MaintenanceRequest', entityId: rows[0].id });
  const full = await query(`${SELECT} WHERE m.id = $1`, [rows[0].id]);
  res.status(201).json(shape(full.rows[0]));
}));

// Approve / reject — only Asset Manager (or Admin)
router.post('/:id/decision', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { decision } = req.body; // APPROVED | REJECTED
  if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });

  const result = await withTransaction(async (client) => {
    const mRes = await client.query('SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (mRes.rows.length === 0) throw { status: 404, message: 'Maintenance request not found' };
    const m = mRes.rows[0];
    if (m.status !== 'PENDING') throw { status: 400, message: 'This request has already been decided' };

    const newStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const upd = await client.query(
      `UPDATE maintenance_requests SET status = $1, approved_by_id = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [newStatus, req.user.id, req.params.id]
    );
    if (decision === 'APPROVED') {
      await client.query(`UPDATE assets SET status = 'UNDER_MAINTENANCE', updated_at = now() WHERE id = $1`, [m.asset_id]);
    }
    return upd.rows[0];
  });

  await logActivity({ employeeId: req.user.id, action: `MAINTENANCE_${decision}`, entityType: 'MaintenanceRequest', entityId: req.params.id });
  await notify({
    employeeId: result.raised_by_id,
    type: decision === 'APPROVED' ? 'MAINTENANCE_APPROVED' : 'MAINTENANCE_REJECTED',
    message: `Your maintenance request was ${decision.toLowerCase()}.`,
  });
  const full = await query(`${SELECT} WHERE m.id = $1`, [req.params.id]);
  res.json(shape(full.rows[0]));
}));

router.post('/:id/assign-technician', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { technicianName } = req.body;
  if (!technicianName) return res.status(400).json({ error: 'Technician name is required' });
  const { rows } = await query(
    `UPDATE maintenance_requests SET status = 'TECHNICIAN_ASSIGNED', technician_name = $1, updated_at = now()
     WHERE id = $2 AND status = 'APPROVED' RETURNING *`,
    [technicianName, req.params.id]
  );
  if (rows.length === 0) return res.status(400).json({ error: 'Request must be approved before assigning a technician' });
  await logActivity({ employeeId: req.user.id, action: 'ASSIGN_TECHNICIAN', entityType: 'MaintenanceRequest', entityId: req.params.id });
  const full = await query(`${SELECT} WHERE m.id = $1`, [req.params.id]);
  res.json(shape(full.rows[0]));
}));

router.post('/:id/start', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE maintenance_requests SET status = 'IN_PROGRESS', updated_at = now()
     WHERE id = $1 AND status = 'TECHNICIAN_ASSIGNED' RETURNING *`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(400).json({ error: 'A technician must be assigned first' });
  await logActivity({ employeeId: req.user.id, action: 'START_MAINTENANCE', entityType: 'MaintenanceRequest', entityId: req.params.id });
  const full = await query(`${SELECT} WHERE m.id = $1`, [req.params.id]);
  res.json(shape(full.rows[0]));
}));

router.post('/:id/resolve', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { resolutionNotes } = req.body;
  const result = await withTransaction(async (client) => {
    const mRes = await client.query('SELECT * FROM maintenance_requests WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (mRes.rows.length === 0) throw { status: 404, message: 'Maintenance request not found' };
    const m = mRes.rows[0];
    if (!['IN_PROGRESS', 'TECHNICIAN_ASSIGNED'].includes(m.status)) {
      throw { status: 400, message: 'Request must be in progress before it can be resolved' };
    }
    const upd = await client.query(
      `UPDATE maintenance_requests SET status = 'RESOLVED', resolution_notes = $1, resolved_at = now(), updated_at = now()
       WHERE id = $2 RETURNING *`,
      [resolutionNotes || null, req.params.id]
    );
    await client.query(`UPDATE assets SET status = 'AVAILABLE', updated_at = now() WHERE id = $1`, [m.asset_id]);
    return upd.rows[0];
  });
  await logActivity({ employeeId: req.user.id, action: 'RESOLVE_MAINTENANCE', entityType: 'MaintenanceRequest', entityId: req.params.id });
  const full = await query(`${SELECT} WHERE m.id = $1`, [result.id]);
  res.json(shape(full.rows[0]));
}));

export default router;
