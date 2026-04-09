'use client'

import { AuthProvider } from '@/lib/auth-context'
import "./globals.css"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-br">
      <body>
        {/* O AuthProvider aqui garante que TANTO o Login QUANTO a Dashboard funcionem */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}