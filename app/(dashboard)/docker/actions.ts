'use server'

import { executeCommand } from '@/lib/shell-executor'

// --- INTERFACES DE RETORNO DO DOCKER ---
interface DockerRawContainer {
  ID: string
  Names: string
  Image: string
  State: string
  Status: string
  Ports: string
}

interface DockerRawImage {
  ID: string
  Repository: string
  Tag: string
  Size: string
  CreatedAt: string
}

interface DockerRawVolume {
  Name: string
  Driver: string
  Mountpoint: string
}

interface DockerRawNetwork {
  ID: string
  Name: string
  Driver: string
  Scope: string
}

// ==========================================
// 1. CONTAINERS
// ==========================================

export async function fetchContainersAction() {
  try {
    const result = await executeCommand('docker', ['ps', '-a', '--format', '{{json .}}'])

    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    const lines = result.stdout.trim().split('\n')
    return lines.map((line) => {
      try {
        const raw: DockerRawContainer = JSON.parse(line)
        return {
          id: raw.ID,
          name: raw.Names,
          image: raw.Image,
          status: raw.State,
          state: raw.Status,
          ports: raw.Ports ? [{ public: 0, private: 0, type: raw.Ports }] : [],
          cpu: 0,
          memory: { used: 0, limit: 0, percent: 0 }
        }
      } catch (e) { return null }
    }).filter(Boolean)
  } catch (error) {
    console.error("Erro Containers:", error)
    return []
  }
}

export async function startContainerAction(id: string) {
  return await executeCommand('docker', ['start', id])
}

export async function stopContainerAction(id: string) {
  return await executeCommand('docker', ['stop', id])
}

export async function restartContainerAction(id: string) {
  return await executeCommand('docker', ['restart', id])
}

export async function removeContainerAction(id: string) {
  return await executeCommand('docker', ['rm', '-f', id])
}

export async function createContainerAction(
  name: string, 
  image: string, 
  ports?: string, 
  envs?: string,
  network?: string,
  ip?: string
) {
  const args = ['run', '-d']
  
  if (name) args.push('--name', name)
  if (network) args.push('--network', network)
  if (ip && network) args.push('--ip', ip) // IP exige rede manual

  if (ports) {
    ports.split(',').forEach(p => args.push('-p', p.trim()))
  }

  if (envs) {
    envs.split(',').forEach(e => args.push('-e', e.trim()))
  }
  
  args.push(image)
  
  const result = await executeCommand('docker', args)
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao criar container.")
  return result
}

// ==========================================
// 2. IMAGENS
// ==========================================

export async function fetchImagesAction() {
  try {
    const result = await executeCommand('docker', ['images', '--format', '{{json .}}'])
    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    const lines = result.stdout.trim().split('\n')
    return lines.map((line) => {
      try {
        const raw: DockerRawImage = JSON.parse(line)
        return {
          id: raw.ID,
          repository: raw.Repository,
          tag: raw.Tag,
          size: raw.Size,
          created: raw.CreatedAt
        }
      } catch (e) { return null }
    }).filter(Boolean)
  } catch (error) { return [] }
}

export async function pullImageAction(imageName: string) {
  const result = await executeCommand('docker', ['pull', imageName])
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro no pull.")
  return result
}

export async function removeImageAction(id: string) {
  const result = await executeCommand('docker', ['rmi', '-f', id])
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover imagem.")
  return result
}

// ==========================================
// 3. VOLUMES
// ==========================================

export async function fetchVolumesAction() {
  try {
    const result = await executeCommand('docker', ['volume', 'ls', '--format', '{{json .}}'])
    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    return result.stdout.trim().split('\n').map((line) => {
      try {
        const raw: DockerRawVolume = JSON.parse(line)
        return {
          name: raw.Name,
          driver: raw.Driver,
          mountpoint: raw.Mountpoint
        }
      } catch (e) { return null }
    }).filter(Boolean)
  } catch (error) { return [] }
}

export async function createVolumeAction(name: string) {
  return await executeCommand('docker', ['volume', 'create', name])
}

export async function removeVolumeAction(name: string) {
  const result = await executeCommand('docker', ['volume', 'rm', name])
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover volume.")
  return result
}

// ==========================================
// 4. REDES (NETWORKS)
// ==========================================

export async function fetchNetworksAction() {
  try {
    // Buscamos todas as redes primeiro
    const result = await executeCommand('docker', ['network', 'ls', '--format', '{{json .}}'])
    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    const lines = result.stdout.trim().split('\n')
    const networks = lines.map(line => JSON.parse(line))

    // Para cada rede, pegamos o detalhe da Subnet
    const detailedNetworks = await Promise.all(networks.map(async (net: any) => {
      const inspect = await executeCommand('docker', ['network', 'inspect', net.ID])
      let subnet = 'N/A'
      
      if (inspect.exitCode === 0) {
        try {
          const details = JSON.parse(inspect.stdout)
          // O Docker guarda a subnet em IPAM.Config
          subnet = details[0]?.IPAM?.Config[0]?.Subnet || 'N/A'
        } catch (e) { subnet = 'N/A' }
      }

      return {
        id: net.ID,
        name: net.Name,
        driver: net.Driver,
        scope: net.Scope,
        subnet: subnet // Nova propriedade com a faixa de IP
      }
    }))

    return detailedNetworks
  } catch (error) {
    return []
  }
}
export async function createNetworkAction(name: string, driver: string, subnet: string) {
  if (!name || !driver) {
    throw new Error("Nome e Driver são obrigatórios.");
  }

  const args = ['network', 'create', '--driver', driver];

  if (subnet.trim()) {
    // Validação básica de CIDR para evitar o erro do prefixo
    if (!subnet.includes('/')) {
      throw new Error("A sub-rede deve estar no formato CIDR (ex: 192.168.10.0/24).");
    }
    args.push('--subnet', subnet.trim());
  }

  args.push(name.trim());

  const result = await executeCommand('docker', args, { sudo: true });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Erro ao criar rede.");
  }

  return true;
}

export async function removeNetworkAction(id: string) {
  const result = await executeCommand('docker', ['network', 'rm', id])
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover rede.")
  return result
}