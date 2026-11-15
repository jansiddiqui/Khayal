/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The backend's address for a deployed build (unset in development: Vite proxies /api). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
