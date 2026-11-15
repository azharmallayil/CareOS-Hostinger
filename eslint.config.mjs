// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- Cross-boundary import guard ---
      // apps/web must not import from apps/api or apps/worker
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/apps/api/*", "*/apps/worker/*"],
              message:
                "apps/web must not import from apps/api or apps/worker. Call the API over HTTP.",
            },
          ],
        },
      ],

      // General quality rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Disable type-aware linting for JS config files
    files: ["*.config.{js,mjs,cjs}", "*.config.*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.storybook/**",
      "**/coverage/**",
      "supabase/functions/**",
    ],
  }
);
