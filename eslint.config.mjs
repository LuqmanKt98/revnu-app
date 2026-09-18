import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static assets served verbatim from the prototype (marketing site scripts).
    "public/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    // The three portal apps + contract/word/floor-plan modules are the client-approved prototype
    // UI, ported faithfully. They predate the React Compiler conventions and rely on module-level
    // state by design (see docs/ARCHITECTURE.md). Keep the signal (unused vars, undefined names)
    // but do not fail CI on style rules the prototype never followed.
    files: ["portals/**/*.jsx", "lib/data/store.js", "lib/data/support.js"],
    rules: {
      "react/no-unescaped-entities": "off",
      "react/jsx-no-comment-textnodes": "off",
      "react/jsx-no-undef": ["error", { allowGlobals: true }],
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: { "@typescript-eslint/no-unused-vars": "warn" },
  },
]);

export default eslintConfig;
