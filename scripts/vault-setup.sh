#!/usr/bin/env bash
# =============================================================================
# AJKMart — Vault Setup Wizard
#
# Pehli baar:  bash scripts/vault-setup.sh
#   → sab secrets enter karo → ek master password set karo → vault ready
#
# Agli baar:   pnpm --filter @workspace/scripts run decrypt-env
#   → sirf password enter karo → sab secrets set ho jayenge
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_FILE="$ROOT_DIR/scripts/.env.enc"
ENV_FILE="$ROOT_DIR/.env"

B='\033[1m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${G}✓${NC} $*"; }
info() { echo -e "  ${C}→${NC} $*"; }
warn() { echo -e "  ${Y}!${NC} $*"; }

# Visible input
ask() {
  local label="$1" default="${2:-}" val
  if [ -n "$default" ]; then
    read -r -p "$(echo -e "  ${B}${label}${NC} [${default}]: ")" val
    echo "${val:-$default}"
  else
    read -r -p "$(echo -e "  ${B}${label}${NC}: ")" val
    echo "$val"
  fi
}

# Hidden input (for secrets)
ask_secret() {
  local label="$1" val
  read -r -s -p "$(echo -e "  ${B}${label}${NC} (hidden): ")" val
  echo ""
  echo "$val"
}

# Auto-generate a 64-byte hex key
gen_key() { node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))"; }

# Write KEY=VALUE to .env (skips empty values)
wenv() {
  local key="$1" val="$2"
  [ -n "$val" ] && printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

# =============================================================================
clear
echo -e "\n${B}${G}  ╔══════════════════════════════════════════════════╗"
echo    "  ║      AJKMart — Vault Setup Wizard               ║"
echo -e "  ╚══════════════════════════════════════════════════╝${NC}\n"

if [ -f "$VAULT_FILE" ]; then
  warn "Vault already exists: scripts/.env.enc"
  read -r -p "$(echo -e "  ${B}Overwrite karna hai? (y/N):${NC} ")" confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }
fi

rm -f "$ENV_FILE"
touch "$ENV_FILE"

# ── 1. Database ───────────────────────────────────────────────────────────────
echo -e "\n${B}── 1/8  Database ──${NC}"
info "Free options: neon.tech · supabase.com · railway.app"
info "Format: postgresql://user:pass@host:5432/dbname?sslmode=require"
wenv "DATABASE_URL" "$(ask "DATABASE_URL")"

# ── 2. App URL ────────────────────────────────────────────────────────────────
echo -e "\n${B}── 2/8  App URL ──${NC}"
info "Deployed app ka URL (Replit .replit.app ya apna domain)"
APP_URL=$(ask "APP_BASE_URL" "https://yourapp.replit.app")
wenv "APP_BASE_URL"            "$APP_URL"
wenv "FRONTEND_URL"            "$APP_URL"
wenv "CLIENT_URL"              "$APP_URL"
wenv "ADMIN_BASE_URL"          "${APP_URL}/admin"
wenv "ALLOWED_ORIGINS"         "$APP_URL"
wenv "VITE_API_BASE_URL"       "$APP_URL"
wenv "VITE_API_PROXY_TARGET"   "http://127.0.0.1:5000"
wenv "PORT"                    "5000"
wenv "NODE_ENV"                "production"
wenv "JWT_ISSUER"              "ajkmart"
wenv "LOG_LEVEL"               "info"

# ── 3. Admin Account ──────────────────────────────────────────────────────────
echo -e "\n${B}── 3/8  Admin Account (pehla admin) ──${NC}"
wenv "ADMIN_SEED_USERNAME"                "$(ask "Username" "superadmin")"
wenv "ADMIN_SEED_EMAIL"                   "$(ask "Email"    "admin@ajkmart.com")"
wenv "ADMIN_SEED_NAME"                    "$(ask "Full name" "Super Admin")"
wenv "ADMIN_SEED_PASSWORD"                "$(ask_secret "Password (strong banayen)")"
wenv "ADMIN_LEGACY_AUTH_DISABLED"         "false"
wenv "ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN" "60"

# ── 4. JWT Secrets (auto-generate) ───────────────────────────────────────────
echo -e "\n${B}── 4/8  JWT Secrets ──${NC}"
info "Auto-generating 11 cryptographically secure keys..."
wenv "JWT_SECRET"                "$(gen_key)"
wenv "ADMIN_JWT_SECRET"          "$(gen_key)"
wenv "ADMIN_REFRESH_SECRET"      "$(gen_key)"
wenv "ADMIN_SECRET"              "$(gen_key)"
wenv "ADMIN_ACCESS_TOKEN_SECRET" "$(gen_key)"
wenv "ADMIN_REFRESH_TOKEN_SECRET" "$(gen_key)"
wenv "ADMIN_CSRF_SECRET"         "$(gen_key)"
wenv "VENDOR_JWT_SECRET"         "$(gen_key)"
wenv "RIDER_JWT_SECRET"          "$(gen_key)"
wenv "ERROR_REPORT_HMAC_SECRET"  "$(gen_key)"
wenv "ENCRYPTION_MASTER_KEY"     "$(gen_key)"
ok "11 JWT secrets generated"

# ── 5. Redis ─────────────────────────────────────────────────────────────────
echo -e "\n${B}── 5/8  Redis (Rate Limiting) ──${NC}"
info "Free Redis: https://upstash.com → Create Database → Copy redis:// URL"
info "Enter karo ya sirf Enter dabayen skip karne ke liye"
REDIS=$(ask "REDIS_URL (optional, press Enter to skip)")
[ -n "$REDIS" ] && wenv "REDIS_URL" "$REDIS"

