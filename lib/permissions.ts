export const ROLE_PERMISSIONS = {
  admin: ['view_dashboard', 'manage_users', 'manage_services', 'edit_settings', 'delete_data'],
  operator: ['view_dashboard', 'manage_services'],
  viewer: ['view_dashboard'],
};

export function hasPermission(role: string, permission: string) {
  const permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [];
  return permissions.includes(permission);
}

// Estrutura de permissões baseada na função do usuário
export const PERMISSIONS = {
  admin: {
    canManageUsers: true,
    canEditSettings: true,
    canControlServices: true,
    viewFullMetrics: true
  },
  operator: {
    canManageUsers: false,
    canEditSettings: false,
    canControlServices: true,
    viewFullMetrics: true
  },
  viewer: {
    canManageUsers: false,
    canEditSettings: false,
    canControlServices: false,
    viewFullMetrics: true
  }
};