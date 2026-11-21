import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom'
import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '../components/shared/ProtectedRoute'
import { AdminShell } from '../components/shared/AdminLayout'
import { NotFound } from '../components/shared/NotFound'
import { RouteFallback } from '../components/shared/RouteFallback'
import { RouteError } from '../components/shared/RouteError'

// Every screen is its own chunk, fetched when its route is first visited. The route table, the
// sign-in guard (ProtectedRoute) and the fallback stay in the main chunk: the guard wraps the
// loaded screen, so a logged-out visitor is still sent to /login.
function route(path: string, load: () => Promise<ComponentType>): RouteObject {
  return {
    path,
    hydrateFallbackElement: <RouteFallback />,
    // A stale tab after a redeploy asks for a chunk that no longer exists: offer a reload, not the router's default error page.
    errorElement: <RouteError />,
    lazy: async () => {
      const Screen = await load()
      return { Component: Screen }
    },
  }
}

/** Schedule is no longer a screen: the Dashboard carries the calendar and the day. An old /schedule?date= link lands on the same day there. */
function ScheduleRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/dashboard${search}`} replace />
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  route('/login', async () => (await import('../features/auth/LoginScreen')).LoginScreen),
  route('/forgot-password', async () => (await import('../features/auth/ForgotPasswordScreen')).ForgotPasswordScreen),
  route('/reset-password', async () => (await import('../features/auth/ResetPasswordScreen')).ResetPasswordScreen),
  {
    element: <ProtectedRoute><AdminShell /></ProtectedRoute>,
    errorElement: <RouteError />,
    children: [
    route('/reports', async () => (await import('../features/reports/ReportsScreen')).ReportsScreen),
    route('/settings', async () => (await import('../features/settings/SettingsScreen')).SettingsScreen),
    { path: '/schedule', element: <ScheduleRedirect /> },
    route('/bookings', async () => (await import('../features/bookings/BookingsQueueScreen')).BookingsQueueScreen),
    route('/bookings/:id', async () => (await import('../features/bookings/BookingDetailScreen')).BookingDetailScreen),
    route('/walk-in', async () => (await import('../features/walk-in/WalkInScreen')).WalkInScreen),
    route('/walk-in/:id', async () => (await import('../features/walk-in/WalkInScreen')).WalkInScreen),
    route('/check-in/:reference', async () => (await import('../features/bookings/OpenByReference')).OpenByReference),
    route('/register', async () => (await import('../features/register/RegisterScreen')).RegisterScreen),
    route('/register/:id', async () => (await import('../features/register/RegisterEntryScreen')).RegisterEntryScreen),
    route('/certificate-requests', async () => (await import('../features/certificate-requests/CertificateRequestsScreen')).CertificateRequestsScreen),
    route('/certificate-requests/:id', async () => (await import('../features/certificate-requests/CertificateRequestDetailScreen')).CertificateRequestDetailScreen),
    route('/audit-log', async () => (await import('../features/audit-log/AuditLogScreen')).AuditLogScreen),
    route('/dashboard', async () => (await import('../features/dashboard/DashboardScreen')).DashboardScreen),
    route('/users', async () => (await import('../features/users/StaffUsersScreen')).StaffUsersScreen),
    route('/parish-events', async () => (await import('../features/parish-events/ParishEventsScreen')).ParishEventsScreen),
    ],
  },
  { path: '*', element: <NotFound /> },
])
