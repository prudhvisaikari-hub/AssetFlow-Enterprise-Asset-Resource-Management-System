-- AssetFlow database schema
-- Plain SQL (no ORM binaries needed — sandbox network blocks Prisma engine downloads)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS activity_logs, notifications, audit_items, audit_assignments, audit_cycles,
  maintenance_requests, bookings, transfer_requests, allocations, assets, asset_categories,
  employees, departments CASCADE;

-- ---------- ENUM TYPES ----------
DO $$ BEGIN
  CREATE TYPE role_enum AS ENUM ('ADMIN','ASSET_MANAGER','DEPARTMENT_HEAD','EMPLOYEE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_enum AS ENUM ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_status_enum AS ENUM ('AVAILABLE','ALLOCATED','RESERVED','UNDER_MAINTENANCE','LOST','RETIRED','DISPOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE allocation_status_enum AS ENUM ('ACTIVE','RETURNED','TRANSFERRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status_enum AS ENUM ('REQUESTED','APPROVED','REJECTED','COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status_enum AS ENUM ('UPCOMING','ONGOING','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_priority_enum AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','TECHNICIAN_ASSIGNED','IN_PROGRESS','RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_cycle_status_enum AS ENUM ('PLANNED','IN_PROGRESS','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_item_result_enum AS ENUM ('PENDING','VERIFIED','MISSING','DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type_enum AS ENUM ('ASSET_ASSIGNED','MAINTENANCE_APPROVED','MAINTENANCE_REJECTED',
    'BOOKING_CONFIRMED','BOOKING_CANCELLED','BOOKING_REMINDER','TRANSFER_REQUESTED','TRANSFER_APPROVED',
    'OVERDUE_RETURN','AUDIT_DISCREPANCY','GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- TABLES ----------

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  head_id UUID,
  parent_id UUID REFERENCES departments(id),
  status status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role role_enum NOT NULL DEFAULT 'EMPLOYEE',
  status status_enum NOT NULL DEFAULT 'ACTIVE',
  department_id UUID REFERENCES departments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE departments ADD CONSTRAINT fk_dept_head FOREIGN KEY (head_id) REFERENCES employees(id);

CREATE TABLE asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  custom_fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES asset_categories(id),
  serial_number TEXT,
  acquisition_date DATE,
  acquisition_cost NUMERIC(12,2),
  condition TEXT,
  location TEXT,
  department_id UUID REFERENCES departments(id),
  photo_url TEXT,
  is_bookable BOOLEAN NOT NULL DEFAULT false,
  status asset_status_enum NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  employee_id UUID REFERENCES employees(id),
  department_id UUID REFERENCES departments(id),
  allocated_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return_date TIMESTAMPTZ,
  actual_return_date TIMESTAMPTZ,
  return_condition_notes TEXT,
  status allocation_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  from_allocation_id UUID REFERENCES allocations(id),
  requested_by_id UUID NOT NULL REFERENCES employees(id),
  to_employee_id UUID REFERENCES employees(id),
  to_department_id UUID REFERENCES departments(id),
  status transfer_status_enum NOT NULL DEFAULT 'REQUESTED',
  approved_by_id UUID REFERENCES employees(id),
  request_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  requested_by_id UUID NOT NULL REFERENCES employees(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  status booking_status_enum NOT NULL DEFAULT 'UPCOMING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  raised_by_id UUID NOT NULL REFERENCES employees(id),
  issue_description TEXT NOT NULL,
  priority maintenance_priority_enum NOT NULL DEFAULT 'MEDIUM',
  photo_url TEXT,
  status maintenance_status_enum NOT NULL DEFAULT 'PENDING',
  approved_by_id UUID REFERENCES employees(id),
  technician_name TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE audit_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope_department_id UUID REFERENCES departments(id),
  scope_location TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status audit_cycle_status_enum NOT NULL DEFAULT 'PLANNED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE audit_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id UUID NOT NULL REFERENCES audit_cycles(id),
  auditor_id UUID NOT NULL REFERENCES employees(id),
  UNIQUE(audit_cycle_id, auditor_id)
);

CREATE TABLE audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id UUID NOT NULL REFERENCES audit_cycles(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  result audit_item_result_enum NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  verified_at TIMESTAMPTZ,
  UNIQUE(audit_cycle_id, asset_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  type notification_type_enum NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- INDEXES ----------
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_department ON assets(department_id);
CREATE INDEX idx_allocations_asset ON allocations(asset_id);
CREATE INDEX idx_allocations_status ON allocations(status);
CREATE INDEX idx_bookings_asset_time ON bookings(asset_id, start_time, end_time);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_notifications_employee ON notifications(employee_id, is_read);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
