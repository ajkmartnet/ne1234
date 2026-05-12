import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { execSync } from "node:child_process";

const MONOREPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ENV_FILE = path.join(MONOREPO_ROOT, ".env");
const VAULT_FILE = path.join(import.meta.dirname, "..", ".env.enc");

const MAX_ATTEMPTS = 10;

/** In --auto mode the script is non-interactive. It exits 0 immediately if the
 *  environment is already configured (DATABASE_URL or VAULT_UNLOCKED is set),
 *  allowing the Project workflow to proceed without blocking on user input. If
 *  neither is set it prints a reminder and exits 0 so apps boot in dev mode. */
const AUTO_MODE = process.argv.includes("--auto");

function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write(prompt);
    let password = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0003") {
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(0);
        }
        process.stdout.write("\n");
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        rl.close();
        resolve(password);
      } else if (ch === "\u007f") {
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

function tryDecrypt(password: string, vault: {
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}): string | null {
  try {
    const salt = Buffer.from(vault.salt, "hex");
    const key = crypto.scryptSync(password, salt, 32);
    const iv = Buffer.from(vault.iv, "hex");
    const tag = Buffer.from(vault.tag, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(vault.ciphertext, "hex", "utf8");
    plaintext += decipher.final("utf8");
    return plaintext;
  } catch {
    return null;
  }
}

async function main() {
  /* ── Auto mode: used by the Project workflow ────────────────────────────────
     If the environment is already configured (Replit Secrets or previous
     decrypt), skip everything and exit 0 so services can start immediately. */
  if (AUTO_MODE) {
    if (process.env.DATABASE_URL || process.env.VAULT_UNLOCKED) {
      process.stdout.write("[Setup] Environment already configured — skipping vault decrypt.\n");
      process.exit(0);
    }
    if (fs.existsSync(ENV_FILE) && fs.readFileSync(ENV_FILE, "utf8").includes("VAULT_UNLOCKED=1")) {
      process.stdout.write("[Setup] .env already unlocked — skipping vault decrypt.\n");
      process.exit(0);
    }
    process.stdout.write(
      "[Setup] Vault not unlocked and DATABASE_URL not set.\n" +
      "        Run the Setup workflow or `pnpm --filter @workspace/scripts run decrypt-env`\n" +
      "        to unlock. Services will start in dev mode (SQLite, placeholder secrets).\n"
    );
    process.exit(0);
  }

  /* ── Interactive mode ───────────────────────────────────────────────────── */
  if (!fs.existsSync(VAULT_FILE)) {
    console.error(`❌  Vault file not found: ${VAULT_FILE}`);
    console.error("    Run the encrypt-env script first to create it.");
    process.exit(1);
  }

  let vault: { salt: string; iv: string; tag: string; ciphertext: string };
  try {
    vault = JSON.parse(fs.readFileSync(VAULT_FILE, "utf8"));
  } catch {
    console.error("❌  Failed to parse vault file. It may be corrupted.");
    process.exit(1);
  }

  let plaintext: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const password = await promptPassword(`🔑  Attempt ${attempt}/${MAX_ATTEMPTS} — Enter master password: `);

    plaintext = tryDecrypt(password, vault);
    if (plaintext !== null) {
      break;
    }

    if (attempt === MAX_ATTEMPTS) {
      console.error("\n🔒  Too many failed attempts. Setup locked.");
      console.error("    Restart the terminal to try again.");
      process.exit(1);
    }

    console.error("    ❌  Wrong password — try again.");
  }

  if (plaintext === null) {
    process.exit(1);
  }

  const content = plaintext.endsWith("\n") ? plaintext : plaintext + "\n";
  const withVaultFlag = content + "VAULT_UNLOCKED=1\n";

  fs.writeFileSync(ENV_FILE, withVaultFlag, "utf8");
  console.log(`\n✅  Decrypted and written to: ${ENV_FILE}`);
  console.log("    VAULT_UNLOCKED=1 appended — API server will boot in full mode.\n");

  console.log("📦  Running pnpm install…");
  execSync("pnpm install", { stdio: "inherit", cwd: MONOREPO_ROOT });

  console.log("\n🗄️   Running database migrations…");
  execSync("pnpm --filter @workspace/db run migrate", { stdio: "inherit", cwd: MONOREPO_ROOT });

  console.log("\n🚀  Setup complete! Start the server with the Project workflow.");
}

main().catch((err) => {
  console.error("❌  Decryption failed:", err);
  process.exit(1);
});
