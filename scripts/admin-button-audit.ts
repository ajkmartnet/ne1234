/**
 * AJKMart Admin Panel — Button & Interactive Element Audit Script (TypeScript)
 *
 * Launches a headless Chromium browser, logs into the admin panel, visits
 * every page in the sidebar navigation, clicks interactive elements, and
 * reports:
 *   - 5xx network errors triggered by button clicks
 *   - Browser console errors / unhandled promise rejections
 *   - Navigation failures
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx scripts/admin-button-audit.ts
 *
 * Required environment variables:
 *   ADMIN_SEED_USERNAME  — admin username
 *   ADMIN_SEED_PASSWORD  — admin password
 *
 * Optional:
 *   AUDIT_BASE_URL       — base URL (default: http://localhost:3000/admin)
 *   AUDIT_REPORT_PATH    — output JSON path (default: scripts/admin-audit-report.json)
 *   AUDIT_NAV_TIMEOUT_MS — per-page navigation timeout in ms (default: 15000)
 *   AUDIT_CLICK_DELAY_MS — pause after each click in ms (default: 500)
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── Config ───────────────────────────────────────────────────────────────── */
const BASE_URL        = (process.env.AUDIT_BASE_URL       ?? "http://localhost:3000/admin").replace(/\/$/, "");
const ADMIN_USER      = process.env.ADMIN_SEED_USERNAME;
const ADMIN_PASS      = process.env.ADMIN_SEED_PASSWORD;
const REPORT_PATH     = process.env.AUDIT_REPORT_PATH     ?? path.join(__dirname, "admin-audit-report.json");
const NAV_TIMEOUT     = Number(process.env.AUDIT_NAV_TIMEOUT_MS ?? 15_000);
const CLICK_DELAY_MS  = Number(process.env.AUDIT_CLICK_DELAY_MS ?? 500);

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error("ERROR: ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD must be set.");
  process.exit(1);
}

/* ── Route list (derived from artifacts/admin/src/lib/navConfig.ts) ──────── */
const ADMIN_ROUTES: readonly string[] = [
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

/* Buttons containing any of these labels are skipped to prevent destructive side effects */
const SKIP_LABELS = ["logout", "sign out", "delete all", "clear all", "wipe", "reset all", "factory reset"];

/* ── Report types ─────────────────────────────────────────────────────────── */
interface AuditError {
  page: string;
  element: string;
  type: "console" | "network-5xx" | "navigation";
  statusCode?: number;
  endpoint?: string;
  detail: string;
}

interface PageResult {
  path: string;
  url: string;
  buttonsFound: number;
  buttonsClicked: number;
  consoleErrors: string[];
  networkErrors: string[];
  error?: string;
  durationMs: number;
}

interface AuditReport {
  meta: {
    generatedAt: string;
    baseUrl: string;
    adminUser: string;
    navTimeoutMs: number;
    clickDelayMs: number;
  };
  summary: {
    pagesVisited: number;
    pagesErrored: number;
    buttonsFound: number;
    buttonsClicked: number;
    errorsFound: number;
    warnings: number;
  };
  pages: PageResult[];
  errors: AuditError[];
}

/* ── Utilities ────────────────────────────────────────────────────────────── */
function ts(): string {
  return new Date().toISOString().slice(11, 23);
}
function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}
function warn(msg: string): void {
  console.warn(`[${ts()}] ⚠  ${msg}`);
}