# ── 6. File Storage ───────────────────────────────────────────────────────────
echo -e "\n${B}── 6/8  File Storage (Photos/Documents) ──${NC}"
info "Options: Cloudflare R2 (free 10GB) · DigitalOcean Spaces · AWS S3"
info "Enter karo ya sirf Enter dabayen skip karne ke liye (local disk use hogi)"
STORAGE_URL=$(ask "STORAGE_BUCKET_URL (optional, press Enter to skip)")
if [ -n "$STORAGE_URL" ]; then
  wenv "STORAGE_BUCKET_URL"  "$STORAGE_URL"
  wenv "STORAGE_ACCESS_KEY"  "$(ask_secret "STORAGE_ACCESS_KEY")"
  wenv "STORAGE_SECRET_KEY"  "$(ask_secret "STORAGE_SECRET_KEY")"
  wenv "STORAGE_BUCKET_NAME" "$(ask "STORAGE_BUCKET_NAME")"
  wenv "STORAGE_REGION"      "$(ask "STORAGE_REGION" "us-east-1")"
fi

# ── 7. SMS & Email ────────────────────────────────────────────────────────────
echo -e "\n${B}── 7/8  SMS OTP & Email ──${NC}"
info "Twilio (twilio.com) — phone login ke liye. Enter to skip."
TWILIO_SID=$(ask "TWILIO_ACCOUNT_SID (optional)")
if [ -n "$TWILIO_SID" ]; then
  wenv "TWILIO_ACCOUNT_SID"  "$TWILIO_SID"
  wenv "TWILIO_AUTH_TOKEN"   "$(ask_secret "TWILIO_AUTH_TOKEN")"
  wenv "TWILIO_FROM_NUMBER"  "$(ask "TWILIO_FROM_NUMBER (+12025551234 format)")"
fi

info "SendGrid (sendgrid.com) — email OTP ke liye. Enter to skip."
SG=$(ask_secret "SENDGRID_API_KEY (optional, starts with SG.)")
if [ -n "$SG" ]; then
  wenv "SENDGRID_API_KEY" "$SG"
  wenv "SMTP_HOST"        "smtp.sendgrid.net"
fi

# ── 8. Optional APIs ──────────────────────────────────────────────────────────
echo -e "\n${B}── 8/8  Optional APIs ──${NC}"
info "Sab optional hain — Enter dabayen skip karne ke liye"

GEMINI=$(ask_secret "GEMINI_API_KEY (AI features)")
[ -n "$GEMINI" ] && wenv "GEMINI_API_KEY" "$GEMINI"

GMAPS=$(ask_secret "GOOGLE_MAPS_API_KEY")
[ -n "$GMAPS" ] && wenv "GOOGLE_MAPS_API_KEY" "$GMAPS"

FB_ID=$(ask "FIREBASE_PROJECT_ID (push notifications)")
if [ -n "$FB_ID" ]; then
  wenv "FIREBASE_PROJECT_ID"    "$FB_ID"
  wenv "FIREBASE_CLIENT_EMAIL"  "$(ask "FIREBASE_CLIENT_EMAIL")"
  info "FIREBASE_PRIVATE_KEY: -----BEGIN PRIVATE KEY----- se shuru hoti hai"
  info "Poori key ek line mein paste karo (\\n se replace karke)"
  wenv "FIREBASE_PRIVATE_KEY"   "$(ask "FIREBASE_PRIVATE_KEY")"
fi

SENTRY=$(ask "SENTRY_DSN (error tracking, https://sentry.io)")
[ -n "$SENTRY" ] && wenv "SENTRY_DSN" "$SENTRY"

VAPID_PUB=$(ask "VAPID_PUBLIC_KEY (web push notifications)")
if [ -n "$VAPID_PUB" ]; then
  wenv "VAPID_PUBLIC_KEY"    "$VAPID_PUB"
  wenv "VAPID_PRIVATE_KEY"   "$(ask_secret "VAPID_PRIVATE_KEY")"
  wenv "VAPID_CONTACT_EMAIL" "$(ask "VAPID_CONTACT_EMAIL")"
fi

# =============================================================================
echo ""
echo -e "${B}── Encrypting vault ──${NC}"
TOTAL=$(grep -c '=' "$ENV_FILE" || true)
info "$TOTAL variables ready for encryption"
echo ""
warn "Ab ek MASTER PASSWORD choose karo — ise yaad rakhna zaroori hai!"
warn "Ye password kahin secure jagah save karo (password manager recommended)"
warn "Iske bina vault dobara unlock nahi hoga."
echo ""

cd "$ROOT_DIR"
node_modules/.bin/tsx scripts/src/encrypt-env.ts

rm -f "$ENV_FILE"

echo ""
echo -e "${G}${B}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${G}${B}║  Vault ban gayi!  →  scripts/.env.enc                ║${NC}"
echo -e "${G}${B}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
ok "Plain .env delete ho gayi — secrets encrypted hain"
ok "File: scripts/.env.enc"
echo ""
echo -e "${B}Agle steps:${NC}"
echo ""
echo -e "  ${C}1. GitHub mein commit karo:${NC}"
echo -e "     git add scripts/.env.enc"
echo -e "     git commit -m 'chore: add encrypted secrets vault'"
echo -e "     git push"
echo ""
echo -e "  ${C}2. Naye environment mein unlock karne ke liye:${NC}"
echo -e "     pnpm --filter @workspace/scripts run decrypt-env"
echo -e "     (password enter karo → .env ban jayegi → server start karo)"
echo ""
echo -e "  ${C}3. Replit par unlock karne ke liye:${NC}"
echo -e "     Shell mein: pnpm --filter @workspace/scripts run decrypt-env"
echo -e "     Phir: Start application workflow restart karo"
echo ""
