'use client'

import React, { createContext, useContext, useState } from 'react'

export type Role = 'admin' | 'operator' | 'viewer'

interface AuthContextType {
  user: { username: string; role: Role } | null
  login: (username: string, role: Role) => void
  logout: () => void
  can: (permission: string) => boolean
}

const PERMISSIONS: Record<Role, Record<string, boolean>> = {
  admin: { manageUsers: true, manageServices: true, editSettings: true },
  operator: { manageUsers: false, manageServices: true, editSettings: false },
  viewer: { manageUsers: false, manageServices: false, editSettings: false },
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ username: string; role: Role } | null>(null)

  const login = (username: string, role: Role) => setUser({ username, role })
  const logout = () => { setUser(null); window.location.href = '/login' }
  const can = (p: string) => user ? PERMISSIONS[user.role][p] : false

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve estar dentro de AuthProvider')
  return context
}