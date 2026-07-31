import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// ── Auth token handling ───────────────────────────────────────────────────────
export const TOKEN_KEY = 'cardvault_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, clear the token and notify the app (so it can redirect to login).
let onAuthError = null
export const setAuthErrorHandler = (fn) => { onAuthError = fn }

/**
 * Turn any axios failure into one sentence a person can act on.
 *
 * Callers do `err.response?.data?.detail || 'Fehlgeschlagen'`, which produces
 * nothing useful for the cases that actually happen in the wild: the phone lost
 * signal mid-upload, the free-tier server was asleep, the request hit a rate
 * limit, FastAPI returned a 422 validation array. We normalise all of those
 * into `detail` so every existing call site improves without being touched.
 */
function humanize(error) {
  if (error.code === 'ECONNABORTED') {
    return 'Zeitüberschreitung — das hat zu lange gedauert. Bitte noch einmal versuchen.'
  }
  if (!error.response) {
    return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.'
  }

  const { status, data } = error.response
  const detail = data?.detail

  // FastAPI validation errors arrive as a list of objects — never show those raw.
  if (Array.isArray(detail)) {
    return detail[0]?.msg || 'Die Eingabe konnte nicht verarbeitet werden.'
  }
  if (typeof detail === 'string' && detail) return detail

  switch (status) {
    case 401: return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'
    case 403: return 'Dafür fehlt dir die Berechtigung.'
    case 404: return 'Nicht gefunden.'
    case 413: return 'Die Datei ist zu groß.'
    case 429: return 'Zu viele Anfragen. Bitte warte einen Moment.'
    case 502:
    case 503:
    case 504: return 'Der Server ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.'
    default:
      return status >= 500
        ? 'Serverfehler. Bitte später noch einmal versuchen.'
        : 'Etwas ist schiefgelaufen.'
  }
}

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null)
      if (onAuthError) onAuthError()
    }
    // Rewrite `detail` in place so every `err.response.data.detail` call site
    // gets the readable message, and expose it directly for new code.
    const message = humanize(error)
    error.userMessage = message
    if (!error.response) error.response = { status: 0, data: {} }
    if (!error.response.data || typeof error.response.data !== 'object') {
      error.response.data = {}
    }
    error.response.data.detail = message
    return Promise.reject(error)
  },
)

export const authApi = {
  // Public flags for the login screen (currently: is registration invite-only).
  config: () => api.get('/auth/config'),
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),
}

export const accountApi = {
  get: () => api.get('/account'),
  updateProfile: (payload) => api.put('/account/profile', payload),
  changePassword: (payload) => api.put('/account/password', payload),
  updateSharing: (enabled) => api.put('/account/sharing', { enabled }),
  deleteAccount: (password) => api.delete('/account', { data: { password } }),
}

export const publicApi = {
  // No auth needed; uses a plain axios call so the token interceptor is irrelevant.
  get: (slug, forTrade = false) =>
    api.get(`/public/${slug}`, { params: forTrade ? { for_trade: true } : {} }),
}

export const billingApi = {
  plans: () => api.get('/billing/plans'),
  // No auth — used by the landing page so it shows the real, current plans.
  publicPlans: () => api.get('/billing/public-plans'),
  checkout: () => api.post('/billing/checkout'),
  demoUpgrade: () => api.post('/billing/demo-upgrade'),
  cancel: () => api.post('/billing/cancel'),
}

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  users: (search, sort = 'created_at', order = 'desc') =>
    api.get('/admin/users', { params: { ...(search ? { search } : {}), sort, order } }),
  userDetail: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, payload) => api.put(`/admin/users/${id}`, payload),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  sendPasswordReset: (id) => api.post(`/admin/users/${id}/reset-password`),
  // Invite codes for the closed testing phase
  invites: () => api.get('/admin/invites'),
  createInvite: (payload) => api.post('/admin/invites', payload),
  updateInvite: (id, payload) => api.patch(`/admin/invites/${id}`, payload),
  deleteInvite: (id) => api.delete(`/admin/invites/${id}`),
}

