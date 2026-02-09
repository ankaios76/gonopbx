import { useState, useEffect } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Search, Filter, RefreshCw } from 'lucide-react'
import { api } from '../services/api'

interface CDRRecord {
  id: number
  call_date: string
  clid: string | null
  src: string | null
  dst: string | null
  duration: number | null
  billsec: number | null
  disposition: string | null
}

interface CDRStats {
  total_calls: number
  answered_calls: number
  missed_calls: number
  busy_calls: number
  total_duration: number
  avg_duration: number
  calls_today: number
  calls_this_week: number
}

export default function CDRPage() {
  const [records, setRecords] = useState<CDRRecord[]>([])
  const [stats, setStats] = useState<CDRStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterSrc, setFilterSrc] = useState('')
  const [filterDst, setFilterDst] = useState('')
  const [filterDisposition, setFilterDisposition] = useState('')

  const fetchCDR = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('limit', '100')
      if (filterSrc) params.append('src', filterSrc)
      if (filterDst) params.append('dst', filterDst)
      if (filterDisposition) params.append('disposition', filterDisposition)

      const [recordsData, statsData] = await Promise.all([
        api.getCdr(params.toString()),
        api.getCdrStats()
      ])

      setRecords(recordsData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to fetch CDR:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCDR()
  }, [])

  const handleFilter = () => {
    fetchCDR()
  }

  const clearFilters = () => {
    setFilterSrc('')
    setFilterDst('')
    setFilterDisposition('')
    setTimeout(fetchCDR, 100)
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDispositionStyle = (disposition: string | null) => {
    switch (disposition) {
      case 'ANSWERED':
        return 'bg-green-100 text-green-800'
      case 'NO ANSWER':
        return 'bg-yellow-100 text-yellow-800'
      case 'BUSY':
        return 'bg-orange-100 text-orange-800'
      case 'FAILED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getDispositionIcon = (disposition: string | null) => {
    switch (disposition) {
      case 'ANSWERED':
        return <Phone className="w-4 h-4 text-green-600" />
      case 'NO ANSWER':
        return <PhoneMissed className="w-4 h-4 text-yellow-600" />
      case 'BUSY':
        return <PhoneOutgoing className="w-4 h-4 text-orange-600" />
      default:
        return <PhoneIncoming className="w-4 h-4 text-gray-600" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-sm">Gesamt</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total_calls}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-sm">Angenommen</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.answered_calls}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <PhoneMissed className="w-4 h-4" />
              <span className="text-sm">Verpasst</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600">{stats.missed_calls}</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Ø Dauer</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatDuration(Math.round(stats.avg_duration))}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Filter</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Von (Quelle)</label>
            <input
              type="text"
              value={filterSrc}
              onChange={(e) => setFilterSrc(e.target.value)}
              placeholder="z.B. 1000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nach (Ziel)</label>
            <input
              type="text"
              value={filterDst}
              onChange={(e) => setFilterDst(e.target.value)}
              placeholder="z.B. 1001"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              value={filterDisposition}
              onChange={(e) => setFilterDisposition(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Alle</option>
              <option value="ANSWERED">Angenommen</option>
              <option value="NO ANSWER">Nicht angenommen</option>
              <option value="BUSY">Besetzt</option>
              <option value="FAILED">Fehlgeschlagen</option>
            </select>
          </div>
          
          <div className="flex items-end gap-2">
            <button
              onClick={handleFilter}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Search className="w-4 h-4" />
              Suchen
            </button>
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CDR Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Anrufverlauf</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-500">Laden...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Keine Anrufe gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Von</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nach</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dauer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gesprächszeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.call_date ? formatDate(record.call_date) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PhoneOutgoing className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{record.src || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PhoneIncoming className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">{record.dst || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDuration(record.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDuration(record.billsec)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getDispositionIcon(record.disposition)}
                        <span className={`text-xs px-2 py-1 rounded-full ${getDispositionStyle(record.disposition)}`}>
                          {record.disposition || 'Unknown'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
