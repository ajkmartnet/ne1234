import { createLogger } from "@/utils/logger";
const log = createLogger("[API]");

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (!domain) {
  log.error(
    "FATAL: EXPO_PUBLIC_DOMAIN is not set. All API calls will fail. " +
    "Set this environment variable to your Replit dev domain before building."
  );
}
export const API_BASE = domain ? `https://${domain}/api` : "";

export function unwrapApiResponse<T = Record<string, unknown>>(json: unknown): T {
  // Validate input is an object
  if (!json || typeof json !== "object") {
    log.error("API response is not an object:", json);
    throw new Error(`Invalid API response type: ${typeof json}`);
  }
  
  const obj = json as Record<string, unknown>;
  
  // Validate response structure
  if (obj.success === true) {
    if (!obj.hasOwnProperty("data")) {
      log.error("API response has success=true but no data field");
      throw new Error("API response missing data field");
    }
    return obj.data as T;
  }
  
  // If not successful, log and throw
  if (obj.success === false) {
    log.error("API returned success=false:", obj.error || obj.message);
    throw new Error(`API error: ${obj.error || obj.message || "Unknown error"}`);
  }
  
  // If no success field, return as-is but validate it's an object
  return obj as T;
}
