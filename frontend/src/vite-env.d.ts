/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. Empty in development (Vite proxy); the Posit backend content URL in production. */
  readonly VITE_API_URL?: string;
  /** Development only: username injected by the Vite proxy as the Posit identity header. */
  readonly VITE_DEV_USER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
