"use strict";
/**
 * AJKMart Admin Panel — Button & Interactive Element Audit Script
 *
 * Launches a headless browser, logs into the admin panel, visits every page
 * derived from navConfig.ts, clicks interactive elements, and reports:
 *   - Network errors (5xx server errors)
 *   - Browser console errors / unhandled rejections
 *   - Navigation failures
 *
 * Usage:
 *   node scripts/admin-button-audit.js
 *
 * Credentials are read from environment variables:
 *   ADMIN_SEED_USERNAME  — admin username (required)
 *   ADMIN_SEED_PASSWORD  — admin password (required)
 *   AUDIT_BASE_URL       — base URL of the admin panel (default: http://localhost:3000)
 *
 * Output:
 *   Prints summary to stdout.
 *   Writes full report to scripts/admin-button-audit-report.json.
 */

const puppeteer = require("puppeteer");
const fs        = require("fs");
const path      = require("path");

const BASE_URL   = process.env.AUDIT_BASE_URL || "http://localhost:3000";
const ADMIN_USER = process.env.ADMIN_SEED_USERNAME;
const ADMIN_PASS = process.env.ADMIN_SEED_PASSWORD;
const REPORT_PATH = path.join(__dirname, "admin-button-audit-report.json");

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error("ERROR: ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD environment variables are required.");
  process.exit(1);
}

/* ── Routes derived from artifacts/admin/src/lib/navConfig.ts ─────────── */
/* Each href is the canonical path as declared in NAV_GROUPS.items[].href  */
const ADMIN_ROUTES = [
  "/dashboard",
  "/orders",
  "/rides",
  "/van",
  "/pharmacy",
  "/parcel",
  "/delivery-access",
  "/users",
  "/riders",
  "/vendors",
  "/kyc",
  "/products",
  "/categories",
  "/reviews",
  "/vendor-inventory-settings",
  "/transactions",
  "/withdrawals",
  "/deposit-requests",
  "/wallet-transfers",
  "/loyalty",
  "/promotions",
  "/promo-codes",
  "/flash-deals",
  "/banners",
  "/popups",
  "/communications",
  "/support-chat",
  "/faq-management",
  "/analytics",
  "/qr-codes",
  "/experiments",
  "/security",
  "/audit-logs",
  "/consent-log",
  "/roles-permissions",
  "/sos-alerts",
  "/health-dashboard",
  "/error-monitor",
  "/live-riders-map",
  "/chat-monitor",
  "/settings",
  "/app-management",
  "/auth-methods",
  "/launch-control",
  "/otp-control",
  "/business-rules",
  "/deep-links",
  "/webhooks",
  "/whatsapp-delivery-log",
];

const NAV_TIMEOUT = 15000;

const results = {
  summary: { pagesVisited: 0, buttonsClicked: 0, errors: 0, warnings: 0 },
  pages: [],
  errors: [],
};

function ts() { return new Date().toISOString().slice(11, 23); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }
function warn(msg) { console.warn(`[${ts()}] ⚠  ${msg}`); }

