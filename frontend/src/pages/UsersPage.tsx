import { useState, useEffect, FormEvent, useRef } from 'react'
import { Trash2, UserPlus, KeyRound, Pencil, Upload, X, Plus, RefreshCw, PhoneOutgoing, PhoneIncoming } from 'lucide-react'
import { api } from '../services/api'

interface UserEntry {
  id: number
  username: string
  role: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  created_at: string
}

interface PeerEntry {
  id: number
  extension: string
  caller_id: string | null
  user_id: number | null
}

interface RouteEntry {
  id: number
  did: string
  trunk_id: number
  destination_extension: string
  description: string | null
}

interface AvailableDidGroup {
  trunk_id: number
  trunk_name: string
  dids: string[]
}

interface TrunkInfo {
  id: number
  name: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserEntry[]>([])
  const [peers, setPeers] = useState<PeerEntry[]>([])
  const [routes, setRoutes] = useState<RouteEntry[]>([])
  const [availableDids, setAvailableDids] = useState<AvailableDidGroup[]>([])
  const [trunkNames, setTrunkNames] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    username: '', password: '', role: 'user', full_name: '', email: '', extension: ''
  })
  const [createNewExt, setCreateNewExt] = useState(false)
  const [newExtData, setNewExtData] = useState({ extension: '', secret: '', caller_id: '' })
  const [generatingPw, setGeneratingPw] = useState(false)
  // Outbound DID for create form
  const [formDid, setFormDid] = useState('')
  const [formTrunkId, setFormTrunkId] = useState('')
  // Inbound DIDs for create form
  const [formInboundDids, setFormInboundDids] = useState<{trunk_id: number, did: string}[]>([])
  // Avatar for create form
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null)
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null)
  const createFileInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState('')
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null)
  const [passwordUsername, setPasswordUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Edit modal state
  const [editUser, setEditUser] = useState<UserEntry | null>(null)
  const [editData, setEditData] = useState({ full_name: '', email: '', role: 'user' })
  const [editExtension, setEditExtension] = useState('')
  const [editDid, setEditDid] = useState('')
  const [editTrunkId, setEditTrunkId] = useState('')
  const [editOutboundRouteId, setEditOutboundRouteId] = useState<number | null>(null)
  // Inbound DIDs for edit modal
  const [editInboundDids, setEditInboundDids] = useState<{trunk_id: number, did: string}[]>([])
  // Map of "trunk_id:did" -> route_id for existing inbound routes
  const [editInboundRouteMap, setEditInboundRouteMap] = useState<Map<string, number>>(new Map())
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = async () => {
    try {
      const [usersData, peersData, routesData, didsData, trunksData] = await Promise.all([
        api.getUsers(),
        api.getSipPeers(),
        api.getRoutes(),
        api.getAvailableDids(),
        api.getTrunks(),
      ])
      setUsers(usersData)
      setPeers(peersData)
      setRoutes(routesData)
      setAvailableDids(didsData)
      const nameMap = new Map<number, string>()
      trunksData.forEach((t: TrunkInfo) => nameMap.set(t.id, t.name))
      setTrunkNames(nameMap)
    } catch {
      setError('Daten konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getUserExtension = (userId: number): string => {
    const peer = peers.find(p => p.user_id === userId)
    return peer ? peer.extension : ''
  }

  const getRoutesForExtension = (extension: string): RouteEntry[] => {
    return routes.filter(r => r.destination_extension === extension)
  }

  const getAvailableExtensions = (currentUserId?: number): PeerEntry[] => {
    return peers.filter(p => !p.user_id || p.user_id === currentUserId)
  }

  // Build combined DID list for edit: available (unassigned) + currently assigned to this extension
  const getCombinedDids = (forExtension?: string): AvailableDidGroup[] => {
    const combined = new Map<number, {trunk_name: string, dids: Set<string>}>()
    for (const group of availableDids) {
      combined.set(group.trunk_id, {trunk_name: group.trunk_name, dids: new Set(group.dids)})
    }
    if (forExtension) {
      const extRoutes = routes.filter(r => r.destination_extension === forExtension)
      for (const route of extRoutes) {
        if (!combined.has(route.trunk_id)) {
          combined.set(route.trunk_id, {
            trunk_name: trunkNames.get(route.trunk_id) || `Leitung ${route.trunk_id}`,
            dids: new Set()
          })
        }
        combined.get(route.trunk_id)!.dids.add(route.did)
      }
    }
    return Array.from(combined.entries()).map(([trunk_id, data]) => ({
      trunk_id, trunk_name: data.trunk_name, dids: Array.from(data.dids).sort()
    })).filter(g => g.dids.length > 0)
  }

  // Filter DIDs for inbound checkboxes: exclude the outbound DID
  const getInboundDidsPool = (allDids: AvailableDidGroup[], outboundTrunkId: string, outboundDid: string): AvailableDidGroup[] => {
    return allDids.map(group => ({
      ...group,
      dids: group.dids.filter(d => !(group.trunk_id.toString() === outboundTrunkId && d === outboundDid))
    })).filter(g => g.dids.length > 0)
  }

  const isDidSelected = (list: {trunk_id: number, did: string}[], trunk_id: number, did: string): boolean => {
    return list.some(d => d.trunk_id === trunk_id && d.did === did)
  }

  const toggleDid = (
    list: {trunk_id: number, did: string}[],
    setList: (v: {trunk_id: number, did: string}[]) => void,
    trunk_id: number,
    did: string
  ) => {
    if (isDidSelected(list, trunk_id, did)) {
      setList(list.filter(d => !(d.trunk_id === trunk_id && d.did === did)))
    } else {
      setList([...list, {trunk_id, did}])
    }
  }

  const handleGeneratePassword = async () => {
    setGeneratingPw(true)
    try {
      const result = await api.generatePassword()
      setNewExtData({ ...newExtData, secret: result.password })
    } catch {
      setError('Passwort konnte nicht generiert werden')
    } finally {
      setGeneratingPw(false)
    }
  }

  const handleCreateAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCreateAvatarFile(file)
    const reader = new FileReader()
    reader.onload = () => setCreateAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      // If creating a new extension, create the SIP peer first
      let assignExtension = formData.extension
      if (createNewExt && newExtData.extension && newExtData.secret) {
        await api.createSipPeer({
          extension: newExtData.extension,
          secret: newExtData.secret,
          caller_id: newExtData.caller_id || (formData.full_name || formData.username),
        })
        assignExtension = newExtData.extension
      }

      const newUser = await api.createUser({
        username: formData.username,
        password: formData.password,
        role: formData.role,
        full_name: formData.full_name || undefined,
        email: formData.email || undefined,
      } as any)

      // From here on, user exists - collect warnings but don't fail
      const warnings: string[] = []

      if (assignExtension) {
        try { await api.assignExtensionToUser(newUser.id, assignExtension) } catch (e: any) { warnings.push(e.message) }
      }

      // Create outbound route first (so it gets lowest ID for dialplan)
      if (assignExtension && formDid && formTrunkId) {
        try {
          await api.createRoute({
            did: formDid,
            trunk_id: parseInt(formTrunkId, 10),
            destination_extension: assignExtension,
            description: formData.full_name || formData.username,
          })
        } catch (e: any) { warnings.push(e.message) }
      }

      // Create additional inbound routes
      if (assignExtension) {
        for (const d of formInboundDids) {
          try {
            await api.createRoute({
              did: d.did,
              trunk_id: d.trunk_id,
              destination_extension: assignExtension,
              description: formData.full_name || formData.username,
            })
          } catch (e: any) { warnings.push(e.message) }
        }
      }

      // Upload avatar if selected
      if (createAvatarFile) {
        try { await api.uploadUserAvatar(newUser.id, createAvatarFile) } catch (e: any) { warnings.push(e.message) }
      }

      // Send welcome email (best-effort)
      if (formData.email && !formData.email.endsWith('@gonopbx.local')) {
        try {
          await api.sendWelcomeEmail(newUser.id, formData.password)
        } catch {
          // SMTP may not be configured - silently ignore
        }
      }

      setFormData({ username: '', password: '', role: 'user', full_name: '', email: '', extension: '' })
      setCreateNewExt(false)
      setNewExtData({ extension: '', secret: '', caller_id: '' })
      setFormDid('')
      setFormTrunkId('')
      setFormInboundDids([])
      setCreateAvatarFile(null)
      setCreateAvatarPreview(null)
      setShowForm(false)
      fetchData()

      if (warnings.length > 0) {
        setError(`Benutzer erstellt, aber: ${warnings.join('; ')}`)
      }
    } catch (err: any) {
      setError(err.message || 'Benutzer konnte nicht erstellt werden')
    }
  }

  const handlePasswordChange = async () => {
    if (!passwordUserId || !newPassword) return
    setError('')
    try {
      await api.changeUserPassword(passwordUserId, newPassword)
      setPasswordUserId(null)
      setNewPassword('')
    } catch (err: any) {
      setError(err.message || 'Passwort konnte nicht geändert werden')
    }
  }

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Benutzer "${username}" wirklich löschen?`)) return
    try {
      await api.deleteUser(id)
      fetchData()
    } catch (err: any) {
      setError(err.message || 'Benutzer konnte nicht gelöscht werden')
    }
  }

  const openEditModal = (user: UserEntry) => {
    setEditUser(user)
    setEditData({
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role,
    })
    const ext = getUserExtension(user.id)
    setEditExtension(ext)

    // Load all routes for this extension
    const extRoutes = ext ? getRoutesForExtension(ext) : []

    // First route = outbound, rest = inbound
    if (extRoutes.length > 0) {
      const outbound = extRoutes[0]
      setEditDid(outbound.did)
      setEditTrunkId(outbound.trunk_id.toString())
      setEditOutboundRouteId(outbound.id)

      // Remaining routes are inbound
      const inbound = extRoutes.slice(1)
      setEditInboundDids(inbound.map(r => ({trunk_id: r.trunk_id, did: r.did})))
      const routeMap = new Map<string, number>()
      inbound.forEach(r => routeMap.set(`${r.trunk_id}:${r.did}`, r.id))
      setEditInboundRouteMap(routeMap)
    } else {
      setEditDid('')
      setEditTrunkId('')
      setEditOutboundRouteId(null)
      setEditInboundDids([])
      setEditInboundRouteMap(new Map())
    }

    setAvatarFile(null)
    setAvatarPreview(null)
    setError('')
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleEditSave = async () => {
    if (!editUser) return
    setError('')
    try {
      await api.updateUser(editUser.id, editData)

      const currentExt = getUserExtension(editUser.id)
      if (editExtension !== currentExt) {
        await api.assignExtensionToUser(editUser.id, editExtension || null)
      }

      const targetExt = editExtension || currentExt
      if (targetExt) {
        // Handle outbound route
        const hadOutbound = editOutboundRouteId !== null
        const wantOutbound = editDid && editTrunkId

        if (hadOutbound && !wantOutbound) {
          await api.deleteRoute(editOutboundRouteId!)
        } else if (hadOutbound && wantOutbound) {
          await api.updateRoute(editOutboundRouteId!, {
            did: editDid,
            trunk_id: parseInt(editTrunkId, 10),
            destination_extension: targetExt,
            description: editData.full_name || editUser.username,
          })
        } else if (!hadOutbound && wantOutbound) {
          await api.createRoute({
            did: editDid,
            trunk_id: parseInt(editTrunkId, 10),
            destination_extension: targetExt,
            description: editData.full_name || editUser.username,
          })
        }

        // Handle inbound routes: compute diff
        const newInboundKeys = new Set(editInboundDids.map(d => `${d.trunk_id}:${d.did}`))

        // Delete routes no longer selected
        for (const [key, routeId] of editInboundRouteMap) {
          if (!newInboundKeys.has(key)) {
            await api.deleteRoute(routeId)
          }
        }

        // Create routes for newly selected DIDs
        for (const d of editInboundDids) {
          const key = `${d.trunk_id}:${d.did}`
          if (!editInboundRouteMap.has(key)) {
            await api.createRoute({
              did: d.did,
              trunk_id: d.trunk_id,
              destination_extension: targetExt,
              description: editData.full_name || editUser.username,
            })
          }
        }
      }

      if (avatarFile) {
        await api.uploadUserAvatar(editUser.id, avatarFile)
      }

      setEditUser(null)
      fetchData()
    } catch (err: any) {
      setError(err.message || 'Änderungen konnten nicht gespeichert werden')
    }
  }

  const getInitial = (user: UserEntry) => {
    return (user.full_name || user.username || '?').charAt(0).toUpperCase()
  }

  const avatarSrc = (user: UserEntry) => {
    if (!user.avatar_url) return null
    return `${user.avatar_url}?t=${Date.now()}`
  }

  // Determine the effective extension for DID section (create form)
  const getFormExtension = () => {
    if (createNewExt) return newExtData.extension
    return formData.extension
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Lade Benutzer...</div>
  }

  // DID pools for create form
  const createDidsPool = availableDids
  const createInboundPool = getInboundDidsPool(createDidsPool, formTrunkId, formDid)

  // DID pools for edit modal
  const editDidsPool = editExtension ? getCombinedDids(editExtension) : availableDids
  const editInboundPool = getInboundDidsPool(editDidsPool, editTrunkId, editDid)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Neuer Benutzer
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Neuen Benutzer anlegen</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Avatar upload for create form */}
            <div className="md:col-span-3">
              <div className="flex items-center gap-4">
                <div
                  className="relative cursor-pointer group"
                  onClick={() => createFileInputRef.current?.click()}
                >
                  {createAvatarPreview ? (
                    <img
                      src={createAvatarPreview}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-30 flex items-center justify-center transition-all">
                    <Upload className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {createAvatarFile ? createAvatarFile.name : 'Foto hochladen (optional)'}
                </div>
                <input
                  ref={createFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleCreateAvatarSelect}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Benutzername</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="benutzername"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Passwort"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Vor- und Nachname"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="email@example.com"
              />
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                An diese Adresse werden die Zugangsdaten gesendet.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rolle</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Extension: toggle between existing and new */}
            <div className="md:col-span-3">
              <div className="flex items-center gap-3 mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nebenstelle</label>
                <button
                  type="button"
                  onClick={() => { setCreateNewExt(!createNewExt); setFormData({ ...formData, extension: '' }); setNewExtData({ extension: '', secret: '', caller_id: '' }) }}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                    createNewExt
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/60'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  {createNewExt ? 'Neue Nebenstelle' : 'Neu anlegen'}
                </button>
              </div>

              {!createNewExt ? (
                <select
                  value={formData.extension}
                  onChange={(e) => setFormData({ ...formData, extension: e.target.value })}
                  className="w-full md:w-1/3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- keine --</option>
                  {getAvailableExtensions().map(p => (
                    <option key={p.id} value={p.extension}>
                      {p.extension} {p.caller_id ? `(${p.caller_id})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Extension-Nr.</label>
                    <input
                      type="text"
                      value={newExtData.extension}
                      onChange={(e) => setNewExtData({ ...newExtData, extension: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="z.B. 1001"
                      required={createNewExt}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SIP-Passwort</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newExtData.secret}
                        onChange={(e) => setNewExtData({ ...newExtData, secret: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="SIP-Passwort"
                        required={createNewExt}
                      />
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        disabled={generatingPw}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
                        title="Sicheres Passwort generieren"
                      >
                        <RefreshCw className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${generatingPw ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Caller-ID (optional)</label>
                    <input
                      type="text"
                      value={newExtData.caller_id}
                      onChange={(e) => setNewExtData({ ...newExtData, caller_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Wird aus Name übernommen"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Rufnummern section */}
            {getFormExtension() && (availableDids.length > 0) && (
              <div className="md:col-span-3">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-4">
                  {/* Ausgehende Rufnummer */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <PhoneOutgoing className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ausgehende Rufnummer</label>
                    </div>
                    <select
                      value={formDid ? `${formTrunkId}:${formDid}` : ''}
                      onChange={(e) => {
                        const val = e.target.value
                        if (!val) {
                          setFormDid('')
                          setFormTrunkId('')
                        } else {
                          const [tid, ...didParts] = val.split(':')
                          setFormTrunkId(tid)
                          setFormDid(didParts.join(':'))
                        }
                      }}
                      className="w-full md:w-2/3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">-- keine Rufnummer --</option>
                      {createDidsPool.map(group => (
                        <optgroup key={group.trunk_id} label={group.trunk_name}>
                          {group.dids.map(did => (
                            <option key={did} value={`${group.trunk_id}:${did}`}>{did}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Eingehende Rufnummern */}
                  {createInboundPool.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <PhoneIncoming className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Eingehende Rufnummern</label>
                        <span className="text-xs text-gray-500 dark:text-gray-400">(weitere Rufnummern, die bei dieser Nebenstelle klingeln)</span>
                      </div>
                      <div className="space-y-2">
                        {createInboundPool.map(group => (
                          <div key={group.trunk_id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{group.trunk_name}</div>
                            <div className="flex flex-wrap gap-2">
                              {group.dids.map(did => {
                                const checked = isDidSelected(formInboundDids, group.trunk_id, did)
                                return (
                                  <label
                                    key={did}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-colors ${
                                      checked ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDid(formInboundDids, setFormInboundDids, group.trunk_id, did)}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    {did}
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="md:col-span-3 flex gap-3">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Anlegen
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Benutzer</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">E-Mail</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nebenstelle</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rufnummern</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rolle</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((u) => {
              const ext = getUserExtension(u.id)
              const extRoutes = ext ? getRoutesForExtension(ext) : []
              const outboundRoute = extRoutes.length > 0 ? extRoutes[0] : undefined
              const inboundCount = extRoutes.length > 1 ? extRoutes.length - 1 : 0
              const src = avatarSrc(u)
              return (
                <tr
                  key={u.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => openEditModal(u)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex items-center justify-center text-sm font-semibold">
                          {getInitial(u)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.full_name || u.username}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{u.email || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {ext ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-mono">
                        {ext}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {outboundRoute ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-mono">
                          <PhoneOutgoing className="w-3 h-3" />
                          {outboundRoute.did}
                        </span>
                        {inboundCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs">
                            <PhoneIncoming className="w-3 h-3" />
                            +{inboundCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        title="Bearbeiten"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setPasswordUserId(u.id); setPasswordUsername(u.username); setNewPassword('') }}
                        className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        title="Passwort ändern"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      {u.username !== 'admin' && (
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Keine Benutzer vorhanden</div>
        )}
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Benutzer bearbeiten: {editUser.username}
              </h2>
              <button onClick={() => setEditUser(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar section */}
            <div className="flex items-center gap-4 mb-6">
              <div
                className="relative cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarPreview || editUser.avatar_url ? (
                  <img
                    src={avatarPreview || avatarSrc(editUser) || ''}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xl font-semibold">
                    {getInitial(editUser)}
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-30 flex items-center justify-center transition-all">
                  <Upload className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Klicken zum Ändern</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editData.full_name}
                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rolle</label>
                <select
                  value={editData.role}
                  onChange={(e) => setEditData({ ...editData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nebenstelle</label>
                <select
                  value={editExtension}
                  onChange={(e) => {
                    const newExt = e.target.value
                    setEditExtension(newExt)
                    // Load routes for newly selected extension
                    const extRoutes = newExt ? getRoutesForExtension(newExt) : []
                    if (extRoutes.length > 0) {
                      const outbound = extRoutes[0]
                      setEditDid(outbound.did)
                      setEditTrunkId(outbound.trunk_id.toString())
                      setEditOutboundRouteId(outbound.id)
                      const inbound = extRoutes.slice(1)
                      setEditInboundDids(inbound.map(r => ({trunk_id: r.trunk_id, did: r.did})))
                      const routeMap = new Map<string, number>()
                      inbound.forEach(r => routeMap.set(`${r.trunk_id}:${r.did}`, r.id))
                      setEditInboundRouteMap(routeMap)
                    } else {
                      setEditDid('')
                      setEditTrunkId('')
                      setEditOutboundRouteId(null)
                      setEditInboundDids([])
                      setEditInboundRouteMap(new Map())
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- keine --</option>
                  {getAvailableExtensions(editUser.id).map(p => (
                    <option key={p.id} value={p.extension}>
                      {p.extension} {p.caller_id ? `(${p.caller_id})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rufnummern im Edit-Modal */}
              {editExtension && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-4">
                  {/* Ausgehende Rufnummer */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <PhoneOutgoing className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ausgehende Rufnummer</label>
                    </div>
                    <select
                      value={editDid ? `${editTrunkId}:${editDid}` : ''}
                      onChange={(e) => {
                        const val = e.target.value
                        if (!val) {
                          setEditDid('')
                          setEditTrunkId('')
                        } else {
                          const [tid, ...didParts] = val.split(':')
                          setEditTrunkId(tid)
                          setEditDid(didParts.join(':'))
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">-- keine Rufnummer --</option>
                      {/* Show currently assigned outbound DID */}
                      {editDid && editTrunkId && (
                        <option value={`${editTrunkId}:${editDid}`}>
                          {editDid} (aktuell)
                        </option>
                      )}
                      {editDidsPool.map(group => (
                        <optgroup key={group.trunk_id} label={group.trunk_name}>
                          {group.dids
                            .filter(did => !(group.trunk_id.toString() === editTrunkId && did === editDid))
                            .map(did => (
                              <option key={did} value={`${group.trunk_id}:${did}`}>{did}</option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Eingehende Rufnummern */}
                  {editInboundPool.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <PhoneIncoming className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Eingehende Rufnummern</label>
                        <span className="text-xs text-gray-500 dark:text-gray-400">(weitere)</span>
                      </div>
                      <div className="space-y-2">
                        {editInboundPool.map(group => (
                          <div key={group.trunk_id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{group.trunk_name}</div>
                            <div className="flex flex-wrap gap-2">
                              {group.dids.map(did => {
                                const checked = isDidSelected(editInboundDids, group.trunk_id, did)
                                return (
                                  <label
                                    key={did}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-colors ${
                                      checked ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleDid(editInboundDids, setEditInboundDids, group.trunk_id, did)}
                                      className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    {did}
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditUser(null)}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleEditSave}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {passwordUserId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Passwort ändern: {passwordUsername}
            </h2>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Neues Passwort (min. 6 Zeichen)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordChange()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPasswordUserId(null); setNewPassword('') }}
                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={newPassword.length < 6}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
