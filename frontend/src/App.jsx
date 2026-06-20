import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  Upload, Grid, Star, BarChart2, Vault, LogOut, Loader,
  User as UserIcon, Shield, Crown, LayoutDashboard, Menu, X,
} from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import PublicCollectionPage from './pages/PublicCollectionPage'
import UploadPage from './pages/UploadPage'
import CollectionPage from './pages/CollectionPage'
import CardDetailPage from './pages/CardDetailPage'
import WantlistPage from './pages/WantlistPage'
import StatsPage from './pages/StatsPage'
import AuthPage from './pages/AuthPage'
import AccountPage from './pages/AccountPage'
import AdminPage from './pages/AdminPage'
import PricingPage from './pages/PricingPage'
import LandingPage from './pages/LandingPage'
import { ImpressumPage, DatenschutzPage, AGBPage } from './pages/LegalPages'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import { useAuth } from './auth/AuthContext'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/collection', label: 'Collection', icon: Grid },
  { to: '/wantlist', label: 'Wantlist', icon: Star },
  { to: '/stats', label: 'Stats', icon: BarChart2 },
  { to: '/account', label: 'Konto', icon: UserIcon },
]

const navItemClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-pokemon-red text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
  }`

/** Shared sidebar/drawer content. `onNavigate` lets the mobile drawer close on tap. */
function SidebarNav({ user, isPro, initials, logout, onNavigate, onClose }) {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-800">
        <Vault className="text-pokemon-yellow w-6 h-6 shrink-0" />
        <span className="font-bold text-lg tracking-wide text-pokemon-yellow">CardVault</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white md:hidden" aria-label="Menü schließen">
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
          className="mx-3 mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-pokemon-yellow/15 text-pokemon-yellow border border-pokemon-yellow/30 hover:bg-pokemon-yellow/25 transition-colors"
        >
          <Crown className="w-4 h-4" /> Auf Pro upgraden
        </NavLink>
      )}

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2 px-1 mb-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-pokemon-yellow text-black font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate flex items-center gap-1">
              {user.display_name}
              {isPro && <Crown className="w-3 h-3 text-pokemon-yellow shrink-0" title="Pro" />}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
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
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
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
    )
  }

  const initials = (user.display_name || user.email || '?').trim().charAt(0).toUpperCase()
  const isPro = (user.plan || 'free') === 'pro'
  const navProps = { user, isPro, initials, logout }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-pokemon-card border-r border-gray-800 flex-col shrink-0">
        <SidebarNav {...navProps} />
      </aside>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 max-w-[80%] bg-pokemon-card border-r border-gray-800 flex flex-col shadow-2xl">
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
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-pokemon-card border-b border-gray-800">
          <button onClick={() => setMobileNavOpen(true)} className="text-gray-300 hover:text-white" aria-label="Menü öffnen">
            <Menu className="w-6 h-6" />
          </button>
          <Vault className="text-pokemon-yellow w-5 h-5" />
          <span className="font-bold tracking-wide text-pokemon-yellow">CardVault</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/u/:slug" element={<PublicCollectionPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/collection" element={<CollectionPage />} />
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
          </Routes>
        </main>
      </div>
    </div>
  )
}
