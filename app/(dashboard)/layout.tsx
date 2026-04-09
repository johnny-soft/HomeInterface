'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Header } from '@/components/dashboard/header'
import { Sidebar } from '@/components/dashboard/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  if (!user) return null

  return (
    // 'bg-sidebar' garante que o fundo atrás da sidebar e do conteúdo seja coeso
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      
      <div className="flex flex-1 flex-col min-w-0">
        {/* O Header agora flutua sobre o conteúdo com a mesma borda da Sidebar */}
        <Header title="HomeLab Manager v3.1" />
        
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6 lg:p-10">
          <div className="mx-auto max-w-[1600px] animate-in fade-in duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}