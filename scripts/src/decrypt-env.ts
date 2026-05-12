import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function askHidden(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      reject(new Error("Password prompt requires a TTY"));
      return;
    }

    let password = "";
    stdout.write(promptText);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          cleanup();
          resolve(password);
          return;
        }

        if (char === "\u0003") {
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }

        if (char === "\u0008" || char === "\x7f") {
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }

        password += char;
        stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

function decryptPayload(payload: {
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}, password: string): string {
  const salt = Buffer.from(payload.salt, "hex");
  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "hex");

  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const vaultPath = resolve(scriptDir, "..", ".env.enc");
  const rootDir = resolve(scriptDir, "..", "..");
  const envPath = resolve(rootDir, ".env");

  const raw = readFileSync(vaultPath, "utf8");
  const payload = JSON.parse(raw) as {
    salt: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };

  for (let attempt = 1; attempt <= 10; attempt++) {
    const password = await askHidden(`Vault master password (Attempt ${attempt}/10): `);
    try {
      const decrypted = decryptPayload(payload, password);
      const normalized = decrypted.replace(/\r\n/g, "\n").replace(/\n*$/u, "");
      writeFileSync(envPath, `${normalized}\nVAULT_UNLOCKED=1\n`, "utf8");
      console.log(`✅ Decrypted vault to ${envPath}`);
      execSync("pnpm install && pnpm --filter @workspace/db run migrate", {
        stdio: "inherit",
      });
      return;
    } catch {
      if (attempt === 10) {
        console.error("🔒 Too many failed attempts. Setup locked.");
        process.exit(1);
      }
      console.error("Incorrect password. Please try again.");
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
