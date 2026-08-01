/// <reference types="vite/client" />

/**
 * plan.md 3.7 uses CSS Modules for component styles. Vite resolves the import
 * at build time; TypeScript needs to be told what the import evaluates to.
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
