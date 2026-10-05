// TEMPORARY: same as vite.config.js, plus an alias so the real AppContext module
// resolves to the probe mock (NotificationBell pulls in the whole app store).
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const mock = fileURLToPath(new URL('./src/__mockApp.jsx', import.meta.url))

const mockAppContext = {
  name: 'probe-mock-app-context',
  enforce: 'pre',
  resolveId(source) {
    // `ThemeProvider` sits in the same folder and imports `./AppContext`, which
    // carries no `providers/` prefix for the pattern below to match. Left
    // unaliased it pulls in the real store, and its `useApp` throws because the
    // real AppProvider is not in the probe tree.
    if (source === './AppContext') return mock
    if (/providers[\\/]AppContext(\.jsx)?$/.test(source)) return mock
  },
}

export default defineConfig({
  plugins: [mockAppContext, react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5197 },
})
