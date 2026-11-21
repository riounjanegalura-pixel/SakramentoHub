import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { NotFound } from '../components/shared/NotFound'
import type { RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '../components/shared/ProtectedRoute'
import { Adaptive } from '../components/shared/Adaptive'
import { RouteFallback } from '../components/shared/RouteFallback'
import { RouteError } from '../components/shared/RouteError'
import { RootLayout } from '../components/shared/RootLayout'

// Every screen is its own chunk, fetched when its route is first visited. The route table, the
// sign-in guard (ProtectedRoute), Adaptive and the fallback stay in the main chunk. A loader
// returns a function that builds the page from the modules it imported; `guard` says how the
// page is wrapped:
//  - public:  as is (reached before there is a session, or by someone with no account)
//  - protect: ProtectedRoute, so logged-out visitors go to /login instead of a blank page
//    (see components/shared/ProtectedRoute.tsx)
//  - desk:    ProtectedRoute, then DeskGuard (staff/admin on the live server)
type Page = () => ReactNode
type Guard = 'public' | 'protect' | 'desk'

function route(path: string, guard: Guard, load: () => Promise<Page>): RouteObject {
  return {
    path,
    hydrateFallbackElement: <RouteFallback />,
    // A stale tab after a redeploy asks for a chunk that no longer exists: offer a reload, not the router's default error page.
    errorElement: <RouteError />,
    lazy: async () => {
      const page = await load()
      if (guard === 'desk') {
        const { DeskGuard } = await import('../features/desk/DeskGuard')
        return { Component: () => <ProtectedRoute><DeskGuard>{page()}</DeskGuard></ProtectedRoute> }
      }
      if (guard === 'protect') return { Component: () => <ProtectedRoute>{page()}</ProtectedRoute> }
      return { Component: () => <>{page()}</> }
    },
  }
}

// Settings sub-pages: the phone screen as is; on a desktop the same screen inside the Settings sub-menu.
async function settingsPage(screen: ReactNode): Promise<Page> {
  const { WebSettings } = await import('../web/WebSettings')
  return () => <Adaptive mobile={screen} desktop={<WebSettings>{screen}</WebSettings>} />
}

// The screens, in match order. They all render inside one pathless layout route (RootLayout), which
// stays mounted between routes: the phone bottom bar, the skip link and the route announcer live there.
const screens: RouteObject[] = [
  route('/', 'public', async () => {
    const { OnboardingCarousel } = await import('../features/onboarding/OnboardingCarousel')
    // The slides are a phone pattern ("from your phone", one narrow column). A desktop visitor lands on the
    // sign-in page, whose brand panel already carries the pitch and links to registration.
    return () => <Adaptive mobile={<OnboardingCarousel />} desktop={<Navigate to="/login" replace />} />
  }),
  route('/login', 'public', async () => {
    const [{ LoginScreen }, { WebAuthSplit }] = await Promise.all([import('../features/auth/LoginScreen'), import('../web/WebAuthSplit')])
    return () => <Adaptive mobile={<LoginScreen />} desktop={<WebAuthSplit><LoginScreen /></WebAuthSplit>} />
  }),
  route('/register', 'public', async () => {
    const [{ RegisterWizard }, { WebAuthSplit }] = await Promise.all([import('../features/auth/RegisterWizard'), import('../web/WebAuthSplit')])
    return () => <Adaptive mobile={<RegisterWizard />} desktop={<WebAuthSplit><RegisterWizard /></WebAuthSplit>} />
  }),
  // Where PayMongo returns a donor after GCash checkout. Public: a donor needs no account.
  route('/donate/qr', 'public', async () => {
    const { DonateQrScreen } = await import('../features/donate/DonateQrScreen')
    return () => <DonateQrScreen />
  }),
  route('/donate/thanks', 'public', async () => {
    const { DonateResultScreen } = await import('../features/donate/DonateResultScreen')
    return () => <DonateResultScreen outcome="thanks" />
  }),
  route('/donate/cancelled', 'public', async () => {
    const { DonateResultScreen } = await import('../features/donate/DonateResultScreen')
    return () => <DonateResultScreen outcome="cancelled" />
  }),
  // Unprotected: the registration wizard links here before the user has an
  // account at all, so it can't sit behind ProtectedRoute like /about, /help.
  route('/privacy', 'public', async () => {
    const { PrivacyNoticeScreen } = await import('../features/settings/PrivacyNoticeScreen')
    return () => <PrivacyNoticeScreen />
  }),
  // Unprotected for the same reason as /login/register: reached by a logged-out
  // visitor (forgot-password) or a fresh registrant clicking an emailed link
  // (verify-email) before there's a session to protect.
  // Public: anyone holding a certificate (an employer, a receiving parish) checks it without an account.
  ...['/verify', '/verify/:number/:code'].map((path) =>
    route(path, 'public', async () => {
      const [{ VerifyScreen }, { WebFrame }] = await Promise.all([import('../features/verify/VerifyScreen'), import('../web/WebFrame')])
      return () => <Adaptive mobile={<VerifyScreen />} desktop={<WebFrame width="max-w-2xl"><VerifyScreen /></WebFrame>} />
    }),
  ),
  route('/forgot-password', 'public', async () => {
    const [{ ForgotPasswordScreen }, { WebAuthSplit }] = await Promise.all([import('../features/auth/ForgotPasswordScreen'), import('../web/WebAuthSplit')])
    return () => <Adaptive mobile={<ForgotPasswordScreen />} desktop={<WebAuthSplit><ForgotPasswordScreen /></WebAuthSplit>} />
  }),
  route('/reset-password', 'public', async () => {
    const [{ ResetPasswordScreen }, { WebAuthSplit }] = await Promise.all([import('../features/auth/ResetPasswordScreen'), import('../web/WebAuthSplit')])
    return () => <Adaptive mobile={<ResetPasswordScreen />} desktop={<WebAuthSplit><ResetPasswordScreen /></WebAuthSplit>} />
  }),
  route('/verify-email', 'public', async () => {
    const [{ VerifyEmailScreen }, { WebAuthSplit }] = await Promise.all([import('../features/auth/VerifyEmailScreen'), import('../web/WebAuthSplit')])
    return () => <Adaptive mobile={<VerifyEmailScreen />} desktop={<WebAuthSplit><VerifyEmailScreen /></WebAuthSplit>} />
  }),
  route('/home', 'protect', async () => {
    const [{ HomeScreen }, { WebHome }] = await Promise.all([import('../features/home/HomeScreen'), import('../web/WebHome')])
    return () => <Adaptive mobile={<HomeScreen />} desktop={<WebHome />} />
  }),
  route('/calendar', 'protect', async () => {
    const [{ CalendarScreen }, { WebCalendar }] = await Promise.all([import('../features/home/CalendarScreen'), import('../web/WebCalendar')])
    return () => <Adaptive mobile={<CalendarScreen />} desktop={<WebCalendar />} />
  }),
  route('/events', 'protect', async () => {
    const { EventsListScreen } = await import('../features/home/EventsListScreen')
    return () => <EventsListScreen />
  }),
  route('/services', 'protect', async () => {
    const [{ ServicesScreen }, { WebServices }] = await Promise.all([import('../features/services/ServicesScreen'), import('../web/WebServices')])
    return () => <Adaptive mobile={<ServicesScreen />} desktop={<WebServices />} />
  }),
  route('/services/:id', 'protect', async () => {
    const [{ ServiceDetailScreen }, { WebServiceDetail }] = await Promise.all([import('../features/services/ServiceDetailScreen'), import('../web/WebServiceDetail')])
    return () => <Adaptive mobile={<ServiceDetailScreen />} desktop={<WebServiceDetail />} />
  }),
  route('/wallet', 'protect', async () => {
    const [{ WalletScreen }, { WebWallet }] = await Promise.all([import('../features/wallet/WalletScreen'), import('../web/WebWallet')])
    return () => <Adaptive mobile={<WalletScreen />} desktop={<WebWallet />} />
  }),
  route('/certificates/request', 'protect', async () => {
    const { RequestCertificateScreen } = await import('../features/certificates/RequestCertificateScreen')
    return () => <RequestCertificateScreen />
  }),

  // Booking always starts from Services, never from a bare /booking URL.
  { path: '/booking', element: <Navigate to="/services" replace /> },
  route('/booking/history', 'protect', async () => {
    const [{ BookingHistoryScreen }, { WebBookings }] = await Promise.all([import('../features/booking/BookingHistoryScreen'), import('../web/WebBookings')])
    return () => <Adaptive mobile={<BookingHistoryScreen />} desktop={<WebBookings />} />
  }),
  route('/booking/history/:id', 'protect', async () => {
    const { BookingDetailScreen } = await import('../features/booking/BookingDetailScreen')
    return () => <BookingDetailScreen />
  }),

  // Every sacrament runs through the one definition-driven wizard.
  { path: '/booking/:sacrament', element: <Navigate to="1" replace /> },
  route('/booking/:sacrament/payment', 'protect', async () => {
    const { PaymentScreen } = await import('../features/booking/shared/PaymentScreen')
    return () => <PaymentScreen />
  }),
  route('/booking/:sacrament/submitted', 'protect', async () => {
    const { SubmittedScreen } = await import('../features/booking/shared/SubmittedScreen')
    return () => <SubmittedScreen />
  }),
  route('/booking/:sacrament/:step', 'protect', async () => {
    const { BookingWizard } = await import('../features/booking/wizard/BookingWizard')
    return () => <BookingWizard />
  }),

  // PayMongo's success_url / cancel_url (PaymentController::initiate) —
  // sacrament-independent, since payment can also be resumed from Booking
  // History. Whether a fee is due is decided server-side, not by which
  // sacrament this is.
  route('/payment/success', 'protect', async () => {
    const { PaymentResultScreen } = await import('../features/booking/shared/PaymentResultScreen')
    return () => <PaymentResultScreen outcome="success" />
  }),
  // Demo only: the mock GCash screen PaymentController::initiate points at when PAYMENT_MODE=simulated.
  route('/payment/simulated', 'protect', async () => {
    const { SimulatedGcashScreen } = await import('../features/booking/shared/SimulatedGcashScreen')
    return () => <SimulatedGcashScreen />
  }),
  // QR Ph: the Scan-to-pay page PaymentController::initiate points at when PAYMONGO_METHOD=qrph.
  route('/payment/qr', 'protect', async () => {
    const { QrPaymentScreen } = await import('../features/booking/shared/QrPaymentScreen')
    return () => <QrPaymentScreen />
  }),
  route('/payment/cancelled', 'protect', async () => {
    const { PaymentResultScreen } = await import('../features/booking/shared/PaymentResultScreen')
    return () => <PaymentResultScreen outcome="cancelled" />
  }),
  // Where PayMongo returns a walk-in payer (CheckoutSessions, channel walk_in). They may have no
  // account, or not be signed in on their own phone, so this must NOT be behind ProtectedRoute.
  route('/payment/received', 'public', async () => {
    const { PaymentReceivedScreen } = await import('../features/booking/shared/PaymentReceivedScreen')
    return () => <PaymentReceivedScreen />
  }),

  // Office desk (walk-in booking). /desk/result and /desk/booking are listed before the wizard route, which also matches two segments.
  route('/desk', 'desk', async () => {
    const { DeskHomeScreen } = await import('../features/desk/DeskHomeScreen')
    return () => <DeskHomeScreen />
  }),
  route('/desk/result/:id', 'desk', async () => {
    const { DeskResultScreen } = await import('../features/desk/DeskResultScreen')
    return () => <DeskResultScreen />
  }),
  route('/desk/booking/:id', 'desk', async () => {
    const { DeskEditScreen } = await import('../features/desk/DeskEditScreen')
    return () => <DeskEditScreen />
  }),
  route('/desk/:sacrament/:step', 'desk', async () => {
    const { BookingWizard } = await import('../features/booking/wizard/BookingWizard')
    return () => <BookingWizard mode="desk" />
  }),

  route('/settings', 'protect', async () => {
    const [{ SettingsScreen }, { WebSettings }, { WebAccountPane }] = await Promise.all([
      import('../features/settings/SettingsScreen'),
      import('../web/WebSettings'),
      import('../web/WebAccountPane'),
    ])
    return () => <Adaptive mobile={<SettingsScreen />} desktop={<WebSettings><WebAccountPane /></WebSettings>} />
  }),
  route('/settings/profile', 'protect', async () => {
    const { ProfileScreen } = await import('../features/settings/ProfileScreen')
    return settingsPage(<ProfileScreen />)
  }),
  route('/settings/change-password', 'protect', async () => {
    const { ChangePasswordScreen } = await import('../features/settings/ChangePasswordScreen')
    return settingsPage(<ChangePasswordScreen />)
  }),
  route('/settings/notifications', 'protect', async () => {
    const { NotificationPreferencesScreen } = await import('../features/settings/NotificationPreferencesScreen')
    return settingsPage(<NotificationPreferencesScreen />)
  }),
  route('/settings/delete-account', 'protect', async () => {
    const { DeleteAccountScreen } = await import('../features/settings/DeleteAccountScreen')
    return settingsPage(<DeleteAccountScreen />)
  }),
  route('/notifications', 'protect', async () => {
    const { NotificationsFeedScreen } = await import('../features/notifications/NotificationsFeedScreen')
    return () => <NotificationsFeedScreen />
  }),
  route('/about', 'protect', async () => {
    const { AboutScreen } = await import('../features/settings/AboutScreen')
    return settingsPage(<AboutScreen />)
  }),
  route('/help', 'protect', async () => {
    const { HelpScreen } = await import('../features/settings/HelpScreen')
    return settingsPage(<HelpScreen />)
  }),
]

export const router = createBrowserRouter([{ element: <RootLayout />, errorElement: <RouteError />, children: [...screens, { path: '*', element: <NotFound /> }] }])
