import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  MessagesSquare,
  FileText,
  Target,
  Repeat,
  Sparkles,
  Bell,
  Settings,
  Home,
  FolderKanban,
  User,
  Users,
  BarChart3,
  ScrollText,
  LifeBuoy,
  Headset
} from 'lucide-react'

export const TASK_STATUS = {
  TODO: { label: 'To Do', tone: 'slate' },
  IN_PROGRESS: { label: 'In Progress', tone: 'indigo' },
  COMPLETED: { label: 'Done', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
}

export const TASK_STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'COMPLETED']

// Single source of truth for task priority presentation.
// `color` drives the small priority dot only; `message` is the short
// contextual hint shown on hover/focus of a task.
export const PRIORITY = {
  URGENT: {
    label: 'Urgent',
    tone: 'red',
    color: '#B42318',
    message: 'This task must be done as soon as possible.',
  },
  HIGH: {
    label: 'High',
    tone: 'rose',
    color: '#D97706',
    message: 'This task should be completed soon.',
  },
  MEDIUM: {
    label: 'Medium',
    tone: 'amber',
    color: '#2563EB',
    message: 'This task is part of your regular priorities.',
  },
  LOW: {
    label: 'Low',
    tone: 'slate',
    color: '#64748B',
    message: 'This task can be completed when you have time.',
  },
}

export const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

// Resolves a priority value (enum or arbitrary casing) to its config.
// Returns null for unknown/missing values so non-task contexts (e.g. a
// friend-request notification) never get a misleading dot.
export function priorityMeta(priority) {
  if (priority == null) return null
  return PRIORITY[String(priority).toUpperCase()] ?? null
}

export const PROJECT_STATUS = {
  ACTIVE: { label: 'Active', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'slate' },
  ARCHIVED: { label: 'Archived', tone: 'muted' },
}

export const GOAL_STATUS = PROJECT_STATUS

// Two different "status" ideas meet on the admin users page and conflating them
// is the easiest mistake to make there.
//
// ACCOUNT_STATUS is stored (User.status) and is what an admin can change:
// suspend someone, reactivate them. ACTIVITY_STATUS is derived from
// RefreshToken.lastUsedAt by the backend and is read-only: it answers "is this
// person still around" without pretending an admin set it.
export const ACCOUNT_STATUS = {
  ACTIVE: { label: 'Active', tone: 'green' },
  SUSPENDED: { label: 'Suspended', tone: 'rose' },
}

export const ACTIVITY_STATUS = {
  ACTIVE: { label: 'Active', tone: 'green' },
  INVITED: { label: 'Invited', tone: 'amber' },
  INACTIVE: { label: 'Inactive', tone: 'slate' },
}

export const USER_ROLES = [
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
]

// Lookup for a role value, mirroring priorityMeta() above.
//
// USER_ROLES stays a plain array because it is also the source for a <select> of
// role choices, and an array keyed by nothing is what that wants. But anything
// displaying a role - a badge, a sentence - needs the entry for a VALUE, and
// USER_ROLES['ADMIN'] on an array is undefined, not the admin entry. Indexing by
// position instead (USER_ROLES[1]) silently depends on the array staying in that
// order, which is the kind of thing that survives a re-sort until it quietly
// starts labelling the wrong role.
export const USER_ROLE_META = {
  USER: { label: 'User', tone: 'slate' },
  ADMIN: { label: 'Admin', tone: 'indigo' },
}

export function userRoleMeta(role) {
  if (role == null) return null
  return USER_ROLE_META[String(role).toUpperCase()] ?? null
}

