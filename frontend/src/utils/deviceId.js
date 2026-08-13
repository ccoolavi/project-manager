/**
 * A per-browser identifier used only to recognise "have we seen this device
 * before", so the server can decide whether a login needs an email-OTP
 * challenge. It carries no personal data and is not a fingerprint — just a
 * random value persisted in localStorage.
 */
const KEY = 'kaizenpm_device_id'

export function getDeviceId() {
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = (crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    localStorage.setItem(KEY, id)
  }
  return id
}
