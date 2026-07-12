import bcrypt from 'bcryptjs';
import { pool, query } from '../src/db.js';

async function hash(pw) { return bcrypt.hash(pw, 10); }

async function main() {
  console.log('Seeding AssetFlow demo data...');

  // Wipe existing data (schema.sql already recreates tables fresh, but keep idempotent)
  await query(`TRUNCATE activity_logs, notifications, audit_items, audit_assignments, audit_cycles,
    maintenance_requests, bookings, transfer_requests, allocations, assets, asset_categories,
    employees, departments RESTART IDENTITY CASCADE`);

  const pw = await hash('password123');

  // --- Departments (created without heads first, patched after employees exist) ---
  const deptNames = ['Engineering', 'Facilities', 'Human Resources', 'Sales', 'IT Support'];
  const depts = {};
  for (const name of deptNames) {
    const { rows } = await query(`INSERT INTO departments (name) VALUES ($1) RETURNING *`, [name]);
    depts[name] = rows[0];
  }

  // --- Categories ---
  const categories = {};
  const catDefs = [
    ['Electronics', { warrantyPeriodMonths: true }],
    ['Furniture', {}],
    ['Vehicles', { registrationExpiry: true }],
    ['Meeting Rooms', {}],
    ['Tools & Equipment', {}],
  ];
  for (const [name, customFields] of catDefs) {
    const { rows } = await query(
      `INSERT INTO asset_categories (name, custom_fields) VALUES ($1,$2) RETURNING *`,
      [name, JSON.stringify(customFields)]
    );
    categories[name] = rows[0];
  }

  // --- Employees ---
  async function makeEmployee(name, email, role, deptKey) {
    const { rows } = await query(
      `INSERT INTO employees (name, email, password_hash, role, department_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, email, pw, role, deptKey ? depts[deptKey].id : null]
    );
    return rows[0];
  }

  const admin = await makeEmployee('Ava Thompson', 'admin@assetflow.com', 'ADMIN', null);
  const assetMgr = await makeEmployee('Marcus Reyes', 'manager@assetflow.com', 'ASSET_MANAGER', 'IT Support');
  const deptHeadEng = await makeEmployee('Priya Nair', 'priya@assetflow.com', 'DEPARTMENT_HEAD', 'Engineering');
  const deptHeadFac = await makeEmployee('Daniel Okafor', 'daniel@assetflow.com', 'DEPARTMENT_HEAD', 'Facilities');
  const raj = await makeEmployee('Raj Malhotra', 'raj@assetflow.com', 'EMPLOYEE', 'Engineering');
  const sara = await makeEmployee('Sara Kim', 'sara@assetflow.com', 'EMPLOYEE', 'Sales');
  const tomas = await makeEmployee('Tomas Alvarez', 'tomas@assetflow.com', 'EMPLOYEE', 'Human Resources');
  const lena = await makeEmployee('Lena Fischer', 'lena@assetflow.com', 'EMPLOYEE', 'Engineering');

  // Patch department heads
  await query(`UPDATE departments SET head_id = $1 WHERE id = $2`, [deptHeadEng.id, depts['Engineering'].id]);
  await query(`UPDATE departments SET head_id = $1 WHERE id = $2`, [deptHeadFac.id, depts['Facilities'].id]);

  // --- Assets ---
  async function makeAsset({ name, category, serial, cost, condition, location, dept, bookable, status = 'AVAILABLE', acquisitionDate }) {
    const last = await query(`SELECT asset_tag FROM assets ORDER BY created_at DESC LIMIT 1`);
    const tag = last.rows.length === 0 ? 'AF-0001' : `AF-${String(parseInt(last.rows[0].asset_tag.split('-')[1], 10) + 1).padStart(4, '0')}`;
    const { rows } = await query(
      `INSERT INTO assets (asset_tag, name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, department_id, is_bookable, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [tag, name, categories[category].id, serial, acquisitionDate || '2023-01-15', cost, condition, location, dept ? depts[dept].id : null, !!bookable, status]
    );
    return rows[0];
  }

  const laptop1 = await makeAsset({ name: 'Dell Latitude 5440', category: 'Electronics', serial: 'DL5440-001', cost: 1200, condition: 'Good', location: 'HQ - 3rd Floor', dept: 'Engineering', acquisitionDate: '2023-08-01' });
  const laptop2 = await makeAsset({ name: 'MacBook Pro 14"', category: 'Electronics', serial: 'MBP14-002', cost: 2400, condition: 'Excellent', location: 'HQ - 3rd Floor', dept: 'Engineering', acquisitionDate: '2024-02-10' });
  const laptop3 = await makeAsset({ name: 'ThinkPad X1 Carbon', category: 'Electronics', serial: 'TPX1-003', cost: 1600, condition: 'Fair', location: 'HQ - 2nd Floor', dept: 'Sales', acquisitionDate: '2021-05-20' });
  const projector = await makeAsset({ name: 'Epson Projector EB-2250U', category: 'Electronics', serial: 'EPS-004', cost: 900, condition: 'Good', location: 'Room B2', bookable: true, acquisitionDate: '2022-03-01' });
  const roomB2 = await makeAsset({ name: 'Conference Room B2', category: 'Meeting Rooms', serial: null, cost: null, condition: 'Good', location: 'HQ - 2nd Floor', bookable: true });
  const roomA1 = await makeAsset({ name: 'Conference Room A1', category: 'Meeting Rooms', serial: null, cost: null, condition: 'Good', location: 'HQ - 1st Floor', bookable: true });
  const van1 = await makeAsset({ name: 'Delivery Van - Ford Transit', category: 'Vehicles', serial: 'FT-VAN-01', cost: 32000, condition: 'Good', location: 'Parking Lot', bookable: true, acquisitionDate: '2020-11-01' });
  const drill = await makeAsset({ name: 'Cordless Drill Set', category: 'Tools & Equipment', serial: 'DRILL-01', cost: 150, condition: 'Fair', location: 'Facilities Storage', dept: 'Facilities' });
  const chair1 = await makeAsset({ name: 'Ergonomic Office Chair', category: 'Furniture', serial: 'CHR-01', cost: 320, condition: 'Good', location: 'HQ - 3rd Floor', dept: 'Engineering' });
  const printer = await makeAsset({ name: 'HP LaserJet Pro M404', category: 'Electronics', serial: 'HP404-01', cost: 280, condition: 'Poor', location: 'HQ - 2nd Floor', dept: 'Human Resources', acquisitionDate: '2020-01-10' });

  // --- Allocations ---
  // laptop1 -> Raj (active, overdue on purpose)
  const allocLaptop1 = await query(
    `INSERT INTO allocations (asset_id, employee_id, expected_return_date, status) VALUES ($1,$2, now() - interval '3 days', 'ACTIVE') RETURNING *`,
    [laptop1.id, raj.id]
  );
  await query(`UPDATE assets SET status = 'ALLOCATED' WHERE id = $1`, [laptop1.id]);

  // laptop2 -> Lena (active, due soon)
  await query(
    `INSERT INTO allocations (asset_id, employee_id, expected_return_date, status) VALUES ($1,$2, now() + interval '3 days', 'ACTIVE')`,
    [laptop2.id, lena.id]
  );
  await query(`UPDATE assets SET status = 'ALLOCATED' WHERE id = $1`, [laptop2.id]);

  // chair1 -> returned already (history example)
  await query(
    `INSERT INTO allocations (asset_id, employee_id, allocated_date, expected_return_date, actual_return_date, status, return_condition_notes)
     VALUES ($1,$2, now() - interval '60 days', now() - interval '30 days', now() - interval '29 days', 'RETURNED', 'Minor scuff on armrest, otherwise fine')`,
    [chair1.id, sara.id]
  );

  // --- Transfer request example: Raj's laptop1 contested by Sara ---
  await query(
    `INSERT INTO transfer_requests (asset_id, from_allocation_id, requested_by_id, to_employee_id, status, request_notes)
     VALUES ($1,$2,$3,$4,'REQUESTED','Need it temporarily while my ThinkPad is in repair')`,
    [laptop1.id, allocLaptop1.rows[0].id, sara.id, sara.id]
  );

  // --- Bookings ---
  await query(
    `INSERT INTO bookings (asset_id, requested_by_id, start_time, end_time, purpose, status)
     VALUES ($1,$2, now() + interval '1 day', now() + interval '1 day 1 hour', 'Sprint planning', 'UPCOMING')`,
    [roomB2.id, deptHeadEng.id]
  );
  await query(
    `INSERT INTO bookings (asset_id, requested_by_id, start_time, end_time, purpose, status)
     VALUES ($1,$2, now() + interval '2 days', now() + interval '2 days 2 hours', 'Client demo', 'UPCOMING')`,
    [roomA1.id, sara.id]
  );
  await query(
    `INSERT INTO bookings (asset_id, requested_by_id, start_time, end_time, purpose, status)
     VALUES ($1,$2, now() - interval '5 days', now() - interval '5 days' + interval '3 hours', 'Site visit', 'COMPLETED')`,
    [van1.id, tomas.id]
  );

  // --- Maintenance requests (various workflow stages) ---
  await query(
    `INSERT INTO maintenance_requests (asset_id, raised_by_id, issue_description, priority, status)
     VALUES ($1,$2,'Screen flickering intermittently','HIGH','PENDING')`,
    [laptop3.id, sara.id]
  );
  const mReq2 = await query(
    `INSERT INTO maintenance_requests (asset_id, raised_by_id, issue_description, priority, status, approved_by_id, technician_name)
     VALUES ($1,$2,'Paper jam sensor not working','MEDIUM','TECHNICIAN_ASSIGNED',$3,'Jordan - Office Tech') RETURNING *`,
    [printer.id, tomas.id, assetMgr.id]
  );
  await query(`UPDATE assets SET status = 'UNDER_MAINTENANCE' WHERE id = $1`, [printer.id]);
  await query(
    `INSERT INTO maintenance_requests (asset_id, raised_by_id, issue_description, priority, status, approved_by_id, resolution_notes, resolved_at)
     VALUES ($1,$2,'Drill battery not holding charge','LOW','RESOLVED',$3,'Replaced battery pack', now() - interval '10 days')`,
    [drill.id, deptHeadFac.id, assetMgr.id]
  );

  // --- Audit cycle example ---
  const cycle = await query(
    `INSERT INTO audit_cycles (name, scope_department_id, start_date, end_date, status)
     VALUES ('Q3 Engineering Floor Audit',$1, now() - interval '5 days', now() + interval '2 days', 'IN_PROGRESS') RETURNING *`,
    [depts['Engineering'].id]
  );
  await query(`INSERT INTO audit_assignments (audit_cycle_id, auditor_id) VALUES ($1,$2)`, [cycle.rows[0].id, deptHeadEng.id]);
  await query(`INSERT INTO audit_assignments (audit_cycle_id, auditor_id) VALUES ($1,$2)`, [cycle.rows[0].id, assetMgr.id]);
  const engAssets = await query(`SELECT id FROM assets WHERE department_id = $1`, [depts['Engineering'].id]);
  for (const a of engAssets.rows) {
    await query(`INSERT INTO audit_items (audit_cycle_id, asset_id, result) VALUES ($1,$2,'PENDING')`, [cycle.rows[0].id, a.id]);
  }
  // mark one as damaged for a discrepancy example
  if (engAssets.rows.length > 0) {
    await query(`UPDATE audit_items SET result = 'DAMAGED', notes = 'Keyboard keys missing', verified_at = now() WHERE audit_cycle_id = $1 AND asset_id = $2`, [cycle.rows[0].id, engAssets.rows[0].id]);
  }

  // --- Notifications ---
  await query(`INSERT INTO notifications (employee_id, type, message) VALUES ($1,'OVERDUE_RETURN','Your Dell Latitude 5440 return is overdue.')`, [raj.id]);
  await query(`INSERT INTO notifications (employee_id, type, message) VALUES ($1,'TRANSFER_REQUESTED','Sara requested a transfer for AF asset you hold.')`, [raj.id]);
  await query(`INSERT INTO notifications (employee_id, type, message) VALUES ($1,'AUDIT_DISCREPANCY','A damaged item was flagged in Q3 Engineering Floor Audit.')`, [assetMgr.id]);

  console.log('Seed complete.');
  console.log('---------------------------------------------');
  console.log('Demo accounts (all passwords: password123)');
  console.log('  Admin:            admin@assetflow.com');
  console.log('  Asset Manager:    manager@assetflow.com');
  console.log('  Dept Head (Eng):  priya@assetflow.com');
  console.log('  Dept Head (Fac):  daniel@assetflow.com');
  console.log('  Employee:         raj@assetflow.com   (has an overdue allocation + contested transfer)');
  console.log('  Employee:         sara@assetflow.com');
  console.log('  Employee:         tomas@assetflow.com');
  console.log('  Employee:         lena@assetflow.com');
  console.log('---------------------------------------------');

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
