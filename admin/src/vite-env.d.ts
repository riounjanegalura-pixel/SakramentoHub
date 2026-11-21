/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Origin of the parishioner app (no screen in this app needs it any more; kept so existing deploys do not break). */
  readonly VITE_PARISHIONER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
