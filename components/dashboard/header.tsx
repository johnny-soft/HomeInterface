'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { User, LogOut, Settings, ChevronDown, Bell, CheckCircle2 } from 'lucide-react'
import { fetchNotificationsAction, markAllAsReadAction } from '@/app/(dashboard)/settings/actions'
import { ScrollArea } from '@/components/ui/scroll-area'

export function Header({ title }: { title: string }) {
  const { user, logout } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])

  // Busca as notificações do /opt/homelab/data/notifications.json
  const loadNotifications = async () => {
    try {
      const data = await fetchNotificationsAction()
      setNotifications(data)
    } catch (e) {
      console.error("Erro ao carregar notificações", e)
    }
  }

  // Carrega na montagem e define um "ping" a cada 30 segundos
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleMarkAsRead = async () => {
    await markAllAsReadAction()
    loadNotifications()
  }

  // Conta quantas mensagens ainda não foram lidas
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h1>
      </div>
      
      <div className="flex items-center gap-4">
        
        {/* ======================= SININHO ======================= */}
        <DropdownMenu onOpenChange={(open) => { if (open && unreadCount > 0) handleMarkAsRead() }}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full hover:bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {/* Bolinha vermelha pulsante se houver mensagens não lidas */}
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 border-border shadow-xl">
            <DropdownMenuLabel className="flex justify-between items-center">
              <span>Notificações do Sistema</span>
              <Badge variant="secondary" className="text-[10px]">{unreadCount} Novas</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-[300px] w-full">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">Nenhum alerta recente.</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className={`p-3 border-b border-border/50 last:border-0 ${!notif.read ? 'bg-primary/5' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-semibold leading-none">{notif.title}</p>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(notif.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notif.message}</p>
                  </div>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ======================= USUÁRIO ======================= */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 gap-2 border-border bg-background hover:bg-muted transition-all">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-medium">{user?.username}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-border shadow-lg">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none">{user?.username}</p>
                <p className="text-[10px] leading-none text-muted-foreground uppercase font-mono mt-1">
                  Role: {user?.role}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.href='/settings'} className="cursor-pointer text-xs">
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" /> Painel de Controle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive focus:bg-destructive/10 cursor-pointer text-xs font-semibold" 
              onClick={() => logout()}
            >
              <LogOut className="mr-2 h-4 w-4" /> Finalizar Sessão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

// Nota: Adicionei o Badge localmente para não quebrar caso o import falhe. Se der erro, importe o Badge do ui/badge.
function Badge({ children, className, variant = "default" }: any) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'secondary' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'bg-primary text-primary-foreground hover:bg-primary/80'} ${className}`}>
      {children}
    </span>
  )
}