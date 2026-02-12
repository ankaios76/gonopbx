import { Phone, PhoneOff, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Call {
  channel: string
  caller: string
  destination: string
  state: string
  start_time: string
}

interface ActiveCallsProps {
  calls: Call[]
}

export default function ActiveCalls({ calls }: ActiveCallsProps) {
  if (calls.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Active Calls</h2>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No active calls</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Active Calls</h2>
        </div>
        <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
          {calls.length} active
        </span>
      </div>

      <div className="space-y-3">
        {calls.map((call, index) => (
          <CallItem key={call.channel || index} call={call} />
        ))}
      </div>
    </div>
  )
}

function CallItem({ call }: { call: Call }) {
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(d => d + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'connected':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30'
      case 'ringing':
        return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30'
      default:
        return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-700'
    }
  }

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'connected':
        return <Phone className="w-4 h-4" />
      case 'ringing':
        return <PhoneOff className="w-4 h-4 animate-pulse" />
      default:
        return <Phone className="w-4 h-4" />
    }
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${getStateColor(call.state)}`}>
          {getStateIcon(call.state)}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">{call.caller || 'Unknown'}</span>
            <span className="text-gray-400 dark:text-gray-500">&rarr;</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{call.destination || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded ${getStateColor(call.state)}`}>
              {call.state}
            </span>
            {call.state === 'connected' && (
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="w-3 h-3" />
                {formatDuration(duration)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
