# AJKMart — Setup Guide

One-command setup that works on **Replit**, **GitHub Codespaces**, **Ubuntu/Debian VPS**, and **local Mac/Linux**.

---

## Quick Start (any environment)

```bash
# 1. Clone
git clone https://github.com/your-org/ajkmart.git
cd ajkmart

# 2. Run the universal setup script (installs Node 20, pnpm, and all deps)
bash scripts/setup.sh

# 3. Set required secrets (see section below), then start:
PORT=5000 pnpm --filter @workspace/api-server run dev
```

---

## GitHub Codespaces

Open the repo on GitHub → click **Code → Codespaces → Create codespace**.

The `.devcontainer/devcontainer.json` handles everything automatically:
- Installs Node.js 20 and pnpm 10
- Runs `bash scripts/setup.sh`
- Forwards ports 5000, 3000, 3001, 3002, 20716

Set your secrets in **Codespaces → Manage secrets** before creating the codespace.

---

## Replit

1. Import the repo from GitHub (New Repl → Import from GitHub).
2. Add required secrets in the **Secrets** panel (padlock icon in sidebar).
3. Press **Run** — the workflows start automatically.

The `.replit` file is committed in the repo, so all workflows are pre-configured.

---

## Ubuntu / Debian VPS

```bash
# Clone and run setup
git clone https://github.com/your-org/ajkmart.git
cd ajkmart
bash scripts/setup.sh

# Copy and fill the environment file
cp .env.example .env
nano .env   # fill in DATABASE_URL and JWT secrets

# Start in production mode
pnpm build
NODE_ENV=production pnpm start
```

For process management use `pm2` with the included `ecosystem.config.cjs`.

---

## Required Environment Variables

> On **Replit**: add these in the Secrets panel (padlock icon).
> On **VPS / Codespace**: copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | JWT signing key (min 64 chars) |
| `ADMIN_JWT_SECRET` | **Yes** | Admin JWT signing key |
| `ADMIN_ACCESS_TOKEN_SECRET` | **Yes** | Admin access token key |
| `ADMIN_REFRESH_TOKEN_SECRET` | **Yes** | Admin refresh token key |
| `ADMIN_CSRF_SECRET` | **Yes** | Admin CSRF key |
| `VENDOR_JWT_SECRET` | **Yes** | Vendor JWT key |
| `RIDER_JWT_SECRET` | **Yes** | Rider JWT key |
| `ENCRYPTION_MASTER_KEY` | **Yes** | PII encryption key (min 16 chars) |
| `GEMINI_API_KEY` | Optional | AI features |
| `TWILIO_*` | Optional | SMS OTP |
| `SENDGRID_API_KEY` | Optional | Email |
| `FIREBASE_*` | Optional | Push notifications |
| `REDIS_URL` | Optional | Rate limiting (required in production) |
| `STORAGE_BUCKET_URL` | Optional | S3-compatible file storage |

Generate secure JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Why binaries always work (tsx, vite, expo)

The `.npmrc` file includes `public-hoist-pattern[]` entries that force pnpm to
link key CLI tools (`tsx`, `vite`, `expo`, `tsc`, `drizzle-kit`) into the root
`node_modules/.bin/`. This means they are always in PATH after `pnpm install`,
regardless of which workspace package owns them — no manual PATH setup needed.

---

## Monorepo Structure

```
ajkmart/
├── artifacts/
│   ├── api-server/     # Node.js/Express backend (port 5000)
│   ├── admin/          # React + Vite admin panel (port 3000)
│   ├── vendor-app/     # React + Vite vendor portal (port 3001)
│   ├── rider-app/      # React + Vite rider PWA (port 3002)
│   └── ajkmart/        # Expo customer super-app (port 20716)
├── lib/                # Shared workspace libraries
├── scripts/            # Build, setup, and utility scripts
├── .devcontainer/      # GitHub Codespaces config
├── .github/workflows/  # GitHub Actions CI
├── .npmrc              # pnpm hoisting config (do not remove)
└── pnpm-workspace.yaml # Workspace package declarations
```

---

## Starting Individual Apps

```bash
# API Server (required by all frontends)
PORT=5000 pnpm --filter @workspace/api-server run dev

# Admin Panel
PORT=3000 BASE_PATH=/admin/ pnpm --filter @workspace/admin run dev

# Vendor App
PORT=3001 pnpm --filter @workspace/vendor-app run dev

# Rider App
PORT=3002 pnpm --filter @workspace/rider-app run dev

# Customer App (Expo Web)
PORT=20716 pnpm --filter @workspace/ajkmart run dev:web

# Type-check everything
pnpm typecheck

# Production build
pnpm build
```
