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
      // error-reporter.ts files carry /* eslint-disable no-console */ because
      // they monkeypatch console.error and must call the real console internally.
      "no-console": "error",

      // Enforce correct hook dependency arrays to prevent stale closure bugs.
      "react-hooks/exhaustive-deps": "warn",
      // Enforce rules of hooks (call order, no conditionals) — violations are bugs.
      "react-hooks/rules-of-hooks": "error",
    },
  },
);
