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


  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-sm">Gesamt</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_calls}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
              <Phone className="w-4 h-4" />
              <span className="text-sm">Angenommen</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.answered_calls}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 mb-1">
              <PhoneMissed className="w-4 h-4" />
              <span className="text-sm">Verpasst</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.missed_calls}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Ø Dauer</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatDuration(Math.round(stats.avg_duration))}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filter</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Von (Quelle)</label>
            <input
              type="text"
              value={filterSrc}
              onChange={(e) => setFilterSrc(e.target.value)}
              placeholder="z.B. 1000"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Nach (Ziel)</label>
            <input
              type="text"
              value={filterDst}
              onChange={(e) => setFilterDst(e.target.value)}
              placeholder="z.B. 1001"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CDR Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Anrufverlauf</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Laden...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Keine Anrufe gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Zeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Von</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nach</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dauer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gesprächszeit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {record.call_date ? formatDate(record.call_date) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PhoneOutgoing className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{record.src || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PhoneIncoming className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{record.dst || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDuration(record.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDuration(record.billsec)}
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
