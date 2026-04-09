'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Container,
  Server,
  HardDrive,
  Network,
  Globe,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Users, // Ícone para a seção de usuários
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

export function Sidebar() {
  const pathname = usePathname()
  const { can, logout } = useAuth()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Organização limpa da navegação
  const navigation = [
    {
      title: 'Overview',
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard, show: true },
      ],
    },
    {
      title: 'Compute',
      items: [
        { name: 'Docker', href: '/docker', icon: Container, show: can('manageServices') },
        { name: 'Virtual Machines', href: '/vms', icon: Server, show: can('manageServices') },
      ],
    },
    {
      title: 'Storage',
      items: [
        { name: 'NAS / Storage', href: '/storage', icon: HardDrive, show: true },
      ],
    },
    {
      title: 'Network',
      items: [
        { name: 'Network', href: '/network', icon: Network, show: true },
        { name: 'Web Server', href: '/webserver', icon: Globe, show: true },
        { name: 'Firewall', href: '/firewall', icon: Shield, show: can('manageFirewall') },
      ],
    },
    {
      title: 'System',
      items: [
        // O item 'Usuários' agora está isolado aqui e só aparece para Admin
        { name: 'Settings', href: '/settings', icon: Settings, show: true },
      ],
    },
  ]

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative flex flex-col border-r border-border bg-background transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo Section */}
        <div className={cn(
          'flex h-16 items-center border-b border-border px-4',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Server className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold tracking-tight text-foreground">HomeLab</span>
            </Link>
          )}
          {collapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Server className="h-5 w-5 text-primary-foreground" />
            </div>
          )}
        </div>

        {/* Navigation Area */}
        <ScrollArea className="flex-1 py-6">
          <nav className="space-y-6 px-3">
            {navigation.map((group) => {
              const visibleItems = group.items.filter(item => item.show)
              if (visibleItems.length === 0) return null

              return (
                <div key={group.title} className="space-y-2">
                  {!collapsed && (
                    <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      {group.title}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                      
                      const linkContent = (
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all',
                            isActive
                              ? 'bg-primary/10 text-primary shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            collapsed && 'justify-center px-0'
                          )}
                        >
                          <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "")} />
                          {!collapsed && <span>{item.name}</span>}
                        </Link>
                      )

                      if (collapsed) {
                        return (
                          <Tooltip key={item.name}>
                            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                            <TooltipContent side="right" className="font-semibold">{item.name}</TooltipContent>
                          </Tooltip>
                        )
                      }
                      return <div key={item.name}>{linkContent}</div>
                    })}
                  </div>
                </div>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Footer Area */}
        <div className="border-t border-border p-3">
          <Button 
            variant="ghost" 
            className={cn(
              "w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors",
              collapsed && "justify-center px-0"
            )}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="text-xs font-bold uppercase tracking-wider">Sair</span>}
          </Button>
        </div>

        {/* Toggle Button */}
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border-border bg-background shadow-md hover:bg-muted"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </Button>
      </aside>
    </TooltipProvider>
  )
}