// Mirrors the backend NotificationType enum. Used by both the user notification
// centre and the admin system page so one type never renders under two names.
export const NOTIFICATION_TYPES = {
  TASK_DUE: { label: 'Task due', tone: 'amber' },
  TASK_REMINDER: { label: 'Task reminder', tone: 'indigo' },
  PROJECT_UPDATE: { label: 'Project update', tone: 'indigo' },
  AI_SUGGESTION: { label: 'AI suggestion', tone: 'indigo' },
  SYSTEM: { label: 'System', tone: 'slate' },
  FRIEND_REQUEST: { label: 'Friend request', tone: 'green' },
  NEW_MESSAGE: { label: 'New message', tone: 'green' },
  TASK_PATTERN_SUGGESTION: { label: 'Recurring pattern', tone: 'indigo' },

  // Support desk. NEW_USER and NEW_SUPPORT_REQUEST are addressed to every active
  // admin and land in the console's own notification table; SUPPORT_STATUS_CHANGED
  // goes to the user who opened the ticket and appears in their bell. Mirrors the
  // three types SupportService writes — see
  // backend/src/services/support/supportService.js.
  NEW_USER: { label: 'New user', tone: 'green' },
  NEW_SUPPORT_REQUEST: { label: 'Support request', tone: 'amber' },
  SUPPORT_STATUS_CHANGED: { label: 'Support update', tone: 'indigo' },
}

// The audit trail's action vocabulary, keyed by the exact string stored in
// `AuditLog.action` — so it mirrors AUDIT_ACTIONS in
// backend/src/services/audit/auditService.js, which is the only writer.
//
// Deliberately keyed by the stored value rather than by a shortened local alias.
// The console filters on this exact string (it is the `?action=` value), so a key
// that did not match the column would produce a filter that silently returns
// nothing. An action the backend adds and this map does not know still renders,
// as its raw string in a neutral badge — a new event is visible immediately
// rather than appearing as a blank or broken cell.
export const AUDIT_ACTIONS = {
  AUTH_LOGIN_SUCCEEDED: { label: 'Signed in', tone: 'green' },
  // Rose, not red: red is the solid fill reserved for the one destructive
  // confirmation on a page, and a failed sign-in is a warning worth noticing
  // rather than an alarm.
  AUTH_LOGIN_FAILED: { label: 'Sign-in failed', tone: 'rose' },
  AUTH_LOGOUT: { label: 'Signed out', tone: 'slate' },
  AUTH_PASSWORD_RESET_REQUESTED: { label: 'Reset requested', tone: 'amber' },
  AUTH_PASSWORD_RESET_COMPLETED: { label: 'Reset completed', tone: 'green' },
  AUTH_EMAIL_CHANGED: { label: 'Email changed', tone: 'indigo' },
  ADMIN_ROLE_CHANGED: { label: 'Role changed', tone: 'indigo' },
  ADMIN_STATUS_CHANGED: { label: 'Status changed', tone: 'amber' },
  TASK_DELETED: { label: 'Task deleted', tone: 'rose' },
  PROJECT_DELETED: { label: 'Project deleted', tone: 'rose' },
}

// Mirrors AUDIT_ENTITIES in the same file on the backend. Separate from the
// actions above because the console groups by entity, and an entity outlives
// the actions that can be recorded against it.
export const AUDIT_ENTITIES = ['User', 'Task', 'Project']

// Sort options. The backend accepts exactly these two, so a longer list here
// would offer a choice the API rejects with a 400.
export const AUDIT_SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Newest first' },
  { value: 'createdAt_asc', label: 'Oldest first' },
]

/**
 * The human-readable name and badge tone for one action.
 *
 * Falls back to the raw string so an action written by a newer backend still
 * renders as something an admin can read and grep for, instead of undefined.
 */
export function auditActionMeta(action) {
  if (action == null) return { label: 'Unknown', tone: 'muted' }
  return AUDIT_ACTIONS[action] ?? { label: String(action), tone: 'slate' }
}

export const GOAL_CATEGORIES = ['CAREER', 'HEALTH', 'LEARNING', 'PERSONAL']

export const THEME_OPTIONS = ['LIGHT', 'DARK', 'SYSTEM']
export const AI_PROVIDER_OPTIONS = ['GEMINI', 'OPENROUTER']
export const AI_SCOPE_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
]

export const WORK_STYLES = [
  { value: 'LONG_FOCUSED_SESSIONS', label: 'Long focused sessions' },
  { value: 'SHORT_FOCUSED_SESSIONS', label: 'Short focused sessions' },
  { value: 'FLEXIBLE', label: 'Flexible' },
  { value: 'VARIED', label: 'Varied' },
]

