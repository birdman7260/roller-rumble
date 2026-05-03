import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginQuery from "@tanstack/eslint-plugin-query";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const typedFiles = ["src/**/*.{ts,tsx}", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"];
const scopeToFiles = (configs, files) =>
  configs.map((config) => ({
    ...config,
    files
  }));

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".vite/**",
      "src/renderer/routeTree.gen.ts"
    ]
  },
  js.configs.recommended,
  ...scopeToFiles(tseslint.configs.strictTypeChecked, typedFiles),
  ...scopeToFiles(tseslint.configs.stylisticTypeChecked, typedFiles),
  {
    ...reactHooks.configs.flat["recommended-latest"],
    files: typedFiles
  },
  ...scopeToFiles(pluginQuery.configs["flat/recommended-strict"], typedFiles),
  eslintConfigPrettier,
  {
    files: typedFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports"
        }
      ],
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true
        }
      ],
      "@typescript-eslint/no-extraneous-class": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        {
          allowConstantLoopConditions: true
        }
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false
        }
      ],
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "error",
      "react-refresh/only-export-components": [
        "error",
        {
          allowConstantExport: true
        }
      ],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: [
      "src/renderer/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
      "vite.config.ts",
      "vitest.config.ts"
    ],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ["src/backend/**/*.ts", "src/electron/**/*.ts", "scripts/**/*.mjs", "drizzle.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["src/renderer/router.tsx"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["src/renderer/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["**/*.test.ts", "src/renderer/test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.vitest
      }
    },
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off"
    }
  }
);
