'use server'

import { executeCommand } from '@/lib/shell-executor'
import { randomBytes } from 'crypto'
import { readdir, writeFile } from 'fs/promises'

const VIRSH_BASE = ['-c', 'qemu:///system']
const TOKEN_FILE = '/etc/novnc/tokens/vms.token'

// --- AUXILIARES ---
function generateMAC() {
  const hex = randomBytes(3).toString('hex').match(/.{1,2}/g)?.join(':')
  return `52:54:00:${hex}`
}

/**
 * Sincroniza os nomes das VMs com as suas portas VNC reais para o Websockify
 */
async function syncVncTokens() {
  try {
    const result = await executeCommand('virsh', [...VIRSH_BASE, 'list', '--all'])
    const lines = result.stdout.trim().split('\n').slice(2)
    
    const tokenLines = await Promise.all(lines.map(async (line) => {
      const name = line.trim().split(/\s{2,}/)[1]
      if (!name) return null

      const vncRes = await executeCommand('virsh', [...VIRSH_BASE, 'vncdisplay', name])
      const display = vncRes.stdout.trim().replace(':', '')
      
      if (display === '' || isNaN(parseInt(display))) return null
      
      const port = 5900 + parseInt(display)
      return `${name}: 127.0.0.1:${port}`
    }))

    const content = tokenLines.filter(Boolean).join('\n')
    await writeFile(TOKEN_FILE, content)
  } catch (e) {
    console.error("Erro ao sincronizar tokens VNC:", e)
  }
}

// --- VM ACTIONS ---

export async function fetchVMsAction() {
  try {
    const result = await executeCommand('virsh', [...VIRSH_BASE, 'list', '--all'])
    if (result.exitCode !== 0) return []
    const lines = result.stdout.trim().split('\n').slice(2)
    
    const vms = await Promise.all(lines.map(async (line) => {
      const parts = line.trim().split(/\s{2,}/)
      const name = parts[1]
      if (!name) return null

      const domInfo = await executeCommand('virsh', [...VIRSH_BASE, 'dominfo', name])
      const getVal = (key: string) => {
        const match = domInfo.stdout.match(new RegExp(`${key}:\\s+(.+)`, 'i'))
        return match ? match[1].trim() : ''
      }

      const netAddr = await executeCommand('virsh', [...VIRSH_BASE, 'domifaddr', name])
      const ipMatch = netAddr.stdout.match(/ipv4\s+([\d./]+)/)

      return {
        id: parts[0] === '-' ? name : parts[0],
        name: name,
        status: parts[2].replace('shut off', 'shutoff').toLowerCase(),
        memory: Math.round(parseInt(getVal('Max memory')) / 1024) || 0,
        vcpus: parseInt(getVal('CPU\\(s\\)')) || 0,
        ipAddress: ipMatch ? ipMatch[1].split('/')[0] : '-',
        uptime: parts[0] !== '-' ? 'Ligada' : 'Desligada'
      }
    })).then(list => list.filter(Boolean))

    // Atualiza os tokens VNC sempre que listamos as VMs
    await syncVncTokens()
    return vms
  } catch (error) { return [] }
}

export async function createVMAction(data: { 
  name: string, ram: number, vcpus: number, disk: number, iso: string, ip?: string 
}) {
  try {
    try {
      await executeCommand('virsh', [...VIRSH_BASE, 'net-update', 'default', 'delete', 'ip-dhcp-host', `<host name='${data.name}'/>`, '--live', '--config'])
    } catch (e) {}

    const mac = generateMAC()
    if (data.ip) {
      await executeCommand('virsh', [...VIRSH_BASE, 'net-update', 'default', 'add', 'ip-dhcp-host', `<host mac='${mac}' name='${data.name}' ip='${data.ip}'/>`, '--live', '--config'])
    }

    const args = [
      '--connect', 'qemu:///system',
      '--name', data.name,
      '--memory', data.ram.toString(),
      '--vcpus', data.vcpus.toString(),
      '--disk', `size=${data.disk},format=qcow2`,
      '--osinfo', 'detect=on,require=off,name=linux2022',
      '--network', `bridge=br0,mac=${mac},model=virtio`,
      '--graphics', 'vnc,listen=0.0.0.0', 
      '--noautoconsole'
    ]

    if (data.iso) args.push('--cdrom', data.iso) 
    else args.push('--import')

    const result = await executeCommand('virt-install', args)
    await syncVncTokens()
    return { success: result.exitCode === 0 }
  } catch (error: any) { throw new Error(error.message) }
}

export async function vmPowerAction(name: string, action: string) {
  const res = await executeCommand('virsh', [...VIRSH_BASE, action, name])
  await syncVncTokens()
  return res
}

export async function removeVMAction(name: string) {
  try {
    await executeCommand('virsh', [...VIRSH_BASE, 'destroy', name])
    const result = await executeCommand('virsh', [...VIRSH_BASE, 'undefine', name, '--remove-all-storage'])
    await syncVncTokens()
    return { success: result.exitCode === 0 }
  } catch (e) { 
    const retry = await executeCommand('virsh', [...VIRSH_BASE, 'undefine', name, '--remove-all-storage'])
    await syncVncTokens()
    return { success: retry.exitCode === 0 }
  }
}

export async function fetchISOsAction() {
  try {
    const dir = '/var/lib/libvirt/images'
    const files = await readdir(dir)
    return files.filter(f => f.endsWith('.iso')).map(f => ({ name: f, path: `${dir}/${f}` }))
  } catch (e) { return [] }
}