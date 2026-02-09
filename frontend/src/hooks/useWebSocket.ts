import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const WS_URL = typeof window !== 'undefined' 
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'http://localhost:8000'

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    // Connect to WebSocket
    socketRef.current = io(WS_URL, {
      transports: ['websocket', 'polling'],
      query: { token: token || '' },
    })

    socketRef.current.on('connect', () => {
      console.log('✓ WebSocket connected')
      setConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      console.log('✗ WebSocket disconnected')
      setConnected(false)
    })

    socketRef.current.on('message', (data: any) => {
      console.log('WebSocket message:', data)
      setLastMessage(data)
    })

    socketRef.current.on('ami_event', (data: any) => {
      console.log('AMI Event:', data)
      setLastMessage(data)
    })

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  return {
    connected,
    lastMessage,
    socket: socketRef.current,
  }
}
