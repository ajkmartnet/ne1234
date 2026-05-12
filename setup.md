# Setup Guide — Encrypted Environment Vault

This repository now supports a password-protected `.env.enc` vault for secrets, while preserving Replit Secrets as the primary source of truth.

## 1. One-time vault creation

1. Copy `.env.template` to `.env` at the monorepo root.
2. Fill in every required value with your real secrets.
3. Run:
   ```bash
   pnpm --filter @workspace/scripts run encrypt-env
   ```
4. Enter the master password when prompted.
5. Commit `scripts/.env.enc` to the repo. Do not commit `.env`.

> The encrypted vault file is safe to commit because it contains only AES-256-GCM ciphertext, salt, iv, and auth tag.

## 2. Fresh clone setup

On a fresh clone or fork, run either:

```bash
pnpm --filter @workspace/scripts run decrypt-env
```

or use the Replit `Setup` workflow.

Then enter the same master password created during vault encryption.

## 3. Master password handling

- The vault password is never stored in the repository.
- It must be shared out-of-band with contributors or operators.
- If you lose it, you must recreate `.env` and re-encrypt to a new `.env.enc` file.

## 4. Lockout behavior

- There are 10 total password attempts.
- On the 10th failed attempt, the script prints:
  `🔒 Too many failed attempts. Setup locked.`
- At that point the script exits with code `1`.
- Restarting the terminal or rerunning the script resets the attempt counter.

## 5. Dev mode fallback

If the vault password is not provided and `NODE_ENV` is not `production`, the API server still boots in a local dev fallback mode:

- `artifacts/api-server/src/lib/db.ts` uses local SQLite with `dev.db`.
- Missing JWT secret env vars are substituted with deterministic dev-only placeholder values.
- A clear `[DEV MODE]` banner is printed.

This fallback is intended for local development only.

## 6. Replit Secrets precedence

When both Replit Secrets and `scripts/.env.enc` exist:

- Replit Secrets always take precedence.
- The vault is only used to fill missing values.

## 7. Important files

- `.env.template` — committed template with required variables.
- `scripts/.env.enc` — committed encrypted vault file.
- `scripts/src/encrypt-env.ts` — encrypts `.env` into `.env.enc`.
- `scripts/src/decrypt-env.ts` — decrypts the vault and runs migrations.

## 8. Git ignore note

The repository now explicitly ignores:

- `.env.local`
- `.env.*.local`
- `dev.db`
- `dev.db-shm`
- `dev.db-wal`

and keeps `.env.template` committed with the negation rule.
