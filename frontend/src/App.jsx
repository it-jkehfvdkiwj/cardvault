import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  Upload, Grid, Star, BarChart2, Vault, LogOut, Loader,
  User as UserIcon, Shield, Crown, LayoutDashboard, Menu, X, ShoppingBag,
} from 'lucide-react'
// Eagerly loaded: the screens a user hits immediately after login.
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import CollectionPage from './pages/CollectionPage'
import AuthPage from './pages/AuthPage'
import LandingPage from './pages/LandingPage'
import { useAuth } from './auth/AuthContext'
import { isPro as hasProFeatures } from './lib/plan'

// Lazily loaded: everything else. This keeps the charting library (~300 kB) and
// the rarely used admin/legal screens out of the initial download, which is what
// a first-time visitor on mobile data actually waits for.
const PublicCollectionPage = lazy(() => import('./pages/PublicCollectionPage'))
const CardDetailPage = lazy(() => import('./pages/CardDetailPage'))
const WantlistPage = lazy(() => import('./pages/WantlistPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const SellPage = lazy(() => import('./pages/SellPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const ImpressumPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.ImpressumPage })))
const DatenschutzPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.DatenschutzPage })))
const AGBPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.AGBPage })))
const ForgotPasswordPage = lazy(() =>
  import('./pages/PasswordResetPages').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() =>
  import('./pages/PasswordResetPages').then((m) => ({ default: m.ResetPasswordPage })))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader className="w-6 h-6 animate-spin text-pokemon-yellow" />
    </div>
  )
}

const NAV = [
  { to: '/dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { to: '/upload', label: 'Scannen', icon: Upload },
  { to: '/collection', label: 'Sammlung', icon: Grid },
  { to: '/sell', label: 'Verkaufen', icon: ShoppingBag },
  { to: '/wantlist', label: 'Wantlist', icon: Star },
  { to: '/stats', label: 'Statistik', icon: BarChart2 },
  { to: '/account', label: 'Konto', icon: UserIcon },
]

const navItemClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
    isActive
      ? 'bg-accent-soft text-accent-ink border border-accent/20'
      : 'text-ink-3 hover:text-ink hover:bg-surface-2 border border-transparent'
  }`

/** Shared sidebar/drawer content. `onNavigate` lets the mobile drawer close on tap. */
function SidebarNav({ user, isPro, initials, logout, onNavigate, onClose }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-line">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shrink-0">
          <Vault className="w-4 h-4 text-ink" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-lg tracking-tight font-display">Cardeva</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink md:hidden" aria-label="Menü schließen">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={navItemClass}>
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}

        {user.is_admin && (
          <NavLink to="/admin" onClick={onNavigate} className={navItemClass}>
            <Shield className="w-4 h-4" />
            Admin
          </NavLink>
        )}
      </nav>

      {/* Upgrade CTA for free users */}
      {!isPro && (
        <NavLink
          to="/pricing"
          onClick={onNavigate}
          className="mx-3 mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-accent-soft text-pokemon-yellow border border-accent/50 hover:bg-accent/25 transition-colors"
        >
          <Crown className="w-4 h-4" /> Auf Pro upgraden
        </NavLink>
      )}

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-line">
        <div className="flex items-center gap-2 px-1 mb-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-accent text-ink font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate flex items-center gap-1">
              {user.display_name}
              {isPro && <Crown className="w-3 h-3 text-pokemon-yellow shrink-0" title="Pro" />}
            </p>
            <p className="text-xs text-ink-3 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Abmelden
        </button>
      </div>
    </>
  )
}

export default function App() {
  const { user, loading, logout } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-3">
        <Loader className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/u/:slug" element={<PublicCollectionPage />} />
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/datenschutz" element={<DatenschutzPage />} />
          <Route path="/agb" element={<AGBPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    )
  }

  const initials = (user.display_name || user.email || '?').trim().charAt(0).toUpperCase()
  const isPro = hasProFeatures(user)
  const navProps = { user, isPro, initials, logout }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-surface/70 backdrop-blur border-r border-line flex-col shrink-0">
        <SidebarNav {...navProps} />
      </aside>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 max-w-[80%] bg-pokemon-card border-r border-line flex flex-col shadow-2xl">
            <SidebarNav
              {...navProps}
              onNavigate={() => setMobileNavOpen(false)}
              onClose={() => setMobileNavOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-surface/80 backdrop-blur border-b border-line">
          <button onClick={() => setMobileNavOpen(true)} className="text-ink-2 hover:text-ink" aria-label="Menü öffnen">
            <Menu className="w-6 h-6" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center">
            <Vault className="w-3.5 h-3.5 text-ink" strokeWidth={2.5} />
          </div>
          <span className="font-bold tracking-tight font-display">Cardeva</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/u/:slug" element={<PublicCollectionPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/collection" element={<CollectionPage />} />
              <Route path="/sell" element={<SellPage />} />
              <Route path="/card/:id" element={<CardDetailPage />} />
              <Route path="/wantlist" element={<WantlistPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/impressum" element={<ImpressumPage />} />
              <Route path="/datenschutz" element={<DatenschutzPage />} />
              <Route path="/agb" element={<AGBPage />} />
              <Route
                path="/admin"
                element={user.is_admin ? <AdminPage /> : <Navigate to="/collection" replace />}
              />
              {/* Anything else inside the app shell goes back to the dashboard
                  instead of rendering an empty page. */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
