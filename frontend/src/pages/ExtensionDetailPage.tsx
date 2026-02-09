import { useState, useEffect } from 'react'
import { ArrowLeft, Phone, Plus, Trash2, Server, PhoneForwarded, PhoneOutgoing, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../services/api'

interface Props {
  extension: string
  onBack: () => void
}

interface InboundRoute {
  id: number
  did: string
  trunk_id: number
  destination_extension: string
  description: string | null
  enabled: boolean
}

interface SIPTrunk {
  id: number
  name: string
  provider: string
  sip_server: string
  number_block: string | null
}

interface SIPPeer {
  id: number
  extension: string
  caller_id: string | null
  enabled: boolean
}

interface CallForwardRule {
  id: number
  extension: string
  forward_type: string
  destination: string
  ring_time: number
  enabled: boolean
}

const FORWARD_TYPE_LABELS: Record<string, string> = {
  unconditional: 'Sofort (immer)',
  busy: 'Bei Besetzt',
  no_answer: 'Bei Nichtmelden',
}

const FORWARD_TYPE_DESCRIPTIONS: Record<string, string> = {
  unconditional: 'Alle Anrufe werden sofort weitergeleitet, das Telefon klingelt nicht.',
  busy: 'Weiterleitung nur wenn die Leitung besetzt ist.',
  no_answer: 'Weiterleitung wenn nach einer bestimmten Zeit nicht abgenommen wird.',
}

export default function ExtensionDetailPage({ extension, onBack }: Props) {
  const [peer, setPeer] = useState<SIPPeer | null>(null)
  const [routes, setRoutes] = useState<InboundRoute[]>([])
  const [allRoutes, setAllRoutes] = useState<InboundRoute[]>([])
  const [trunks, setTrunks] = useState<SIPTrunk[]>([])
  const [forwards, setForwards] = useState<CallForwardRule[]>([])
  const [loading, setLoading] = useState(true)

  // Route form state
  const [showRouteForm, setShowRouteForm] = useState(false)
  const [routeFormData, setRouteFormData] = useState({
    did: '',
    trunk_id: 0,
    description: '',
  })

  // Forward form state
  const [showForwardForm, setShowForwardForm] = useState(false)
  const [forwardFormData, setForwardFormData] = useState({
    forward_type: 'unconditional',
    destination: '',
    ring_time: 20,
  })

  useEffect(() => {
    fetchData()
  }, [extension])

  const fetchData = async () => {
    try {
      const [peersData, routesData, trunksData, forwardsData, allRoutesData] = await Promise.all([
        api.getSipPeers(),
        api.getRoutesByExtension(extension),
        api.getTrunks(),
        api.getCallForwards(extension),
        api.getRoutes(),
      ])
      setPeer(peersData.find((p: SIPPeer) => p.extension === extension) || null)
      setRoutes(routesData)
      setAllRoutes(allRoutesData || [])
      setTrunks(trunksData)
      setForwards(forwardsData)
      if (trunksData.length > 0 && routeFormData.trunk_id === 0) {
        setRouteFormData(f => ({ ...f, trunk_id: trunksData[0].id }))
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // ==================== ROUTES ====================
  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.createRoute({
        did: routeFormData.did,
        trunk_id: routeFormData.trunk_id,
        destination_extension: extension,
        description: routeFormData.description || null,
        enabled: true,
      })
      setRouteFormData({ did: '', trunk_id: trunks[0]?.id || 0, description: '' })
      setShowRouteForm(false)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Zuordnen')
    }
  }

  const handleDeleteRoute = async (route: InboundRoute) => {
    if (!confirm(`Rufnummer ${route.did} wirklich entfernen?`)) return
    try {
      await api.deleteRoute(route.id)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Löschen')
    }
  }

  const getTrunkName = (trunkId: number) => {
    return trunks.find(t => t.id === trunkId)?.name || `Trunk #${trunkId}`
  }

  // ==================== CALL FORWARDS ====================
  const handleAddForward = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.createCallForward({
        extension,
        forward_type: forwardFormData.forward_type,
        destination: forwardFormData.destination,
        ring_time: forwardFormData.ring_time,
        enabled: true,
      })
      setForwardFormData({ forward_type: 'unconditional', destination: '', ring_time: 20 })
      setShowForwardForm(false)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Erstellen der Rufumleitung')
    }
  }

  const handleToggleForward = async (fwd: CallForwardRule) => {
    try {
      await api.updateCallForward(fwd.id, { enabled: !fwd.enabled })
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Ändern')
    }
  }

  const handleDeleteForward = async (fwd: CallForwardRule) => {
    if (!confirm(`Rufumleitung "${FORWARD_TYPE_LABELS[fwd.forward_type]}" wirklich löschen?`)) return
    try {
      await api.deleteCallForward(fwd.id)
      fetchData()
    } catch (error: any) {
      alert(error.message || 'Fehler beim Löschen')
    }
  }

  // Available forward types (exclude already configured ones)
  const availableForwardTypes = Object.keys(FORWARD_TYPE_LABELS).filter(
    type => !forwards.some(f => f.forward_type === type)
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {peer?.caller_id || extension}
          </h1>
          <p className="text-gray-500">Nebenstelle {extension}</p>
        </div>
      </div>

      {/* ==================== Ausgehende Rufnummer ==================== */}
      {routes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 mb-8 flex items-center gap-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <PhoneOutgoing className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-sm text-blue-600 font-medium">Ausgehende Rufnummer</div>
            <div className="text-lg font-bold text-blue-900">{routes[0].did}</div>
            <div className="text-xs text-blue-500">
              Wird bei ausgehenden Anrufen als Caller-ID gesendet (via {getTrunkName(routes[0].trunk_id)})
            </div>
          </div>
        </div>
      )}

      {/* ==================== Zugeordnete Rufnummern ==================== */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Zugeordnete Rufnummern</h2>
          </div>
          {!showRouteForm && trunks.length > 0 && (
            <button
              onClick={() => setShowRouteForm(true)}
              className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              Rufnummer zuordnen
            </button>
          )}
        </div>

        {showRouteForm && (() => {
          const selectedTrunk = trunks.find(t => t.id === routeFormData.trunk_id)
          const assignedDids = allRoutes.filter(r => r.trunk_id === routeFormData.trunk_id)
          return (
          <div className="px-6 py-4 border-b bg-gray-50">
            <form onSubmit={handleAddRoute} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leitung *</label>
                  <select
                    value={routeFormData.trunk_id}
                    onChange={(e) => setRouteFormData({ ...routeFormData, trunk_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    {trunks.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rufnummer (DID) *</label>
                  <input
                    type="text"
                    value={routeFormData.did}
                    onChange={(e) => setRouteFormData({ ...routeFormData, did: e.target.value })}
                    placeholder="z.B. +4922166980"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                  <input
                    type="text"
                    value={routeFormData.description}
                    onChange={(e) => setRouteFormData({ ...routeFormData, description: e.target.value })}
                    placeholder="z.B. Hauptnummer"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Trunk-Info: Verfügbare Nummern */}
              {selectedTrunk && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Nummernblock von "{selectedTrunk.name}"
                  </div>
                  {selectedTrunk.number_block ? (
                    <div className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-1.5 rounded inline-block">
                      {selectedTrunk.number_block}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 italic">Kein Nummernblock hinterlegt</div>
                  )}
                  {assignedDids.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-500 mb-1">Bereits vergebene Nummern dieser Leitung:</div>
                      <div className="flex flex-wrap gap-2">
                        {assignedDids.map(r => (
                          <span key={r.id} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-1 rounded font-mono">
                            {r.did} → {r.destination_extension}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                  Zuordnen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRouteForm(false)
                    setRouteFormData({ did: '', trunk_id: trunks[0]?.id || 0, description: '' })
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
          )
        })()}

        <div className="divide-y">
          {routes.length > 0 ? (
            routes.map((route, index) => (
              <div key={route.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Phone className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {route.did}
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Eingehend</span>
                      {index === 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Ausgehend</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <Server className="w-3 h-3" />
                      {getTrunkName(route.trunk_id)}
                      {route.description && (
                        <span className="text-gray-400">— {route.description}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRoute(route)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              {trunks.length > 0
                ? 'Keine Rufnummern zugeordnet. Klicken Sie auf "Rufnummer zuordnen" um eine Nummer zuzuweisen.'
                : 'Bitte zuerst einen SIP-Trunk unter Extensions > SIP-Trunks anlegen.'}
            </div>
          )}
        </div>
      </div>

      {/* ==================== Rufumleitungen ==================== */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PhoneForwarded className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Rufumleitungen</h2>
          </div>
          {!showForwardForm && availableForwardTypes.length > 0 && (
            <button
              onClick={() => {
                setForwardFormData(f => ({ ...f, forward_type: availableForwardTypes[0] }))
                setShowForwardForm(true)
              }}
              className="flex items-center gap-2 bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              Umleitung hinzufügen
            </button>
          )}
        </div>

        {showForwardForm && (
          <div className="px-6 py-4 border-b bg-gray-50">
            <form onSubmit={handleAddForward} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Typ *</label>
                  <select
                    value={forwardFormData.forward_type}
                    onChange={(e) => setForwardFormData({ ...forwardFormData, forward_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    {availableForwardTypes.map(type => (
                      <option key={type} value={type}>{FORWARD_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {FORWARD_TYPE_DESCRIPTIONS[forwardFormData.forward_type]}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zielrufnummer *</label>
                  <input
                    type="text"
                    value={forwardFormData.destination}
                    onChange={(e) => setForwardFormData({ ...forwardFormData, destination: e.target.value })}
                    placeholder="z.B. +491701234567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                {forwardFormData.forward_type === 'no_answer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Klingelzeit (Sek.)</label>
                    <input
                      type="number"
                      value={forwardFormData.ring_time}
                      onChange={(e) => setForwardFormData({ ...forwardFormData, ring_time: Number(e.target.value) })}
                      min={5}
                      max={120}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Wie lange soll das Telefon klingeln bevor umgeleitet wird?
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm">
                  Umleitung erstellen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForwardForm(false)
                    setForwardFormData({ forward_type: 'unconditional', destination: '', ring_time: 20 })
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="divide-y">
          {forwards.length > 0 ? (
            forwards.map(fwd => (
              <div key={fwd.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <PhoneForwarded className={`w-5 h-5 ${fwd.enabled ? 'text-orange-500' : 'text-gray-300'}`} />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {FORWARD_TYPE_LABELS[fwd.forward_type]}
                      {!fwd.enabled && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Deaktiviert</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Ziel: {fwd.destination}
                      {fwd.forward_type === 'no_answer' && (
                        <span className="ml-2 text-gray-400">({fwd.ring_time}s Klingelzeit)</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleForward(fwd)}
                    className={`p-2 rounded-lg transition ${fwd.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={fwd.enabled ? 'Deaktivieren' : 'Aktivieren'}
                  >
                    {fwd.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => handleDeleteForward(fwd)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              Keine Rufumleitungen konfiguriert. Klicken Sie auf "Umleitung hinzufügen" um eine Weiterleitung einzurichten.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
