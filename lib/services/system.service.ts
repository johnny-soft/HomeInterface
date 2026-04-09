import { executeCommand } from '../shell-executor'
import type { SystemInfo, SystemMetrics, SystemService } from '@/types'

/**
 * Gets system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const [hostname, os, kernel, uptime, cpu, memory, disk] = await Promise.all([
    executeCommand('hostname'),
    executeCommand('cat', ['/etc/os-release']),
    executeCommand('uname', ['-r']),
    executeCommand('cat', ['/proc/uptime']),
    executeCommand('lscpu'),
    executeCommand('free', ['-b']),
    executeCommand('df', ['-B1', '/']),
  ])
  
  // Parse OS info
  const osMatch = os.stdout.match(/PRETTY_NAME="([^"]+)"/)
  const osName = osMatch?.[1] || 'Linux'
  
  // Parse CPU info
  const cpuModelMatch = cpu.stdout.match(/Model name:\s*(.+)/)
  const cpuCoresMatch = cpu.stdout.match(/CPU\(s\):\s*(\d+)/)
  
  // Parse memory
  const memMatch = memory.stdout.match(/Mem:\s+(\d+)/)
  const totalMemory = parseInt(memMatch?.[1] || '0')
  
  // Parse disk
  const diskLines = disk.stdout.trim().split('\n')
  const diskMatch = diskLines[1]?.match(/\S+\s+(\d+)/)
  const totalDisk = parseInt(diskMatch?.[1] || '0')
  
  // Parse uptime
  const uptimeSeconds = parseFloat(uptime.stdout.split(' ')[0])
  
  return {
    hostname: hostname.stdout.trim(),
    os: osName,
    kernel: kernel.stdout.trim(),
    uptime: uptimeSeconds,
    cpuModel: cpuModelMatch?.[1]?.trim() || 'Unknown',
    cpuCores: parseInt(cpuCoresMatch?.[1] || '1'),
    totalMemory,
    totalDisk,
  }
}

/**
 * Gets current system metrics
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [cpu, memory, disk, network, loadAvg] = await Promise.all([
    getCPUUsage(),
    getMemoryUsage(),
    getDiskUsage(),
    getNetworkStats(),
    getLoadAverage(),
  ])
  
  return {
    cpu,
    memory,
    disk,
    network,
    loadAverage: loadAvg,
    timestamp: Date.now(),
  }
}

/**
 * Gets CPU usage percentage
 */
async function getCPUUsage(): Promise<number> {
  const result = await executeCommand('cat', ['/proc/stat'])
  const lines = result.stdout.split('\n')
  const cpuLine = lines.find(l => l.startsWith('cpu '))
  
  if (!cpuLine) return 0
  
  const values = cpuLine.split(/\s+/).slice(1).map(Number)
  const idle = values[3] + values[4]
  const total = values.reduce((a, b) => a + b, 0)
  
  // For a more accurate reading, we'd need to compare two samples
  // This is a simplified version
  return Math.round((1 - idle / total) * 100)
}

/**
 * Gets memory usage
 */
async function getMemoryUsage(): Promise<{ used: number; total: number; percent: number }> {
  const result = await executeCommand('free', ['-b'])
  const lines = result.stdout.split('\n')
  const memLine = lines.find(l => l.startsWith('Mem:'))
  
  if (!memLine) return { used: 0, total: 0, percent: 0 }
  
  const values = memLine.split(/\s+/)
  const total = parseInt(values[1])
  const used = parseInt(values[2])
  
  return {
    total,
    used,
    percent: Math.round((used / total) * 100),
  }
}

/**
 * Gets disk usage for root partition
 */
async function getDiskUsage(): Promise<{ used: number; total: number; percent: number }> {
  const result = await executeCommand('df', ['-B1', '/'])
  const lines = result.stdout.trim().split('\n')
  
  if (lines.length < 2) return { used: 0, total: 0, percent: 0 }
  
  const values = lines[1].split(/\s+/)
  const total = parseInt(values[1])
  const used = parseInt(values[2])
  
  return {
    total,
    used,
    percent: Math.round((used / total) * 100),
  }
}

/**
 * Gets network statistics
 */
async function getNetworkStats(): Promise<{ rx: number; tx: number }> {
  // Sum all non-loopback interface stats
  const result = await executeCommand('cat', ['/proc/net/dev'])
  const lines = result.stdout.split('\n')
  
  let totalRx = 0
  let totalTx = 0
  
  for (const line of lines.slice(2)) {
    if (!line.trim() || line.includes('lo:')) continue
    
    const match = line.match(/^\s*\w+:\s*(\d+)(?:\s+\d+){7}\s+(\d+)/)
    if (match) {
      totalRx += parseInt(match[1])
      totalTx += parseInt(match[2])
    }
  }
  
  return { rx: totalRx, tx: totalTx }
}

