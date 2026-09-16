const { FlatCompat } = require("@eslint/eslintrc");
const prettier = require("eslint-config-prettier");

// eslint-config-next ships in legacy format — FlatCompat bridges it into the
// flat config Next.js and ESLint 9 expect.
const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  {
    ignores: [".next/*", "node_modules", "coverage", "playwright-report", "src/lib/database.types.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "import/prefer-default-export": "off", // we export at end of file with export { }
    },
  },
  // Must be last — disables ESLint rules that conflict with Prettier formatting
  prettier,
];