export const PLANNING_STYLES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'MINIMALIST', label: 'Minimalist' },
  { value: 'DETAILED', label: 'Detailed' },
]

export const TASK_ORGANIZATIONS = [
  { value: 'BY_PRIORITY', label: 'By priority' },
  { value: 'BY_PROJECT', label: 'By project' },
  { value: 'BY_DEADLINE', label: 'By deadline' },
  { value: 'BY_ENERGY', label: 'By energy' },
]

export const TIME_OF_DAY = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
  { value: 'NIGHT', label: 'Night' },
  { value: 'VARIES', label: 'Varies' },
]

export const BREAK_PREFERENCES = [
  { value: 'FREQUENT_SHORT_BREAKS', label: 'Frequent short breaks' },
  { value: 'LONG_BREAKS', label: 'Long breaks' },
  { value: 'NO_BREAKS', label: 'No breaks' },
]

export const REMINDER_PREFERENCES = [
  { value: 'NONE', label: 'None' },
  { value: 'MINIMAL', label: 'Minimal' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'FREQUENT', label: 'Frequent' },
]

export const DIFFICULTY_LEVELS = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'HIGH', label: 'High' },
]

export const TASK_DETAIL_LEVELS = [
  { value: 'HIGH_LEVEL', label: 'High level' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'GRANULAR', label: 'Granular' },
]

export const AI_RESPONSE_STYLES = [
  { value: 'CONCISE', label: 'Concise' },
  { value: 'DETAILED', label: 'Detailed' },
  { value: 'FRIENDLY', label: 'Friendly' },
  { value: 'DIRECT', label: 'Direct' },
]

export const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/tasks', label: 'My Tasks', icon: ListChecks },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/notes', label: 'Notes', icon: FileText },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/habits', label: 'Habits', icon: Repeat },
    ],
  },
  {
    label: 'AI Suite',
    items: [{ to: '/ai', label: 'AI Assistant', icon: Sparkles, badge: 'PRO' }],
  },
  {
    label: 'Collaboration',
    items: [
      { to: '/community', label: 'Community', icon: MessagesSquare },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: null,
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      // The in-app help centre. Added to NAV_SECTIONS rather than to
      // PROFILE_DRAWER_NAV so the mobile drawer picks it up for free through
      // DRAWER_SECONDARY_NAV below, which is derived from this array — adding an
      // entry here is what stops a new page being unreachable on a phone.
      { to: '/support', label: 'Customer Service', icon: Headset},
    ],
  },
]

// Navigation for the admin console, rendered by features/admin/layout. Kept
// beside NAV_SECTIONS so the two menus can be compared in one place rather than
// hunted for across feature folders.
//
// The console is its own navigation tree: no user destination appears here and
// no admin destination appears in NAV_SECTIONS. The two are reachable only by
// URL, which is what keeps an admin from being able to wander into the console
// by clicking around the user app.
//
// Every entry is a real route declared in app/App.jsx. There is deliberately no
// speculative "Billing" or "Roles" section pointing at a 404.
export const ADMIN_NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/tasks', label: 'Tasks', icon: ListChecks },
      { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
      { to: '/admin/ai-usage', label: 'AI Usage', icon: Sparkles },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
      { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
      // Support triage. Same reasoning as the user-side entry: listed here so
      // ADMIN_DRAWER_SECONDARY_NAV picks it up for the mobile drawer.
      { to: '/admin/support', label: 'Support', icon: Headset },
    ],
  },
     {
       label: 'Account',
       items: [
         { to: '/admin/settings', label: 'Settings', icon: Settings },
         { to: '/admin/profile', label: 'Profile', icon: User },
       ],
     },
   ]

