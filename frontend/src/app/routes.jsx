import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useApp } from '@/app/providers/AppContext'
import { setNotificationSoundBlocked } from '@/utils/notificationSound'
import AppShell from '@/components/layout/AppShell'
import NotFound from '@/app/pages/NotFound'
import { Login, Register, ForgotPassword, ResetPassword } from '@/features/auth'
import CommunityPage from '@/features/community'
import {
  Onboarding,
  Dashboard,
  Tasks,
  Projects,
  CalendarPage,
  Notes,
  Goals,
  HabitsPage,
  AiAssistantPage,
  NotificationsPage,
  ProfilePage,
  SettingsPage,
  SupportPage,
} from '@/features/user'
import {
  AdminDashboard,
  AdminUsers,
  AdminTasks,
  AdminProjects,
  AdminAiUsage,
  AdminNotifications,
  AdminReports,
  AdminAuditLogs,
  AdminSettings,
  AdminProfile,
  AdminSupport,
} from '@/features/admin'

export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Sparkles className="size-5" strokeWidth={2} />
        </div>
        <p className="text-[13px] font-medium text-ink-muted">Loading Taskora…</p>
      </div>
    </div>
  )
}

export function RequireAuth({ children }) {
  const { authState } = useApp()
  if (authState === 'loading') return <SplashScreen />
  if (authState !== 'ready') return <Navigate to="/login" replace />
  return children
}

/**
 * Sends an already-authenticated visitor away from the auth screens.
 *
 * The destination has to be role-aware: submitting the login form flips
 * authState to 'ready' while the router is still on /login, so this guard
 * re-renders and fires on the same tick. Hardcoding '/' raced Login.jsx's
 * navigate('/admin') and landed admins on the user dashboard.
 */
function RedirectIfSignedIn() {
  const { authState, data } = useApp()
  if (authState !== 'ready') return null
  return <Navigate to={data.user?.role === 'ADMIN' ? '/admin' : '/'} replace />
}

/**
 * Client-side role gate for the console. Not the security boundary - every
 * /api/admin route re-checks the role per request - just enough to stop an
 * ordinary account rendering a console shell it cannot use.
 */
export function RequireAdmin({ children }) {
  const { data } = useApp()
  // An empty id is the pre-bootstrap placeholder: hold the splash until the
  // identity is known rather than redirecting on an unknown state.
  if (!data.user?.id) return <SplashScreen />
  if (data.user.role === 'ADMIN') return children
  return <Navigate to="/" replace />
}

/**
 * The signed-in user's own preference interview. Guards everything below it, so
 * a new account cannot reach /community or /admin by typing the URL.
 */
export function RequireOnboardingComplete({ children }) {
  const { data } = useApp()
  const isAdmin = data.user?.role === 'ADMIN'
  if (data.profile?.isNew && !isAdmin) return <Navigate to="/onboarding" replace />
  return children
}

function AppLayout() {
  return (
    <RequireOnboardingComplete>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireOnboardingComplete>
  )
}

/**
 * Community's own layout, deliberately not AppShell: a three-panel chat needs
 * the whole viewport, and the dashboard shell's fixed sidebar and page-level
 * padding squeeze the message column and add a scroll container the composer
 * does not want. The auth and onboarding guards are unchanged.
 */
function CommunityLayout() {
  return (
    <RequireAuth>
      <RequireOnboardingComplete>
        <Outlet />
      </RequireOnboardingComplete>
    </RequireAuth>
  )
}

/**
 * Holds the alert tone on screens that are not part of the app.
 *
 * AppProvider sits above BrowserRouter and owns the sound entry points, so it
 * cannot see the path. /404 is reached by a fresh load, where bootstrap beeps
 * once per unread notification - the one screen with nothing to interact with
 * was the one that made the most noise.
 */
function NotificationSoundRoute() {
  const location = useLocation()

  useEffect(() => {
    setNotificationSoundBlocked(location.pathname === '/404')
    return () => setNotificationSoundBlocked(false)
  }, [location.pathname])

  return null
}

export default function AppRoutes() {
  return (
    <>
      <NotificationSoundRoute />
      <Routes>
        <Route
          path="/login"
          element={
            <>
              <RedirectIfSignedIn />
              <Login />
            </>
          }
        />
        <Route
          path="/register"
          element={
            <>
              <RedirectIfSignedIn />
              <Register />
            </>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <>
              <RedirectIfSignedIn />
              <ForgotPassword />
            </>
          }
        />
        <Route
          path="/reset-password"
          element={
            <>
              <RedirectIfSignedIn />
              <ResetPassword />
            </>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <Onboarding />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          {/* `/dashboard` is an alias people type and bookmark, not a second
              page. Redirecting to `/` keeps one canonical URL. */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/habits" element={<HabitsPage />} />
          <Route path="/ai" element={<AiAssistantPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* A real page rather than a modal: the flow has depth (browse,
              category, issue, problem, solution, request, history) and cannot be
              linked to or resized. Inherits the guards above it. */}
          <Route path="/support" element={<SupportPage />} />
        </Route>

        <Route element={<CommunityLayout />}>
          <Route path="/community" element={<CommunityPage />} />
        </Route>

        {/* The console gets its own route group so the admin pages share the
            authenticated layout and one place to add an admin-only guard. No
            nav link reaches it - RequireAdmin is the only gate. */}
        <Route
          element={
            <RequireAuth>
              <RequireAdmin>
                <AppLayout />
              </RequireAdmin>
            </RequireAuth>
          }
        >
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/tasks" element={<AdminTasks />} />
          <Route path="/admin/projects" element={<AdminProjects />} />
          <Route path="/admin/ai-usage" element={<AdminAiUsage />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/profile" element={<AdminProfile />} />
          <Route path="/admin/support" element={<AdminSupport />} />
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  )
}
