import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off", 
      "@typescript-eslint/no-unused-vars": "warn"
    }
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ]
    }
  },
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "public/",
      "lib/generated/**",
      "lib/sec-edgar/**",
      "lib/parsers/**",
      "lib/job-queue/**",
      "lib/monitoring/**",
      "lib/logging/**"
    ]
  }
];

export default eslintConfig;
