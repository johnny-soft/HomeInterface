'use server'

import { executeCommand } from '@/lib/shell-executor'
import os from 'os'
import { revalidatePath } from 'next/cache'

export async function fetchDashboardDataAction() {
  try {
    revalidatePath('/')
    
    // 1. Métricas de Hardware (CPU/RAM/Disco)
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const load = os.loadavg()
    const cpuCores = os.cpus().length
    
    let disk = { used: 0, total: 0, percent: 0 }
    try {
      // Usa -Pk para compatibilidade com o formato de saída do WSL/Ubuntu
      const diskRes = await executeCommand('df', ['-Pk', '/'])
      const parts = diskRes.stdout.trim().split('\n')[1].split(/\s+/)
      const dTotal = parseInt(parts[1]) * 1024
      const dUsed = parseInt(parts[2]) * 1024
      disk = { total: dTotal, used: dUsed, percent: Math.round((dUsed / dTotal) * 100) }
    } catch (e) {}

    // 2. Containers Docker
    let containers = []
    try {
      const dockerRes = await executeCommand('sudo', ['docker', 'ps', '-a', '--format', '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.State}}"}'])
      containers = dockerRes.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    } catch (e) {}

    // 3. Máquinas Virtuais KVM (virsh)
    let vms = []
    try {
      const virshRes = await executeCommand('sudo', ['virsh', 'list', '--all'])
      const lines = virshRes.stdout.trim().split('\n').slice(2) 
      vms = lines.filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/)
        return {
          id: parts[0] === '-' ? Math.random().toString() : parts[0],
          name: parts[1],
          status: parts[2] === 'running' ? 'running' : 'shutoff',
          memory: 2048,
          vcpus: 2
        }
      })
    } catch (e) {}

    // 4. Status de Serviços de Sistema e Storage
    const servicesToCheck = [
      { id: 'docker', name: 'Docker Engine' },
      { id: 'nginx', name: 'Nginx Web Server' },
      { id: 'libvirtd', name: 'KVM/Libvirt' },
      { id: 'smbd', name: 'Samba (SMB)' },
      { id: 'ufw', name: 'Firewall (UFW)' }
    ]
    
    const serviceResults = await Promise.all(servicesToCheck.map(async (s) => {
      try {
        const res = await executeCommand('systemctl', ['is-active', s.id])
        return { 
          name: s.name, 
          status: res.stdout.trim() === 'active' ? 'active' : 'inactive' 
        }
      } catch (e) { return { name: s.name, status: 'inactive' } }
    }))

    // Verificação de Pools ZFS Ativos
    let zfsStatus = 'inactive'
    try {
      const zfsCheck = await executeCommand('lsmod', [])
      if (zfsCheck.stdout.includes('zfs')) {
        const poolCheck = await executeCommand('sudo', ['zpool', 'list', '-H'])
        zfsStatus = poolCheck.stdout.trim() !== '' ? 'active' : 'inactive'
      }
    } catch (e) { zfsStatus = 'inactive' }

    serviceResults.push({ name: 'ZFS Storage', status: zfsStatus })

    return {
      metrics: {
        cpu: Math.round((load[0] / cpuCores) * 100),
        memory: { used: usedMem, total: totalMem, percent: Math.round((usedMem / totalMem) * 100) },
        disk,
        network: { rx: 0, tx: 0 }
      },
      system: {
        hostname: os.hostname(),
        os: `${os.type()} ${os.release()}`,
        cpuModel: os.cpus()[0].model,
        cpuCores: cpuCores,
        uptime: os.uptime()
      },
      containers,
      vms,
      services: serviceResults
    }
  } catch (error) {
    throw error
  }
}