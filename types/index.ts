// User and Auth types
export interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'operator' | 'viewer'
  createdAt: string
  lastLogin?: string
}

export interface AuthSession {
  user: User
  token: string
  expiresAt: string
}

// System types
export interface SystemInfo {
  hostname: string
  os: string
  kernel: string
  uptime: number
  cpuModel: string
  cpuCores: number
  totalMemory: number
  totalDisk: number
}

export interface SystemMetrics {
  cpu: number
  memory: {
    used: number
    total: number
    percent: number
  }
  disk: {
    used: number
    total: number
    percent: number
  }
  network: {
    rx: number
    tx: number
  }
  loadAverage: number[]
  timestamp: number
}

// Docker types
export interface DockerContainer {
  id: string
  name: string
  image: string
  status: 'running' | 'paused' | 'exited' | 'created' | 'restarting' | 'dead'
  state: string
  created: string
  ports: { private: number; public: number; type: string }[]
  networks: string[]
  mounts: { source: string; destination: string; mode: string }[]
  cpu: number
  memory: { used: number; limit: number; percent: number }
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: number
  created: string
}

export interface DockerNetwork {
  id: string
  name: string
  driver: string
  scope: string
  ipam: { subnet: string; gateway: string }[]
  containers: string[]
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  createdAt: string
  labels: Record<string, string>
}

export interface DockerComposeProject {
  name: string
  path: string
  status: 'running' | 'stopped' | 'partial'
  services: { name: string; status: string; replicas: string }[]
}

// VM types
export interface VirtualMachine {
  id: string
  name: string
  uuid: string
  status: 'running' | 'paused' | 'shutoff' | 'crashed' | 'suspended'
  memory: number
  vcpus: number
  autostart: boolean
  persistent: boolean
  osType: string
  arch: string
  disks: VMDisk[]
  interfaces: VMInterface[]
  graphics?: { type: string; port: number; listen: string }
}

export interface VMDisk {
  device: string
  path: string
  size: number
  format: string
  bus: string
}

export interface VMInterface {
  type: string
  mac: string
  source: string
  model: string
}

export interface VMSnapshot {
  name: string
  domain: string
  creationTime: string
  state: string
  description?: string
  parent?: string
}

export interface ISOImage {
  name: string
  path: string
  size: number
  modified: string
}

// Storage types
export type StoragePoolType = 'zfs' | 'btrfs' | 'lvm' | 'dir'

export interface StoragePool {
  name: string
  type: StoragePoolType
  status: 'online' | 'degraded' | 'offline' | 'faulted'
  size: number
  used: number
  available: number
  mountpoint: string
  devices: string[]
  properties: Record<string, string>
}

export interface StorageDataset {
  name: string
  pool: string
  type: StoragePoolType
  mountpoint: string
  used: number
  available: number
  quota?: number
  compression?: string
  properties: Record<string, string>
}

export interface StorageSnapshot {
  name: string
  dataset: string
  pool: string
  created: string
  used: number
  referenced: number
}

export interface StorageShare {
  id: string
  name: string
  path: string
  type: 'smb' | 'nfs'
  enabled: boolean
  comment?: string
  options: Record<string, string>
  allowedHosts?: string[]
  allowedUsers?: string[]
  readOnly: boolean
}

export interface StorageDisk {
  name: string
  path: string
  size: number
  model: string
  serial: string
  type: 'ssd' | 'hdd' | 'nvme'
  status: 'available' | 'in-use' | 'failed'
  partitions: { name: string; size: number; filesystem: string; mountpoint?: string }[]
}

// Network types
export interface NetworkInterface {
  name: string
  type: 'ethernet' | 'bridge' | 'vlan' | 'bond' | 'loopback' | 'virtual'
  mac: string
  state: 'up' | 'down'
  mtu: number
  addresses: { address: string; netmask: string; family: 'inet' | 'inet6' }[]
  gateway?: string
  dns?: string[]
  dhcp: boolean
  speed?: number
  stats: { rx: number; tx: number; rxPackets: number; txPackets: number }
}

export interface DNSConfig {
  nameservers: string[]
  searchDomains: string[]
  resolvConfPath: string
}

export interface ProxyHost {
  id: string
  domain: string
  target: string
  port: number
  ssl: boolean
  sslCertPath?: string
  sslKeyPath?: string
  forceSSL: boolean
  enabled: boolean
  locations?: ProxyLocation[]
  cacheEnabled: boolean
  websocketSupport: boolean
}

export interface ProxyLocation {
  path: string
  target: string
  port: number
  headers?: Record<string, string>
}

// Web Server types
export interface WebSite {
  id: string
  name: string
  domain: string
  root: string
  enabled: boolean
  ssl: boolean
  sslCertPath?: string
  sslKeyPath?: string
  php: boolean
  phpVersion?: string
  accessLog: string
  errorLog: string
  config: string
}

export interface SSLCertificate {
  domain: string
  issuer: string
  validFrom: string
  validTo: string
  path: string
  keyPath: string
  autoRenew: boolean
  type: 'letsencrypt' | 'self-signed' | 'custom'
}

// Firewall types
export type FirewallAction = 'accept' | 'drop' | 'reject'
export type FirewallProtocol = 'tcp' | 'udp' | 'icmp' | 'all'
export type FirewallDirection = 'input' | 'output' | 'forward'

export interface FirewallRule {
  id: string
  name: string
  chain: FirewallDirection
  action: FirewallAction
  protocol: FirewallProtocol
  sourceAddress?: string
  destinationAddress?: string
  sourcePort?: string
  destinationPort?: string
  interface?: string
  enabled: boolean
  position: number
  comment?: string
}

export interface FirewallZone {
  name: string
  interfaces: string[]
  services: string[]
  ports: { port: number; protocol: FirewallProtocol }[]
  masquerade: boolean
  forwardPorts: { sourcePort: number; destinationPort: number; destinationAddress?: string; protocol: FirewallProtocol }[]
}

export interface FirewallStatus {
  enabled: boolean
  defaultInputPolicy: FirewallAction
  defaultOutputPolicy: FirewallAction
  defaultForwardPolicy: FirewallAction
  activeRules: number
  blockedConnections: number
}

// Services types
export interface SystemService {
  name: string
  description: string
  status: 'running' | 'stopped' | 'failed' | 'inactive'
  enabled: boolean
  pid?: number
  memory?: number
  cpu?: number
  uptime?: number
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
