import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { AppProvider, useApp } from '../features/user/context/AppContext'
import { ThemeProvider } from '../features/user/context/ThemeProvider'
import { setNotificationSoundBlocked } from '../shared/utils/notificationSound'
import Toaster from '../shared/components/ui/Toaster'
import AppShell from '../shared/components/layouts/AppShell'

import Login from '../features/user/auth/pages/Login'
import Register from '../features/user/auth/pages/Register'
import ForgotPassword from '../features/user/auth/pages/ForgotPassword'
import ResetPassword from '../features/user/auth/pages/ResetPassword'
import Onboarding from '../features/user/onboarding/pages/Onboarding'
import Dashboard from '../features/user/dashboard/pages/Dashboard'
import Tasks from '../features/user/tasks/pages/Tasks'
import Projects from '../features/user/projects/pages/Projects'
import CalendarPage from '../features/user/calendar/pages/Calendar'
import Notes from '../features/user/notes/pages/Notes'
import Goals from '../features/user/goals/pages/Goals'
import HabitsPage from '../features/user/habits/pages/Habits'
import AiAssistantPage from '../features/user/ai/pages/AiAssistant'
import NotificationsPage from '../features/user/notifications/pages/Notifications'
import CommunityPage from '../features/user/community/pages/Community'
import ProfilePage from '../features/user/profile/pages/Profile'
import SettingsPage from '../features/user/settings/pages/Settings'
import SupportPage from '../features/user/support/pages/SupportPage'
import AdminDashboard from '../features/admin/pages/Dashboard'
import AdminUsers from '../features/admin/pages/Users'
import AdminTasks from '../features/admin/pages/Tasks'
import AdminProjects from '../features/admin/pages/Projects'
import AdminAiUsage from '../features/admin/pages/AiUsage'
import AdminNotifications from '../features/admin/pages/Notifications'
import AdminReports from '../features/admin/pages/Reports'
import AdminAuditLogs from '../features/admin/pages/AuditLogs'
import AdminSettings from '../features/admin/pages/Settings'
import AdminProfile from '../features/admin/pages/Profile'
import AdminSupport from '../features/admin/pages/Support'
import NotFound from '../shared/pages/NotFound'

function SplashScreen() {
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

function RequireAuth({ children }) {
  const { authState } = useApp()
  if (authState === 'loading') return <SplashScreen />
  if (authState !== 'ready') return <Navigate to="/login" replace />
  return children
}

/**
 * Sends an already-authenticated visitor away from the auth screens.
 *
 * The destination has to be role-aware, and getting this wrong is what sent a
 * freshly signed-in administrator to the user dashboard. Submitting the login
 * form flips authState to 'ready' while the router is still on /login, so this
 * guard re-renders and fires on the same tick the login succeeds. Hardcoding
 * '/' here meant that replace() raced Login.jsx's navigate('/admin') and won,
 * landing the admin on http://localhost:5173/ every single time — which reads
 * exactly like "the role redirect is broken" or "the browser cached the old
 * bundle", neither of which was true.
 */
function RedirectIfSignedIn() {
  const { authState, data } = useApp()
  if (authState !== 'ready') return null
  return <Navigate to={data.user?.role === 'ADMIN' ? '/admin' : '/'} replace />
}

/**
 * Client-side role gate for the console.
 *
 * This is a rendering guard, not the security boundary — every /api/admin route
 * re-checks the role from the database on each request, so a user who forges
 * their way past this just gets 403s and an error state. Its job is to stop an
 * ordinary account rendering a console shell it cannot use, and to send an
 * administrator to the console after a refresh on /admin.
 */
function RequireAdmin({ children }) {
  const { data } = useApp()
  // An empty id is the placeholder from shared.js, meaning bootstrap has not
  // committed the real identity yet. Failing closed is right for access, but
  // redirecting on an unknown state is not: that turned a one-frame loading gap
  // into a permanent wrong destination. Hold the splash until the identity is
  // actually known, then decide.
  if (!data.user?.id) return <SplashScreen />
  if (data.user.role === 'ADMIN') return children
  return <Navigate to="/" replace />
}

/**
 * The signed-in user's own preference interview, which owns the routes below
 * `lg`-independent shells rather than any one of them: without it a brand new
 * account that landed on /community or /admin directly would be able to skip the
 * interview entirely.
 */
function RequireOnboardingComplete({ children }) {
  const { data } = useApp()
  const isAdmin = data.user?.role === 'ADMIN'
  // `isNew` is read before the admin exemption, so an account with no profile
  // crashed here even though the redirect below would have let an admin through
  // anyway. The store guarantees an object; the chain is a backstop only.
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
 * Community's own layout, and deliberately not AppShell.
 *
 * The dashboard shell spends a fixed 16rem sidebar and a 6xl content column on
 * every page, which is right for cards and wrong for a chat: three panels in
 * that budget leaves the message column too narrow to read, and the page-level
 * `pt-24` plus bottom-nav padding stacks a third scroll container on top of the
 * one the composer needs. Community therefore takes the whole viewport and
 * brings its own header, while keeping every guard that used to sit in front of
 * it - authentication and the onboarding interview are unchanged, so no route
 * became reachable that was not before.
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
 * AppProvider sits above BrowserRouter and owns both sound entry points, so it
 * cannot see the current path. The 404 is reached by following a bad or stale
 * link, which is a fresh page load: bootstrap ran and beeped once per unread
 * notification, and the socket stayed connected on top of it, so the one screen
 * with nothing to interact with was the one that made the most noise. Rendering
 * nothing and reporting the path is all this needs to do.
 */
function NotificationSoundRoute() {
  const location = useLocation()

  useEffect(() => {
    setNotificationSoundBlocked(location.pathname === '/404')
    return () => setNotificationSoundBlocked(false)
  }, [location.pathname])

  return null
}

export default function App() {
  return (
    <AppProvider>
      <ThemeProvider>
        <BrowserRouter>
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
                page. Redirecting to `/` keeps one canonical URL, so the Home
                nav item (which is `end`-matched against `/`) still highlights
                and the dashboard's own relative links behave identically. */}
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
            {/* The in-app help centre. A real page rather than a modal because the
                flow has depth — browse, category, issue, problem, solution, request,
                and a history the user returns to later — and a modal cannot be
                linked to or resized. It sits inside AppLayout like every other user
                page, so it inherits the sidebar, header, mobile drawer and the
                RequireAuth + onboarding guards above it with no extra wiring. */}
            <Route path="/support" element={<SupportPage />} />
          </Route>

          {/*
            Community keeps its URL and its place in the nav, but not the shell
            around it: a messaging surface wants the whole viewport and its own
            header, and the dashboard shell cannot give it either without
            squeezing the message column.
          */}
          <Route element={<CommunityLayout />}>
            <Route path="/community" element={<CommunityPage />} />
          </Route>

          {/*
            The console gets its own route group rather than nine more
            siblings above, so the admin pages share the authenticated layout,
            the admin sidebar AppShell picks for /admin/*, and one place to
            add an admin-only guard later. There is deliberately no nav link
            from the user side - the console is entered by URL, and
            RequireAdmin is the one gate in front of it.
          */}
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
        <Toaster />
        </BrowserRouter>
      </ThemeProvider>
    </AppProvider>
  )
}