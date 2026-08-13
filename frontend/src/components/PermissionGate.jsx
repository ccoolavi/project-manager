import { hasPermission, hasRole } from '../utils/permissions'

/**
 * Renders `children` only when the signed-in user holds the required permission
 * (or one of the required roles). Falls back to `fallback`, which defaults to
 * rendering nothing at all so unusable controls simply disappear.
 *
 *   <PermissionGate permission="task:delete"><DeleteButton /></PermissionGate>
 *   <PermissionGate roles={['owner', 'admin']}><Settings /></PermissionGate>
 */
export function PermissionGate({ children, permission, roles, fallback = null }) {
  if (permission && !hasPermission(permission)) return fallback
  if (roles?.length && !hasRole(...roles)) return fallback
  return children
}

export default PermissionGate
