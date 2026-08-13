export function PermissionGate({ children, permission, fallback = null }) {
  // TODO: Implement permission checking based on user role
  return children || fallback
}
