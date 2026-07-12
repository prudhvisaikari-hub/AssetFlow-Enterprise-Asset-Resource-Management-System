# AssetFlow — Enterprise Asset & Resource Management System

Hackathon build. Stack: **React (frontend, in progress) + Node/Express + PostgreSQL (backend, complete)**.

## What's done so far
- Full PostgreSQL schema (`backend/prisma/schema.sql`) covering departments, employees, asset
  categories, assets, allocations, transfers, bookings, maintenance requests, audit cycles/items,
  notifications, and activity logs.
- Complete Express API (`backend/src/routes/*`) implementing every module from the problem statement:
  auth (signup/login/forgot-reset password, no self-assigned roles), org setup (departments,
  categories, employee directory + role promotion), asset registration/search/lifecycle, allocation
  with the double-allocation conflict rule + transfer workflow, resource booking with overlap
  validation, maintenance approval workflow, audit cycles with discrepancy reports, dashboard KPIs,
  reports/analytics + CSV export, notifications, and activity logs.
- Seed script with realistic demo data and 8 demo accounts across all 4 roles.
- Verified against the spec's own examples (allocation conflict, booking overlap boundary, audit
  discrepancy) — see smoke tests in the conversation.

## Not done yet
- React frontend (all 10 screens) — next step.

## Backend setup

```bash
cd backend
npm install
# Postgres must be running locally; update backend/.env if your credentials differ
psql -U <user> -d <db> -f prisma/schema.sql   # creates all tables
node prisma/seed.js                            # loads demo data
npm run dev                                     # starts API on :4000
```

### Demo accounts (password: `password123` for all)
| Role | Email |
|---|---|
| Admin | admin@assetflow.com |
| Asset Manager | manager@assetflow.com |
| Department Head (Engineering) | priya@assetflow.com |
| Department Head (Facilities) | daniel@assetflow.com |
| Employee (has overdue allocation + contested transfer) | raj@assetflow.com |
| Employee | sara@assetflow.com |
| Employee | tomas@assetflow.com |
| Employee | lena@assetflow.com |

### API base
All routes are under `/api`, e.g. `POST /api/auth/login`, `GET /api/dashboard`, `GET /api/assets`.
Auth uses a Bearer JWT from login/signup in the `Authorization` header.

## Note on tooling
Prisma's binary engine download was blocked by this sandbox's network allowlist, so the backend uses
the plain `pg` driver with hand-written SQL instead of a Prisma-generated client. Functionally
equivalent, just less magic.
