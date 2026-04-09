import { executeCommand, commandExists } from '../shell-executor'
import type { VirtualMachine, VMSnapshot, ISOImage, VMDisk, VMInterface } from '@/types'

/**
 * Checks if libvirt is available
 */
export async function isLibvirtAvailable(): Promise<boolean> {
  const exists = await commandExists('virsh')
  if (!exists) return false
  
  const result = await executeCommand('virsh', ['version'])
  return result.exitCode === 0
}

/**
 * Lists all virtual machines
 */
export async function listVMs(): Promise<VirtualMachine[]> {
  const result = await executeCommand('virsh', ['list', '--all'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list VMs')
  }
  
  const lines = result.stdout.trim().split('\n').slice(2) // Skip header lines
  const vms: VirtualMachine[] = []
  
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    
    const [id, name, ...stateParts] = parts
    const state = stateParts.join(' ')
    
    if (!name || name === '-') continue
    
    // Get detailed info
    const vm = await getVM(name)
    if (vm) {
      vms.push(vm)
    } else {
      // Basic info if detailed fetch fails
      vms.push({
        id: id === '-' ? '' : id,
        name,
        uuid: '',
        status: parseVMStatus(state),
        memory: 0,
        vcpus: 0,
        autostart: false,
        persistent: true,
        osType: '',
        arch: '',
        disks: [],
        interfaces: [],
      })
    }
  }
  
  return vms
}

/**
 * Gets detailed VM information
 */
export async function getVM(name: string): Promise<VirtualMachine | null> {
  const result = await executeCommand('virsh', ['dominfo', name])
  if (result.exitCode !== 0) {
    return null
  }
  
  const info: Record<string, string> = {}
  for (const line of result.stdout.split('\n')) {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length) {
      info[key.trim().toLowerCase()] = valueParts.join(':').trim()
    }
  }
  
  // Get XML config for more details
  const xmlResult = await executeCommand('virsh', ['dumpxml', name])
  let disks: VMDisk[] = []
  let interfaces: VMInterface[] = []
  let graphics: VirtualMachine['graphics'] = undefined
  let osType = ''
  let arch = ''
  
  if (xmlResult.exitCode === 0) {
    // Parse basic info from XML (simplified parsing)
    const xml = xmlResult.stdout
    
    // Parse disks
    const diskMatches = xml.matchAll(/<disk[^>]*>[\s\S]*?<source[^>]*file=['"]([^'"]+)['"][^>]*\/>[\s\S]*?<target[^>]*dev=['"]([^'"]+)['"][^>]*bus=['"]([^'"]+)['"][^>]*\/>[\s\S]*?<\/disk>/g)
    for (const match of diskMatches) {
      disks.push({
        path: match[1],
        device: match[2],
        bus: match[3],
        size: 0,
        format: 'qcow2',
      })
    }
    
    // Parse interfaces
    const ifaceMatches = xml.matchAll(/<interface[^>]*type=['"]([^'"]+)['"][^>]*>[\s\S]*?<mac[^>]*address=['"]([^'"]+)['"][^>]*\/>[\s\S]*?<source[^>]*(?:network|bridge)=['"]([^'"]+)['"][^>]*\/>[\s\S]*?<model[^>]*type=['"]([^'"]+)['"][^>]*\/>[\s\S]*?<\/interface>/g)
    for (const match of ifaceMatches) {
      interfaces.push({
        type: match[1],
        mac: match[2],
        source: match[3],
        model: match[4],
      })
    }
    
    // Parse graphics
    const graphicsMatch = xml.match(/<graphics[^>]*type=['"]([^'"]+)['"][^>]*port=['"](\d+)['"][^>]*listen=['"]([^'"]+)['"][^>]*\/>/)
    if (graphicsMatch) {
      graphics = {
        type: graphicsMatch[1],
        port: parseInt(graphicsMatch[2]),
        listen: graphicsMatch[3],
      }
    }
    
    // Parse OS info
    const osMatch = xml.match(/<type[^>]*arch=['"]([^'"]+)['"][^>]*>([^<]+)<\/type>/)
    if (osMatch) {
      arch = osMatch[1]
      osType = osMatch[2]
    }
  }
  
  return {
    id: info['id'] || '',
    name: info['name'] || name,
    uuid: info['uuid'] || '',
    status: parseVMStatus(info['state'] || 'shutoff'),
    memory: parseMemoryKB(info['max memory'] || '0'),
    vcpus: parseInt(info['cpu(s)'] || '0'),
    autostart: info['autostart'] === 'enable',
    persistent: info['persistent'] === 'yes',
    osType,
    arch,
    disks,
    interfaces,
    graphics,
  }
}

/**
 * Starts a VM
 */
export async function startVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['start', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to start VM')
  }
}

/**
 * Stops a VM gracefully
 */
export async function shutdownVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['shutdown', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to shutdown VM')
  }
}

