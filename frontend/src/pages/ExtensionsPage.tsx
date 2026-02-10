import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Phone, PhoneOff, Server } from 'lucide-react'
import { api } from '../services/api'

interface SIPPeer {
  id: number
  extension: string
  secret: string
  caller_id: string | null
  context: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface SIPTrunk {
  id: number
  name: string
  provider: string
  auth_mode: string
  sip_server: string
  username: string | null
  password: string | null
  caller_id: string | null
  number_block: string | null
  context: string
  codecs: string
  enabled: boolean
  created_at: string
  updated_at: string
}

const PROVIDERS: Record<string, { label: string; server: string; supportsIp: boolean }> = {
  plusnet_basic: { label: 'Plusnet IPfonie Basic/Extended', server: 'sip.ipfonie.de', supportsIp: false },
  plusnet_connect: { label: 'Plusnet IPfonie Extended Connect', server: 'sipconnect.ipfonie.de', supportsIp: true },
  custom: { label: 'Anderer Provider', server: '', supportsIp: true },
}

export default function ExtensionsPage() {
  const [activeTab, setActiveTab] = useState<'peers' | 'trunks'>('peers')

  // --- Peers state ---
  const [peers, setPeers] = useState<SIPPeer[]>([])
  const [loadingPeers, setLoadingPeers] = useState(true)
  const [showPeerForm, setShowPeerForm] = useState(false)
  const [editingPeer, setEditingPeer] = useState<SIPPeer | null>(null)
  const [peerForm, setPeerForm] = useState({
    extension: '',
    secret: '',
    caller_id: '',
    context: 'internal',
    enabled: true
  })

  // --- Trunks state ---
  const [trunks, setTrunks] = useState<SIPTrunk[]>([])
  const [loadingTrunks, setLoadingTrunks] = useState(true)
  const [showTrunkForm, setShowTrunkForm] = useState(false)
  const [editingTrunk, setEditingTrunk] = useState<SIPTrunk | null>(null)
  const [trunkForm, setTrunkForm] = useState({
    name: '',
    provider: 'plusnet_basic',
    auth_mode: 'registration',
    sip_server: '',
    username: '',
    password: '',
    caller_id: '',
    number_block: '',
    enabled: true,
  })

  useEffect(() => {
    fetchPeers()
    fetchTrunks()
  }, [])

  // ==================== PEERS ====================
  const fetchPeers = async () => {
    try {
      const data = await api.getSipPeers()
      setPeers(data)
    } catch (error) {
      console.error('Error fetching peers:', error)
    } finally {
      setLoadingPeers(false)
    }
  }

  const handlePeerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingPeer) {
        await api.updateSipPeer(editingPeer.id, peerForm)
      } else {
        await api.createSipPeer(peerForm)
      }
      setPeerForm({ extension: '', secret: '', caller_id: '', context: 'internal', enabled: true })
      setShowPeerForm(false)
      setEditingPeer(null)
      fetchPeers()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Speichern')
    }
  }

  const handlePeerEdit = (peer: SIPPeer) => {
    setEditingPeer(peer)
    setPeerForm({
      extension: peer.extension,
      secret: peer.secret,
      caller_id: peer.caller_id || '',
      context: peer.context,
      enabled: peer.enabled
    })
    setShowPeerForm(true)
  }

  const handlePeerDelete = async (peer: SIPPeer) => {
    if (!confirm(`Wirklich Extension ${peer.extension} löschen?`)) return
    try {
      await api.deleteSipPeer(peer.id)
      fetchPeers()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Löschen')
    }
  }

  const handlePeerCancel = () => {
    setShowPeerForm(false)
    setEditingPeer(null)
    setPeerForm({ extension: '', secret: '', caller_id: '', context: 'internal', enabled: true })
  }

  // ==================== TRUNKS ====================
  const fetchTrunks = async () => {
    try {
      const data = await api.getTrunks()
      setTrunks(data)
    } catch (error) {
      console.error('Error fetching trunks:', error)
    } finally {
      setLoadingTrunks(false)
    }
  }

  const handleTrunkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...trunkForm,
        sip_server: trunkForm.provider === 'custom' ? trunkForm.sip_server : null,
        username: trunkForm.auth_mode === 'registration' ? trunkForm.username : null,
        password: trunkForm.auth_mode === 'registration' ? trunkForm.password : null,
      }
      if (editingTrunk) {
        await api.updateTrunk(editingTrunk.id, payload)
      } else {
        await api.createTrunk(payload)
      }
      resetTrunkForm()
      setShowTrunkForm(false)
      setEditingTrunk(null)
      fetchTrunks()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Speichern')
    }
  }

  const handleTrunkEdit = (trunk: SIPTrunk) => {
    setEditingTrunk(trunk)
    setTrunkForm({
      name: trunk.name,
      provider: trunk.provider,
      auth_mode: trunk.auth_mode,
      sip_server: trunk.sip_server || '',
      username: trunk.username || '',
      password: trunk.password || '',
      caller_id: trunk.caller_id || '',
      number_block: trunk.number_block || '',
      enabled: trunk.enabled,
    })
    setShowTrunkForm(true)
  }

  const handleTrunkDelete = async (trunk: SIPTrunk) => {
    if (!confirm(`Wirklich Trunk "${trunk.name}" löschen?`)) return
    try {
      await api.deleteTrunk(trunk.id)
      fetchTrunks()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Löschen')
    }
  }

  const resetTrunkForm = () => {
    setTrunkForm({ name: '', provider: 'plusnet_basic', auth_mode: 'registration', sip_server: '', username: '', password: '', caller_id: '', number_block: '', enabled: true })
  }

  const handleTrunkCancel = () => {
    setShowTrunkForm(false)
    setEditingTrunk(null)
    resetTrunkForm()
  }

  const providerLabel = (key: string, server?: string) => {
    if (key === 'custom') return server || 'Benutzerdefiniert'
    return PROVIDERS[key]?.label || key
  }

  const loading = activeTab === 'peers' ? loadingPeers : loadingTrunks

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Extensions verwalten</h1>
          <p className="text-gray-600 mt-1">SIP-Accounts und Trunks anlegen und bearbeiten</p>
        </div>

        {activeTab === 'peers' && !showPeerForm && (
          <button
            onClick={() => setShowPeerForm(true)}
            className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition"
          >
            <Plus className="w-5 h-5" />
            Neue Extension
          </button>
        )}
        {activeTab === 'trunks' && !showTrunkForm && (
          <button
            onClick={() => setShowTrunkForm(true)}
            className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition"
          >
            <Plus className="w-5 h-5" />
            Neuer SIP-Trunk
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('peers')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === 'peers'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Nebenstellen ({peers.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab('trunks')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === 'trunks'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            SIP-Trunks ({trunks.length})
          </span>
        </button>
      </div>

      {/* ==================== PEERS TAB ==================== */}
      {activeTab === 'peers' && (
        <>
          {showPeerForm && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">
                {editingPeer ? 'Extension bearbeiten' : 'Neue Extension anlegen'}
              </h2>
              <form onSubmit={handlePeerSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Extension (Rufnummer) *</label>
                    <input
                      type="text"
                      value={peerForm.extension}
                      onChange={(e) => setPeerForm({...peerForm, extension: e.target.value})}
                      placeholder="z.B. 1002"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                      disabled={!!editingPeer}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Passwort *</label>
                    <input
                      type="text"
                      value={peerForm.secret}
                      onChange={(e) => setPeerForm({...peerForm, secret: e.target.value})}
                      placeholder="Sicheres Passwort"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caller ID</label>
                    <input
                      type="text"
                      value={peerForm.caller_id}
                      onChange={(e) => setPeerForm({...peerForm, caller_id: e.target.value})}
                      placeholder="Max Mustermann"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
                    <select
                      value={peerForm.context}
                      onChange={(e) => setPeerForm({...peerForm, context: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="internal">internal</option>
                      <option value="default">default</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="peer-enabled"
                    checked={peerForm.enabled}
                    onChange={(e) => setPeerForm({...peerForm, enabled: e.target.checked})}
                    className="w-4 h-4 text-primary-500 rounded"
                  />
                  <label htmlFor="peer-enabled" className="text-sm text-gray-700">Extension aktiviert</label>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="submit" className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    {editingPeer ? 'Speichern' : 'Anlegen'}
                  </button>
                  <button type="button" onClick={handlePeerCancel} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Aktive Extensions ({peers.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Extension</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caller ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Context</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {peers.map((peer) => (
                    <tr key={peer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{peer.extension}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{peer.caller_id || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-sm">{peer.context}</span>
                      </td>
                      <td className="px-6 py-4">
                        {peer.enabled ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Phone className="w-4 h-4" /> Aktiv
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <PhoneOff className="w-4 h-4" /> Deaktiviert
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => handlePeerEdit(peer)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handlePeerDelete(peer)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== TRUNKS TAB ==================== */}
      {activeTab === 'trunks' && (
        <>
          {showTrunkForm && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">
                {editingTrunk ? 'SIP-Trunk bearbeiten' : 'Neuen SIP-Trunk anlegen'}
              </h2>
              <form onSubmit={handleTrunkSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
                    <select
                      value={trunkForm.provider}
                      onChange={(e) => {
                        const provider = e.target.value
                        setTrunkForm({
                          ...trunkForm,
                          provider,
                          sip_server: provider === 'custom' ? trunkForm.sip_server : '',
                          auth_mode: PROVIDERS[provider]?.supportsIp ? trunkForm.auth_mode : 'registration',
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {Object.entries(PROVIDERS).map(([key, { label }]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    {trunkForm.provider !== 'custom' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Server: {PROVIDERS[trunkForm.provider]?.server}
                      </p>
                    )}
                  </div>

                  {trunkForm.provider === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SIP-Server *</label>
                      <input
                        type="text"
                        value={trunkForm.sip_server}
                        onChange={(e) => setTrunkForm({...trunkForm, sip_server: e.target.value})}
                        placeholder="z.B. sip.provider.de"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        required
                      />
                    </div>
                  )}

                  {PROVIDERS[trunkForm.provider]?.supportsIp && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Auth-Modus *</label>
                      <select
                        value={trunkForm.auth_mode}
                        onChange={(e) => setTrunkForm({...trunkForm, auth_mode: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="registration">Registrierung (Username/Passwort)</option>
                        <option value="ip">Fix-IP Authentifizierung</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={trunkForm.name}
                      onChange={(e) => setTrunkForm({...trunkForm, name: e.target.value})}
                      placeholder="z.B. Plusnet Hauptanschluss"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>

                  {trunkForm.auth_mode === 'registration' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                        <input
                          type="text"
                          value={trunkForm.username}
                          onChange={(e) => setTrunkForm({...trunkForm, username: e.target.value})}
                          placeholder="SIP-Username"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Passwort *</label>
                        <input
                          type="password"
                          value={trunkForm.password}
                          onChange={(e) => setTrunkForm({...trunkForm, password: e.target.value})}
                          placeholder="SIP-Passwort"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          required
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rufnummernblock</label>
                    <input
                      type="text"
                      value={trunkForm.number_block}
                      onChange={(e) => setTrunkForm({...trunkForm, number_block: e.target.value})}
                      placeholder="z.B. +492216698"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caller-ID</label>
                    <input
                      type="text"
                      value={trunkForm.caller_id}
                      onChange={(e) => setTrunkForm({...trunkForm, caller_id: e.target.value})}
                      placeholder="Ausgehende Rufnummer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="trunk-enabled"
                    checked={trunkForm.enabled}
                    onChange={(e) => setTrunkForm({...trunkForm, enabled: e.target.checked})}
                    className="w-4 h-4 text-primary-500 rounded"
                  />
                  <label htmlFor="trunk-enabled" className="text-sm text-gray-700">Trunk aktiviert</label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    {editingTrunk ? 'Speichern' : 'Anlegen'}
                  </button>
                  <button type="button" onClick={handleTrunkCancel} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">SIP-Trunks ({trunks.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Server</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auth-Modus</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {trunks.map((trunk) => (
                    <tr key={trunk.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{trunk.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{providerLabel(trunk.provider, trunk.sip_server)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-sm">{trunk.sip_server}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-sm ${trunk.auth_mode === 'registration' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {trunk.auth_mode === 'registration' ? 'Registrierung' : 'Fix-IP'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {trunk.enabled ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Phone className="w-4 h-4" /> Aktiv
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <PhoneOff className="w-4 h-4" /> Deaktiviert
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => handleTrunkEdit(trunk)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleTrunkDelete(trunk)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {trunks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        Keine SIP-Trunks konfiguriert. Klicken Sie auf "Neuer SIP-Trunk" um einen anzulegen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