async function login(page) {
  log(`Navigating to login: ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });

  const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="text"]'];
  const passwordSelectors = ['input[name="password"]', 'input[type="password"]'];

  let usernameInput = null;
  for (const sel of usernameSelectors) {
    usernameInput = await page.$(sel);
    if (usernameInput) break;
  }
  if (!usernameInput) { warn("Login: could not find username field"); return false; }

  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(ADMIN_USER);

  for (const sel of passwordSelectors) {
    const pwInput = await page.$(sel);
    if (pwInput) {
      await pwInput.click({ clickCount: 3 });
      await pwInput.type(ADMIN_PASS);
      break;
    }
  }

  const loginBtn = await page.$('button[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
    await page.waitForNavigation({ timeout: NAV_TIMEOUT, waitUntil: "networkidle2" }).catch(() => {});
    log("Login submitted");
  } else {
    warn("Login: submit button not found");
    return false;
  }
  return true;
}

async function auditPage(page, pagePath) {
  const url = `${BASE_URL}${pagePath}`;
  const pageResult = { path: pagePath, url, buttonsClicked: 0, consoleErrors: [], networkErrors: [] };
  const consoleErrors = [];
  const networkErrors = [];

  const consoleHandler = (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("favicon") && !text.includes("net::ERR_ABORTED")) {
        consoleErrors.push(text);
      }
    }
  };
  const responseHandler = (response) => {
    if (response.status() >= 500) {
      const reqUrl = response.url();
      if (!reqUrl.includes("favicon") && !reqUrl.includes(".map")) {
        networkErrors.push(`${response.status()} ${reqUrl}`);
      }
    }
  };

  page.on("console", consoleHandler);
  page.on("response", responseHandler);

  try {
    log(`Visiting: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
    await new Promise(r => setTimeout(r, 1200));

    const elements = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll(
        'button:not([disabled]):not([aria-hidden="true"]), [role="button"]:not([disabled])'
      ));
      return els
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
            style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        })
        .slice(0, 25)
        .map(el => ({
          text: (el.textContent || "").trim().slice(0, 60),
          ariaLabel: el.getAttribute("aria-label") || "",
          id: el.id || "",
        }));
    });

    results.summary.buttonsClicked += elements.length;
    pageResult.buttonsClicked = elements.length;

    for (const elInfo of elements) {
      const labelLower = (elInfo.text + elInfo.ariaLabel).toLowerCase();
      if (["logout", "sign out", "delete all", "clear all", "wipe"].some(k => labelLower.includes(k))) continue;

      try {
        let target = null;
        if (elInfo.id) target = await page.$(`#${elInfo.id}`).catch(() => null);
        if (!target) {
          const candidates = await page.$$("button, [role='button']");
          for (const c of candidates) {
            const txt = await page.evaluate(el => (el.textContent || "").trim().slice(0, 60), c).catch(() => "");
            if (txt === elInfo.text) { target = c; break; }
          }
        }
        if (!target) continue;

        const preErrors = consoleErrors.length;
        const preNet    = networkErrors.length;

        await target.click().catch(() => {});
        await new Promise(r => setTimeout(r, 500));

        const newConsole = consoleErrors.slice(preErrors);
        const newNet     = networkErrors.slice(preNet);

        if (newConsole.length > 0) {
          results.summary.errors++;
          results.errors.push({ page: pagePath, element: elInfo.text || elInfo.ariaLabel, type: "console", detail: newConsole[0].slice(0, 200) });
        } else if (newNet.length > 0) {
          results.summary.errors++;
          results.errors.push({ page: pagePath, element: elInfo.text || elInfo.ariaLabel, type: "network-5xx", detail: newNet[0].slice(0, 200) });
        }

        const currentUrl = page.url();
        if (!currentUrl.startsWith(BASE_URL + pagePath)) {
          await page.goBack({ timeout: NAV_TIMEOUT, waitUntil: "networkidle2" }).catch(() =>
            page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: "networkidle2" })
          );
          await new Promise(r => setTimeout(r, 600));
        }
      } catch (_e) {
        results.summary.warnings++;
      }
    }

    pageResult.consoleErrors = consoleErrors;
    pageResult.networkErrors = networkErrors;
    results.summary.pagesVisited++;

  } catch (navErr) {
    warn(`Failed to visit ${url}: ${navErr.message}`);
    pageResult.error = navErr.message;
    results.errors.push({ page: pagePath, type: "navigation", detail: navErr.message });
    results.summary.errors++;
  } finally {
    page.off("console", consoleHandler);
    page.off("response", responseHandler);
  }

  return pageResult;
}

async function main() {
  log("=".repeat(60));
  log("AJKMart Admin Panel — Button Audit");
  log(`Target: ${BASE_URL}  User: ${ADMIN_USER}`);
  log("=".repeat(60));

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    const loggedIn = await login(page);
    if (!loggedIn) {
      warn("Could not log in — results may be incomplete");
    }

    for (const route of ADMIN_ROUTES) {
      const result = await auditPage(page, route);
      results.pages.push(result);
    }
  } finally {
    await browser.close();
  }

  console.log("\n" + "=".repeat(60));
  console.log("AUDIT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Pages visited  : ${results.summary.pagesVisited}`);
  console.log(`Buttons tested : ${results.summary.buttonsClicked}`);
  console.log(`Errors found   : ${results.summary.errors}`);
  console.log(`Warnings       : ${results.summary.warnings}`);

  if (results.errors.length > 0) {
    console.log("\nERRORS:");
    for (const err of results.errors) {
      console.log(`  [${err.type.toUpperCase()}] ${err.page} → ${err.element || ""}`);
      if (err.detail) console.log(`    ${err.detail}`);
    }
  } else {
    console.log("\nNo errors detected.");
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nReport written to: ${REPORT_PATH}`);
  console.log("=".repeat(60));

  process.exit(results.summary.errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