/**
 * Forces VM to stop immediately
 */
export async function destroyVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['destroy', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to destroy VM')
  }
}

/**
 * Reboots a VM
 */
export async function rebootVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['reboot', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to reboot VM')
  }
}

/**
 * Pauses a VM
 */
export async function suspendVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['suspend', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to suspend VM')
  }
}

/**
 * Resumes a paused VM
 */
export async function resumeVM(name: string): Promise<void> {
  const result = await executeCommand('virsh', ['resume', name])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to resume VM')
  }
}

/**
 * Deletes a VM and optionally its storage
 */
export async function deleteVM(name: string, removeStorage = false): Promise<void> {
  // First, try to stop the VM if running
  const vm = await getVM(name)
  if (vm && vm.status === 'running') {
    await destroyVM(name)
  }
  
  // Remove storage if requested
  if (removeStorage && vm) {
    for (const disk of vm.disks) {
      await executeCommand('virsh', ['vol-delete', '--pool', 'default', disk.path])
    }
  }
  
  // Undefine the VM
  const args = ['undefine', name]
  if (removeStorage) args.push('--remove-all-storage')
  
  const result = await executeCommand('virsh', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to delete VM')
  }
}

/**
 * Sets VM autostart
 */
export async function setAutostart(name: string, enabled: boolean): Promise<void> {
  const result = await executeCommand('virsh', ['autostart', enabled ? name : `--disable ${name}`])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to set autostart')
  }
}

/**
 * Creates a new VM
 */
export async function createVM(options: {
  name: string
  memory: number // MB
  vcpus: number
  diskSize: number // GB
  iso?: string
  network?: string
  osVariant?: string
}): Promise<string> {
  const args = [
    '--name', options.name,
    '--memory', options.memory.toString(),
    '--vcpus', options.vcpus.toString(),
    '--disk', `size=${options.diskSize},format=qcow2`,
    '--graphics', 'vnc,listen=0.0.0.0',
    '--noautoconsole',
  ]
  
  if (options.iso) {
    args.push('--cdrom', options.iso)
  } else {
    args.push('--boot', 'hd')
  }
  
  if (options.network) {
    args.push('--network', `network=${options.network}`)
  } else {
    args.push('--network', 'default')
  }
  
  if (options.osVariant) {
    args.push('--os-variant', options.osVariant)
  }
  
  const result = await executeCommand('virt-install', args, { timeout: 60000 })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create VM')
  }
  
  return options.name
}

/**
 * Lists VM snapshots
 */
export async function listSnapshots(vmName: string): Promise<VMSnapshot[]> {
  const result = await executeCommand('virsh', ['snapshot-list', vmName, '--tree'])
  if (result.exitCode !== 0) {
    return []
  }
  
  const snapshots: VMSnapshot[] = []
  const lines = result.stdout.trim().split('\n')
  
  for (const line of lines) {
    const name = line.trim()
    if (!name) continue
    
    const infoResult = await executeCommand('virsh', ['snapshot-info', vmName, name])
    if (infoResult.exitCode === 0) {
      const info: Record<string, string> = {}
      for (const infoLine of infoResult.stdout.split('\n')) {
        const [key, ...valueParts] = infoLine.split(':')
        if (key && valueParts.length) {
          info[key.trim().toLowerCase()] = valueParts.join(':').trim()
        }
      }
      
      snapshots.push({
        name: info['name'] || name,
        domain: vmName,
        creationTime: info['creation time'] || '',
        state: info['state'] || '',
        description: info['description'],
        parent: info['parent'],
      })
    }
  }
  
  return snapshots
}

