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
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response?.status === 401) {
      setToken(null)
      if (onAuthError) onAuthError()
    }
    return Promise.reject(error)
  },
)

export const authApi = {
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
  checkout: () => api.post('/billing/checkout'),
  demoUpgrade: () => api.post('/billing/demo-upgrade'),
  cancel: () => api.post('/billing/cancel'),
}

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  users: (search) => api.get('/admin/users', { params: search ? { search } : {} }),
  updateUser: (id, payload) => api.put(`/admin/users/${id}`, payload),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
}

export const cardsApi = {
  upload: (formData, onProgress) =>
    api.post('/cards/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
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
}

export const ebayApi = {
  status: () => api.get('/ebay/status'),
  preview: (payload) => api.post('/ebay/preview', payload),
  exportCsv: (payload) =>
    api.post('/ebay/export/csv', payload, { responseType: 'blob' }),
  list: (payload) => api.post('/ebay/list', payload),
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
