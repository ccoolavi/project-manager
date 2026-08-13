/**
 * Client-side permission helpers.
 *
 * These read the permission list the server embedded in the JWT. They exist only
 * to hide controls the user cannot use — the server re-checks every request, so
 * this is a usability layer and never a security boundary.
 */

export function decodeToken(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(normalised)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function getClaims() {
  return decodeToken(localStorage.getItem('access_token'))
}

export function getPermissions() {
  return getClaims()?.permissions ?? []
}

export function getRole() {
  return getClaims()?.role ?? null
}

/** True when the permission list grants `permission`, honouring `domain:*` wildcards. */
export function hasPermission(permission, permissions = getPermissions()) {
  if (!permission) return true
  if (permissions.includes(permission)) return true
  const [domain] = permission.split(':')
  return permissions.includes(`${domain}:*`)
}

export function hasRole(...roles) {
  const role = getRole()
  return role !== null && roles.includes(role)
}
