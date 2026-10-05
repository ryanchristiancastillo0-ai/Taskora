import { Compass, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-card">
        <Compass className="size-7" strokeWidth={2} />
      </div>
      <p className="text-6xl font-extrabold tracking-tight text-primary-container">404</p>
      <h1 className="mt-3 text-xl font-bold text-ink">Page not found</h1>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
        The page you're looking for doesn't exist or was moved.
      </p>
      <Button icon={Home} className="mt-6" onClick={() => navigate('/')}>
        Back to dashboard
      </Button>
    </div>
  )
}