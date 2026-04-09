'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Container, 
  Server, 
  Globe, 
  Shield, 
  HardDrive,
  Network,
  Play,
  Square,
  RotateCcw,
  MoreVertical,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Service {
  name: string
  // Alterado para aceitar string para suportar retornos variados do sistema
  status: 'running' | 'stopped' | 'failed' | 'inactive' | 'active' | string 
  icon: React.ReactNode
  description?: string
}

interface ServiceStatusProps {
  services: Service[]
  onStart?: (name: string) => void
  onStop?: (name: string) => void
  onRestart?: (name: string) => void
}

// Mapeamento visual seguro para o hardware
const statusConfig: any = {
  running: { label: 'Ativo', className: 'bg-success/20 text-success border-success/30' },
  active: { label: 'Ativo', className: 'bg-success/20 text-success border-success/30' },
  stopped: { label: 'Parado', className: 'bg-muted text-muted-foreground border-muted' },
  inactive: { label: 'Inativo', className: 'bg-muted text-muted-foreground border-muted' },
  failed: { label: 'Falhou', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  // Fallback para status desconhecidos do Ubuntu
  unknown: { label: 'Desconhecido', className: 'bg-destructive/10 text-destructive border-destructive/20' }
}

export function ServiceStatus({ services, onStart, onStop, onRestart }: ServiceStatusProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Status dos Serviços</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((service) => {
            // SOLUÇÃO: Garante que 'config' nunca seja undefined
            const config = statusConfig[service.status] || statusConfig.unknown;
            const isRunning = service.status === 'running' || service.status === 'active';

            return (
              <div
                key={service.name}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    isRunning ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                  )}>
                    {service.icon}
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{service.name}</p>
                    {service.description && (
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('border text-[10px]', config.className)}>
                    {config.label}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isRunning && (
                        <DropdownMenuItem onClick={() => onStart?.(service.name)}>
                          <Play className="mr-2 h-4 w-4" />
                          Iniciar
                        </DropdownMenuItem>
                      )}
                      {isRunning && (
                        <>
                          <DropdownMenuItem onClick={() => onStop?.(service.name)}>
                            <Square className="mr-2 h-4 w-4" />
                            Parar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onRestart?.(service.name)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reiniciar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// Serviços reais configurados no seu install.sh v3.1
export const defaultServices: Service[] = [
  { name: 'Docker', status: 'running', icon: <Container className="h-5 w-5" />, description: 'Container runtime' },
  { name: 'Libvirt', status: 'running', icon: <Server className="h-5 w-5" />, description: 'Virtualização KVM' },
  { name: 'Nginx', status: 'running', icon: <Globe className="h-5 w-5" />, description: 'Web server & proxy' },
  { name: 'UFW', status: 'running', icon: <Shield className="h-5 w-5" />, description: 'Firewall do Sistema' },
  { name: 'Samba', status: 'stopped', icon: <HardDrive className="h-5 w-5" />, description: 'Compartilhamento SMB' },
  { name: 'NFS', status: 'running', icon: <Network className="h-5 w-5" />, description: 'Compartilhamento NFS' },
]