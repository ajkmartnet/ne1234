import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // All console.* calls are banned — use @workspace/logger instead.
      // error-reporter.ts carries /* eslint-disable no-console */ because it
      // monkeypatches console.error and must call the real console internally.
      "no-console": "error",

      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Logger wrapper file — re-exports from @workspace/logger, no console calls,
    // but excluded so future pass-through helpers aren't blocked by the rule.
    files: ["**/lib/logger.ts"],
    rules: { "no-console": "off" },
  },
);
