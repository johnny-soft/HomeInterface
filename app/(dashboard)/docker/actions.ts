'use server'

import { executeCommand } from '@/lib/shell-executor'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

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
// 1. CONTAINERS & COMPOSE
// ==========================================

export async function fetchContainersAction() {
  try {
    const result = await executeCommand('docker', ['ps', '-a', '--format', '{{json .}}'], { sudo: true })

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
  return await executeCommand('docker', ['start', id], { sudo: true })
}

export async function stopContainerAction(id: string) {
  return await executeCommand('docker', ['stop', id], { sudo: true })
}

export async function restartContainerAction(id: string) {
  return await executeCommand('docker', ['restart', id], { sudo: true })
}

export async function removeContainerAction(id: string) {
  return await executeCommand('docker', ['rm', '-f', id], { sudo: true })
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
  if (ip && network) args.push('--ip', ip)

  if (ports) {
    ports.split(',').forEach(p => args.push('-p', p.trim()))
  }

  if (envs) {
    envs.split(',').forEach(e => args.push('-e', e.trim()))
  }
  
  args.push(image)
  
  const result = await executeCommand('docker', args, { sudo: true })
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao criar container.")
  return result
}

export async function inspectContainerAction(id: string) {
  try {
    const result = await executeCommand('docker', ['inspect', id], { sudo: true })
    if (result.exitCode !== 0) throw new Error("Erro ao inspecionar container")
    
    const data = JSON.parse(result.stdout)[0]
    
    let portsArray: string[] = []
    if (data.NetworkSettings.Ports) {
      for (const [containerPort, bindings] of Object.entries(data.NetworkSettings.Ports)) {
        if (bindings && Array.isArray(bindings) && bindings.length > 0) {
          const hostPort = (bindings as any)[0].HostPort
          const cPort = containerPort.split('/')[0]
          portsArray.push(`${hostPort}:${cPort}`)
        }
      }
    }

    const networks = Object.keys(data.NetworkSettings.Networks)
    const network = networks.length > 0 ? networks[0] : ''
    const ip = network ? data.NetworkSettings.Networks[network].IPAMConfig?.IPv4Address || data.NetworkSettings.Networks[network].IPAddress : ''

    const envs = data.Config.Env ? data.Config.Env.filter((e: string) => !e.startsWith('PATH=')).join(', ') : ''

    return {
      name: data.Name.replace(/^\//, ''),
      image: data.Config.Image,
      ports: portsArray.join(', '),
      envs: envs,
      network: network === 'bridge' ? '' : network,
      ip: ip
    }
  } catch (error: any) {
    throw new Error(error.message || "Falha ao ler configurações do container")
  }
}

export async function createComposeAction(projectName: string, yamlContent: string) {
  if (!yamlContent) throw new Error("O conteúdo do YAML é obrigatório.");

  const safeProjectName = projectName 
    ? projectName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() 
    : `compose-${Date.now()}`;

  const projectDir = path.join(os.tmpdir(), 'homelab-compose', safeProjectName);
  
  try {
    await fs.mkdir(projectDir, { recursive: true });
    const composeFilePath = path.join(projectDir, 'docker-compose.yml');
    await fs.writeFile(composeFilePath, yamlContent, 'utf8');

    const result = await executeCommand('docker-compose', ['-p', safeProjectName, 'up', '-d'], { 
      cwd: projectDir,
      sudo: true 
    });

    if (result.exitCode !== 0) throw new Error(`Falha no Compose: ${result.stderr}`);
    return true;
  } catch (error: any) {
    throw new Error(error.message || "Erro interno ao executar docker-compose.");
  }
}

// ==========================================
// 2. TERMINAL WEB SHELL (EXEC)
// ==========================================

export async function executeContainerCommandAction(id: string, cmd: string) {
  try {
    const result = await executeCommand('docker', ['exec', id, 'sh', '-c', cmd], { sudo: true })
    
    return { 
      success: result.exitCode === 0, 
      output: result.stdout || result.stderr || '' 
    }
  } catch (error: any) {
    return { 
      success: false, 
      output: error.message || "Erro ao executar comando na shell do container." 
    }
  }
}

// Logs estáticos (mantido como fallback caso o stream falhe)
export async function fetchContainerLogsAction(id: string, tail: number = 100) {
  try {
    const result = await executeCommand('docker', ['logs', '--tail', tail.toString(), id], { sudo: true })
    const combinedLogs = [result.stdout, result.stderr].filter(Boolean).join('\n')
    return { success: true, logs: combinedLogs }
  } catch (error: any) {
    return { success: false, logs: error.message || "Erro ao buscar logs do container." }
  }
}

// ==========================================
// 3. IMAGENS
// ==========================================

export async function fetchImagesAction() {
  try {
    const result = await executeCommand('docker', ['images', '--format', '{{json .}}'], { sudo: true })
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
  const result = await executeCommand('docker', ['pull', imageName], { sudo: true })
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro no pull.")
  return result
}

export async function removeImageAction(id: string) {
  const result = await executeCommand('docker', ['rmi', '-f', id], { sudo: true })
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover imagem.")
  return result
}

// ==========================================
// 4. VOLUMES
// ==========================================

export async function fetchVolumesAction() {
  try {
    const result = await executeCommand('docker', ['volume', 'ls', '--format', '{{json .}}'], { sudo: true })
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
  return await executeCommand('docker', ['volume', 'create', name], { sudo: true })
}

export async function removeVolumeAction(name: string) {
  const result = await executeCommand('docker', ['volume', 'rm', name], { sudo: true })
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover volume.")
  return result
}

// ==========================================
// 5. REDES (NETWORKS)
// ==========================================

export async function fetchNetworksAction() {
  try {
    const result = await executeCommand('docker', ['network', 'ls', '--format', '{{json .}}'], { sudo: true })
    if (result.exitCode !== 0 || !result.stdout.trim()) return []

    const lines = result.stdout.trim().split('\n')
    const networks = lines.map(line => JSON.parse(line))

    const detailedNetworks = await Promise.all(networks.map(async (net: any) => {
      const inspect = await executeCommand('docker', ['network', 'inspect', net.ID], { sudo: true })
      let subnet = 'N/A'
      
      if (inspect.exitCode === 0) {
        try {
          const details = JSON.parse(inspect.stdout)
          subnet = details[0]?.IPAM?.Config[0]?.Subnet || 'N/A'
        } catch (e) { subnet = 'N/A' }
      }

      return {
        id: net.ID,
        name: net.Name,
        driver: net.Driver,
        scope: net.Scope,
        subnet: subnet
      }
    }))

    return detailedNetworks
  } catch (error) {
    return []
  }
}

export async function createNetworkAction(name: string, driver: string, subnet: string) {
  if (!name || !driver) throw new Error("Nome e Driver são obrigatórios.");

  const args = ['network', 'create', '--driver', driver];

  if (subnet.trim()) {
    if (!subnet.includes('/')) throw new Error("A sub-rede deve estar no formato CIDR (ex: 192.168.10.0/24).");
    args.push('--subnet', subnet.trim());
  }

  args.push(name.trim());

  const result = await executeCommand('docker', args, { sudo: true });

  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao criar rede.");

  return true;
}

export async function removeNetworkAction(id: string) {
  const result = await executeCommand('docker', ['network', 'rm', id], { sudo: true })
  if (result.exitCode !== 0) throw new Error(result.stderr || "Erro ao remover rede.")
  return result
}