import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
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

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(scriptDir, "..", "..");
  const envPath = resolve(rootDir, ".env");
  const outPath = resolve(scriptDir, "..", ".env.enc");

  const content = readFileSync(envPath, "utf8");
  const password = await askHidden("Vault master password: ");
  if (!password) {
    throw new Error("Master password cannot be empty.");
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`✅ Encrypted .env to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