/**
 * Gets load average
 */
async function getLoadAverage(): Promise<number[]> {
  const result = await executeCommand('cat', ['/proc/loadavg'])
  const values = result.stdout.split(' ')
  
  return [
    parseFloat(values[0]),
    parseFloat(values[1]),
    parseFloat(values[2]),
  ]
}

/**
 * Lists systemd services
 */
export async function listServices(filter?: string[]): Promise<SystemService[]> {
  const args = ['list-units', '--type=service', '--all', '--no-pager', '--plain']
  
  const result = await executeCommand('systemctl', args)
  if (result.exitCode !== 0) {
    return []
  }
  
  const services: SystemService[] = []
  const lines = result.stdout.split('\n')
  
  for (const line of lines) {
    const match = line.match(/^\s*(\S+\.service)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/)
    if (!match) continue
    
    const [, name, load, active, sub, description] = match
    const serviceName = name.replace('.service', '')
    
    // Apply filter if provided
    if (filter && !filter.includes(serviceName)) continue
    
    let status: SystemService['status']
    if (active === 'active' && sub === 'running') {
      status = 'running'
    } else if (active === 'failed') {
      status = 'failed'
    } else if (active === 'inactive') {
      status = 'stopped'
    } else {
      status = 'inactive'
    }
    
    services.push({
      name: serviceName,
      description: description.trim(),
      status,
      enabled: load === 'loaded',
    })
  }
  
  return services
}

/**
 * Gets status of a specific service
 */
export async function getServiceStatus(name: string): Promise<SystemService | null> {
  const result = await executeCommand('systemctl', ['status', name, '--no-pager'])
  
  // Parse output
  const lines = result.stdout.split('\n')
  const loadedLine = lines.find(l => l.includes('Loaded:'))
  const activeLine = lines.find(l => l.includes('Active:'))
  const mainPidLine = lines.find(l => l.includes('Main PID:'))
  
  if (!loadedLine || !activeLine) return null
  
  const enabled = loadedLine.includes('enabled')
  const activeMatch = activeLine.match(/Active:\s+(\w+)\s+\((\w+)\)/)
  
  let status: SystemService['status'] = 'inactive'
  if (activeMatch) {
    if (activeMatch[1] === 'active' && activeMatch[2] === 'running') {
      status = 'running'
    } else if (activeMatch[1] === 'failed') {
      status = 'failed'
    } else if (activeMatch[1] === 'inactive') {
      status = 'stopped'
    }
  }
  
  const pidMatch = mainPidLine?.match(/Main PID:\s+(\d+)/)
  
  return {
    name,
    description: '',
    status,
    enabled,
    pid: pidMatch ? parseInt(pidMatch[1]) : undefined,
  }
}

/**
 * Starts a service
 */
export async function startService(name: string): Promise<void> {
  const result = await executeCommand('systemctl', ['start', name], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to start ${name}`)
  }
}

/**
 * Stops a service
 */
export async function stopService(name: string): Promise<void> {
  const result = await executeCommand('systemctl', ['stop', name], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to stop ${name}`)
  }
}

/**
 * Restarts a service
 */
export async function restartService(name: string): Promise<void> {
  const result = await executeCommand('systemctl', ['restart', name], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to restart ${name}`)
  }
}

/**
 * Enables a service
 */
export async function enableService(name: string): Promise<void> {
  const result = await executeCommand('systemctl', ['enable', name], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to enable ${name}`)
  }
}

/**
 * Disables a service
 */
export async function disableService(name: string): Promise<void> {
  const result = await executeCommand('systemctl', ['disable', name], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to disable ${name}`)
  }
}

/**
 * Gets service logs
 */
export async function getServiceLogs(name: string, lines = 100): Promise<string> {
  const result = await executeCommand('journalctl', ['-u', name, '-n', lines.toString(), '--no-pager'])
  return result.stdout
}

/**
 * HomeLab relevant services
 */
export const HOMELAB_SERVICES = [
  'docker',
  'libvirtd',
  'nginx',
  'nftables',
  'smbd',
  'nmbd',
  'nfs-server',
  'ssh',
  'fail2ban',
]

/**
 * Gets HomeLab specific services status
 */
export async function getHomelabServicesStatus(): Promise<SystemService[]> {
  return listServices(HOMELAB_SERVICES)
}
