'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Cpu, MemoryStick, HardDrive, Network, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  progress?: number
  trend?: { value: number; isUp: boolean }
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

function StatsCard({ title, value, subtitle, icon, progress, trend, variant = 'default' }: StatsCardProps) {
  const variantStyles = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }

  const progressStyles = {
    default: '[&>div]:bg-primary',
    success: '[&>div]:bg-success',
    warning: '[&>div]:bg-warning',
    danger: '[&>div]:bg-destructive',
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', variantStyles[variant])}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {progress !== undefined && (
          <Progress 
            value={progress} 
            className={cn('mt-3 h-2 bg-muted', progressStyles[variant])} 
          />
        )}
        {trend && (
          <div className={cn(
            'mt-2 flex items-center text-xs',
            trend.isUp ? 'text-success' : 'text-destructive'
          )}>
            {trend.isUp ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : (
              <TrendingDown className="mr-1 h-3 w-3" />
            )}
            {trend.value}% vs. ultima hora
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface StatsCardsProps {
  metrics: {
    cpu: number
    memory: { used: number; total: number; percent: number }
    disk: { used: number; total: number; percent: number }
    network: { rx: number; tx: number }
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function StatsCards({ metrics }: StatsCardsProps) {
  const getVariant = (percent: number): StatsCardProps['variant'] => {
    if (percent >= 90) return 'danger'
    if (percent >= 75) return 'warning'
    return 'default'
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="CPU"
        value={`${metrics.cpu}%`}
        subtitle="Uso do processador"
        icon={<Cpu className="h-5 w-5" />}
        progress={metrics.cpu}
        variant={getVariant(metrics.cpu)}
      />
      <StatsCard
        title="Memoria"
        value={`${metrics.memory.percent}%`}
        subtitle={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
        icon={<MemoryStick className="h-5 w-5" />}
        progress={metrics.memory.percent}
        variant={getVariant(metrics.memory.percent)}
      />
      <StatsCard
        title="Disco"
        value={`${metrics.disk.percent}%`}
        subtitle={`${formatBytes(metrics.disk.used)} / ${formatBytes(metrics.disk.total)}`}
        icon={<HardDrive className="h-5 w-5" />}
        progress={metrics.disk.percent}
        variant={getVariant(metrics.disk.percent)}
      />
      <StatsCard
        title="Rede"
        value={formatBytes(metrics.network.rx + metrics.network.tx)}
        subtitle={`RX: ${formatBytes(metrics.network.rx)} | TX: ${formatBytes(metrics.network.tx)}`}
        icon={<Network className="h-5 w-5" />}
      />
    </div>
  )
}
