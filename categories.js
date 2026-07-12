import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, logActivity } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shape = (c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  customFields: c.custom_fields || {},
  assetCount: c.asset_count !== undefined ? Number(c.asset_count) : undefined,
  createdAt: c.created_at,
});

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT c.*, (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id) AS asset_count
    FROM asset_categories c ORDER BY c.name
  `);
  res.json(rows.map(shape));
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, description, customFields } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const { rows } = await query(
    `INSERT INTO asset_categories (name, description, custom_fields) VALUES ($1,$2,$3) RETURNING *`,
    [name, description || null, customFields ? JSON.stringify(customFields) : null]
  );
  await logActivity({ employeeId: req.user.id, action: 'CREATE_CATEGORY', entityType: 'AssetCategory', entityId: rows[0].id });
  res.status(201).json(shape(rows[0]));
}));

router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, description, customFields } = req.body;
  const { rows } = await query(
    `UPDATE asset_categories SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       custom_fields = COALESCE($3, custom_fields)
     WHERE id = $4 RETURNING *`,
    [name, description, customFields ? JSON.stringify(customFields) : null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Category not found' });
  await logActivity({ employeeId: req.user.id, action: 'UPDATE_CATEGORY', entityType: 'AssetCategory', entityId: req.params.id });
  res.json(shape(rows[0]));
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const inUse = await query('SELECT COUNT(*) FROM assets WHERE category_id = $1', [req.params.id]);
  if (Number(inUse.rows[0].count) > 0) {
    return res.status(400).json({ error: 'Cannot delete a category that has assets assigned to it' });
  }
  await query('DELETE FROM asset_categories WHERE id = $1', [req.params.id]);
  await logActivity({ employeeId: req.user.id, action: 'DELETE_CATEGORY', entityType: 'AssetCategory', entityId: req.params.id });
  res.json({ message: 'Category deleted' });
}));

export default router;
