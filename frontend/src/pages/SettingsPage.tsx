import { useState, useEffect, FormEvent } from 'react'
import { Save, Send, Eye, EyeOff, Mail, Volume2, Shield, Plus, Trash2, AlertTriangle, ServerIcon, RefreshCw, Power, Download, HardDrive, Cpu, Clock, CheckCircle, XCircle, ArrowUpCircle, FileText, ShieldAlert, Ban, Unlock, Users, Phone, Server } from 'lucide-react'
import { api } from '../services/api'
import UsersPage from './UsersPage'
import ExtensionsPage from './ExtensionsPage'

interface AvailableCodec {
  id: string
  name: string
  description: string
}

interface ServerInfo {
  version: string
  uptime: string
  disk: { total_gb: number; used_gb: number; free_gb: number; percent: number }
  memory: { total_mb: number; used_mb: number; free_mb: number; percent: number }
  containers: { name: string; service: string; state: string; status: string }[]
}

interface UpdateInfo {
  current_version: string
  latest_version: string
  update_available: boolean
  published_at: string
  release_notes: string
  release_url: string
}

type SettingsTab = 'extensions' | 'trunks' | 'users' | 'email' | 'audio' | 'security' | 'audit' | 'server'

const tabs: { id: SettingsTab; label: string; icon: typeof Mail }[] = [
  { id: 'extensions', label: 'Nebenstellen', icon: Phone },
  { id: 'trunks', label: 'Leitungen', icon: Server },
  { id: 'users', label: 'Benutzer', icon: Users },
  { id: 'email', label: 'E-Mail', icon: Mail },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'security', label: 'Sicherheit', icon: Shield },
  { id: 'audit', label: 'Audit-Log', icon: FileText },
  { id: 'server', label: 'Server', icon: ServerIcon },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('extensions')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [formData, setFormData] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_tls: 'true',
    smtp_user: '',
    smtp_password: '',
    smtp_from: '',
  })

  // Codec state
  const [availableCodecs, setAvailableCodecs] = useState<AvailableCodec[]>([])
  const [selectedCodecs, setSelectedCodecs] = useState<string[]>([])
  const [savingCodecs, setSavingCodecs] = useState(false)

  // IP Whitelist state
  const [whitelistEnabled, setWhitelistEnabled] = useState(false)
  const [whitelistIps, setWhitelistIps] = useState<string[]>([])
  const [newIp, setNewIp] = useState('')
  const [savingWhitelist, setSavingWhitelist] = useState(false)

  // Weak passwords state
  const [weakPasswords, setWeakPasswords] = useState<any[]>([])
  const [loadingWeak, setLoadingWeak] = useState(false)

  // Fail2Ban state
  const [fail2ban, setFail2ban] = useState<any>(null)
  const [loadingF2b, setLoadingF2b] = useState(false)

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditOffset, setAuditOffset] = useState(0)
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Server state
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [restartingService, setRestartingService] = useState<string | null>(null)
  const [rebooting, setRebooting] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [data, codecData, wlData] = await Promise.all([
          api.getSettings(),
          api.getCodecSettings(),
          api.getIpWhitelist(),
        ])
        setFormData({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || '587',
          smtp_tls: data.smtp_tls || 'true',
          smtp_user: data.smtp_user || '',
          smtp_password: data.smtp_password || '',
          smtp_from: data.smtp_from || '',
        })
        setAvailableCodecs(codecData.available_codecs || [])
        setSelectedCodecs((codecData.global_codecs || '').split(',').filter(Boolean))
        setWhitelistEnabled(wlData.enabled || false)
        setWhitelistIps(wlData.ips || [])
      } catch {
        setError('Einstellungen konnten nicht geladen werden')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await api.updateSettings(formData)
      setSuccess('Einstellungen gespeichert')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail) {
      setError('Bitte Empfänger-Adresse eingeben')
      return
    }
    setError('')
    setSuccess('')
    setTesting(true)
    try {
      await api.sendTestEmail(testEmail)
      setSuccess(`Test-E-Mail an ${testEmail} gesendet`)
    } catch (err: any) {
      setError(err.message || 'Test-E-Mail konnte nicht gesendet werden')
    } finally {
      setTesting(false)
    }
  }

  const toggleCodec = (codecId: string) => {
    setSelectedCodecs(prev =>
      prev.includes(codecId) ? prev.filter(c => c !== codecId) : [...prev, codecId]
    )
  }

  const handleSaveCodecs = async () => {
    if (selectedCodecs.length === 0) {
      setError('Mindestens ein Codec muss ausgewählt sein')
      return
    }
    setError('')
    setSuccess('')
    setSavingCodecs(true)
    try {
      await api.updateCodecSettings({ global_codecs: selectedCodecs.join(',') })
      setSuccess('Codec-Einstellungen gespeichert')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Codec-Einstellungen')
    } finally {
      setSavingCodecs(false)
    }
  }

  const addIp = () => {
    const trimmed = newIp.trim()
    if (!trimmed) return
    if (whitelistIps.includes(trimmed)) {
      setError('Diese IP ist bereits in der Liste')
      return
    }
    setWhitelistIps([...whitelistIps, trimmed])
    setNewIp('')
  }

  const removeIp = (ip: string) => {
    setWhitelistIps(whitelistIps.filter(i => i !== ip))
  }

  const handleSaveWhitelist = async () => {
    setError('')
    setSuccess('')
    setSavingWhitelist(true)
    try {
      await api.updateIpWhitelist({ enabled: whitelistEnabled, ips: whitelistIps })
      setSuccess('IP-Whitelist gespeichert')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der IP-Whitelist')
    } finally {
      setSavingWhitelist(false)
    }
  }

  // Server functions
  const fetchServerInfo = async () => {
    try {
      const info = await api.getServerInfo()
      setServerInfo(info)
    } catch {
      setError('Server-Informationen konnten nicht geladen werden')
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setError('')
    setSuccess('')
    try {
      const info = await api.checkUpdate()
      setUpdateInfo(info)
      if (!info.update_available) {
        setSuccess('GonoPBX ist auf dem neuesten Stand')
      }
    } catch (err: any) {
      setError(err.message || 'Update-Prüfung fehlgeschlagen')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleRestartService = async (service: string) => {
    if (!confirm(`Service "${service}" wirklich neu starten?`)) return
    setRestartingService(service)
    setError('')
    setSuccess('')
    try {
      await api.restartService(service)
      setSuccess(`Service "${service}" wird neu gestartet`)
      setTimeout(fetchServerInfo, 5000)
    } catch (err: any) {
      setError(err.message || 'Neustart fehlgeschlagen')
    } finally {
      setRestartingService(null)
    }
  }

  const handleReboot = async () => {
    if (!confirm('Server wirklich neu starten? Alle Verbindungen werden getrennt.')) return
    if (!confirm('Sind Sie sicher? Der Server wird komplett neu gestartet!')) return
    setRebooting(true)
    setError('')
    try {
      await api.rebootServer()
      setSuccess('Server wird neu gestartet...')
    } catch (err: any) {
      setError(err.message || 'Reboot fehlgeschlagen')
      setRebooting(false)
    }
  }

  // Fetch weak passwords and fail2ban when switching to security tab
  const fetchWeakPasswords = async () => {
    setLoadingWeak(true)
    try {
      const data = await api.getWeakPasswords()
      setWeakPasswords(data)
    } catch { /* ignore */ } finally { setLoadingWeak(false) }
  }

  const fetchFail2ban = async () => {
    setLoadingF2b(true)
    try {
      const data = await api.getFail2banStatus()
      setFail2ban(data)
    } catch { /* ignore */ } finally { setLoadingF2b(false) }
  }

  const fetchAuditLogs = async (offset = 0) => {
    setLoadingAudit(true)
    try {
      const data = await api.getAuditLogs(50, offset)
      if (offset === 0) {
        setAuditLogs(data.logs)
      } else {
        setAuditLogs(prev => [...prev, ...data.logs])
      }
      setAuditTotal(data.total)
      setAuditOffset(offset)
    } catch { /* ignore */ } finally { setLoadingAudit(false) }
  }

  useEffect(() => {
    if (activeTab === 'security') {
      fetchWeakPasswords()
      fetchFail2ban()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'audit' && auditLogs.length === 0) {
      fetchAuditLogs(0)
    }
  }, [activeTab])

  // Load server info when switching to server tab
  useEffect(() => {
    if (activeTab === 'server' && !serverInfo) {
      fetchServerInfo()
    }
  }, [activeTab])

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Lade Einstellungen...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Einstellungen</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1" aria-label="Tabs">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError(''); setSuccess('') }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Extensions Tab */}
      {activeTab === 'extensions' && <ExtensionsPage mode="peers" />}

      {/* Trunks Tab */}
      {activeTab === 'trunks' && <ExtensionsPage mode="trunks" />}

      {/* Users Tab */}
      {activeTab === 'users' && <UsersPage />}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">SMTP-Konfiguration</h2>
            <p className="text-sm text-gray-500 mb-6">
              Konfigurieren Sie den SMTP-Server für den Versand von Voicemail-Benachrichtigungen per E-Mail.
            </p>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP-Server</label>
                  <input
                    type="text"
                    value={formData.smtp_host}
                    onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="mail.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="text"
                    value={formData.smtp_port}
                    onChange={(e) => setFormData({ ...formData, smtp_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
                  <input
                    type="text"
                    value={formData.smtp_user}
                    onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.smtp_password}
                      onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Passwort"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Absender-Adresse</label>
                  <input
                    type="email"
                    value={formData.smtp_from}
                    onChange={(e) => setFormData({ ...formData, smtp_from: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="voicemail@example.com"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.smtp_tls === 'true'}
                      onChange={(e) => setFormData({ ...formData, smtp_tls: e.target.checked ? 'true' : 'false' })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">TLS verwenden</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Test-E-Mail senden</h2>
            <p className="text-sm text-gray-500 mb-4">
              Senden Sie eine Test-E-Mail, um die SMTP-Konfiguration zu überprüfen.
            </p>
            <div className="flex gap-3">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="empfaenger@example.com"
              />
              <button
                onClick={handleTestEmail}
                disabled={testing}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
                {testing ? 'Sende...' : 'Senden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Tab */}
      {activeTab === 'audio' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Audio-Codecs (Global)</h2>
          <p className="text-sm text-gray-500 mb-6">
            Wählen Sie die Codecs aus, die standardmäßig für alle Nebenstellen verwendet werden.
            Einzelne Nebenstellen können diese Einstellung überschreiben.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {availableCodecs.map(codec => (
              <label
                key={codec.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  selectedCodecs.includes(codec.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCodecs.includes(codec.id)}
                  onChange={() => toggleCodec(codec.id)}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">{codec.name}</div>
                  <div className="text-xs text-gray-500">{codec.description}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleSaveCodecs}
            disabled={savingCodecs || selectedCodecs.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {savingCodecs ? 'Speichern...' : 'Codecs speichern'}
          </button>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* IP Whitelist */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">IP-Whitelist für Registrierung</h2>
            <p className="text-sm text-gray-500 mb-6">
              Beschränken Sie die SIP-Registrierung auf bestimmte IP-Adressen oder Netzwerke (CIDR).
              Wenn aktiviert, werden alle anderen IPs blockiert.
            </p>

            {whitelistEnabled && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-amber-800">
                  Achtung: Stellen Sie sicher, dass Ihre eigene IP-Adresse in der Liste enthalten ist,
                  bevor Sie die Whitelist aktivieren.
                </span>
              </div>
            )}

            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setWhitelistEnabled(!whitelistEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    whitelistEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      whitelistEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  Whitelist {whitelistEnabled ? 'aktiviert' : 'deaktiviert'}
                </span>
              </label>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIp())}
                  className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="z.B. 203.0.113.5 oder 10.0.0.0/24"
                />
                <button
                  onClick={addIp}
                  className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </button>
              </div>

              {whitelistIps.length > 0 ? (
                <div className="space-y-2">
                  {whitelistIps.map((ip) => (
                    <div
                      key={ip}
                      className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
                    >
                      <span className="text-sm font-mono text-gray-800">{ip}</span>
                      <button
                        onClick={() => removeIp(ip)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Keine IPs konfiguriert</p>
              )}
            </div>

            <button
              onClick={handleSaveWhitelist}
              disabled={savingWhitelist}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {savingWhitelist ? 'Speichern...' : 'Whitelist speichern'}
            </button>
          </div>

          {/* Weak Passwords */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-800">Schwache SIP-Passwörter</h2>
              </div>
              <button onClick={fetchWeakPasswords} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <RefreshCw className={`w-4 h-4 ${loadingWeak ? 'animate-spin' : ''}`} />
                Aktualisieren
              </button>
            </div>
            {weakPasswords.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">Alle SIP-Passwörter sind ausreichend stark</span>
              </div>
            ) : (
              <div className="space-y-2">
                {weakPasswords.map((pw: any) => (
                  <div key={pw.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-800">{pw.extension}</span>
                      {pw.caller_id && <span className="text-sm text-gray-500 ml-2">({pw.caller_id})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${pw.strength.level === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${pw.strength.score}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${pw.strength.level === 'medium' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {pw.strength.level === 'medium' ? 'Mittel' : 'Schwach'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fail2Ban Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-semibold text-gray-800">Fail2Ban-Status</h2>
              </div>
              <button onClick={fetchFail2ban} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <RefreshCw className={`w-4 h-4 ${loadingF2b ? 'animate-spin' : ''}`} />
                Aktualisieren
              </button>
            </div>

            {!fail2ban ? (
              <div className="text-center py-4 text-gray-500">Lade Fail2Ban-Status...</div>
            ) : !fail2ban.available ? (
              <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-gray-500 mt-0.5" />
                <span className="text-sm text-gray-600">
                  Fail2Ban ist nicht verfügbar. {fail2ban.error || 'Stellen Sie sicher, dass Fail2Ban installiert ist.'}
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-700">{fail2ban.active_bans}</div>
                    <div className="text-xs text-red-600">Aktive Bans</div>
                  </div>
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-orange-700">{fail2ban.bans_24h}</div>
                    <div className="text-xs text-orange-600">Bans (24h)</div>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-gray-700">{fail2ban.total_bans}</div>
                    <div className="text-xs text-gray-600">Bans gesamt</div>
                  </div>
                </div>

                {/* Jails */}
                {fail2ban.jails && fail2ban.jails.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Jails</h3>
                    <div className="space-y-2">
                      {fail2ban.jails.map((jail: any) => (
                        <div key={jail.name} className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            {jail.enabled ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                            <span className="text-sm font-medium text-gray-800">{jail.name}</span>
                          </div>
                          <span className={`text-sm font-medium ${jail.active_bans > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {jail.active_bans} aktiv
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent bans */}
                {fail2ban.recent_bans && fail2ban.recent_bans.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Letzte Bans</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Jail</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Zeitpunkt</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {fail2ban.recent_bans.map((ban: any, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-mono text-gray-800">{ban.ip}</td>
                              <td className="px-3 py-2 text-gray-600">{ban.jail}</td>
                              <td className="px-3 py-2 text-gray-600">{new Date(ban.timestamp).toLocaleString('de-DE')}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ban.active ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {ban.active ? 'Aktiv' : 'Abgelaufen'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {ban.active && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`IP ${ban.ip} aus Jail "${ban.jail}" entbannen?`)) return
                                      try {
                                        await api.unbanIp(ban.jail, ban.ip)
                                        fetchFail2ban()
                                      } catch (e: any) {
                                        alert(e.message || 'Entbannung fehlgeschlagen')
                                      }
                                    }}
                                    className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    Entbannen
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-800">Audit-Log</h2>
              <span className="text-sm text-gray-500">({auditTotal} Einträge)</span>
            </div>
            <button
              onClick={() => fetchAuditLogs(0)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>

          {auditLogs.length === 0 && !loadingAudit ? (
            <div className="text-center py-8 text-gray-500">Keine Audit-Log-Einträge vorhanden</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zeitpunkt</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Benutzer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktion</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ressource</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {auditLogs.map((log: any) => {
                      const isDelete = log.action?.includes('deleted')
                      const isCreate = log.action?.includes('created')
                      const actionColor = isDelete ? 'text-red-600 bg-red-50' : isCreate ? 'text-green-600 bg-green-50' : 'text-blue-600 bg-blue-50'
                      const actionLabel: Record<string, string> = {
                        peer_created: 'Extension erstellt',
                        peer_updated: 'Extension bearbeitet',
                        peer_deleted: 'Extension gelöscht',
                        trunk_created: 'Trunk erstellt',
                        trunk_updated: 'Trunk bearbeitet',
                        trunk_deleted: 'Trunk gelöscht',
                        route_created: 'Route erstellt',
                        route_updated: 'Route bearbeitet',
                        route_deleted: 'Route gelöscht',
                        user_created: 'Benutzer erstellt',
                        user_deleted: 'Benutzer gelöscht',
                        callforward_created: 'Weiterleitung erstellt',
                        callforward_updated: 'Weiterleitung bearbeitet',
                        callforward_deleted: 'Weiterleitung gelöscht',
                        settings_updated: 'Einstellungen geändert',
                        whitelist_updated: 'IP-Whitelist geändert',
                        service_restarted: 'Service neu gestartet',
                        server_reboot: 'Server-Neustart',
                      }
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString('de-DE') : '-'}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{log.username}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${actionColor}`}>
                              {actionLabel[log.action] || log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {log.resource_type && <span className="text-gray-500">{log.resource_type}: </span>}
                            {log.resource_id || '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {log.details ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {auditLogs.length < auditTotal && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => fetchAuditLogs(auditOffset + 50)}
                    disabled={loadingAudit}
                    className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                  >
                    {loadingAudit ? 'Lade...' : 'Mehr laden'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Server Tab */}
      {activeTab === 'server' && (
        <div className="space-y-6">
          {/* System Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">System-Information</h2>
              <button
                onClick={fetchServerInfo}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Aktualisieren
              </button>
            </div>

            {serverInfo ? (
              <div className="space-y-6">
                {/* Version & Uptime */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ServerIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Version</div>
                      <div className="text-lg font-semibold text-gray-800">v{serverInfo.version}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Clock className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Uptime</div>
                      <div className="text-lg font-semibold text-gray-800">{serverInfo.uptime}</div>
                    </div>
                  </div>
                </div>

                {/* Disk & Memory */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Festplatte</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                      <div
                        className={`h-2.5 rounded-full ${serverInfo.disk.percent > 90 ? 'bg-red-500' : serverInfo.disk.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${serverInfo.disk.percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      {serverInfo.disk.used_gb} GB / {serverInfo.disk.total_gb} GB belegt ({serverInfo.disk.percent}%)
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Arbeitsspeicher</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                      <div
                        className={`h-2.5 rounded-full ${serverInfo.memory.percent > 90 ? 'bg-red-500' : serverInfo.memory.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${serverInfo.memory.percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      {serverInfo.memory.used_mb} MB / {serverInfo.memory.total_mb} MB belegt ({serverInfo.memory.percent}%)
                    </div>
                  </div>
                </div>

                {/* Container Status */}
                {serverInfo.containers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Container-Status</h3>
                    <div className="space-y-2">
                      {serverInfo.containers.map(c => (
                        <div key={c.name} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {c.state === 'running' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-800">{c.service}</div>
                              <div className="text-xs text-gray-500">{c.status}</div>
                            </div>
                          </div>
                          {['asterisk', 'backend', 'frontend'].includes(c.service) && (
                            <button
                              onClick={() => handleRestartService(c.service)}
                              disabled={restartingService === c.service}
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${restartingService === c.service ? 'animate-spin' : ''}`} />
                              {restartingService === c.service ? 'Startet...' : 'Neustart'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">Lade System-Informationen...</div>
            )}
          </div>

          {/* Update Check */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-800">Updates</h2>
            </div>

            {updateInfo?.update_available && (
              <div className="flex items-start gap-3 p-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg">
                <ArrowUpCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-blue-800">
                    Neue Version verfügbar: v{updateInfo.latest_version}
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    Aktuelle Version: v{updateInfo.current_version}
                  </div>
                  {updateInfo.release_notes && (
                    <pre className="text-xs text-blue-700 mt-2 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                      {updateInfo.release_notes}
                    </pre>
                  )}
                  {updateInfo.release_url && (
                    <a
                      href={updateInfo.release_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 mt-2 underline"
                    >
                      Release auf GitHub ansehen
                    </a>
                  )}
                </div>
              </div>
            )}

            {updateInfo && !updateInfo.update_available && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">GonoPBX v{updateInfo.current_version} ist aktuell</span>
              </div>
            )}

            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? 'Prüfe...' : 'Auf Updates prüfen'}
            </button>
          </div>

          {/* Server Reboot */}
          <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Power className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-gray-800">Server neu starten</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Startet den gesamten Server neu. Alle aktiven Verbindungen und Gespräche werden getrennt.
            </p>
            <button
              onClick={handleReboot}
              disabled={rebooting}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-6 py-2 rounded-lg transition-colors"
            >
              <Power className="w-4 h-4" />
              {rebooting ? 'Server startet neu...' : 'Server neu starten'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
