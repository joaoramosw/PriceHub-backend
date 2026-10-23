interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ENABLE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