/**
 * Creates a VM snapshot
 */
export async function createSnapshot(vmName: string, snapshotName: string, description?: string): Promise<void> {
  const args = ['snapshot-create-as', vmName, snapshotName]
  if (description) {
    args.push('--description', description)
  }
  
  const result = await executeCommand('virsh', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create snapshot')
  }
}

/**
 * Reverts to a snapshot
 */
export async function revertSnapshot(vmName: string, snapshotName: string): Promise<void> {
  const result = await executeCommand('virsh', ['snapshot-revert', vmName, snapshotName])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to revert snapshot')
  }
}

/**
 * Deletes a snapshot
 */
export async function deleteSnapshot(vmName: string, snapshotName: string): Promise<void> {
  const result = await executeCommand('virsh', ['snapshot-delete', vmName, snapshotName])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to delete snapshot')
  }
}

/**
 * Lists available ISO images
 */
export async function listISOs(directory = '/var/lib/libvirt/images'): Promise<ISOImage[]> {
  const result = await executeCommand('ls', ['-la', directory])
  if (result.exitCode !== 0) {
    return []
  }
  
  const isos: ISOImage[] = []
  const lines = result.stdout.split('\n')
  
  for (const line of lines) {
    if (!line.includes('.iso')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 9) continue
    
    const name = parts.slice(8).join(' ')
    const size = parseInt(parts[4])
    const modified = `${parts[5]} ${parts[6]} ${parts[7]}`
    
    isos.push({
      name,
      path: `${directory}/${name}`,
      size,
      modified,
    })
  }
  
  return isos
}

/**
 * Gets VNC port for a VM
 */
export async function getVNCPort(vmName: string): Promise<number | null> {
  const result = await executeCommand('virsh', ['vncdisplay', vmName])
  if (result.exitCode !== 0) {
    return null
  }
  
  const match = result.stdout.match(/:(\d+)/)
  if (match) {
    return 5900 + parseInt(match[1])
  }
  return null
}

/**
 * Clones a VM
 */
export async function cloneVM(sourceName: string, newName: string): Promise<void> {
  const result = await executeCommand('virt-clone', [
    '--original', sourceName,
    '--name', newName,
    '--auto-clone',
  ], { timeout: 300000 })
  
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to clone VM')
  }
}

/**
 * Updates VM configuration
 */
export async function updateVM(name: string, options: {
  memory?: number
  vcpus?: number
}): Promise<void> {
  if (options.memory !== undefined) {
    const result = await executeCommand('virsh', ['setmaxmem', name, `${options.memory}M`, '--config'])
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to update memory')
    }
    await executeCommand('virsh', ['setmem', name, `${options.memory}M`, '--config'])
  }
  
  if (options.vcpus !== undefined) {
    const result = await executeCommand('virsh', ['setvcpus', name, options.vcpus.toString(), '--config', '--maximum'])
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to update vCPUs')
    }
    await executeCommand('virsh', ['setvcpus', name, options.vcpus.toString(), '--config'])
  }
}

// Helper functions
function parseVMStatus(state: string): VirtualMachine['status'] {
  const s = state.toLowerCase()
  if (s.includes('running')) return 'running'
  if (s.includes('paused')) return 'paused'
  if (s.includes('shut off') || s.includes('shutoff')) return 'shutoff'
  if (s.includes('crashed')) return 'crashed'
  if (s.includes('suspended') || s.includes('pmsuspended')) return 'suspended'
  return 'shutoff'
}

function parseMemoryKB(str: string): number {
  const match = str.match(/([\d.]+)\s*(\w+)?/)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] || 'KiB').toLowerCase()
  
  if (unit.includes('g')) return value * 1024
  if (unit.includes('m')) return value
  return value / 1024 // KiB to MB
}
