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

  // Auth - self-service
  async changeMyPassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
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

  async getAvailableDids() {
    return this.request<{ trunk_id: number; trunk_name: string; dids: string[] }[]>('/api/trunks/available-dids')
  }

  async getTrunkStatus(id: number) {
    return this.request<any>(`/api/trunks/${id}/status`)
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

  async sendWelcomeEmail(id: number, loginPassword: string) {
    return this.request<any>(`/api/users/${id}/send-welcome`, {
      method: 'POST',
      body: JSON.stringify({ login_password: loginPassword }),
    })
  }

  async changeUserPassword(id: number, password: string) {
    return this.request<any>(`/api/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    })
  }

  async updateUser(id: number, data: { full_name?: string; email?: string; role?: string }) {
    return this.request<any>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async uploadUserAvatar(id: number, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const url = `${this.baseUrl}/api/users/${id}/avatar`
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    })
    if (response.status === 401) {
      localStorage.removeItem('token')
      window.location.reload()
      throw new Error('Sitzung abgelaufen')
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.detail || `API Error: ${response.status}`)
    }
    return response.json()
  }

  async assignExtensionToUser(userId: number, extension: string | null) {
    return this.request<any>(`/api/users/${userId}/extension`, {
      method: 'PATCH',
      body: JSON.stringify({ extension }),
    })
  }

  async assignUserToPeer(peerId: number, userId: number | null) {
    return this.request<any>(`/api/peers/${peerId}/user`, {
      method: 'PATCH',
      body: JSON.stringify({ user_id: userId }),
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

  // IP Whitelist
  async getIpWhitelist() {
    return this.request<{ enabled: boolean; ips: string[] }>('/api/settings/ip-whitelist')
  }

  async updateIpWhitelist(data: { enabled: boolean; ips: string[] }) {
    return this.request<any>('/api/settings/ip-whitelist', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  // Server Management
  async getServerInfo() {
    return this.request<any>('/api/settings/server-info')
  }

  async checkUpdate() {
    return this.request<any>('/api/settings/check-update')
  }

  async restartService(service: string) {
    return this.request<any>('/api/settings/restart-service', {
      method: 'POST',
      body: JSON.stringify({ service }),
    })
  }

  async rebootServer() {
    return this.request<any>('/api/settings/reboot', {
      method: 'POST',
    })
  }

  async installUpdate() {
    return this.request<any>('/api/settings/install-update', {
      method: 'POST',
    })
  }

  async updatePeerOutbound(peerId: number, data: { outbound_cid: string | null; pai: string | null }) {
    return this.request<any>(`/api/peers/${peerId}/outbound`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updatePeerCodecs(peerId: number, codecs: string | null) {
    return this.request<any>(`/api/peers/${peerId}/codecs`, {
      method: 'PATCH',
      body: JSON.stringify({ codecs }),
    })
  }

  // Password Strength
  async generatePassword() {
    return this.request<{ password: string; strength: { score: number; level: string; warnings: string[] } }>('/api/peers/generate-password')
  }

  async getWeakPasswords() {
    return this.request<any[]>('/api/peers/weak-passwords')
  }

  // Audit Log
  async getAuditLogs(limit = 50, offset = 0) {
    return this.request<{ total: number; logs: any[] }>(`/api/audit/?limit=${limit}&offset=${offset}`)
  }

  // Home Assistant Settings
  async getHASettings() {
    return this.request<any>('/api/settings/home-assistant')
  }

  async updateHASettings(data: any) {
    return this.request<any>('/api/settings/home-assistant', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async generateHAApiKey() {
    return this.request<{ key: string }>('/api/settings/home-assistant/generate-key', {
      method: 'POST',
    })
  }

  async testMqttConnection(data: { broker: string; port: number; user: string; password: string }) {
    return this.request<any>('/api/settings/home-assistant/test-mqtt', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // SIP Debug
  async getSipDebugStatus() {
    return this.request<any>('/api/sip-debug/status')
  }

  async enableSipDebug() {
    return this.request<any>('/api/sip-debug/enable', { method: 'POST' })
  }

  async disableSipDebug() {
    return this.request<any>('/api/sip-debug/disable', { method: 'POST' })
  }

  async getSipDebugCalls() {
    return this.request<any[]>('/api/sip-debug/calls')
  }

  async getSipDebugMessages(callId: string) {
    return this.request<any[]>(`/api/sip-debug/calls/${encodeURIComponent(callId)}`)
  }

  // Fail2Ban
  async getFail2banStatus() {
    return this.request<any>('/api/settings/fail2ban')
  }

  async unbanIp(jail: string, ip: string) {
    return this.request<any>('/api/settings/fail2ban/unban', {
      method: 'POST',
      body: JSON.stringify({ jail, ip }),
    })
  }
}

export const api = new ApiService(API_BASE_URL)
