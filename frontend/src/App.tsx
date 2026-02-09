import { useState } from 'react'
import { Phone, Users, History, Voicemail, Menu, X, LogOut, Shield } from 'lucide-react'
import packageJson from '../package.json'
import Dashboard from './pages/Dashboard'
import ExtensionsPage from './pages/ExtensionsPage'
import ExtensionDetailPage from './pages/ExtensionDetailPage'
import CDRPage from './pages/CDRPage'
import VoicemailPage from './pages/VoicemailPage'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/UsersPage'
import { AuthProvider, useAuth } from './context/AuthContext'

type Page = 'dashboard' | 'extensions' | 'extension-detail' | 'cdr' | 'voicemail' | 'users'

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [selectedExtension, setSelectedExtension] = useState<string>('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigateToExtensionDetail = (ext: string) => {
    setSelectedExtension(ext)
    setCurrentPage('extension-detail')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Lade...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const navigation = [
    { id: 'dashboard' as Page, name: 'Dashboard', icon: Phone },
    { id: 'extensions' as Page, name: 'Extensions', icon: Users },
    { id: 'cdr' as Page, name: 'Anrufverlauf', icon: History },
    { id: 'voicemail' as Page, name: 'Voicemail', icon: Voicemail },
    ...(user?.role === 'admin'
      ? [{ id: 'users' as Page, name: 'Benutzer', icon: Shield }]
      : []),
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onExtensionClick={navigateToExtensionDetail} onNavigate={(page) => setCurrentPage(page as Page)} />
      case 'extensions':
        return <ExtensionsPage />
      case 'extension-detail':
        return <ExtensionDetailPage extension={selectedExtension} onBack={() => setCurrentPage('dashboard')} />
      case 'cdr':
        return <CDRPage />
      case 'voicemail':
        return <VoicemailPage />
      case 'users':
        return user?.role === 'admin' ? <UsersPage /> : <Dashboard />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="GonoPBX" className="h-14 w-auto" />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentPage(item.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      currentPage === item.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </button>
                )
              })}

              {/* User info & Logout */}
              <div className="ml-4 pl-4 border-l border-gray-200 flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {user?.username}
                  {user?.role === 'admin' && (
                    <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-gray-500 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                  title="Abmelden"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-600" />
              ) : (
                <Menu className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-gray-200 bg-white">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`flex items-center gap-3 w-full px-4 py-3 ${
                    currentPage === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </button>
              )
            })}
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 text-red-600 border-t border-gray-200"
            >
              <LogOut className="w-5 h-5" />
              Abmelden ({user?.username})
            </button>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderPage()}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        GonoPBX v{packageJson.version} &mdash; &copy; {new Date().getFullYear()} Norbert Hengsteler. Alle Rechte vorbehalten.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
