// The package ships register-hooks.d.ts, but its exports map does not point types at this subpath.
declare module "import-in-the-middle/register-hooks.mjs" {
  export function register(): void;
  export function supportsSyncHooks(): boolean;
}
