# NexusOps - Multi-Platform Metrics Dashboard

A modern, comprehensive metrics and analytics dashboard that integrates with VTEX, Mercado Libre, Meta, Google Ads, Kommo CRM, Perfit, and Google Sheets.

## Features

- ✅ Multi-user support with role-based access control
- ✅ Secure credential storage (AES-256 encryption)
- ✅ Multi-platform integrations (7 platforms)
- ✅ Real-time metrics synchronization (every 15-30 minutes)
- ✅ Advanced dashboard with charts and KPIs
- ✅ Objective tracking and alerts
- ✅ Excel export functionality
- ✅ Audit logging

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Neon)
- **Authentication**: NextAuth.js
- **Encryption**: Node.js crypto module

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database

Copy environment template and update with your Neon PostgreSQL URL:

```bash
cp .env.local.example .env.local
```

Then run migrations:

```bash
npx prisma migrate dev --name init
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

- **Register**: http://localhost:3000/register
- **Login**: http://localhost:3000/login
- **Dashboard**: http://localhost:3000/dashboard

## Project Status

🚀 **Phase 1: Core Infrastructure** - ✅ COMPLETED

- Multi-user authentication system
- Role-based access control
- Database schema with Prisma
- Login/Register pages
- Dashboard layout

📝 **Phase 2: Integrations** - IN PROGRESS

- API integrations for VTEX, Mercado Libre, Meta, Google Ads, Kommo CRM, Perfit
- Credential encryption and management
- Sync scheduler (Vercel Cron)

🎯 **Phases 3-6**: See ROADMAP below

## Database Setup

### Prerequisites

- Neon PostgreSQL account (https://console.neon.tech)

### Steps

1. Create Neon project and copy connection string
2. Update `.env.local`:
   ```env
   DATABASE_URL=postgresql://[user]:[password]@[host]/[database]
   ```
3. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@host/database

# NextAuth
NEXTAUTH_SECRET=min-32-character-secret-key
NEXTAUTH_URL=http://localhost:3000

# Encryption
ENCRYPTION_KEY=min-32-character-encryption-key

# Optional: OAuth
GITHUB_ID=
GITHUB_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Roadmap

- [x] PHASE 1: Core Infrastructure (COMPLETED)
- [ ] PHASE 2: Integrations (4-5 weeks)
- [ ] PHASE 3: Dashboard Metrics (2-3 weeks)
- [ ] PHASE 4: Objectives & Alerts (1-2 weeks)
- [ ] PHASE 5: Exports (1 week)
- [ ] PHASE 6: Advanced Features (1-2 weeks)

## Contributing

1. Create feature branch: `git checkout -b feature/name`
2. Commit: `git commit -m "feat: description"`
3. Push: `git push origin feature/name`

## Deployment

Deploy to Vercel:

```bash
git push origin main
```

---

**Built with ❤️ for better metrics management**
