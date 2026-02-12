import { useState } from 'react'
import { Phone, History, Menu, X, LogOut, Settings, HelpCircle, KeyRound, Moon, Sun } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import ExtensionDetailPage from './pages/ExtensionDetailPage'
import TrunkDetailPage from './pages/TrunkDetailPage'
import CDRPage from './pages/CDRPage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import FAQPage from './pages/FAQPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { api } from './services/api'

type Page = 'dashboard' | 'extension-detail' | 'trunk-detail' | 'cdr' | 'settings' | 'faq'

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [selectedExtension, setSelectedExtension] = useState<string>('')
  const [selectedTrunkId, setSelectedTrunkId] = useState<number>(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Password change modal
  const [showPwModal, setShowPwModal] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwRepeat, setNewPwRepeat] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const navigateToExtensionDetail = (ext: string) => {
    setSelectedExtension(ext)
    setCurrentPage('extension-detail')
  }

  const navigateToTrunkDetail = (id: number) => {
    setSelectedTrunkId(id)
    setCurrentPage('trunk-detail')
  }

  const handleChangePassword = async () => {
    setPwError('')
    setPwSuccess('')
    if (newPw.length < 6) {
      setPwError('Das neue Passwort muss mindestens 6 Zeichen lang sein')
      return
    }
    if (newPw !== newPwRepeat) {
      setPwError('Die Passwörter stimmen nicht überein')
      return
    }
    setPwSaving(true)
    try {
      await api.changeMyPassword(currentPw, newPw)
      setPwSuccess('Passwort erfolgreich geändert')
      setCurrentPw('')
      setNewPw('')
      setNewPwRepeat('')
      setTimeout(() => setShowPwModal(false), 1500)
    } catch (err: any) {
      setPwError(err.message || 'Passwort konnte nicht geändert werden')
    } finally {
      setPwSaving(false)
    }
  }

  const openPwModal = () => {
    setShowPwModal(true)
    setCurrentPw('')
    setNewPw('')
    setNewPwRepeat('')
    setPwError('')
    setPwSuccess('')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Lade...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const navigation = [
    { id: 'dashboard' as Page, name: 'Dashboard', icon: Phone },
    { id: 'cdr' as Page, name: 'Anrufverlauf', icon: History },
    { id: 'faq' as Page, name: 'FAQ', icon: HelpCircle },
    ...(user?.role === 'admin'
      ? [
          { id: 'settings' as Page, name: 'Einstellungen', icon: Settings },
        ]
      : []),
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onExtensionClick={navigateToExtensionDetail} onTrunkClick={navigateToTrunkDetail} onNavigate={(page) => setCurrentPage(page as Page)} />
      case 'extension-detail':
        return <ExtensionDetailPage extension={selectedExtension} onBack={() => setCurrentPage('dashboard')} />
      case 'trunk-detail':
        return <TrunkDetailPage trunkId={selectedTrunkId} onBack={() => setCurrentPage('dashboard')} />
      case 'cdr':
        return <CDRPage />
      case 'faq':
        return <FAQPage />
      case 'settings':
        return user?.role === 'admin' ? <SettingsPage /> : <Dashboard />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 sticky top-0 z-50">
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
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </button>
                )
              })}

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors ml-2"
                title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* User info & actions */}
              <div className="ml-2 pl-4 border-l border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <button
                  onClick={openPwModal}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title={`${user?.full_name || user?.username} – Passwort ändern`}
                >
                  {user?.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center text-sm font-semibold ring-2 ring-gray-200 dark:ring-gray-600">
                      {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  {user?.role === 'admin' && (
                    <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Abmelden"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </nav>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                ) : (
                  <Menu className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </button>
              )
            })}
            <button
              onClick={() => { openPwModal(); setMobileMenuOpen(false) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700"
            >
              <KeyRound className="w-5 h-5" />
              Passwort ändern
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 text-red-600 dark:text-red-400 border-t border-gray-200 dark:border-gray-700"
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
      <footer className="text-center py-4 text-xs text-gray-400 dark:text-gray-600">
        &copy; {new Date().getFullYear()} Norbert Hengsteler. Alle Rechte vorbehalten. · Made with <span className="text-red-500">❤</span> in Bremen
      </footer>

      {/* Password Change Modal */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Passwort ändern</h2>
              <button onClick={() => setShowPwModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwError && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-2 rounded-lg text-sm">
                {pwSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aktuelles Passwort</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Neues Passwort</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Mindestens 6 Zeichen"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Neues Passwort wiederholen</label>
                <input
                  type="password"
                  value={newPwRepeat}
                  onChange={(e) => setNewPwRepeat(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowPwModal(false)}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwSaving || !currentPw || !newPw || !newPwRepeat}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {pwSaving ? 'Speichern...' : 'Passwort ändern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  )
}
