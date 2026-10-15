import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import react from "eslint-plugin-react";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";

const sourceFiles = ["**/*.{js,mjs,cjs,jsx}"];
const frontendFiles = ["src/**/*.{js,jsx}"];

export default defineConfig([
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: sourceFiles,
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["server.js", "server/**/*.js", "scripts/**/*.js", "test/**/*.js", "vite.config.js", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: frontendFiles,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    extends: [react.configs.flat.recommended, react.configs.flat["jsx-runtime"]],
    rules: {
      // Components use plain JavaScript without PropTypes or a static type checker.
      "react/prop-types": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: frontendFiles,
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    extends: [jsxA11y.flatConfigs.recommended],
  },
  {
    files: frontendFiles,
    extends: [reactHooks.configs.flat.recommended],
  },
]);
