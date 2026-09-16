@AGENTS.md

# OWE Payroll Management — Claude Code Guide

## What this repo is
The OWE internal payroll and contractor portal. Two user-facing surfaces built on a single Next.js 15 codebase:
- **Admin console** (`/admin/*`) — HR/admin manage contractors, attendance, payroll runs, time-off approvals, and org settings.
- **Contractor portal** (`/contractor/*`) — Contractors view their own attendance, pay vouchers, time-off, and profile.

Supabase handles auth (email+password + TOTP MFA). Prisma 6 sits in front of a Supabase-hosted PostgreSQL database.

## Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 15.x (App Router) — **see AGENTS.md warning** |
| React | 19.x |
| Language | TypeScript 5 (strict) |
| ORM | Prisma 6 — `prisma/schema.prisma` |
| Auth | Supabase Auth via `@supabase/ssr` |
| Styling | Tailwind CSS v4 (breaking changes from v3 — read the docs) |
| Email | Resend v6 |
| Deploy | Netlify (primary) · Vercel (secondary) |
| Time tracking | Worksnap (Python sync scripts in repo root) |

## Run / build commands
```bash
npm run dev            # local dev server (Next.js)
npm run dev:turbo      # same, with Turbopack (faster HMR)
npm run build          # production build
npm run lint           # ESLint

# Database (all require .env.local to be present):
npm run db:generate    # regenerate Prisma client after schema change
npm run db:migrate     # create + apply a new migration (dev)
npm run db:deploy      # apply pending migrations (CI / prod)
npm run db:studio      # Prisma Studio GUI
npm run db:status      # show migration status
npm run db:reset       # destructive — drops all data, re-runs migrations
```

## Environment secrets
Required in `.env.local` (never commit this file):
```
DATABASE_URL           # pooled connection string (port 6543, pgbouncer)
DIRECT_URL             # direct connection string (port 5432, for migrations)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
SALARY_AES_KEY         # 32-byte hex key for AES-256-GCM salary encryption
```
**Never log, expose, or commit any value from `.env.local`.** Salary/money columns in `PayrollAdjustment` and `ProcessWeeklyPayroll` are AES-256-GCM ciphertext (`enc:v1:…` prefix) — encrypt/decrypt only via `src/lib/salaryCrypto.ts`.

## Database rules
- Schema changes go through `npm run db:migrate` — never hand-edit the database directly.
- `DATABASE_URL` (port 6543, pgbouncer) is for all app queries; `DIRECT_URL` (port 5432) is for migrations only. Never swap them.
- The `profiles` table mirrors `auth.users` — do not delete profile rows without also handling the auth side.

## Architecture notes
- **App Router only** — no Pages Router. All routes live under `src/app/`.
- **Server Actions** (`"use server"`) for mutations; API routes (`src/app/api/`) for external webhooks and Worksnap callbacks.
- **Dark mode** on admin pages: `useAdminTheme()` hook from `src/components/AdminThemeContext.tsx`. Apply dark classes inline with `dark ? "..." : "..."` — do not fight CSS specificity with `!important` overrides in `globals.css`.
- **Role system**: `admin` · `hr` · `manager` · `user` (contractor). See `src/lib/roles.ts` for `normalizeRole`, `PORTAL_PAGES`, `effectivePagesFor`.
- **Salary encryption**: always use `src/lib/salaryCrypto.ts` — never store raw dollar amounts.

## Do not touch
- `prisma/migrations/` — never edit or delete existing migration files.
- `src/lib/salaryCrypto.ts` — changing the encryption scheme breaks all existing stored values.
- Supabase Row Level Security policies — managed in the Supabase dashboard, not in this repo.
- `worksnap_*.py` scripts — owned by the sync pipeline; changes need testing against live Worksnap data.

## Branch / commit conventions
- **Branch from `main`**: `feat/`, `fix/`, `chore/` prefixes.
- **Conventional commits**: `feat(payroll): add deduction line items` · `fix(attendance): correct week boundary off-by-one`
- Do not commit directly to `main`.
- Do not commit `.env.local`, `.env`, or any file matching `.env*`.

## Stop and ask
Stop and ask the user before:
- Running `npm run db:reset` (destroys all data).
- Running `npm run db:deploy` against production.
- Adding or removing Prisma models that touch `profiles`, `payroll_runs`, or `payroll_entries`.
- Changing the salary encryption scheme or key derivation in `salaryCrypto.ts`.
- Sending any email via Resend outside of test/preview environments.
