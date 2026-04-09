import { executeCommand, streamCommand, commandExists } from '../shell-executor'
import type { DockerContainer, DockerImage, DockerNetwork, DockerVolume, DockerComposeProject } from '@/types'

/**
 * Checks if Docker is installed and running
 */
export async function isDockerAvailable(): Promise<boolean> {
  const exists = await commandExists('docker')
  if (!exists) return false
  
  const result = await executeCommand('docker', ['info'])
  return result.exitCode === 0
}

/**
 * Lists all Docker containers
 */
export async function listContainers(all = true): Promise<DockerContainer[]> {
  const args = ['ps', '--format', '{{json .}}']
  if (all) args.push('-a')
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list containers')
  }
  
  if (!result.stdout.trim()) return []
  
  const lines = result.stdout.trim().split('\n')
  const containers: DockerContainer[] = []
  
  for (const line of lines) {
    try {
      const raw = JSON.parse(line)
      containers.push({
        id: raw.ID,
        name: raw.Names,
        image: raw.Image,
        status: parseContainerStatus(raw.State),
        state: raw.Status,
        created: raw.CreatedAt,
        ports: parsePorts(raw.Ports),
        networks: raw.Networks ? raw.Networks.split(',') : [],
        mounts: [],
        cpu: 0,
        memory: { used: 0, limit: 0, percent: 0 },
      })
    } catch {
      // Skip invalid lines
    }
  }
  
  return containers
}

/**
 * Gets detailed container info
 */
export async function getContainer(id: string): Promise<DockerContainer | null> {
  const result = await executeCommand('docker', ['inspect', id])
  if (result.exitCode !== 0) {
    return null
  }
  
  try {
    const [data] = JSON.parse(result.stdout)
    return {
      id: data.Id.substring(0, 12),
      name: data.Name.replace(/^\//, ''),
      image: data.Config.Image,
      status: parseContainerStatus(data.State.Status),
      state: data.State.Status,
      created: data.Created,
      ports: parseInspectPorts(data.NetworkSettings?.Ports || {}),
      networks: Object.keys(data.NetworkSettings?.Networks || {}),
      mounts: (data.Mounts || []).map((m: { Source: string; Destination: string; Mode: string }) => ({
        source: m.Source,
        destination: m.Destination,
        mode: m.Mode,
      })),
      cpu: 0,
      memory: { used: 0, limit: 0, percent: 0 },
    }
  } catch {
    return null
  }
}

/**
 * Gets container stats
 */
export async function getContainerStats(id: string): Promise<{ cpu: number; memory: { used: number; limit: number; percent: number } }> {
  const result = await executeCommand('docker', ['stats', '--no-stream', '--format', '{{json .}}', id])
  if (result.exitCode !== 0) {
    return { cpu: 0, memory: { used: 0, limit: 0, percent: 0 } }
  }
  
  try {
    const data = JSON.parse(result.stdout)
    return {
      cpu: parseFloat(data.CPUPerc?.replace('%', '') || '0'),
      memory: {
        used: parseMemory(data.MemUsage?.split('/')[0] || '0'),
        limit: parseMemory(data.MemUsage?.split('/')[1] || '0'),
        percent: parseFloat(data.MemPerc?.replace('%', '') || '0'),
      },
    }
  } catch {
    return { cpu: 0, memory: { used: 0, limit: 0, percent: 0 } }
  }
}

/**
 * Starts a container
 */
export async function startContainer(id: string): Promise<void> {
  const result = await executeCommand('docker', ['start', id])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to start container')
  }
}

/**
 * Stops a container
 */
export async function stopContainer(id: string, timeout = 10): Promise<void> {
  const result = await executeCommand('docker', ['stop', '-t', timeout.toString(), id])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to stop container')
  }
}

/**
 * Restarts a container
 */
export async function restartContainer(id: string): Promise<void> {
  const result = await executeCommand('docker', ['restart', id])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to restart container')
  }
}

/**
 * Removes a container
 */
export async function removeContainer(id: string, force = false, removeVolumes = false): Promise<void> {
  const args = ['rm']
  if (force) args.push('-f')
  if (removeVolumes) args.push('-v')
  args.push(id)
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to remove container')
  }
}

/**
 * Gets container logs
 */
export async function getContainerLogs(
  id: string,
  options: { tail?: number; since?: string; timestamps?: boolean } = {}
): Promise<string> {
  const args = ['logs']
  if (options.tail) args.push('--tail', options.tail.toString())
  if (options.since) args.push('--since', options.since)
  if (options.timestamps) args.push('-t')
  args.push(id)
  
  const result = await executeCommand('docker', args)
  // Docker logs go to stderr for some containers
  return result.stdout || result.stderr
}

/**
 * Streams container logs
 */
export function streamContainerLogs(
  id: string,
  onLog: (data: string) => void,
  options: { tail?: number; timestamps?: boolean } = {}
): Promise<void> {
  const args = ['logs', '-f']
  if (options.tail) args.push('--tail', options.tail.toString())
  if (options.timestamps) args.push('-t')
  args.push(id)
  
  return streamCommand('docker', args, {}, onLog, onLog).then(() => {})
}

/**
 * Lists all Docker images
 */
export async function listImages(): Promise<DockerImage[]> {
  const result = await executeCommand('docker', ['images', '--format', '{{json .}}'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list images')
  }
  
  if (!result.stdout.trim()) return []
  
  const lines = result.stdout.trim().split('\n')
  return lines.map(line => {
    const raw = JSON.parse(line)
    return {
      id: raw.ID,
      repository: raw.Repository,
      tag: raw.Tag,
      size: parseSize(raw.Size),
      created: raw.CreatedAt || raw.CreatedSince,
    }
  })
}

/**
 * Pulls a Docker image
 */
export async function pullImage(image: string, tag = 'latest'): Promise<void> {
  const result = await executeCommand('docker', ['pull', `${image}:${tag}`], { timeout: 600000 })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to pull image')
  }
}

