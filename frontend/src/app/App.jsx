import { BrowserRouter } from 'react-router-dom'
import { AppProvider, ThemeProvider } from '@/app/providers'
import Toaster from '@/components/ui/Toaster'
import AppRoutes from '@/app/routes'

export default function App() {
  return (
    <AppProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster />
        </BrowserRouter>
      </ThemeProvider>
    </AppProvider>
  )
}
