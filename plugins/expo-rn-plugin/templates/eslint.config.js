const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");

module.exports = defineConfig([
  {
    ignores: ["dist/*", ".expo", "node_modules"],
  },
  expoConfig,
  {
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "import/prefer-default-export": "off", // we export at end of file with export { }
    },
  },
  // Must be last — disables ESLint rules that conflict with Prettier formatting
  prettier,
]);