/**
 * Removes a Docker image
 */
export async function removeImage(id: string, force = false): Promise<void> {
  const args = ['rmi']
  if (force) args.push('-f')
  args.push(id)
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to remove image')
  }
}

/**
 * Lists Docker networks
 */
export async function listNetworks(): Promise<DockerNetwork[]> {
  const result = await executeCommand('docker', ['network', 'ls', '--format', '{{json .}}'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list networks')
  }
  
  if (!result.stdout.trim()) return []
  
  const lines = result.stdout.trim().split('\n')
  return lines.map(line => {
    const raw = JSON.parse(line)
    return {
      id: raw.ID,
      name: raw.Name,
      driver: raw.Driver,
      scope: raw.Scope,
      ipam: [],
      containers: [],
    }
  })
}

/**
 * Lists Docker volumes
 */
export async function listVolumes(): Promise<DockerVolume[]> {
  const result = await executeCommand('docker', ['volume', 'ls', '--format', '{{json .}}'])
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to list volumes')
  }
  
  if (!result.stdout.trim()) return []
  
  const lines = result.stdout.trim().split('\n')
  return lines.map(line => {
    const raw = JSON.parse(line)
    return {
      name: raw.Name,
      driver: raw.Driver,
      mountpoint: raw.Mountpoint || '',
      createdAt: '',
      labels: {},
    }
  })
}

/**
 * Creates a new container
 */
export async function createContainer(options: {
  name: string
  image: string
  ports?: { host: number; container: number }[]
  volumes?: { host: string; container: string }[]
  env?: Record<string, string>
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure'
  network?: string
}): Promise<string> {
  const args = ['run', '-d', '--name', options.name]
  
  if (options.restart) {
    args.push('--restart', options.restart)
  }
  
  if (options.network) {
    args.push('--network', options.network)
  }
  
  if (options.ports) {
    for (const port of options.ports) {
      args.push('-p', `${port.host}:${port.container}`)
    }
  }
  
  if (options.volumes) {
    for (const vol of options.volumes) {
      args.push('-v', `${vol.host}:${vol.container}`)
    }
  }
  
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      args.push('-e', `${key}=${value}`)
    }
  }
  
  args.push(options.image)
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to create container')
  }
  
  return result.stdout.trim().substring(0, 12)
}

/**
 * Lists Docker Compose projects
 */
export async function listComposeProjects(): Promise<DockerComposeProject[]> {
  const result = await executeCommand('docker', ['compose', 'ls', '--format', 'json'])
  if (result.exitCode !== 0) {
    return []
  }
  
  try {
    const projects = JSON.parse(result.stdout)
    return projects.map((p: { Name: string; ConfigFiles: string; Status: string }) => ({
      name: p.Name,
      path: p.ConfigFiles,
      status: p.Status.includes('running') ? 'running' : p.Status.includes('exited') ? 'stopped' : 'partial',
      services: [],
    }))
  } catch {
    return []
  }
}

/**
 * Docker Compose up
 */
export async function composeUp(projectPath: string, detach = true): Promise<void> {
  const args = ['compose', '-f', projectPath, 'up']
  if (detach) args.push('-d')
  
  const result = await executeCommand('docker', args, { timeout: 300000 })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to start compose project')
  }
}

/**
 * Docker Compose down
 */
export async function composeDown(projectPath: string, removeVolumes = false): Promise<void> {
  const args = ['compose', '-f', projectPath, 'down']
  if (removeVolumes) args.push('-v')
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to stop compose project')
  }
}

// Helper functions
function parseContainerStatus(state: string): DockerContainer['status'] {
  const s = state.toLowerCase()
  if (s.includes('running') || s === 'running') return 'running'
  if (s.includes('paused') || s === 'paused') return 'paused'
  if (s.includes('exited') || s === 'exited') return 'exited'
  if (s.includes('created') || s === 'created') return 'created'
  if (s.includes('restarting') || s === 'restarting') return 'restarting'
  if (s.includes('dead') || s === 'dead') return 'dead'
  return 'exited'
}

function parsePorts(portsStr: string): DockerContainer['ports'] {
  if (!portsStr) return []
  const ports: DockerContainer['ports'] = []
  const matches = portsStr.matchAll(/(\d+)->(\d+)\/(\w+)/g)
  for (const match of matches) {
    ports.push({
      public: parseInt(match[1]),
      private: parseInt(match[2]),
      type: match[3],
    })
  }
  return ports
}

function parseInspectPorts(portsObj: Record<string, Array<{ HostPort: string }> | null>): DockerContainer['ports'] {
  const ports: DockerContainer['ports'] = []
  for (const [key, value] of Object.entries(portsObj)) {
    if (!value) continue
    const [port, type] = key.split('/')
    for (const binding of value) {
      ports.push({
        private: parseInt(port),
        public: parseInt(binding.HostPort),
        type: type || 'tcp',
      })
    }
  }
  return ports
}

function parseMemory(str: string): number {
  const match = str.trim().match(/^([\d.]+)\s*([KMGT]?i?B)?$/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] || 'B').toUpperCase()
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
  }
  return value * (multipliers[unit] || 1)
}

function parseSize(str: string): number {
  return parseMemory(str)
}
