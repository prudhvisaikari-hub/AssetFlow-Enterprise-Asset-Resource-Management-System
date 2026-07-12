import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity, nextAssetTag } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const VALID_TRANSITIONS = {
  AVAILABLE: ['ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'],
  ALLOCATED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'LOST'],
  RESERVED: ['AVAILABLE', 'ALLOCATED', 'UNDER_MAINTENANCE'],
  UNDER_MAINTENANCE: ['AVAILABLE', 'RETIRED', 'LOST'],
  LOST: ['AVAILABLE', 'RETIRED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

const shape = (a) => ({
  id: a.id,
  assetTag: a.asset_tag,
  name: a.name,
  categoryId: a.category_id,
  categoryName: a.category_name || null,
  serialNumber: a.serial_number,
  acquisitionDate: a.acquisition_date,
  acquisitionCost: a.acquisition_cost !== null && a.acquisition_cost !== undefined ? Number(a.acquisition_cost) : null,
  condition: a.condition,
  location: a.location,
  departmentId: a.department_id,
  departmentName: a.department_name || null,
  photoUrl: a.photo_url,
  isBookable: a.is_bookable,
  status: a.status,
  currentHolder: a.current_holder || null,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

const BASE_SELECT = `
  SELECT a.*, c.name AS category_name, d.name AS department_name,
    (SELECT CASE
        WHEN al.employee_id IS NOT NULL THEN e.name
        WHEN al.department_id IS NOT NULL THEN dep.name
        ELSE NULL END
     FROM allocations al
     LEFT JOIN employees e ON e.id = al.employee_id
     LEFT JOIN departments dep ON dep.id = al.department_id
     WHERE al.asset_id = a.id AND al.status = 'ACTIVE'
     ORDER BY al.allocated_date DESC LIMIT 1) AS current_holder
  FROM assets a
  LEFT JOIN asset_categories c ON c.id = a.category_id
  LEFT JOIN departments d ON d.id = a.department_id
`;

// Search / filter
router.get('/', asyncHandler(async (req, res) => {
  const { search, category, status, department, location, bookable } = req.query;
  const clauses = [];
  const params = [];
  let i = 1;

  if (search) {
    clauses.push(`(a.asset_tag ILIKE $${i} OR a.name ILIKE $${i} OR a.serial_number ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }
  if (category) { clauses.push(`a.category_id = $${i}`); params.push(category); i++; }
  if (status) { clauses.push(`a.status = $${i}`); params.push(status); i++; }
  if (department) { clauses.push(`a.department_id = $${i}`); params.push(department); i++; }
  if (location) { clauses.push(`a.location ILIKE $${i}`); params.push(`%${location}%`); i++; }
  if (bookable === 'true') { clauses.push(`a.is_bookable = true`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`${BASE_SELECT} ${where} ORDER BY a.created_at DESC`, params);
  res.json(rows.map(shape));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(`${BASE_SELECT} WHERE a.id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
  res.json(shape(rows[0]));
}));

// Per-asset history: allocation + maintenance history
router.get('/:id/history', asyncHandler(async (req, res) => {
  const allocations = await query(`
    SELECT al.*, e.name AS employee_name, d.name AS department_name
    FROM allocations al
    LEFT JOIN employees e ON e.id = al.employee_id
    LEFT JOIN departments d ON d.id = al.department_id
    WHERE al.asset_id = $1 ORDER BY al.allocated_date DESC
  `, [req.params.id]);

  const maintenance = await query(`
    SELECT m.*, r.name AS raised_by_name, ap.name AS approved_by_name
    FROM maintenance_requests m
    LEFT JOIN employees r ON r.id = m.raised_by_id
    LEFT JOIN employees ap ON ap.id = m.approved_by_id
    WHERE m.asset_id = $1 ORDER BY m.created_at DESC
  `, [req.params.id]);

  res.json({
    allocations: allocations.rows.map(a => ({
      id: a.id,
      holder: a.employee_name || a.department_name || null,
      allocatedDate: a.allocated_date,
      expectedReturnDate: a.expected_return_date,
      actualReturnDate: a.actual_return_date,
      status: a.status,
      returnConditionNotes: a.return_condition_notes,
    })),
    maintenance: maintenance.rows.map(m => ({
      id: m.id,
      issueDescription: m.issue_description,
      priority: m.priority,
      status: m.status,
      raisedBy: m.raised_by_name,
      approvedBy: m.approved_by_name,
      createdAt: m.created_at,
      resolvedAt: m.resolved_at,
    })),
  });
}));

router.post('/', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const {
    name, categoryId, serialNumber, acquisitionDate, acquisitionCost,
    condition, location, departmentId, photoUrl, isBookable,
  } = req.body;
  if (!name || !categoryId) return res.status(400).json({ error: 'Name and category are required' });

  const assetTag = await nextAssetTag();
  const { rows } = await query(
    `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost,
       condition, location, department_id, photo_url, is_bookable, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'AVAILABLE') RETURNING *`,
    [assetTag, name, categoryId, serialNumber || null, acquisitionDate || null, acquisitionCost || null,
      condition || null, location || null, departmentId || null, photoUrl || null, !!isBookable]
  );
  await logActivity({ employeeId: req.user.id, action: 'REGISTER_ASSET', entityType: 'Asset', entityId: rows[0].id, metadata: { assetTag } });
  res.status(201).json(shape(rows[0]));
}));

router.put('/:id', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const {
    name, categoryId, serialNumber, acquisitionDate, acquisitionCost,
    condition, location, departmentId, photoUrl, isBookable,
  } = req.body;
  const { rows } = await query(
    `UPDATE assets SET
       name = COALESCE($1, name),
       category_id = COALESCE($2, category_id),
       serial_number = COALESCE($3, serial_number),
       acquisition_date = COALESCE($4, acquisition_date),
       acquisition_cost = COALESCE($5, acquisition_cost),
       condition = COALESCE($6, condition),
       location = COALESCE($7, location),
       department_id = $8,
       photo_url = COALESCE($9, photo_url),
       is_bookable = COALESCE($10, is_bookable),
       updated_at = now()
     WHERE id = $11 RETURNING *`,
    [name, categoryId, serialNumber, acquisitionDate, acquisitionCost, condition, location,
      departmentId ?? null, photoUrl, isBookable, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
  await logActivity({ employeeId: req.user.id, action: 'UPDATE_ASSET', entityType: 'Asset', entityId: req.params.id });
  res.json(shape(rows[0]));
}));

// Explicit lifecycle transition endpoint, validated against the state machine
router.post('/:id/transition', requireRole('ADMIN', 'ASSET_MANAGER'), asyncHandler(async (req, res) => {
  const { toStatus, reason } = req.body;
  const current = await query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
  const fromStatus = current.rows[0].status;

  if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    return res.status(400).json({ error: `Cannot move an asset from ${fromStatus} to ${toStatus}` });
  }
  const { rows } = await query(
    `UPDATE assets SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [toStatus, req.params.id]
  );
  await logActivity({
    employeeId: req.user.id, action: 'ASSET_STATUS_CHANGE', entityType: 'Asset', entityId: req.params.id,
    metadata: { fromStatus, toStatus, reason: reason || null },
  });
  res.json(shape(rows[0]));
}));

export default router;