export const cardsApi = {
  upload: (formData, onProgress, pairs = false) =>
    api.post('/cards/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: pairs ? { pairs: true } : {},
      onUploadProgress: onProgress,
      // OCR runs server-side per card and can take a few seconds each; allow
      // generous time for multi-card batches so we don't abort with "Upload failed".
      timeout: 180000,
    }),

  /**
   * Manual search.
   * @param {string} query
   * @param {{ setCode?: string, language?: string, page?: number }} opts
   */
  search: (query, { setCode, language = 'EN', page = 1 } = {}) =>
    api.post('/cards/search', null, {
      params: {
        query,
        ...(setCode ? { set_code: setCode } : {}),
        language,
        page,
      },
    }),

  sets: () => api.get('/cards/sets'),

  localizeName: (name, language, dex) =>
    api.get('/cards/localize-name', { params: { name, language, ...(dex ? { dex } : {}) } }),

  confirm: (payload) => api.post('/cards/confirm', payload),

  list: (params) => api.get('/cards', { params }),

  get: (id) => api.get(`/cards/${id}`),

  update: (id, data) => api.put(`/cards/${id}`, data),

  delete: (id) => api.delete(`/cards/${id}`),

  bulkUpdate: (payload) => api.post('/cards/bulk-update', payload),
  bulkDelete: (ids) => api.post('/cards/bulk-delete', { ids }),

  exportCsv: () => api.get('/cards/export/csv', { responseType: 'blob' }),
  exportPdf: () => api.get('/cards/export/pdf', { responseType: 'blob' }),
  exportJson: () => api.get('/cards/export/json'),

  hashIndexStats: () => api.get('/cards/hash-index/stats'),
  buildHashIndex: (setCode) =>
    api.post('/cards/hash-index/build', null, { params: { set_code: setCode } }),

  tcgInfo: (id) => api.get(`/cards/${id}/tcg-info`),
  variants: (id) => api.get(`/cards/${id}/variants`),

  // Seller's own card photos (front / back) for eBay listings.
  uploadPhoto: (id, slot, file) => {
    const fd = new FormData()
    fd.append('slot', slot)
    fd.append('file', file)
    return api.post(`/cards/${id}/photo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deletePhoto: (id, slot) => api.delete(`/cards/${id}/photo/${slot}`),
  // Lazy variant lookup for an unsaved scan candidate (by TCG card id).
  scanVariants: (tcgId) => api.get('/cards/scan/variants', { params: { tcg_card_id: tcgId } }),
  setsOwned: () => api.get('/cards/sets-owned'),
  collectionIds: () => api.get('/cards/collection-ids'),
}

export const pricesApi = {
  get: (cardApiId, language = 'EN') =>
    api.get(`/prices/${cardApiId}`, { params: { language } }),
  bulkRefresh: (ids = null) =>
    api.post('/prices/bulk-refresh', { ids: ids && ids.length ? ids : null }, { timeout: 120000 }),
}

export const wantlistApi = {
  list: (params) => api.get('/wantlist', { params }),
  add: (payload) => api.post('/wantlist', payload),
  remove: (id) => api.delete(`/wantlist/${id}`),
}

export const statsApi = {
  get: () => api.get('/stats'),
  history: (days = 90) => api.get('/stats/history', { params: { days } }),
  setsProgress: () => api.get('/stats/sets-progress'),
}

// Selling: per-user settings + reusable template photos for eBay listings.
export const saleApi = {
  getSettings: () => api.get('/sale/settings'),
  updateSettings: (photosPerCard) =>
    api.put('/sale/settings', { photos_per_card: photosPerCard }),
  listTemplates: () => api.get('/sale/templates'),
  addTemplate: (file, { label, position } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (label != null) fd.append('label', label)
    if (position != null) fd.append('position', position)
    return api.post('/sale/templates', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  updateTemplate: (id, { label, position } = {}) => {
    const fd = new FormData()
    if (label != null) fd.append('label', label)
    if (position != null) fd.append('position', position)
    return api.put(`/sale/templates/${id}`, fd)
  },
  deleteTemplate: (id) => api.delete(`/sale/templates/${id}`),
}

export const ebayApi = {
  status: () => api.get('/ebay/status'),
  preview: (payload) => api.post('/ebay/preview', payload),
  exportCsv: (payload) =>
    api.post('/ebay/export/csv', payload, { responseType: 'blob' }),
}

// Multi-marketplace hub: exports, account linking, cross-listing, sold-sync.
export const marketApi = {
  status: () => api.get('/market/status'),
  whatnotCsv: (payload) =>
    api.post('/market/whatnot/export/csv', payload, { responseType: 'blob' }),
  vintedPreview: (payload) => api.post('/market/vinted/preview', payload),
  vintedTxt: (payload) =>
    api.post('/market/vinted/export/txt', payload, { responseType: 'blob' }),
  ebayConnect: () => api.get('/market/ebay/connect'),
  ebayDisconnect: () => api.delete('/market/ebay/connection'),
  whatnotConnect: (token) => api.post('/market/whatnot/connection', { token }),
  whatnotDisconnect: () => api.delete('/market/whatnot/connection'),
  publish: (payload) => api.post('/market/publish', payload, { timeout: 120000 }),
  sync: () => api.post('/market/sync', null, { timeout: 60000 }),
  listings: () => api.get('/market/listings'),
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default api
