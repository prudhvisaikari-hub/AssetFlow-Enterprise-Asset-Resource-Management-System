import { query } from '../db.js';

// Generate next asset tag like AF-0001, AF-0002...
export async function nextAssetTag() {
  const { rows } = await query(
    `SELECT asset_tag FROM assets ORDER BY created_at DESC LIMIT 1`
  );
  if (rows.length === 0) return 'AF-0001';
  const last = rows[0].asset_tag;
  const num = parseInt(last.split('-')[1], 10) + 1;
  return `AF-${String(num).padStart(4, '0')}`;
}

export async function logActivity({ employeeId, action, entityType, entityId, metadata }) {
  await query(
    `INSERT INTO activity_logs (employee_id, action, entity_type, entity_id, metadata)
     VALUES ($1,$2,$3,$4,$5)`,
    [employeeId || null, action, entityType, entityId || null, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function notify({ employeeId, type, message }) {
  if (!employeeId) return;
  await query(
    `INSERT INTO notifications (employee_id, type, message) VALUES ($1,$2,$3)`,
    [employeeId, type, message]
  );
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
