import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, logActivity, notify } from '../utils/helpers.js';

const router = Router();
router.use(authenticate);

const shape = (b) => ({
  id: b.id,
  assetId: b.asset_id,
  assetTag: b.asset_tag || null,
  assetName: b.asset_name || null,
  requestedById: b.requested_by_id,
  requestedByName: b.requested_by_name || null,
  startTime: b.start_time,
  endTime: b.end_time,
  purpose: b.purpose,
  status: b.status,
  createdAt: b.created_at,
});

const SELECT = `
  SELECT b.*, a.asset_tag, a.name AS asset_name, e.name AS requested_by_name
  FROM bookings b
  JOIN assets a ON a.id = b.asset_id
  JOIN employees e ON e.id = b.requested_by_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const { assetId, status, employeeId } = req.query;
  const clauses = []; const params = []; let i = 1;
  if (assetId) { clauses.push(`b.asset_id = $${i}`); params.push(assetId); i++; }
  if (status) { clauses.push(`b.status = $${i}`); params.push(status); i++; }
  if (employeeId) { clauses.push(`b.requested_by_id = $${i}`); params.push(employeeId); i++; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(`${SELECT} ${where} ORDER BY b.start_time DESC`, params);
  res.json(rows.map(shape));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { assetId, startTime, endTime, purpose } = req.body;
  if (!assetId || !startTime || !endTime) return res.status(400).json({ error: 'Asset, start time and end time are required' });
  if (new Date(startTime) >= new Date(endTime)) return res.status(400).json({ error: 'Start time must be before end time' });

  const result = await withTransaction(async (client) => {
    const assetRes = await client.query('SELECT * FROM assets WHERE id = $1 FOR UPDATE', [assetId]);
    if (assetRes.rows.length === 0) throw { status: 404, message: 'Asset not found' };
    if (!assetRes.rows[0].is_bookable) throw { status: 400, message: 'This asset is not marked as bookable' };

    // Overlap validation: reject if any active booking overlaps [startTime, endTime)
    const overlap = await client.query(
      `SELECT id FROM bookings WHERE asset_id = $1 AND status IN ('UPCOMING','ONGOING')
       AND start_time < $3 AND end_time > $2`,
      [assetId, startTime, endTime]
    );
    if (overlap.rows.length > 0) {
      throw { status: 409, message: 'This time slot overlaps with an existing booking' };
    }
    const bookingRes = await client.query(
      `INSERT INTO bookings (asset_id, requested_by_id, start_time, end_time, purpose, status)
       VALUES ($1,$2,$3,$4,$5,'UPCOMING') RETURNING *`,
      [assetId, req.user.id, startTime, endTime, purpose || null]
    );
    return bookingRes.rows[0];
  });

  await logActivity({ employeeId: req.user.id, action: 'CREATE_BOOKING', entityType: 'Booking', entityId: result.id });
  await notify({ employeeId: req.user.id, type: 'BOOKING_CONFIRMED', message: 'Your resource booking is confirmed.' });
  const full = await query(`${SELECT} WHERE b.id = $1`, [result.id]);
  res.status(201).json(shape(full.rows[0]));
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND status IN ('UPCOMING','ONGOING') RETURNING *`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(400).json({ error: 'Booking cannot be cancelled' });
  await logActivity({ employeeId: req.user.id, action: 'CANCEL_BOOKING', entityType: 'Booking', entityId: req.params.id });
  await notify({ employeeId: rows[0].requested_by_id, type: 'BOOKING_CANCELLED', message: 'A booking was cancelled.' });
  const full = await query(`${SELECT} WHERE b.id = $1`, [req.params.id]);
  res.json(shape(full.rows[0]));
}));

router.put('/:id/reschedule', asyncHandler(async (req, res) => {
  const { startTime, endTime } = req.body;
  if (!startTime || !endTime) return res.status(400).json({ error: 'Start and end time are required' });
  if (new Date(startTime) >= new Date(endTime)) return res.status(400).json({ error: 'Start time must be before end time' });

  const result = await withTransaction(async (client) => {
    const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (bookingRes.rows.length === 0) throw { status: 404, message: 'Booking not found' };
    const booking = bookingRes.rows[0];

    const overlap = await client.query(
      `SELECT id FROM bookings WHERE asset_id = $1 AND id != $2 AND status IN ('UPCOMING','ONGOING')
       AND start_time < $4 AND end_time > $3`,
      [booking.asset_id, req.params.id, startTime, endTime]
    );
    if (overlap.rows.length > 0) throw { status: 409, message: 'This time slot overlaps with an existing booking' };

    const upd = await client.query(
      `UPDATE bookings SET start_time = $1, end_time = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [startTime, endTime, req.params.id]
    );
    return upd.rows[0];
  });

  await logActivity({ employeeId: req.user.id, action: 'RESCHEDULE_BOOKING', entityType: 'Booking', entityId: req.params.id });
  const full = await query(`${SELECT} WHERE b.id = $1`, [result.id]);
  res.json(shape(full.rows[0]));
}));

export default router;