/* ── Login ────────────────────────────────────────────────────────────────── */
async function login(page: Page): Promise<boolean> {
  log(`Navigating to login page: ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });

  const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="text"]'];
  const passwordSelectors = ['input[name="password"]', 'input[type="password"]'];

  let usernameInput = null;
  for (const sel of usernameSelectors) {
    usernameInput = await page.$(sel);
    if (usernameInput) break;
  }
  if (!usernameInput) {
    warn("Login: could not find username field");
    return false;
  }

  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(ADMIN_USER!);

  for (const sel of passwordSelectors) {
    const pwInput = await page.$(sel);
    if (pwInput) {
      await pwInput.click({ clickCount: 3 });
      await pwInput.type(ADMIN_PASS!);
      break;
    }
  }

  const loginBtn = await page.$('button[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
    await page
      .waitForNavigation({ timeout: NAV_TIMEOUT, waitUntil: "networkidle2" })
      .catch(() => {});
    log("Login submitted");
  } else {
    warn("Login: submit button not found");
    return false;
  }

  return true;
}

/* ── Single-page audit ────────────────────────────────────────────────────── */
async function auditPage(
  page: Page,
  pagePath: string,
  report: AuditReport,
): Promise<PageResult> {
  const url = `${BASE_URL}${pagePath}`;
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  let buttonsFound = 0;
  let buttonsClicked = 0;
  const start = Date.now();

  const consoleHandler = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("favicon") && !text.includes("net::ERR_ABORTED")) {
        consoleErrors.push(text);
      }
    }
  };

  const responseHandler = (response: {
    status(): number;
    url(): string;
  }) => {
    const status = response.status();
    if (status >= 500) {
      const reqUrl = response.url();
      if (!reqUrl.includes("favicon") && !reqUrl.includes(".map")) {
        networkErrors.push(`${status} ${reqUrl}`);
      }
    }
  };

  page.on("console", consoleHandler as Parameters<typeof page.on>[1]);
  page.on("response", responseHandler as Parameters<typeof page.on>[1]);

  let pageError: string | undefined;
  try {
    log(`Visiting: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT });
    await new Promise(r => setTimeout(r, 1_200));

    interface ElementInfo {
      text: string;
      ariaLabel: string;
      id: string;
    }

    const elements: ElementInfo[] = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([aria-hidden="true"]), [role="button"]:not([disabled])',
        ),
      );
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
        .slice(0, 30)
        .map(el => ({
          text: (el.textContent ?? "").trim().slice(0, 80),
          ariaLabel: el.getAttribute("aria-label") ?? "",
          id: el.id ?? "",
        }));
    });

    buttonsFound = elements.length;
    report.summary.buttonsFound += buttonsFound;

    for (const elInfo of elements) {
      const labelLower = (elInfo.text + elInfo.ariaLabel).toLowerCase();
      if (SKIP_LABELS.some(k => labelLower.includes(k))) continue;

      try {
        let target = null;
        if (elInfo.id) {
          target = await page.$(`#${CSS.escape(elInfo.id)}`).catch(() => null);
        }
        if (!target) {
          const candidates = await page.$$("button, [role='button']");
          for (const c of candidates) {
            const txt = await page
              .evaluate(
                (el: HTMLElement) => (el.textContent ?? "").trim().slice(0, 80),
                c,
              )
              .catch(() => "");
            if (txt === elInfo.text) {
              target = c;
              break;
            }
          }
        }
        if (!target) continue;

        const preConsole = consoleErrors.length;
        const preNet = networkErrors.length;

        await target.click().catch(() => {});
        await new Promise(r => setTimeout(r, CLICK_DELAY_MS));

        const newConsole = consoleErrors.slice(preConsole);
        const newNet = networkErrors.slice(preNet);

        if (newNet.length > 0) {
          report.summary.errorsFound++;
          const raw = newNet[0];
          const [statusStr, ...urlParts] = raw.split(" ");
          report.errors.push({
            page: pagePath,
            element: elInfo.text || elInfo.ariaLabel || "(unlabelled)",
            type: "network-5xx",
            statusCode: Number(statusStr),
            endpoint: urlParts.join(" ").replace(/^https?:\/\/[^/]+/, ""),
            detail: raw.slice(0, 300),
          });
        } else if (newConsole.length > 0) {
          report.summary.errorsFound++;
          report.errors.push({
            page: pagePath,
            element: elInfo.text || elInfo.ariaLabel || "(unlabelled)",
            type: "console",
            detail: newConsole[0].slice(0, 300),
          });
        }

        buttonsClicked++;
        report.summary.buttonsClicked++;

        /* Restore page if a click navigated away */
        const currentUrl = page.url();
        if (!currentUrl.startsWith(`${BASE_URL}${pagePath}`)) {
          await page
            .goBack({ timeout: NAV_TIMEOUT, waitUntil: "networkidle2" })
            .catch(() =>
              page.goto(url, { timeout: NAV_TIMEOUT, waitUntil: "networkidle2" }),
            );
          await new Promise(r => setTimeout(r, 600));
        }
      } catch {
        report.summary.warnings++;
      }
    }
  } catch (navErr) {
    const msg = navErr instanceof Error ? navErr.message : String(navErr);
    warn(`Failed to visit ${url}: ${msg}`);
    pageError = msg;
    report.errors.push({ page: pagePath, element: "", type: "navigation", detail: msg });
    report.summary.errorsFound++;
    report.summary.pagesErrored++;
  } finally {
    page.off("console", consoleHandler as Parameters<typeof page.on>[1]);
    page.off("response", responseHandler as Parameters<typeof page.on>[1]);
  }

  report.summary.pagesVisited++;

  return {
    path: pagePath,
    url,
    buttonsFound,
    buttonsClicked,
    consoleErrors,
    networkErrors,
    error: pageError,
    durationMs: Date.now() - start,
  };
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
async function main(): Promise<void> {
  const report: AuditReport = {
    meta: {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      adminUser: ADMIN_USER!,
      navTimeoutMs: NAV_TIMEOUT,
      clickDelayMs: CLICK_DELAY_MS,
    },
    summary: {
      pagesVisited: 0,
      pagesErrored: 0,
      buttonsFound: 0,
      buttonsClicked: 0,
      errorsFound: 0,
      warnings: 0,
    },
    pages: [],
    errors: [],
  };

  log("=".repeat(64));
  log("AJKMart Admin Panel — Button & Interactive Element Audit");
  log(`Target : ${BASE_URL}`);
  log(`User   : ${ADMIN_USER}`);
  log(`Pages  : ${ADMIN_ROUTES.length}`);
  log("=".repeat(64));

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const loggedIn = await login(page);
    if (!loggedIn) {
      warn("Could not log in — page results may be incomplete (auth redirects).");
    }

    for (const route of ADMIN_ROUTES) {
      const result = await auditPage(page, route, report);
      report.pages.push(result);
      log(
        `  [${result.buttonsClicked}/${result.buttonsFound} clicked]` +
        ` ${result.networkErrors.length} net-5xx` +
        ` ${result.consoleErrors.length} console-err` +
        ` — ${route} (${result.durationMs}ms)`,
      );
    }
  } finally {
    await browser?.close();
  }

  /* ── Print summary ─────────────────────────────────────────────────────── */
  console.log("\n" + "=".repeat(64));
  console.log("AUDIT SUMMARY");
  console.log("=".repeat(64));
  console.log(`Pages visited  : ${report.summary.pagesVisited} / ${ADMIN_ROUTES.length}`);
  console.log(`Pages errored  : ${report.summary.pagesErrored}`);
  console.log(`Buttons found  : ${report.summary.buttonsFound}`);
  console.log(`Buttons clicked: ${report.summary.buttonsClicked}`);
  console.log(`Errors found   : ${report.summary.errorsFound}`);
  console.log(`Warnings       : ${report.summary.warnings}`);

  if (report.errors.length > 0) {
    console.log("\nERRORS:");
    for (const err of report.errors) {
      const label = err.element ? ` → "${err.element}"` : "";
      console.log(`  [${err.type.toUpperCase()}] ${err.page}${label}`);
      if (err.statusCode) console.log(`    HTTP ${err.statusCode}: ${err.endpoint ?? ""}`);
      else if (err.detail) console.log(`    ${err.detail.slice(0, 120)}`);
    }
  } else {
    console.log("\nNo errors detected.");
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport saved to: ${REPORT_PATH}`);
  console.log("=".repeat(64));

  process.exit(report.summary.errorsFound > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Audit script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
