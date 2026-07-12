import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity, notify } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shapeCycle = (c) => ({
  id: c.id,
  name: c.name,
  scopeDepartmentId: c.scope_department_id,
  scopeDepartmentName: c.scope_department_name || null,
  scopeLocation: c.scope_location,
  startDate: c.start_date,
  endDate: c.end_date,
  status: c.status,
  auditorCount: c.auditor_count !== undefined ? Number(c.auditor_count) : undefined,
  itemCount: c.item_count !== undefined ? Number(c.item_count) : undefined,
  discrepancyCount: c.discrepancy_count !== undefined ? Number(c.discrepancy_count) : undefined,
  createdAt: c.created_at,
  closedAt: c.closed_at,
});

const CYCLE_SELECT = `
  SELECT c.*, d.name AS scope_department_name,
    (SELECT COUNT(*) FROM audit_assignments aa WHERE aa.audit_cycle_id = c.id) AS auditor_count,
    (SELECT COUNT(*) FROM audit_items ai WHERE ai.audit_cycle_id = c.id) AS item_count,
    (SELECT COUNT(*) FROM audit_items ai WHERE ai.audit_cycle_id = c.id AND ai.result IN ('MISSING','DAMAGED')) AS discrepancy_count
  FROM audit_cycles c
  LEFT JOIN departments d ON d.id = c.scope_department_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`${CYCLE_SELECT} ORDER BY c.created_at DESC`);
  res.json(rows.map(shapeCycle));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${CYCLE_SELECT} WHERE c.id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Audit cycle not found' });

  const auditors = await query(`
    SELECT e.id, e.name FROM audit_assignments aa JOIN employees e ON e.id = aa.auditor_id
    WHERE aa.audit_cycle_id = $1`, [req.params.id]);

  const items = await query(`
    SELECT ai.*, a.asset_tag, a.name AS asset_name
    FROM audit_items ai JOIN assets a ON a.id = ai.asset_id
    WHERE ai.audit_cycle_id = $1 ORDER BY a.asset_tag`, [req.params.id]);

  res.json({
    ...shapeCycle(rows[0]),
    auditors: auditors.rows,
    items: items.rows.map(i => ({
      id: i.id, assetId: i.asset_id, assetTag: i.asset_tag, assetName: i.asset_name,
      result: i.result, notes: i.notes, verifiedAt: i.verified_at,
    })),
  });
}));

// Create a cycle — scope by department and/or location, date range, auditors, initial item set
router.post('/', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { name, scopeDepartmentId, scopeLocation, startDate, endDate, auditorIds } = req.body;
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'Name, start date and end date are required' });

  const result = await withTransaction(async (client) => {
    const cycleRes = await client.query(
      `INSERT INTO audit_cycles (name, scope_department_id, scope_location, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,'PLANNED') RETURNING *`,
      [name, scopeDepartmentId || null, scopeLocation || null, startDate, endDate]
    );
    const cycle = cycleRes.rows[0];

    for (const auditorId of auditorIds || []) {
      await client.query(
        `INSERT INTO audit_assignments (audit_cycle_id, auditor_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [cycle.id, auditorId]
      );
    }

    // Auto-populate items in scope
    const clauses = []; const params = [cycle.id]; let i = 2;
    if (scopeDepartmentId) { clauses.push(`department_id = $${i}`); params.push(scopeDepartmentId); i++; }
    if (scopeLocation) { clauses.push(`location ILIKE $${i}`); params.push(`%${scopeLocation}%`); i++; }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const assetsInScope = await client.query(`SELECT id FROM assets ${where}`, clauses.length ? params.slice(1) : []);
    for (const a of assetsInScope.rows) {
      await client.query(
        `INSERT INTO audit_items (audit_cycle_id, asset_id, result) VALUES ($1,$2,'PENDING') ON CONFLICT DO NOTHING`,
        [cycle.id, a.id]
      );
    }
    return cycle;
  });

  await logActivity({ employeeId: req.user.id, action: 'CREATE_AUDIT_CYCLE', entityType: 'AuditCycle', entityId: result.id });
  for (const auditorId of req.body.auditorIds || []) {
    await notify({ employeeId: auditorId, type: 'GENERAL', message: `You have been assigned to audit cycle "${result.name}".` });
  }
  const full = await query(`${CYCLE_SELECT} WHERE c.id = $1`, [result.id]);
  res.status(201).json(shapeCycle(full.rows[0]));
}));