// The five primary destinations on the admin console's mobile bar. Same shape as
// MOBILE_BOTTOM_NAV below: same five slots, same emphasised centre, same single
// shared renderer. `/admin/ai-usage` is the console's counterpart to the user
// app's AI Assistant, so it takes the centre position the way `/ai` does.
//
// The console has no Community page, so Users fills that fifth slot as the other
// page an admin opens daily. Reports is the one route pushed off the bar, into
// the drawer — nine destinations will not fit a 360px bar.
export const ADMIN_MOBILE_NAV = [
  { to: '/admin', label: 'Home', ariaLabel: 'Admin dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/tasks', label: 'Tasks', ariaLabel: 'Admin tasks', icon: ListChecks },
  {
    to: '/admin/ai-usage',
    label: 'AI',
    ariaLabel: 'AI usage',
    icon: Sparkles,
    emphasis: true,
  },
  { to: '/admin/projects', label: 'Projects', ariaLabel: 'Projects', icon: FolderKanban },
  { to: '/admin/users', label: 'Users', ariaLabel: 'User management', icon: Users },
]

// Account-level destinations in the admin drawer. The desktop admin sidebar lists
// Settings and Profile, but the sidebar is hidden below `lg`, and the console's
// own Notifications page replaces the user app's — reaching it via a link to
// /notifications would silently drop an admin out of the console.
export const ADMIN_PROFILE_DRAWER_NAV = [
  { to: '/admin/profile', label: 'Profile', icon: User },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

// Admin routes on neither the bar nor the account group, derived from
// ADMIN_NAV_SECTIONS for the same reason DRAWER_SECONDARY_NAV is: adding a
// console page must not leave it unreachable on a phone.
export const ADMIN_DRAWER_SECONDARY_NAV = ADMIN_NAV_SECTIONS.flatMap(
  (section) => section.items
).filter(
  (item) =>
    !ADMIN_MOBILE_NAV.some((nav) => nav.to === item.to) &&
    !ADMIN_PROFILE_DRAWER_NAV.some((nav) => nav.to === item.to)
)

// The console deliberately has no "Back to Taskora" link. An admin who also
// wants the user app signs in as a user instead, and switching by role inside
// one session made it too easy to read user-facing screens as the console's
// own data. Kept as an empty list rather than deleted so AdminDrawer and
// MobileDrawer keep a single, stable prop shape; MobileDrawer already skips the
// section when it is empty, so the drawer's logout/account rows are unaffected.
export const ADMIN_SWITCH_NAV = []

// The five primary destinations on the mobile bottom bar. Routes are reused
// from the router, never invented. `emphasis` marks the centre item, which is
// drawn as a raised pill so AI reads as the headline feature.
// The visible label is deliberately short ("AI") so five labels fit a 360px
// bar; `ariaLabel` keeps the full name for assistive tech and the tooltip.
export const MOBILE_BOTTOM_NAV = [
  { to: '/', label: 'Home', ariaLabel: 'Home', icon: Home, end: true },
  { to: '/tasks', label: 'Tasks', ariaLabel: 'Tasks', icon: ListChecks },
  {
    to: '/ai',
    label: 'AI',
    ariaLabel: 'AI Assistant',
    icon: Sparkles,
    emphasis: true,
  },
  { to: '/projects', label: 'Projects', ariaLabel: 'Projects', icon: FolderKanban },
  {
    to: '/community',
    label: 'Community',
    ariaLabel: 'Community',
    icon: MessagesSquare,
  },
]

// Account-level destinations that live in the mobile drawer. The desktop
// sidebar already lists Notifications and Settings, but the drawer needs its
// own entries because the sidebar is hidden on mobile.
export const PROFILE_DRAWER_NAV = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Everything in the desktop sidebar that neither the bottom bar nor the drawer
// already covers (Calendar, Notes, Goals, Habits). Derived from NAV_SECTIONS
// rather than restated, so adding a sidebar item cannot leave it stranded on
// mobile.
export const DRAWER_SECONDARY_NAV = NAV_SECTIONS.flatMap((section) => section.items).filter(
  (item) =>
    !MOBILE_BOTTOM_NAV.some((nav) => nav.to === item.to) &&
    !PROFILE_DRAWER_NAV.some((nav) => nav.to === item.to)
)

export const PROJECT_COLORS = [
  '#4D3EC8',
  '#6659E2',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#0EA5E9',
  '#8B5CF6',
  '#64748B',
]