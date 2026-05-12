# AJKMart — Setup Guide

This guide covers how to get the project running on a fresh clone, fork, or Codespace checkout.

---

## Overview

AJKMart uses an **encrypted vault** (`scripts/.env.enc`) to store environment secrets safely in source control. The vault is encrypted with AES-256-GCM using a master password that you obtain from the project operator out-of-band.

If you don't have the master password, the API server boots in **dev mode** using a local SQLite database and placeholder JWT secrets — enough to explore the codebase, but with limited features.

---

## Option A — Full Setup (with vault password)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Decrypt the vault

```bash
pnpm --filter @workspace/scripts run decrypt-env
```

You will be prompted for the master password (up to 10 attempts). On success:
- `.env` is written to the monorepo root with all secrets
- `VAULT_UNLOCKED=1` is appended to the file
- `pnpm install` runs automatically
- Database migrations run automatically

> **Where is the master password?**  
> The password is never stored anywhere. Obtain it from the project operator (team lead, DevOps contact, etc.) through a secure channel such as a password manager share or encrypted message.

### 3. Start the server

On Replit — click **Run** or start the **Project** workflow.  
On other environments:

```bash
pnpm --filter @workspace/api-server run dev
```

---

## Option B — Dev Mode (no vault password)

If you don't have the master password, the API server automatically enters dev mode when:
- `VAULT_UNLOCKED` is **not** set, **and**
- `NODE_ENV` is **not** `production` or `staging`

In dev mode:
- A local **SQLite** database (`dev.db`) is used instead of PostgreSQL
- JWT secrets are set to deterministic **placeholder values** (safe for local development only)
- A `[DEV MODE]` banner is printed in the logs at startup

**Limitations in dev mode:**
- No SMS / email / push notification delivery
- No real payment processing
- No admin panel seeded data
- Some PostgreSQL-specific features may not work

To exit dev mode, obtain the vault password and run Option A.

---

## One-Time Vault Creation (operators only)

If you need to create or re-create the encrypted vault:

1. Copy `.env.template` to `.env` at the monorepo root
2. Fill in all real values
3. Run the encryption script:

```bash
pnpm --filter @workspace/scripts run encrypt-env
```

4. Enter a strong master password when prompted
5. Commit the resulting `scripts/.env.enc` to source control
6. **Never commit `.env` itself** — it is in `.gitignore`
7. Distribute the master password to team members through a secure channel

---

## Lockout Behaviour

The `decrypt-env` script allows **10 attempts** before locking out:

```
Attempt 1/10 — Enter master password: ❌ Wrong password
...
Attempt 10/10 — Enter master password: ❌ Wrong password
🔒  Too many failed attempts. Setup locked.
```

**To reset:** simply restart your terminal and run the script again. There is no persistent lockout — the counter resets on each new process.

---

## Replit Secrets vs Vault

On Replit, secrets set in the **Secrets panel** (padlock icon) always take precedence over the vault file. The vault is used to fill gaps — if a secret is already in the Replit Secrets panel, the `.env` value is ignored (`dotenv` uses `override: false`).

**Priority order:**
1. Replit Secrets panel (highest priority)
2. `.env` file (written by `decrypt-env`)
3. Dev-mode placeholder values (lowest priority)

Existing Replit users with all secrets already in the Secrets panel do not need to run the decrypt script.

---

## Environment Variables Reference

See `.env.template` at the monorepo root for a complete list of all required and optional environment variables with placeholder comments.

Key required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing key (64+ hex chars) |
| `ADMIN_JWT_SECRET` | Admin JWT signing key |
| `ENCRYPTION_MASTER_KEY` | AES-256-GCM PII encryption key (min 16 chars) |

Generate strong secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Workflows (Replit)

| Workflow | Purpose |
|---|---|
| **Setup** | Runs `decrypt-env` to unlock the vault |
| **Project** | Starts all services (API, Admin, Vendor, Rider, Customer) |
| **API Server** | API server only (port 5000) |
| **Admin Panel** | Admin dashboard (port 3000) |
| **Vendor App** | Vendor portal (port 3001) |
| **Rider App** | Rider PWA (port 3002) |
| **Customer App** | Customer super-app (port 20716) |
