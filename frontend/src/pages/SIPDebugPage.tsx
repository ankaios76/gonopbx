import { useState, useEffect, useRef } from 'react'
import { ToggleLeft, ToggleRight, RefreshCw, ChevronDown, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react'
import { api } from '../services/api'

interface SIPCall {
  call_id: string
  first_seen: string
  from: string
  to: string
  method: string
  message_count: number
}

interface SIPMessageData {
  timestamp: string
  direction: string
  method: string
  status_code: number
  from: string
  to: string
  cseq: string
  raw_text: string
}

export default function SIPDebugPage() {
  const [enabled, setEnabled] = useState(false)
  const [messageCount, setMessageCount] = useState(0)
  const [callCount, setCallCount] = useState(0)
  const [calls, setCalls] = useState<SIPCall[]>([])
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SIPMessageData[]>([])
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async () => {
    try {
      const data = await api.getSipDebugStatus()
      setEnabled(data.enabled)
      setMessageCount(data.message_count)
      setCallCount(data.call_count)
    } catch (e) {
      console.error('Failed to fetch SIP debug status', e)
    }
  }

  const fetchCalls = async () => {
    try {
      const data = await api.getSipDebugCalls()
      setCalls(data)
    } catch (e) {
      console.error('Failed to fetch SIP debug calls', e)
    }
  }

  const fetchMessages = async (callId: string) => {
    try {
      const data = await api.getSipDebugMessages(callId)
      setMessages(data)
    } catch (e) {
      console.error('Failed to fetch SIP debug messages', e)
    }
  }

  const toggleCapture = async () => {
    setToggling(true)
    try {
      if (enabled) {
        await api.disableSipDebug()
      } else {
        await api.enableSipDebug()
      }
      await fetchStatus()
    } catch (e) {
      console.error('Failed to toggle SIP debug', e)
    } finally {
      setToggling(false)
    }
  }

  const refresh = async () => {
    setLoading(true)
    await fetchStatus()
    await fetchCalls()
    if (selectedCallId) {
      await fetchMessages(selectedCallId)
    }
    setLoading(false)
  }

  const selectCall = async (callId: string) => {
    if (selectedCallId === callId) {
      setSelectedCallId(null)
      setMessages([])
      setExpandedMsg(null)
      return
    }
    setSelectedCallId(callId)
    setExpandedMsg(null)
    await fetchMessages(callId)
  }

  // Initial load
  useEffect(() => {
    fetchStatus()
    fetchCalls()
  }, [])

  // Auto-refresh when enabled
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (enabled) {
      intervalRef.current = setInterval(() => {
        fetchStatus()
        fetchCalls()
        if (selectedCallId) {
          fetchMessages(selectedCallId)
        }
      }, 10000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, selectedCallId])

  const shortCallId = (cid: string) => {
    if (cid.length > 24) return cid.substring(0, 24) + '...'
    return cid
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso + 'Z')
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso + 'Z')
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  }

  // Extract display name or user part from SIP URI
  const extractParty = (header: string) => {
    if (!header) return ''
    const nameMatch = header.match(/^"?([^"<]+)"?\s*</)
    if (nameMatch) return nameMatch[1].trim()
    const uriMatch = header.match(/<sip:([^@>]+)/)
    if (uriMatch) return uriMatch[1]
    const bareMatch = header.match(/sip:([^@>]+)/)
    if (bareMatch) return bareMatch[1]
    return header.substring(0, 30)
  }

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">SIP Debug</h1>
            <button
              onClick={toggleCapture}
              disabled={toggling}
              className="flex items-center gap-2 transition-colors"
              title={enabled ? 'Capture deaktivieren' : 'Capture aktivieren'}
            >
              {enabled ? (
                <ToggleRight className="w-8 h-8 text-green-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-gray-400" />
              )}
              <span className={`text-sm font-medium ${enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {toggling ? '...' : enabled ? 'Aktiv' : 'Inaktiv'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{messageCount}</span> Nachrichten
              {' / '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{callCount}</span> Calls
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {enabled && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Auto-Refresh alle 10 Sekunden. Nachrichten werden max. 2 Stunden gespeichert.
          </p>
        )}
      </div>

      {/* Call List */}
      {calls.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center text-gray-500 dark:text-gray-400">
          {enabled
            ? 'Noch keine SIP-Nachrichten erfasst. Starten Sie einen Anruf.'
            : 'Capture ist deaktiviert. Aktivieren Sie den Toggle oben.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 w-8"></th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Zeit</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Call-ID</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Von</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Nach</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Methode</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300 text-right">Msgs</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.call_id}>
                    <td colSpan={7} className="p-0">
                      <div>
                        <button
                          onClick={() => selectCall(call.call_id)}
                          className={`w-full flex items-center text-left px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-700 ${
                            selectedCallId === call.call_id
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                          }`}
                        >
                          <div className="w-8 flex-shrink-0">
                            {selectedCallId === call.call_id ? (
                              <ChevronDown className="w-4 h-4 text-blue-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                            <div className="text-gray-500 dark:text-gray-400">{formatDateTime(call.first_seen)}</div>
                            <div className="font-mono text-xs text-gray-600 dark:text-gray-300" title={call.call_id}>
                              {shortCallId(call.call_id)}
                            </div>
                            <div className="text-gray-700 dark:text-gray-300">{extractParty(call.from)}</div>
                            <div className="text-gray-700 dark:text-gray-300">{extractParty(call.to)}</div>
                            <div>
                              <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                                {call.method || '?'}
                              </span>
                            </div>
                            <div className="text-right text-gray-500 dark:text-gray-400">{call.message_count}</div>
                          </div>
                        </button>

                        {/* Expanded SIP Messages */}
                        {selectedCallId === call.call_id && messages.length > 0 && (
                          <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-6 py-4 space-y-2">
                            {messages.map((msg, idx) => (
                              <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <button
                                  onClick={() => setExpandedMsg(expandedMsg === idx ? null : idx)}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                  {msg.direction === 'sent' ? (
                                    <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                  ) : (
                                    <ArrowLeft className="w-4 h-4 text-green-500 flex-shrink-0" />
                                  )}
                                  <span className="text-xs text-gray-400 dark:text-gray-500 w-20 flex-shrink-0">
                                    {formatTime(msg.timestamp)}
                                  </span>
                                  <span className={`text-sm font-medium ${
                                    msg.method
                                      ? 'text-blue-700 dark:text-blue-400'
                                      : msg.status_code >= 200 && msg.status_code < 300
                                        ? 'text-green-700 dark:text-green-400'
                                        : msg.status_code >= 400
                                          ? 'text-red-700 dark:text-red-400'
                                          : 'text-yellow-700 dark:text-yellow-400'
                                  }`}>
                                    {msg.method || `${msg.status_code}`}
                                  </span>
                                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{msg.cseq}</span>
                                  <div className="flex-1" />
                                  {expandedMsg === idx ? (
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                                {expandedMsg === idx && (
                                  <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 overflow-x-auto">
                                    <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                                      {msg.raw_text}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