router.post('/:id/start', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE audit_cycles SET status = 'IN_PROGRESS' WHERE id = $1 AND status = 'PLANNED' RETURNING *`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(400).json({ error: 'Only a planned cycle can be started' });
  await logActivity({ employeeId: req.user.id, action: 'START_AUDIT_CYCLE', entityType: 'AuditCycle', entityId: req.params.id });
  res.json({ message: 'Audit cycle started' });
}));

// Auditor marks each asset
router.put('/items/:itemId', asyncHandler(async (req, res) => {
  const { result, notes } = req.body;
  if (!['VERIFIED', 'MISSING', 'DAMAGED'].includes(result)) return res.status(400).json({ error: 'Result must be VERIFIED, MISSING, or DAMAGED' });
  const { rows } = await query(
    `UPDATE audit_items SET result = $1, notes = $2, verified_at = now() WHERE id = $3 RETURNING *`,
    [result, notes || null, req.params.itemId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Audit item not found' });
  await logActivity({ employeeId: req.user.id, action: 'MARK_AUDIT_ITEM', entityType: 'AuditItem', entityId: req.params.itemId, metadata: { result } });
  if (result === 'MISSING' || result === 'DAMAGED') {
    await logActivity({ employeeId: req.user.id, action: 'AUDIT_DISCREPANCY', entityType: 'AuditItem', entityId: req.params.itemId, metadata: { result } });
  }
  res.json(rows[0]);
}));

// Discrepancy report for a cycle (auto-generated view)
router.get('/:id/discrepancies', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT ai.*, a.asset_tag, a.name AS asset_name, a.location
    FROM audit_items ai JOIN assets a ON a.id = ai.asset_id
    WHERE ai.audit_cycle_id = $1 AND ai.result IN ('MISSING','DAMAGED')
    ORDER BY ai.result, a.asset_tag`, [req.params.id]);
  res.json(rows.map(r => ({
    id: r.id, assetId: r.asset_id, assetTag: r.asset_tag, assetName: r.asset_name,
    location: r.location, result: r.result, notes: r.notes, verifiedAt: r.verified_at,
  })));
}));

// Close cycle — locks it and updates affected asset statuses (Lost for confirmed-missing items)
router.post('/:id/close', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const cRes = await client.query('SELECT * FROM audit_cycles WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (cRes.rows.length === 0) throw { status: 404, message: 'Audit cycle not found' };
    if (cRes.rows[0].status === 'CLOSED') throw { status: 400, message: 'This audit cycle is already closed' };

    const missing = await client.query(`SELECT asset_id FROM audit_items WHERE audit_cycle_id = $1 AND result = 'MISSING'`, [req.params.id]);
    for (const row of missing.rows) {
      await client.query(`UPDATE assets SET status = 'LOST', updated_at = now() WHERE id = $1`, [row.asset_id]);
    }
    const damaged = await client.query(`SELECT asset_id FROM audit_items WHERE audit_cycle_id = $1 AND result = 'DAMAGED'`, [req.params.id]);
    for (const row of damaged.rows) {
      await client.query(`UPDATE assets SET status = 'UNDER_MAINTENANCE', updated_at = now() WHERE id = $1`, [row.asset_id]);
    }
    const upd = await client.query(`UPDATE audit_cycles SET status = 'CLOSED', closed_at = now() WHERE id = $1 RETURNING *`, [req.params.id]);
    return upd.rows[0];
  });
  await logActivity({ employeeId: req.user.id, action: 'CLOSE_AUDIT_CYCLE', entityType: 'AuditCycle', entityId: req.params.id });
  const full = await query(`${CYCLE_SELECT} WHERE c.id = $1`, [result.id]);
  res.json(shapeCycle(full.rows[0]));
}));

export default router;
