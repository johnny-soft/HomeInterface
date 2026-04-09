import { executeCommand, commandExists } from '../shell-executor'
import type { StoragePool, StorageDataset, StorageSnapshot, StorageShare, StorageDisk } from '@/types'

/**
 * Checks which storage systems are available
 */
export async function getAvailableStorageSystems(): Promise<{
  zfs: boolean
  btrfs: boolean
  lvm: boolean
}> {
  const [zfs, btrfs, lvm] = await Promise.all([
    commandExists('zpool'),
    commandExists('btrfs'),
    commandExists('lvm'),
  ])
  return { zfs, btrfs, lvm }
}

/**
 * Lists all available disks
 */
export async function listDisks(): Promise<StorageDisk[]> {
  const result = await executeCommand('lsblk', ['-J', '-o', 'NAME,SIZE,TYPE,MODEL,SERIAL,ROTA,MOUNTPOINT,FSTYPE'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list disks')
  }
  
  try {
    const data = JSON.parse(result.stdout)
    const disks: StorageDisk[] = []
    
    for (const device of data.blockdevices || []) {
      if (device.type !== 'disk') continue
      
      const partitions = (device.children || []).map((p: { name: string; size: string; fstype: string; mountpoint: string }) => ({
        name: p.name,
        size: parseSize(p.size),
        filesystem: p.fstype || '',
        mountpoint: p.mountpoint,
      }))
      
      const inUse = partitions.some((p: { mountpoint: string }) => p.mountpoint)
      
      disks.push({
        name: device.name,
        path: `/dev/${device.name}`,
        size: parseSize(device.size),
        model: device.model || 'Unknown',
        serial: device.serial || '',
        type: device.rota === '0' ? 'ssd' : 'hdd',
        status: inUse ? 'in-use' : 'available',
        partitions,
      })
    }
    
    return disks
  } catch {
    return []
  }
}

// ==================== ZFS Functions ====================

/**
 * Lists ZFS pools
 */
export async function listZFSPools(): Promise<StoragePool[]> {
  const result = await executeCommand('zpool', ['list', '-H', '-o', 'name,size,alloc,free,health,altroot'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const pools: StoragePool[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const [name, size, used, free, health] = line.split('\t')
    
    // Get devices
    const statusResult = await executeCommand('zpool', ['status', name], { sudo: true })
    const devices = extractZFSDevices(statusResult.stdout)
    
    pools.push({
      name,
      type: 'zfs',
      status: health === 'ONLINE' ? 'online' : health === 'DEGRADED' ? 'degraded' : 'faulted',
      size: parseSize(size),
      used: parseSize(used),
      available: parseSize(free),
      mountpoint: `/${name}`,
      devices,
      properties: {},
    })
  }
  
  return pools
}

/**
 * Creates a ZFS pool
 */
export async function createZFSPool(
  name: string,
  devices: string[],
  raidLevel: 'stripe' | 'mirror' | 'raidz' | 'raidz2' | 'raidz3' = 'stripe'
): Promise<void> {
  const args = ['create', name]
  
  if (raidLevel !== 'stripe') {
    args.push(raidLevel)
  }
  
  args.push(...devices)
  
  const result = await executeCommand('zpool', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create ZFS pool')
  }
}

/**
 * Destroys a ZFS pool
 */
export async function destroyZFSPool(name: string, force = false): Promise<void> {
  const args = ['destroy']
  if (force) args.push('-f')
  args.push(name)
  
  const result = await executeCommand('zpool', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to destroy ZFS pool')
  }
}

/**
 * Lists ZFS datasets
 */
export async function listZFSDatasets(pool?: string): Promise<StorageDataset[]> {
  const args = ['list', '-H', '-o', 'name,used,avail,mountpoint,compression,quota']
  if (pool) args.push('-r', pool)
  
  const result = await executeCommand('zfs', args, { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const datasets: StorageDataset[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const [name, used, avail, mountpoint, compression, quota] = line.split('\t')
    
    datasets.push({
      name,
      pool: name.split('/')[0],
      type: 'zfs',
      mountpoint,
      used: parseSize(used),
      available: parseSize(avail),
      compression: compression !== '-' ? compression : undefined,
      quota: quota !== 'none' && quota !== '-' ? parseSize(quota) : undefined,
      properties: { compression, quota },
    })
  }
  
  return datasets
}

/**
 * Creates a ZFS dataset
 */
export async function createZFSDataset(
  name: string,
  options?: { compression?: string; quota?: string; mountpoint?: string }
): Promise<void> {
  const args = ['create']
  
  if (options?.compression) {
    args.push('-o', `compression=${options.compression}`)
  }
  if (options?.quota) {
    args.push('-o', `quota=${options.quota}`)
  }
  if (options?.mountpoint) {
    args.push('-o', `mountpoint=${options.mountpoint}`)
  }
  
  args.push(name)
  
  const result = await executeCommand('zfs', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create ZFS dataset')
  }
}

/**
 * Destroys a ZFS dataset
 */
export async function destroyZFSDataset(name: string, recursive = false): Promise<void> {
  const args = ['destroy']
  if (recursive) args.push('-r')
  args.push(name)
  
  const result = await executeCommand('zfs', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to destroy ZFS dataset')
  }
}

/**
 * Lists ZFS snapshots
 */
export async function listZFSSnapshots(dataset?: string): Promise<StorageSnapshot[]> {
  const args = ['list', '-H', '-t', 'snapshot', '-o', 'name,creation,used,referenced']
  if (dataset) args.push('-r', dataset)
  
  const result = await executeCommand('zfs', args, { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const snapshots: StorageSnapshot[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const [fullName, creation, used, referenced] = line.split('\t')
    const [datasetName, snapName] = fullName.split('@')
    
    snapshots.push({
      name: snapName,
      dataset: datasetName,
      pool: datasetName.split('/')[0],
      created: creation,
      used: parseSize(used),
      referenced: parseSize(referenced),
    })
  }
  
  return snapshots
}

/**
 * Creates a ZFS snapshot
 */
export async function createZFSSnapshot(dataset: string, name: string): Promise<void> {
  const result = await executeCommand('zfs', ['snapshot', `${dataset}@${name}`], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create ZFS snapshot')
  }
}

/**
 * Deletes a ZFS snapshot
 */
export async function deleteZFSSnapshot(dataset: string, name: string): Promise<void> {
  const result = await executeCommand('zfs', ['destroy', `${dataset}@${name}`], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to delete ZFS snapshot')
  }
}

/**
 * Rollback to a ZFS snapshot
 */
export async function rollbackZFSSnapshot(dataset: string, name: string): Promise<void> {
  const result = await executeCommand('zfs', ['rollback', `${dataset}@${name}`], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to rollback ZFS snapshot')
  }
}

// ==================== Btrfs Functions ====================

/**
 * Lists Btrfs filesystems
 */
export async function listBtrfsPools(): Promise<StoragePool[]> {
  const result = await executeCommand('btrfs', ['filesystem', 'show'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const pools: StoragePool[] = []
  const blocks = result.stdout.split(/\n(?=Label:)/)
  
  for (const block of blocks) {
    if (!block.trim()) continue
    
    const labelMatch = block.match(/Label:\s*'?([^']+)'?\s+uuid:\s*(\S+)/)
    if (!labelMatch) continue
    
    const label = labelMatch[1] === 'none' ? labelMatch[2].substring(0, 8) : labelMatch[1]
    const sizeMatch = block.match(/Total devices\s+\d+\s+FS bytes used\s+(\S+)/)
    const deviceMatches = block.matchAll(/devid\s+\d+\s+size\s+(\S+).*path\s+(\S+)/g)
    
    const devices: string[] = []
    let totalSize = 0
    for (const match of deviceMatches) {
      totalSize += parseSize(match[1])
      devices.push(match[2])
    }
    
    const usedSize = sizeMatch ? parseSize(sizeMatch[1]) : 0
    
    pools.push({
      name: label,
      type: 'btrfs',
      status: 'online',
      size: totalSize,
      used: usedSize,
      available: totalSize - usedSize,
      mountpoint: '',
      devices,
      properties: {},
    })
  }
  
  return pools
}

/**
 * Lists Btrfs subvolumes
 */
export async function listBtrfsSubvolumes(mountpoint: string): Promise<StorageDataset[]> {
  const result = await executeCommand('btrfs', ['subvolume', 'list', mountpoint], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const datasets: StorageDataset[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/path\s+(.+)$/)
    if (!match) continue
    
    datasets.push({
      name: match[1],
      pool: mountpoint,
      type: 'btrfs',
      mountpoint: `${mountpoint}/${match[1]}`,
      used: 0,
      available: 0,
      properties: {},
    })
  }
  
  return datasets
}

/**
 * Creates a Btrfs subvolume
 */
export async function createBtrfsSubvolume(path: string): Promise<void> {
  const result = await executeCommand('btrfs', ['subvolume', 'create', path], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create Btrfs subvolume')
  }
}

/**
 * Deletes a Btrfs subvolume
 */
export async function deleteBtrfsSubvolume(path: string): Promise<void> {
  const result = await executeCommand('btrfs', ['subvolume', 'delete', path], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to delete Btrfs subvolume')
  }
}

/**
 * Creates a Btrfs snapshot
 */
export async function createBtrfsSnapshot(source: string, destination: string, readonly = false): Promise<void> {
  const args = ['subvolume', 'snapshot']
  if (readonly) args.push('-r')
  args.push(source, destination)
  
  const result = await executeCommand('btrfs', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create Btrfs snapshot')
  }
}

// ==================== LVM Functions ====================

/**
 * Lists LVM volume groups
 */
export async function listLVMPools(): Promise<StoragePool[]> {
  const result = await executeCommand('vgs', ['--reportformat', 'json'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  try {
    const data = JSON.parse(result.stdout)
    const pools: StoragePool[] = []
    
    for (const vg of data.report?.[0]?.vg || []) {
      // Get PVs for this VG
      const pvsResult = await executeCommand('pvs', ['--reportformat', 'json', '-S', `vg_name=${vg.vg_name}`], { sudo: true })
      const pvsData = pvsResult.exitCode === 0 ? JSON.parse(pvsResult.stdout) : { report: [{ pv: [] }] }
      const devices = pvsData.report?.[0]?.pv?.map((p: { pv_name: string }) => p.pv_name) || []
      
      pools.push({
        name: vg.vg_name,
        type: 'lvm',
        status: 'online',
        size: parseSize(vg.vg_size),
        used: parseSize(vg.vg_size) - parseSize(vg.vg_free),
        available: parseSize(vg.vg_free),
        mountpoint: '',
        devices,
        properties: {},
      })
    }
    
    return pools
  } catch {
    return []
  }
}

/**
 * Lists LVM logical volumes
 */
export async function listLVMVolumes(vgName?: string): Promise<StorageDataset[]> {
  const args = ['--reportformat', 'json']
  if (vgName) args.push('-S', `vg_name=${vgName}`)
  
  const result = await executeCommand('lvs', args, { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  try {
    const data = JSON.parse(result.stdout)
    const volumes: StorageDataset[] = []
    
    for (const lv of data.report?.[0]?.lv || []) {
      volumes.push({
        name: lv.lv_name,
        pool: lv.vg_name,
        type: 'lvm',
        mountpoint: '',
        used: parseSize(lv.lv_size),
        available: 0,
        properties: {},
      })
    }
    
    return volumes
  } catch {
    return []
  }
}

/**
 * Creates an LVM volume group
 */
export async function createLVMVolumeGroup(name: string, devices: string[]): Promise<void> {
  // First create physical volumes
  for (const device of devices) {
    const pvResult = await executeCommand('pvcreate', [device], { sudo: true })
    if (pvResult.exitCode !== 0) {
      throw new Error(pvResult.stderr || `Failed to create PV on ${device}`)
    }
  }
  
  // Then create volume group
  const result = await executeCommand('vgcreate', [name, ...devices], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create volume group')
  }
}

/**
 * Creates an LVM logical volume
 */
export async function createLVMLogicalVolume(
  name: string,
  vgName: string,
  size: string,
  filesystem?: string
): Promise<void> {
  const result = await executeCommand('lvcreate', ['-L', size, '-n', name, vgName], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create logical volume')
  }
  
  // Format if filesystem specified
  if (filesystem) {
    const mkfsResult = await executeCommand('mkfs', [`-t`, filesystem, `/dev/${vgName}/${name}`], { sudo: true })
    if (mkfsResult.exitCode !== 0) {
      throw new Error(mkfsResult.stderr || 'Failed to format logical volume')
    }
  }
}

// ==================== Share Functions ====================

/**
 * Lists SMB shares
 */
export async function listSMBShares(): Promise<StorageShare[]> {
  const result = await executeCommand('testparm', ['-s', '--section-name=global', '-l'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  // Parse smb.conf output (simplified)
  const shares: StorageShare[] = []
  // This would need proper parsing of smb.conf
  
  return shares
}

/**
 * Lists NFS exports
 */
export async function listNFSExports(): Promise<StorageShare[]> {
  const result = await executeCommand('exportfs', ['-v'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  const shares: StorageShare[] = []
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue
    const match = line.match(/^(\S+)\s+(\S+)\((.+)\)/)
    if (!match) continue
    
    const options: Record<string, string> = {}
    for (const opt of match[3].split(',')) {
      const [key, value] = opt.split('=')
      options[key] = value || 'true'
    }
    
    shares.push({
      id: `nfs-${match[1].replace(/\//g, '-')}`,
      name: match[1].split('/').pop() || match[1],
      path: match[1],
      type: 'nfs',
      enabled: true,
      options,
      allowedHosts: [match[2]],
      readOnly: options['ro'] === 'true',
    })
  }
  
  return shares
}

// Helper functions
function parseSize(str: string): number {
  if (!str) return 0
  const match = str.trim().match(/^([\d.]+)\s*([KMGTP]?i?B?)?$/i)
  if (!match) return parseInt(str) || 0
  
  const value = parseFloat(match[1])
  const unit = (match[2] || 'B').toUpperCase().replace('I', '')
  
  const multipliers: Record<string, number> = {
    B: 1,
    K: 1024,
    KB: 1024,
    M: 1024 ** 2,
    MB: 1024 ** 2,
    G: 1024 ** 3,
    GB: 1024 ** 3,
    T: 1024 ** 4,
    TB: 1024 ** 4,
    P: 1024 ** 5,
    PB: 1024 ** 5,
  }
  
  return value * (multipliers[unit] || 1)
}

function extractZFSDevices(statusOutput: string): string[] {
  const devices: string[] = []
  const lines = statusOutput.split('\n')
  
  for (const line of lines) {
    const match = line.match(/^\s+(sd[a-z]+|nvme\d+n\d+|vd[a-z]+)\s/)
    if (match) {
      devices.push(`/dev/${match[1]}`)
    }
  }
  
  return devices
}
