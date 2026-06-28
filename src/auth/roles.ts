export type AppRole = 'admin' | 'staff' | 'viewer';

const ADMIN_ONLY_PREFIXES = ['/settings/', '/analytics/'];
const STAFF_AND_ADMIN_PREFIXES = ['/payments/', '/audit/'];

export function normalizeRole(role: unknown): AppRole {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'staff' || value === 'viewer') {
    return value;
  }
  return 'admin';
}

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

export function canAccessPath(roleInput: unknown, pathname: string): boolean {
  const role = normalizeRole(roleInput);
  const normalizedPath = normalizePathname(pathname);

  if (role === 'admin') return true;

  if (ADMIN_ONLY_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return false;
  }

  if (role === 'viewer' && STAFF_AND_ADMIN_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return false;
  }

  return true;
}

export function canManageBookings(roleInput: unknown): boolean {
  return normalizeRole(roleInput) !== 'viewer';
}
