function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set it in apps/web/.env.development or .env.local`);
  }
  return value;
}

export const config = {
  apiBaseUrl: required("VITE_API_BASE_URL", import.meta.env.VITE_API_BASE_URL),
  oidcAuthority: required("VITE_OIDC_AUTHORITY", import.meta.env.VITE_OIDC_AUTHORITY),
  oidcClientId: required("VITE_OIDC_CLIENT_ID", import.meta.env.VITE_OIDC_CLIENT_ID),
} as const;
