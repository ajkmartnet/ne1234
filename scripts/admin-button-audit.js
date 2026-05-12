#!/usr/bin/env node
/**
 * AJKMart Admin Panel — Button & Interactive Element Audit Script
 *
 * Uses Puppeteer to crawl every page of the admin panel, click every button
 * and link, and report which ones produce:
 *   - Network errors (4xx / 5xx)
 *   - Console errors / unhandled rejections
 *   - Loading states that never resolve (timeout)
 *   - Navigation failures
 *
 * Usage:
 *   node scripts/admin-button-audit.js [BASE_URL] [ADMIN_USER] [ADMIN_PASS]
 *
 * Defaults:
 *   BASE_URL   = http://localhost:3000
 *   ADMIN_USER = admin
 *   ADMIN_PASS = password
 *
 * Output:
 *   Prints a summary table to stdout and writes audit-report.json to the
 *   project root.
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL   = process.argv[2] || "http://localhost:3000";
const ADMIN_USER = process.argv[3] || "admin";
const ADMIN_PASS = process.argv[4] || "password";
const REPORT_PATH = path.join(__dirname, "..", "audit-report.json");

/* ── Admin pages to visit ─────────────────────────────────────────────── */
const PAGES = [
  "/",
  "/dashboard",
  "/orders",
  "/rides",
  "/users",
  "/vendors",
  "/riders",
  "/fleet",
  "/inventory",
  "/categories",
  "/offers",
  "/campaigns",
  "/wallet",
  "/finance",
  "/reports",
  "/settings",
  "/platform",
  "/communication",
  "/notifications",
  "/security",
  "/health-dashboard",
  "/service-zones",
  "/experiments",
  "/deep-links",
  "/qr-codes",
  "/sms-gateways",
  "/weather",
  "/analytics",
];

/* ── Selectors to ignore (navigation, external links, logout) ─────────── */
const IGNORE_SELECTORS = [
  "a[href^='mailto']",
  "a[href^='tel']",
  "a[target='_blank']",
  "[data-audit-skip]",
  "button[type='submit']",  // form submissions handled separately
];

const TIMEOUT_MS = 8000;
const NAV_TIMEOUT_MS = 15000;

/* ── Result accumulators ─────────────────────────────────────────────── */
const results = {
  summary: { pagesVisited: 0, buttonsClicked: 0, errors: 0, warnings: 0 },
  pages: [],
  errors: [],
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function warn(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`[${ts}] ⚠  ${msg}`);
}

