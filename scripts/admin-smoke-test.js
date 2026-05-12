#!/usr/bin/env node
/**
 * AJKMart Admin Panel Smoke-Test
 * ================================
 * Logs into the admin panel with seed credentials, visits every sidebar nav
 * link, and records any page that returns a network error (4xx/5xx).
 *
 * Prerequisites:
 *   pnpm add -g puppeteer   # or: npm install -g puppeteer
 *   (Puppeteer will auto-download a compatible Chromium)
 *
 * Usage:
 *   ADMIN_URL=http://localhost:3000  \
 *   ADMIN_USER=admin                  \
 *   ADMIN_PASS=admin123               \
 *   node scripts/admin-smoke-test.js
 *
 * Outputs:
 *   scripts/admin-smoke-report.md  — summary of every route tested
 *
 * Environment variables:
 *   ADMIN_URL   — base URL of the admin panel (default: http://localhost:3000)
 *   ADMIN_USER  — admin username             (default: from ADMIN_SEED_USERNAME)
 *   ADMIN_PASS  — admin password             (default: from ADMIN_SEED_PASSWORD)
 *   HEADLESS    — set to "false" to watch the browser (default: "true")
 *   TIMEOUT_MS  — per-page wait in ms        (default: 3000)
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_URL  = process.env.ADMIN_URL  || "http://localhost:3000";
const ADMIN_USER = process.env.ADMIN_USER || process.env.ADMIN_SEED_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_SEED_PASSWORD || "admin123";
const HEADLESS   = process.env.HEADLESS !== "false";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "3000", 10);

const results = [];
const failedResponses = {};

async function run() {
  console.log(`[smoke] Starting admin smoke-test against ${ADMIN_URL}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    if (status >= 400 && url.includes("/api/")) {
      const key = page.url();
      if (!failedResponses[key]) failedResponses[key] = [];
      failedResponses[key].push({ url, status });
    }
  });

  try {
    await page.goto(`${ADMIN_URL}/admin/login`, { waitUntil: "networkidle2", timeout: 15000 });
    console.log("[smoke] Reached login page, logging in...");

    await page.type('input[name="username"], input[placeholder*="sername"], input[type="text"]', ADMIN_USER);
    await page.type('input[name="password"], input[type="password"]', ADMIN_PASS);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});

    const currentUrl = page.url();
    if (currentUrl.includes("login")) {
      console.error("[smoke] Login appears to have failed — still on login page");
      console.error("[smoke] Check ADMIN_USER / ADMIN_PASS and ensure the server is running");
      await browser.close();
      process.exit(1);
    }
    console.log(`[smoke] Logged in — now at ${currentUrl}`);

    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("nav a[href], aside a[href]"));
      return [...new Set(links.map((a) => a.getAttribute("href")).filter(Boolean))];
    });

    console.log(`[smoke] Found ${navLinks.length} nav links to test`);

    for (const href of navLinks) {
      const fullUrl = href.startsWith("http") ? href : `${ADMIN_URL}${href}`;
      if (!fullUrl.startsWith(ADMIN_URL)) continue;

      const start = Date.now();
      let title = "";
      let loadError = null;

      try {
        await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        await new Promise((r) => setTimeout(r, TIMEOUT_MS));
        title = await page.title();
      } catch (e) {
        loadError = e.message;
      }

      const elapsed = Date.now() - start;
      const apiErrors = failedResponses[fullUrl] || [];

      results.push({
        href,
        fullUrl,
        title,
        loadError,
        apiErrors,
        elapsed,
      });

      const status = loadError ? "ERROR" : apiErrors.length > 0 ? "WARN" : "OK";
      console.log(`[smoke] [${status}] ${href} — "${title}" (${elapsed}ms)${apiErrors.length ? ` — ${apiErrors.length} API error(s)` : ""}`);
    }
  } finally {
    await browser.close();
  }

  writeReport();
}

function writeReport() {
  const timestamp = new Date().toISOString();
  const total = results.length;
  const failed = results.filter((r) => r.loadError || r.apiErrors.length > 0);
  const passed = total - failed.length;

  let md = `# AJKMart Admin Smoke-Test Report\n\n`;
  md += `**Generated:** ${timestamp}  \n`;
  md += `**Target:** ${ADMIN_URL}  \n`;
  md += `**Total routes tested:** ${total}  \n`;
  md += `**Passed:** ${passed}  \n`;
  md += `**Failed/Warned:** ${failed.length}  \n\n`;

  if (failed.length > 0) {
    md += `## Issues Found\n\n`;
    for (const r of failed) {
      md += `### \`${r.href}\`\n`;
      if (r.loadError) md += `- **Page load error:** ${r.loadError}\n`;
      for (const e of r.apiErrors) {
        md += `- **API ${e.status}:** \`${e.url}\`\n`;
      }
      md += `\n`;
    }
  }

  md += `## Full Results\n\n`;
  md += `| Route | Title | API Errors | Time (ms) |\n`;
  md += `|-------|-------|-----------|----------|\n`;
  for (const r of results) {
    const status = r.loadError ? "❌" : r.apiErrors.length > 0 ? "⚠️" : "✅";
    const errSummary = r.apiErrors.map((e) => `${e.status}`).join(", ") || "";
    md += `| ${status} \`${r.href}\` | ${r.title || r.loadError || "—"} | ${errSummary} | ${r.elapsed} |\n`;
  }

  const outPath = path.resolve(__dirname, "admin-smoke-report.md");
  fs.writeFileSync(outPath, md, "utf8");
  console.log(`\n[smoke] Report written to ${outPath}`);
  console.log(`[smoke] ${passed}/${total} routes OK, ${failed.length} issue(s) found`);

  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error("[smoke] Fatal error:", err);
  process.exit(1);
});
