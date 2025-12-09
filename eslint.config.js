// eslint.config.js
import parser from "@typescript-eslint/parser"
import plugin from "@typescript-eslint/eslint-plugin"

/**
 * Flat config array consumed by ESLint. Applies the TypeScript plugin/parser to
 * every `.ts` file and enforces a consistent code style.
 *
 * Highlights:
 * - Ensures TypeScript-specific linting without double-reporting `no-unused-vars`.
 * - Prefers double quotes and forbids semicolons to match project style.
 * - Warns on `any` usage so we can gradually add stronger types.
 */
/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": plugin,
    },
    rules: {
      // Turn off core rule to avoid duplicate errors and rely on TS version
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn"],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      semi: ["error", "never"],
      quotes: ["error", "double"],
    },
  },
]