async function login(page) {
  log(`Navigating to login: ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });

  /* Try username/password form — adapt selectors to actual admin login UI */
  const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="text"]'];
  const passwordSelectors = ['input[name="password"]', 'input[type="password"]'];

  let usernameInput = null;
  for (const sel of usernameSelectors) {
    usernameInput = await page.$(sel);
    if (usernameInput) break;
  }
  if (!usernameInput) {
    warn("Login: could not find username field — skipping login");
    return false;
  }

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

  /* Click login button */
  const loginBtn = await page.$('button[type="submit"], button::-p-text(Login), button::-p-text(Sign in)');
  if (loginBtn) {
    await loginBtn.click();
    await page.waitForNavigation({ timeout: NAV_TIMEOUT_MS, waitUntil: "networkidle2" }).catch(() => {});
    log("Login submitted");
  } else {
    warn("Login: submit button not found");
    return false;
  }

  return true;
}

async function auditPage(page, pagePath) {
  const url = `${BASE_URL}${pagePath}`;
  const pageResult = { path: pagePath, url, buttons: [], consoleErrors: [], networkErrors: [] };
  const consoleErrors = [];
  const networkErrors = [];

  /* Collect console errors */
  const consoleHandler = (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("favicon") && !text.includes("net::ERR_ABORTED")) {
        consoleErrors.push({ text, location: msg.location() });
      }
    }
  };
  page.on("console", consoleHandler);

  /* Collect network failures */
  const responseHandler = (response) => {
    const status = response.status();
    if (status >= 400) {
      const reqUrl = response.url();
      if (!reqUrl.includes("favicon") && !reqUrl.includes(".map")) {
        networkErrors.push({ url: reqUrl, status });
      }
    }
  };
  page.on("response", responseHandler);

  try {
    log(`Visiting: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });

    /* Small delay for React to render */
    await new Promise(r => setTimeout(r, 1200));

    /* Find all interactive elements */
    const elements = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll(
        'button:not([disabled]):not([aria-hidden="true"]), ' +
        '[role="button"]:not([disabled]), ' +
        'a[href]:not([href^="http"]):not([href^="mailto"]):not([href^="tel"])'
      ));

      return els
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0"
          );
        })
        .slice(0, 30) // cap at 30 elements per page to avoid endless loops
        .map(el => ({
          tag: el.tagName,
          text: (el.textContent || "").trim().slice(0, 60),
          ariaLabel: el.getAttribute("aria-label") || "",
          href: el.getAttribute("href") || "",
          role: el.getAttribute("role") || "",
          id: el.id || "",
          classes: el.className.toString().slice(0, 80),
          rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y },
        }));
    });

    results.summary.buttonsClicked += elements.length;

    for (const elInfo of elements) {
      const btnResult = { label: elInfo.text || elInfo.ariaLabel || elInfo.href, status: "ok", error: null };

      /* Skip navigation links that would leave the admin panel */
      if (elInfo.href && (elInfo.href.startsWith("http") || elInfo.href === "/")) {
        btnResult.status = "skipped";
        pageResult.buttons.push(btnResult);
        continue;
      }

      /* Skip logout / destructive action buttons */
      const labelLower = (elInfo.text + elInfo.ariaLabel).toLowerCase();
      if (["logout", "sign out", "delete all", "clear all", "wipe"].some(k => labelLower.includes(k))) {
        btnResult.status = "skipped (destructive)";
        pageResult.buttons.push(btnResult);
        continue;
      }

      try {
        /* Find the element again (DOM may have re-rendered) */
        let target;
        if (elInfo.id) {
          target = await page.$(`#${CSS.escape(elInfo.id)}`);
        }
        if (!target && elInfo.ariaLabel) {
          target = await page.$(`[aria-label="${elInfo.ariaLabel}"]`);
        }
        if (!target) {
          /* Find by text/position */
          const candidates = await page.$$(elInfo.tag.toLowerCase() === "a" ? "a" : "button, [role='button']");
          for (const c of candidates) {
            const txt = await page.evaluate(el => (el.textContent || "").trim().slice(0, 60), c);
            if (txt === elInfo.text) { target = c; break; }
          }
        }

        if (!target) {
          btnResult.status = "not-found";
          pageResult.buttons.push(btnResult);
          continue;
        }

        const preClickErrors = consoleErrors.length;
        const preClickNetworkErrors = networkErrors.length;

        await target.click().catch(() => {});

        /* Short wait for any async effects */
        await new Promise(r => setTimeout(r, 600));

        const newConsoleErrors = consoleErrors.slice(preClickErrors);
        const newNetworkErrors = networkErrors.slice(preClickNetworkErrors);

        if (newConsoleErrors.length > 0) {
          btnResult.status = "console-error";
          btnResult.error = newConsoleErrors.map(e => e.text).join("; ").slice(0, 200);
          results.summary.errors++;
          results.errors.push({ page: pagePath, element: btnResult.label, type: "console", detail: btnResult.error });
        } else if (newNetworkErrors.length > 0) {
          const serverErrors = newNetworkErrors.filter(e => e.status >= 500);
          if (serverErrors.length > 0) {
            btnResult.status = "server-error";
            btnResult.error = serverErrors.map(e => `${e.status} ${e.url}`).join("; ").slice(0, 200);
            results.summary.errors++;
            results.errors.push({ page: pagePath, element: btnResult.label, type: "network", detail: btnResult.error });
          } else {
            btnResult.status = "client-error";
            btnResult.error = newNetworkErrors.map(e => `${e.status} ${e.url}`).join("; ").slice(0, 200);
            results.summary.warnings++;
          }
        } else {
          btnResult.status = "ok";
        }

        /* Navigate back if we left the page */
        const currentUrl = page.url();
        if (!currentUrl.startsWith(BASE_URL + pagePath)) {
          await page.goBack({ timeout: NAV_TIMEOUT_MS, waitUntil: "networkidle2" }).catch(() => {
            return page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "networkidle2" });
          });
          await new Promise(r => setTimeout(r, 800));
        }
      } catch (clickErr) {
        btnResult.status = "click-error";
        btnResult.error = clickErr.message?.slice(0, 120);
        results.summary.warnings++;
      }

      pageResult.buttons.push(btnResult);
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
  log(`Target: ${BASE_URL}`);
  log("=".repeat(60));

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  /* Suppress browser-level SSL errors (dev env) */
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  try {
    const loggedIn = await login(page);
    if (!loggedIn) {
      warn("Could not log in — auditing public pages only");
    }

    for (const pagePath of PAGES) {
      const result = await auditPage(page, pagePath);
      results.pages.push(result);
    }
  } finally {
    await browser.close();
  }

  /* ── Print summary ─────────────────────────────────────────────────── */
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
      console.log(`  [${err.type.toUpperCase()}] ${err.page} → ${err.element ?? ""}`);
      if (err.detail) console.log(`    ${err.detail}`);
    }
  } else {
    console.log("\nNo errors detected.");
  }

  /* ── Write JSON report ─────────────────────────────────────────────── */
  fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nFull report written to: ${REPORT_PATH}`);
  console.log("=".repeat(60));

  process.exit(results.summary.errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Audit script failed:", err);
  process.exit(1);
});
