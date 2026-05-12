import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const MONOREPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ENV_FILE = path.join(MONOREPO_ROOT, ".env");
const OUT_FILE = path.join(import.meta.dirname, "..", ".env.enc");

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

async function main() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`❌  No .env file found at: ${ENV_FILE}`);
    console.error("    Create a .env from .env.template and populate it first.");
    process.exit(1);
  }

  const plaintext = fs.readFileSync(ENV_FILE, "utf8");
  const password = await promptPassword("🔑  Enter master password: ");

  if (!password) {
    console.error("❌  Password cannot be empty.");
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();

  const vault = JSON.stringify({
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext,
  });

  fs.writeFileSync(OUT_FILE, vault, "utf8");
  console.log(`✅  Vault written to: ${OUT_FILE}`);
  console.log("    Commit scripts/.env.enc to source control.");
  console.log("    Keep the master password safe — it is never stored.");
}

main().catch((err) => {
  console.error("❌  Encryption failed:", err);
  process.exit(1);
});
