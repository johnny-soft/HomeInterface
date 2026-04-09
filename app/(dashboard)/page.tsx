'use client'

import { StatsCards } from '@/components/dashboard/stats-cards'
import { ServiceStatus } from '@/components/dashboard/service-status'
import { ResourceOverview } from '@/components/dashboard/resource-overview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Server, Activity, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Importação da Action unificada
import { fetchDashboardDataAction } from './actions'

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true)
    else setIsRefreshing(true)
    
    try {
      const result = await fetchDashboardDataAction()
      setData(result)
    } catch (e) {
      console.error("Erro ao sincronizar dashboard:", e)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadAllData()
    // Atualização a cada 10s para manter o i5-4590 estável
    const interval = setInterval(() => {
      setCurrentTime(new Date())
      loadAllData(true)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !data) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-mono">Sincronizando Hardware...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Host: {data.system.hostname}</p>
        </div>
        <div className="flex items-center gap-4">
          {isRefreshing && <span className="text-[10px] text-primary animate-pulse italic">REFRESHING</span>}
          <Badge variant="outline" className="gap-2 px-3 py-1.5 font-mono">
            <Clock className="h-4 w-4" />
            {currentTime.toLocaleTimeString('pt-BR')}
          </Badge>
        </div>
      </div>

      {/* Info do Host i5-4590 */}
      <Card className="border-primary/10">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-[10px] font-bold uppercase flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" /> Info do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase">Processador</p>
              <p className="text-sm font-bold truncate leading-none">{data.system.cpuModel}</p>
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-[10px] text-muted-foreground uppercase">OS / Kernel</p>
              <p className="text-sm font-bold truncate leading-none">{data.system.os}</p>
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-[10px] text-muted-foreground uppercase">Localização</p>
              <p className="text-sm font-bold leading-none text-primary">Campo Grande, MS</p>
            </div>
            <div className="space-y-1 border-l pl-4">
              <p className="text-[10px] text-muted-foreground uppercase">Uptime</p>
              <p className="text-sm font-bold flex items-center gap-1 leading-none">
                <Activity className="h-3 w-3 text-success" />
                {Math.floor(data.system.uptime / 3600)}h {Math.floor((data.system.uptime % 3600) / 60)}m
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <StatsCards metrics={data.metrics} />

      <ResourceOverview containers={data.containers} vms={data.vms} />

      <ServiceStatus services={data.services} />
    </div>
  )
}