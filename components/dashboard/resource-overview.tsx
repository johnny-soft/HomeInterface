'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Container, Server, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: 'running' | 'paused' | 'exited' | 'created'
}

interface VMInfo {
  id: string
  name: string
  status: 'running' | 'paused' | 'shutoff'
  memory: number
  vcpus: number
}

interface ResourceOverviewProps {
  containers: ContainerInfo[]
  vms: VMInfo[]
}

const containerStatusConfig = {
  running: { label: 'Ativo', className: 'bg-success/20 text-success' },
  paused: { label: 'Pausado', className: 'bg-warning/20 text-warning' },
  exited: { label: 'Parado', className: 'bg-muted text-muted-foreground' },
  created: { label: 'Criado', className: 'bg-info/20 text-info' },
}

const vmStatusConfig = {
  running: { label: 'Ativo', className: 'bg-success/20 text-success' },
  paused: { label: 'Pausado', className: 'bg-warning/20 text-warning' },
  shutoff: { label: 'Desligado', className: 'bg-muted text-muted-foreground' },
}

export function ResourceOverview({ containers, vms }: ResourceOverviewProps) {
  const runningContainers = containers.filter(c => c.status === 'running').length
  const runningVMs = vms.filter(v => v.status === 'running').length

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Containers */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Container className="h-5 w-5 text-primary" />
            Containers
            <Badge variant="secondary" className="ml-2">
              {runningContainers}/{containers.length} ativos
            </Badge>
          </CardTitle>
          <Link href="/docker">
            <Button variant="ghost" size="sm" className="gap-1">
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {containers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Container className="h-12 w-12 mb-2 opacity-50" />
              <p>Nenhum container encontrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {containers.slice(0, 5).map((container) => (
                <div
                  key={container.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-2 w-2 rounded-full',
                      container.status === 'running' ? 'bg-success' : 'bg-muted-foreground'
                    )} />
                    <div>
                      <p className="font-medium text-foreground">{container.name}</p>
                      <p className="text-xs text-muted-foreground">{container.image}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className={containerStatusConfig[container.status].className}>
                    {containerStatusConfig[container.status].label}
                  </Badge>
                </div>
              ))}
              {containers.length > 5 && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  +{containers.length - 5} containers
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Virtual Machines */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Maquinas Virtuais
            <Badge variant="secondary" className="ml-2">
              {runningVMs}/{vms.length} ativas
            </Badge>
          </CardTitle>
          <Link href="/vms">
            <Button variant="ghost" size="sm" className="gap-1">
              Ver todas
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {vms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mb-2 opacity-50" />
              <p>Nenhuma VM encontrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vms.slice(0, 5).map((vm) => (
                <div
                  key={vm.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-2 w-2 rounded-full',
                      vm.status === 'running' ? 'bg-success' : 'bg-muted-foreground'
                    )} />
                    <div>
                      <p className="font-medium text-foreground">{vm.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {vm.vcpus} vCPUs | {vm.memory} MB RAM
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className={vmStatusConfig[vm.status].className}>
                    {vmStatusConfig[vm.status].label}
                  </Badge>
                </div>
              ))}
              {vms.length > 5 && (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  +{vms.length - 5} VMs
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
