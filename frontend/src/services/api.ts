const API_BASE_URL = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://localhost:8000'

class ApiService {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token')
    if (token) {
      return { Authorization: `Bearer ${token}` }
    }
    return {}
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options?.headers,
        },
      })

      if (response.status === 401) {
        localStorage.removeItem('token')
        window.location.reload()
        throw new Error('Sitzung abgelaufen')
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || `API Error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('API Request failed:', error)
      throw error
    }
  }

  // Health
  async getHealth() {
    return this.request<any>('/api/health')
  }

  // Dashboard
  async getDashboardStatus() {
    return this.request<any>('/api/dashboard/status')
  }

  async getActiveCalls() {
    return this.request<any>('/api/calls/active')
  }

  async getRegisteredPeers() {
    return this.request<any>('/api/dashboard/registered-peers')
  }

  // SIP Peers
  async getSipPeers() {
    return this.request<any[]>('/api/peers/')
  }

  async getSipPeer(id: number) {
    return this.request<any>(`/api/peers/${id}`)
  }

  async createSipPeer(data: any) {
    return this.request<any>('/api/peers/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateSipPeer(id: number, data: any) {
    return this.request<any>(`/api/peers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteSipPeer(id: number) {
    return this.request<any>(`/api/peers/${id}`, {
      method: 'DELETE',
    })
  }

  // SIP Trunks
  async getTrunks() {
    return this.request<any[]>('/api/trunks/')
  }

  async createTrunk(data: any) {
    return this.request<any>('/api/trunks/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateTrunk(id: number, data: any) {
    return this.request<any>(`/api/trunks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteTrunk(id: number) {
    return this.request<any>(`/api/trunks/${id}`, {
      method: 'DELETE',
    })
  }

  // Inbound Routes
  async getRoutes() {
    return this.request<any[]>('/api/routes/')
  }

  async getRoutesByExtension(extension: string) {
    return this.request<any[]>(`/api/routes/by-extension/${extension}`)
  }

  async createRoute(data: any) {
    return this.request<any>('/api/routes/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateRoute(id: number, data: any) {
    return this.request<any>(`/api/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteRoute(id: number) {
    return this.request<any>(`/api/routes/${id}`, {
      method: 'DELETE',
    })
  }

  // Call Forwarding
  async getCallForwards(extension: string) {
    return this.request<any[]>(`/api/callforward/by-extension/${extension}`)
  }

  async createCallForward(data: any) {
    return this.request<any>('/api/callforward/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateCallForward(id: number, data: any) {
    return this.request<any>(`/api/callforward/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteCallForward(id: number) {
    return this.request<any>(`/api/callforward/${id}`, {
      method: 'DELETE',
    })
  }

  // CDR
  async getCdr(params?: string) {
    return this.request<any[]>(`/api/cdr/?${params || 'limit=50'}`)
  }

  async getCdrStats() {
    return this.request<any>('/api/cdr/stats')
  }

  // Voicemail Mailbox Config
  async getVoicemailMailbox(extension: string) {
    return this.request<any>(`/api/voicemail/mailbox/${extension}`)
  }

  async updateVoicemailMailbox(extension: string, data: any) {
    return this.request<any>(`/api/voicemail/mailbox/${extension}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteVoicemailMailbox(extension: string) {
    return this.request<any>(`/api/voicemail/mailbox/${extension}`, {
      method: 'DELETE',
    })
  }

  // Voicemail Messages
  async getVoicemails(mailbox?: string) {
    const params = mailbox ? `?mailbox=${mailbox}` : ''
    return this.request<any[]>(`/api/voicemail/${params}`)
  }

  async markVoicemailRead(id: number) {
    return this.request<any>(`/api/voicemail/${id}/mark-read`, {
      method: 'PATCH',
    })
  }

  async deleteVoicemail(id: number) {
    return this.request<any>(`/api/voicemail/${id}`, {
      method: 'DELETE',
    })
  }

  // Users (Admin)
  async getUsers() {
    return this.request<any[]>('/api/users/')
  }

  async createUser(data: { username: string; password: string; role: string }) {
    return this.request<any>('/api/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteUser(id: number) {
    return this.request<any>(`/api/users/${id}`, {
      method: 'DELETE',
    })
  }

  // Settings
  async getSettings() {
    return this.request<any>('/api/settings/')
  }

  async updateSettings(data: any) {
    return this.request<any>('/api/settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async sendTestEmail(to: string) {
    return this.request<any>('/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to }),
    })
  }

  // Codec Settings
  async getCodecSettings() {
    return this.request<any>('/api/settings/codecs')
  }

  async updateCodecSettings(data: { global_codecs: string }) {
    return this.request<any>('/api/settings/codecs', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async updatePeerCodecs(peerId: number, codecs: string | null) {
    return this.request<any>(`/api/peers/${peerId}/codecs`, {
      method: 'PATCH',
      body: JSON.stringify({ codecs }),
    })
  }
}

export const api = new ApiService(API_BASE_URL)
