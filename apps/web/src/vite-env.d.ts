interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_NOTIFICATIONS_PATH?: string;
  readonly VITE_SEARCH_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
