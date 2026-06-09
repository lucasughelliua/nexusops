# NexusOps - Setup & Configuration Guide

## ✅ PHASE 1 COMPLETED: Core Infrastructure

The following has been implemented:

### Authentication & Users
- ✅ User registration with validation
- ✅ Secure password hashing (PBKDF2-SHA512)
- ✅ Email/password login with NextAuth.js
- ✅ JWT session management
- ✅ Protected routes with middleware

### Database & ORM
- ✅ Prisma schema with 8 models:
  - User (with roles: ADMIN, MANAGER, ANALYST, USER)
  - Account (multi-account support)
  - Credential (encrypted API keys)
  - Objective (goal tracking)
  - Metric (metrics storage)
  - SyncLog (audit trail)
  - AuditLog (security logs)
- ✅ PostgreSQL compatibility (Neon)
- ✅ Database indexes for performance

### Security
- ✅ AES-256-GCM encryption for credentials
- ✅ Password hashing with salt
- ✅ JWT-based sessions
- ✅ Environment variable validation
- ✅ Audit logging framework

### UI/Frontend
- ✅ Login page (responsive, styled)
- ✅ Register page (with validation)
- ✅ Dashboard layout with sidebar
- ✅ Navigation system
- ✅ User dropdown with sign out
- ✅ Tailwind CSS configuration

### Project Structure
- ✅ Organized folder structure
- ✅ Type-safe with TypeScript
- ✅ API routes foundation
- ✅ Component structure ready
- ✅ Utils and validators ready

---

## 🔧 CONFIGURATION STEPS

### Step 1: Set Up Neon PostgreSQL Database

**Time: 5 minutes**

1. Go to https://console.neon.tech
2. Sign up or log in
3. Create a new project
4. Copy the connection string (it looks like):
   ```
   postgresql://[user]:[password]@[host]/[database]?sslmode=require
   ```
5. Keep it safe - you'll need it next

### Step 2: Configure Environment Variables

**Time: 5 minutes**

1. In `apps/web/` directory, create `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and update these values:

   ```env
   # Database - PASTE YOUR NEON CONNECTION STRING HERE
   DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require

   # NextAuth - Generate with: openssl rand -base64 32
   NEXTAUTH_SECRET=your-32-character-minimum-secret-key-here
   
   # Encryption - Generate with: openssl rand -base64 24 | tr -d '=' | cut -c1-32
   ENCRYPTION_KEY=your-32-character-minimum-encryption-key-here

   # Your domain (local dev)
   NEXTAUTH_URL=http://localhost:3000

   # Optional: OAuth providers (can skip for now)
   # GITHUB_ID=
   # GITHUB_SECRET=
   # GOOGLE_CLIENT_ID=
   # GOOGLE_CLIENT_SECRET=
   ```

   **⚠️ Important**: 
   - `NEXTAUTH_SECRET` must be at least 32 characters
   - `ENCRYPTION_KEY` must be at least 32 characters
   - Never commit these values - they're in `.gitignore`

### Step 3: Create Database Schema

**Time: 2 minutes**

From the `apps/web/` directory, run:

```bash
npx prisma migrate dev --name init
```

This will:
1. Create all tables in your Neon database
2. Generate Prisma client
3. Seed with any initial data

If successful, you'll see:
```
✔ Generated Prisma Client (x.y.z)
✔ Your database has been successfully migrated
```

### Step 4: Start Development Server

**Time: 1 minute**

```bash
npm run dev
```

You should see:
```
> next dev

  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
```

### Step 5: Test the Application

**Time: 5 minutes**

1. Open http://localhost:3000
2. Click "Sign up" and create an account:
   - Name: Your Name
   - Email: test@example.com
   - Password: SecurePassword123!
3. You'll be redirected to login
4. Log in with your credentials
5. You should see the Dashboard!

---

## 📊 Database Management

### View Database in Prisma Studio

```bash
npx prisma studio
```

This opens a GUI at http://localhost:5555 where you can:
- View all tables
- Create/edit records
- Manage relationships

### Reset Database (Development Only)

⚠️ **This deletes all data!**

```bash
npx prisma migrate reset
```

---

## 🚀 Next Steps (PHASE 2: Integrations)

The foundation is ready! Next, we'll implement:

### Week 1-2: VTEX Integration
- Create VTEX API client
- Test connection endpoint
- Build credential management UI
- Store encrypted credentials

### Week 3-4: Other Platforms
- Mercado Libre OAuth
- Meta Graph API
- Google Ads API
- Kommo CRM API
- Perfit API
- Google Sheets API

### Week 5: Sync System
- Vercel Cron job setup
- Metric storage
- Sync status tracking
- Error handling

---

## 🔐 Security Checklist

Before going to production:

- [ ] Database credentials are secure (use Neon secrets)
- [ ] `NEXTAUTH_SECRET` is 32+ random characters
- [ ] `ENCRYPTION_KEY` is 32+ random characters
- [ ] `.env.local` is in `.gitignore`
- [ ] All API credentials are encrypted in database
- [ ] HTTPS is enabled (automatic on Vercel)
- [ ] Rate limiting is configured
- [ ] Audit logs are working

---

## 🐛 Troubleshooting

### Port 3000 Already in Use

```bash
# On macOS/Linux
lsof -i :3000
kill -9 <PID>

# On Windows (PowerShell)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
```

### Database Connection Error

```
Error: getaddrinfo ENOTFOUND [host]
```

Check:
1. `DATABASE_URL` is copied correctly from Neon
2. Neon project is active
3. Network allows PostgreSQL connections
4. No special characters in password that need escaping

### Prisma Errors

```bash
# Regenerate client
npx prisma generate

# Check database sync
npx prisma migrate status

# Verify schema
npx prisma validate
```

### Authentication Not Working

Check:
1. `NEXTAUTH_SECRET` is set and 32+ characters
2. Session cookie is not blocked
3. Database user exists in Prisma

---

## 📚 Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run lint            # Run ESLint
npm run format          # Format code with Prettier

# Database
npx prisma migrate dev  # Create new migration
npx prisma studio      # Open database GUI
npx prisma db push     # Push schema to DB
npx prisma db pull     # Pull schema from DB

# Utilities
npx prisma generate    # Regenerate client
npx prisma validate    # Validate schema syntax
```

---

## 📞 Support

If you encounter issues:

1. Check the console for error messages
2. Review `.env.local` configuration
3. Check Neon dashboard for database status
4. Review Prisma logs with `DEBUG=prisma:* npm run dev`
5. Check NextAuth logs in browser console

---

## ✨ What's Ready for PHASE 2

- ✅ User authentication system
- ✅ Database schema for all integrations
- ✅ Credential encryption utilities
- ✅ API route structure
- ✅ Environment validation
- ✅ Audit logging framework
- ✅ Deployment configuration (Vercel)

**You're now ready to start building integrations!**

---

**Last Updated**: 2024-06-09  
**Status**: Phase 1 Complete ✅
