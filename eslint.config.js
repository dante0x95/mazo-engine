import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import perfectionist from "eslint-plugin-perfectionist";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Ignorados globales ──────────────────────────────────────
  { ignores: ["dist", "coverage", "node_modules", "*.config.js"] },

  // ── Base JS + TS con chequeo de tipos ───────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── Formateo: reemplaza a Prettier ──────────────────────────
  // Ajusta estos valores UNA vez y no los toques más.
  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    braceStyle: "1tbs",
    arrowParens: true,
  }),

  // ── Orden automático de imports (estilo antfu) ──────────────
  {
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-imports": [
        "error",
        {
          type: "natural",
          groups: [
            "builtin", // node:fs, node:path...
            "external", // dependencias de npm
            "internal", // alias tipo @/...
            ["parent", "sibling", "index"], // relativos
            "type", // import type
          ],
          newlinesBetween: 1,
        },
      ],
      "perfectionist/sort-named-imports": ["error", { type: "natural" }],
      "perfectionist/sort-named-exports": ["error", { type: "natural" }],
    },
  },

  // ── Unicorn: buenas prácticas modernas (selección curada) ───
  {
    plugins: { unicorn },
    rules: {
      "unicorn/prefer-node-protocol": "error", // import "node:fs" y no "fs"
      "unicorn/no-for-each": "error", // for...of en vez de .forEach
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/throw-new-error": "error",
      "unicorn/error-message": "error", // Errores siempre con mensaje
      "unicorn/no-useless-promise-resolve-reject": "error",
      "unicorn/catch-error-name": ["error", { name: "error" }],
    },
  },

  // ── Reglas propias del proyecto ─────────────────────────────
  {
    rules: {
      // Promesas: la fuente #1 de bugs silenciosos en Node
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],

      // Tipado
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true },
      ],

      // Higiene general
      "no-console": ["error", { allow: ["error"] }],
      "eqeqeq": ["error", "smart"],
      "prefer-const": "error",
      "no-else-return": "error",
    },
  },

  // ── Tests: reglas relajadas ─────────────────────────────────
  {
    files: ["**/*.test.ts", "tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console": "off",
    },
  },
);