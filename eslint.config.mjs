import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginQuery from "@tanstack/eslint-plugin-query";
import globals from "globals";
import reactDoctor from "eslint-plugin-react-doctor";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import vitest from "@vitest/eslint-plugin";
import tseslint from "typescript-eslint";

const typedFiles = [
  "apps/desktop/src/**/*.{ts,tsx}",
  "apps/desktop/vite.config.ts",
  "apps/desktop/vitest.config.ts",
  "apps/desktop/drizzle.config.ts",
  "apps/desktop/tsup.electron.config.ts",
  "packages/shared/src/**/*.{ts,tsx}",
  "packages/shared-ui/src/**/*.{ts,tsx}",
  "tools/photo-booth-agent/src/**/*.{ts,tsx}",
  "tools/photo-booth-agent/vite.config.ts",
  "tools/photo-booth-agent/vitest.config.ts"
];
const reactFiles = [
  "apps/desktop/src/renderer/**/*.{ts,tsx}",
  "packages/shared-ui/src/**/*.{ts,tsx}",
  "tools/photo-booth-agent/src/kiosk/**/*.{ts,tsx}"
];
const scopeToFiles = (configs, files) =>
  configs.map((config) => ({
    ...config,
    files
  }));

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "**/dist/**",
      "node_modules/**",
      "coverage/**",
      ".vite/**",
      ".claude/**",
      ".agents/**",
      "apps/desktop/src/renderer/routeTree.gen.ts"
    ]
  },
  js.configs.recommended,
  ...scopeToFiles(tseslint.configs.strictTypeChecked, typedFiles),
  ...scopeToFiles(tseslint.configs.stylisticTypeChecked, typedFiles),
  {
    ...reactHooks.configs.flat["recommended-latest"],
    files: typedFiles
  },
  {
    ...reactDoctor.configs.recommended,
    files: reactFiles
  },
  ...scopeToFiles(pluginQuery.configs["flat/recommended-strict"], typedFiles),
  eslintConfigPrettier,
  {
    files: typedFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: [
          "./apps/desktop/tsconfig.json",
          "./apps/desktop/tsconfig.node.json",
          "./packages/shared/tsconfig.json",
          "./packages/shared-ui/tsconfig.json",
          "./tools/photo-booth-agent/tsconfig.json"
        ],
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
      "apps/desktop/src/renderer/**/*.{ts,tsx}",
      "packages/shared-ui/src/**/*.{ts,tsx}",
      "tools/photo-booth-agent/src/kiosk/**/*.tsx"
    ],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: [
      "apps/desktop/src/backend/**/*.ts",
      "apps/desktop/src/electron/**/*.ts",
      "apps/desktop/scripts/**/*.mjs",
      "apps/desktop/vitest.config.ts",
      "apps/desktop/vite.config.ts",
      "apps/desktop/drizzle.config.ts",
      "apps/desktop/tsup.electron.config.ts",
      "tools/photo-booth-agent/src/**/*.ts",
      "tools/photo-booth-agent/vitest.config.ts",
      "tools/photo-booth-agent/vite.config.ts",
      "scripts/**/*.mjs"
    ],
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
    files: ["tools/photo-booth-agent/src/kiosk/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    },
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["apps/desktop/src/renderer/router.tsx"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["apps/desktop/src/renderer/routes/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["**/*.test.ts", "apps/desktop/src/renderer/test/**/*.ts"],
    plugins: {
      vitest
    },
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
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
      "vitest/unbound-method": "error"
    }
  }
);
