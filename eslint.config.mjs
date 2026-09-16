import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // Build output and generated code, none of it ours to lint. Without this,
    // a local run after a Netlify/Next build reports thousands of errors from
    // minified vendor bundles. CI never sees them (these are gitignored), so
    // ignoring them here is what makes a local `npm run lint` match CI.
    ignores: [
      ".netlify/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // A leading underscore marks a binding that is deliberately unused —
      // typically a positional parameter kept so a signature still documents
      // what it accepts (see regularTimeMinutesFor's isHolidayDay). Anything
      // genuinely dead is deleted rather than renamed.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
];

export default eslintConfig;
