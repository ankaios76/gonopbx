import { useState, useEffect } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing, Users, Activity, CheckCircle, XCircle, AlertTriangle, Server, History, ArrowRight, ArrowDownLeft, ArrowUpRight, Repeat2, Clock } from 'lucide-react'
import { api } from '../services/api'

interface SystemStatus {
  asterisk: string
  endpoints: Array<{
    endpoint: string
    display_name: string
    type: 'peer' | 'trunk'
    provider?: string
    status: string
    rtt?: number
  }>
  system?: {
    health: string
    issues: string[]
    database: string
    api: string
  }
}

const PROVIDER_INFO: Record<string, { label: string; logo?: string }> = {
  plusnet_basic: { label: 'Plusnet IPfonie Basic/Extended', logo: '/logos/plusnet.svg' },
  plusnet_connect: { label: 'Plusnet IPfonie Extended Connect', logo: '/logos/plusnet.svg' },
}

interface InboundRoute {
  id: number
  did: string
  trunk_id: number
  destination_extension: string
  description: string | null
}

interface CDRRecord {
  id: number
  call_date: string
  clid: string | null
  src: string | null
  dst: string | null
  channel: string | null
  dstchannel: string | null
  duration: number | null
  billsec: number | null
  disposition: string | null
}

interface DashboardProps {
  onExtensionClick?: (extension: string) => void
  onNavigate?: (page: string) => void
}

export default function Dashboard({ onExtensionClick, onNavigate }: DashboardProps) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [routes, setRoutes] = useState<InboundRoute[]>([])
  const [recentCalls, setRecentCalls] = useState<CDRRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const [statusData, routesData, cdrData] = await Promise.all([
        api.getDashboardStatus(),
        api.getRoutes(),
        api.getCdr('limit=5'),
      ])

      setStatus(statusData)
      setRoutes(routesData || [])
      setRecentCalls(cdrData || [])
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const onlineEndpoints = status?.endpoints?.filter(e => e.status === 'online').length || 0
  const totalEndpoints = status?.endpoints?.length || 0

  const getHealthIcon = () => {
    const health = status?.system?.health || 'unknown'
    switch (health) {
      case 'healthy':
        return <CheckCircle className="w-6 h-6 text-green-600" />
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />
      case 'critical':
        return <XCircle className="w-6 h-6 text-red-600" />
      default:
        return <Activity className="w-6 h-6 text-gray-600" />
    }
  }

  const getHealthColor = () => {
    const health = status?.system?.health || 'unknown'
    switch (health) {
      case 'healthy':
        return 'bg-green-100'
      case 'warning':
      case 'degraded':
        return 'bg-yellow-100'
      case 'critical':
        return 'bg-red-100'
      default:
        return 'bg-gray-100'
    }
  }

  const getHealthText = () => {
    const health = status?.system?.health || 'unknown'
    switch (health) {
      case 'healthy':
        return 'Healthy'
      case 'warning':
        return 'Warning'
      case 'degraded':
        return 'Degraded'
      case 'critical':
        return 'Critical'
      default:
        return 'Unknown'
    }
  }

  const getDispositionLabel = (disposition: string | null) => {
    switch (disposition) {
      case 'ANSWERED':
        return 'Angenommen'
      case 'NO ANSWER':
        return 'Verpasst'
      case 'BUSY':
        return 'Besetzt'
      case 'FAILED':
        return 'Fehlgeschlagen'
      default:
        return disposition || 'Unbekannt'
    }
  }

  const getDispositionColor = (disposition: string | null) => {
    switch (disposition) {
      case 'ANSWERED':
        return 'text-green-600 bg-green-50'
      case 'NO ANSWER':
        return 'text-red-600 bg-red-50'
      case 'BUSY':
        return 'text-orange-600 bg-orange-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  // Find extension display name
  const getEndpointName = (ext: string | null) => {
    if (!ext) return '-'
    const ep = status?.endpoints?.find(e => e.endpoint === ext)
    if (ep?.display_name && ep.display_name !== ep.endpoint) {
      return `${ep.display_name} (${ext})`
    }
    return ext
  }

  // Extract extension from channel string like "PJSIP/1099-00000002"
  const getExtFromChannel = (channel: string | null) => {
    if (!channel) return null
    const match = channel.match(/^PJSIP\/(\d{4})-/)
    return match ? match[1] : null
  }

  // Get display source/destination considering outbound calls where src = DID
  const getCallSrcName = (call: CDRRecord) => {
    const direction = getCallDirection(call)
    if (direction === 'outbound') {
      const ext = getExtFromChannel(call.channel)
      if (ext) return getEndpointName(ext)
    }
    return getEndpointName(call.src)
  }

  const getCallDstName = (call: CDRRecord) => {
    const direction = getCallDirection(call)
    if (direction === 'inbound') {
      const ext = getExtFromChannel(call.dstchannel)
      if (ext) return getEndpointName(ext)
    }
    return getEndpointName(call.dst)
  }

  const getCallDirection = (call: CDRRecord): 'inbound' | 'outbound' | 'internal' => {
    const ch = call.channel || ''
    const dstCh = call.dstchannel || ''
    const srcFromPeer = /^PJSIP\/\d{4}-/.test(ch)
    const dstToPeer = /^PJSIP\/\d{4}-/.test(dstCh)
    const srcFromTrunk = /^PJSIP\/trunk-/.test(ch)
    const dstToTrunk = /^PJSIP\/trunk-/.test(dstCh)

    if (srcFromPeer && dstToTrunk) return 'outbound'
    if (srcFromTrunk && dstToPeer) return 'inbound'
    if (srcFromPeer && dstToPeer) return 'internal'

    // Fallback auf src/dst Nummern
    const srcInternal = /^1\d{3}$/.test(call.src || '')
    const dstInternal = /^1\d{3}$/.test(call.dst || '')
    if (srcInternal && !dstInternal) return 'outbound'
    if (!srcInternal && dstInternal) return 'inbound'
    return 'internal'
  }

  const getDirectionIcon = (direction: 'inbound' | 'outbound' | 'internal') => {
    switch (direction) {
      case 'inbound':
        return <ArrowDownLeft className="w-4 h-4 text-green-600" />
      case 'outbound':
        return <ArrowUpRight className="w-4 h-4 text-blue-600" />
      case 'internal':
        return <Repeat2 className="w-4 h-4 text-gray-500" />
    }
  }

  const getDirectionLabel = (direction: 'inbound' | 'outbound' | 'internal') => {
    switch (direction) {
      case 'inbound':
        return 'Eingehend'
      case 'outbound':
        return 'Ausgehend'
      case 'internal':
        return 'Intern'
    }
  }

  const getDirectionColor = (direction: 'inbound' | 'outbound' | 'internal') => {
    switch (direction) {
      case 'inbound':
        return 'text-green-700 bg-green-50 border-green-200'
      case 'outbound':
        return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'internal':
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">

      {/* ===== HEADER STATUS CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[120px]">

        {/* Asterisk */}
        <div className="bg-white rounded-lg shadow px-6 h-full flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Asterisk</p>
            <p className="text-2xl font-bold text-gray-900">
              {status?.asterisk === 'connected' ? 'Online' : 'Offline'}
            </p>
          </div>
          <div className={`p-3 rounded-full ${status?.asterisk === 'connected' ? 'bg-green-100' : 'bg-red-100'}`}>
            {status?.asterisk === 'connected'
              ? <CheckCircle className="w-6 h-6 text-green-600" />
              : <XCircle className="w-6 h-6 text-red-600" />}
          </div>
        </div>

        {/* Endpoints */}
        <div className="bg-white rounded-lg shadow px-6 h-full flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Endpoints Online</p>
            <p className="text-2xl font-bold text-gray-900">
              {onlineEndpoints} / {totalEndpoints}
            </p>
          </div>
          <div className="p-3 rounded-full bg-purple-100">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
        </div>

        {/* System */}
        <div className="bg-white rounded-lg shadow px-6 h-full flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">System</p>
            <p className="text-2xl font-bold text-gray-900">{getHealthText()}</p>
          </div>
          <div className={`p-3 rounded-full ${getHealthColor()}`}>
            {getHealthIcon()}
          </div>
        </div>

      </div>

      {/* Leitungen */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Leitungen</h2>
        </div>

        {loading ? (
          <p className="text-gray-500 text-center py-4">Laden...</p>
        ) : status?.endpoints?.filter(e => e.type === 'trunk').length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {status.endpoints.filter(e => e.type === 'trunk').map(endpoint => {
              const providerKey = endpoint.provider || ''
              const provider = PROVIDER_INFO[providerKey]
              return (
              <div
                key={endpoint.endpoint}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  endpoint.status === 'online'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {provider?.logo ? (
                  <img
                    src={provider.logo}
                    alt={provider.label}
                    className="w-12 h-12 object-contain flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <Server className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {provider?.label || endpoint.display_name || endpoint.endpoint}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {endpoint.display_name}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Keine Leitungen konfiguriert</p>
        )}
      </div>

      {/* Nebenstellen */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Nebenstellen</h2>
        </div>

        {loading ? (
          <p className="text-gray-500 text-center py-4">Laden...</p>
        ) : status?.endpoints?.filter(e => e.type !== 'trunk').length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {status.endpoints.filter(e => e.type !== 'trunk').map(endpoint => (
              <div
                key={endpoint.endpoint}
                onClick={() => onExtensionClick?.(endpoint.endpoint)}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition hover:shadow-md ${
                  endpoint.status === 'online'
                    ? 'bg-green-50 border-green-200 hover:border-green-300'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <div>
                    <span className="font-medium">{endpoint.display_name || endpoint.endpoint}</span>
                    {endpoint.display_name && endpoint.display_name !== endpoint.endpoint && (
                      <span className="text-xs text-gray-400 ml-2">{endpoint.endpoint}</span>
                    )}
                    {(() => {
                      const extRoutes = routes.filter(r => r.destination_extension === endpoint.endpoint)
                      if (extRoutes.length === 0) return null
                      return (
                        <div className="mt-1 space-y-0.5">
                          {extRoutes.map((route, idx) => (
                            <div key={route.id} className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-gray-600">{route.did}</span>
                              <PhoneIncoming className="w-3 h-3 text-green-400" />
                              {idx === 0 && <PhoneOutgoing className="w-3 h-3 text-blue-400" />}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Keine Nebenstellen registriert</p>
        )}
      </div>

      {/* Letzte Anrufe */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Letzte Anrufe</h2>
          </div>
          <button
            onClick={() => onNavigate?.('cdr')}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium transition"
          >
            Alle Anrufe
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-gray-500">Laden...</div>
        ) : recentCalls.length > 0 ? (
          <div className="divide-y">
            {recentCalls.map(call => {
              const direction = getCallDirection(call)
              return (
              <div key={call.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50">
                {/* Richtungs-Icon */}
                <div className={`flex-shrink-0 p-2 rounded-full border ${getDirectionColor(direction)}`}>
                  {getDirectionIcon(direction)}
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{getCallSrcName(call)}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">{getCallDstName(call)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(call.call_date)}
                    </span>
                    {call.billsec != null && call.billsec > 0 && (
                      <span>{formatDuration(call.billsec)}</span>
                    )}
                  </div>
                </div>
                {/* Status-Badges */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs border ${getDirectionColor(direction)}`}>
                    {getDirectionLabel(direction)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${getDispositionColor(call.disposition)}`}>
                    {getDispositionLabel(call.disposition)}
                  </span>
                </div>
              </div>
              )
            })}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-gray-500">Keine Anrufe vorhanden</div>
        )}
      </div>
    </div>
  )
}
