import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Whitelist of allowed commands for security
const ALLOWED_COMMANDS = [
  // Docker commands
  'docker',
  'docker-compose',
  // Libvirt/VM commands
  'virsh',
  'virt-install',
  'qemu-img',
  // Storage commands
  'zpool',
  'zfs',
  'btrfs',
  'lvm',
  'lvs',
  'vgs',
  'pvs',
  'lsblk',
  'blkid',
  'mount',
  'umount',
  'mkfs',
  // Network commands
  'ip',
  'netplan',
  'nmcli',
  'resolvectl',
  'systemd-resolve',
  // Nginx commands
  'nginx',
  'certbot',
  // Firewall commands
  'nft',
  'iptables',
  'ufw',
  // System commands
  'systemctl',
  'cat',
  'ls',
  'df',
  'free',
  'top',
  'ps',
  'uptime',
  'hostname',
  'uname',
  'lscpu',
  'lsmem',
  'ss',
  'netstat',
  'smbpasswd',
  'testparm',
  'exportfs',
  // Package management
  'apt',
  'apt-get',
  'dpkg',
  'sudo',
  'grep',
  'tee',
  'bash',
  'resolvectl',
  'certbot',
  'ln',
  'sed',
  'ufw',
  'sh',
]

// Characters that should be escaped in shell arguments
const DANGEROUS_CHARS = /[;&|`$(){}[\]<>\\'"!#*?~\n\r]/g

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
  command: string
  duration: number
}

export interface ShellOptions {
  timeout?: number
  cwd?: string
  env?: Record<string, string>
  sudo?: boolean
}

/**
 * Validates that a command is in the whitelist
 */
function validateCommand(command: string): boolean {
  const baseCommand = command.trim().split(/\s+/)[0]
  const commandName = baseCommand.replace(/^sudo\s+/, '')
  return ALLOWED_COMMANDS.some(allowed => 
    commandName === allowed || commandName.endsWith(`/${allowed}`)
  )
}

/**
 * Escapes shell arguments to prevent injection
 */
export function escapeShellArg(arg: string): string {
  if (DANGEROUS_CHARS.test(arg)) {
    // Use single quotes and escape any single quotes in the string
    return `'${arg.replace(/'/g, "'\\''")}'`
  }
  return arg
}

/**
 * Builds a safe command string from command and arguments
 */
export function buildCommand(command: string, args: string[] = []): string {
  const escapedArgs = args.map(escapeShellArg)
  return [command, ...escapedArgs].join(' ')
}

/**
 * Executes a shell command safely
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: ShellOptions = {}
): Promise<ShellResult> {
  const { timeout = 30000, cwd, env, sudo = false } = options
  const startTime = Date.now()
  
  // Build the full command
  let fullCommand = buildCommand(command, args)
  
  // Add sudo if requested
  if (sudo) {
    fullCommand = `sudo ${fullCommand}`
  }
  
  // Validate the command
  if (!validateCommand(fullCommand)) {
    throw new Error(`Command not allowed: ${command}`)
  }
  
  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout,
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
    
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
      command: fullCommand,
      duration: Date.now() - startTime,
    }
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string }
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || err.message || 'Unknown error',
      exitCode: err.code || 1,
      command: fullCommand,
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Executes a command and streams the output
 */
export function streamCommand(
  command: string,
  args: string[] = [],
  options: ShellOptions = {},
  onStdout?: (data: string) => void,
  onStderr?: (data: string) => void
): Promise<ShellResult> {
  const { timeout = 60000, cwd, env, sudo = false } = options
  const startTime = Date.now()
  
  // Validate the command
  const checkCommand = sudo ? `sudo ${command}` : command
  if (!validateCommand(checkCommand)) {
    return Promise.reject(new Error(`Command not allowed: ${command}`))
  }
  
  return new Promise((resolve, reject) => {
    const spawnArgs = sudo ? ['sudo', command, ...args] : [command, ...args]
    const spawnCommand = spawnArgs[0]
    const spawnRestArgs = spawnArgs.slice(1)
    
    const child = spawn(spawnCommand, spawnRestArgs, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
    })
    
    let stdout = ''
    let stderr = ''
    
    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${timeout}ms`))
    }, timeout)
    
    child.stdout?.on('data', (data: Buffer) => {
      const str = data.toString()
      stdout += str
      onStdout?.(str)
    })
    
    child.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      stderr += str
      onStderr?.(str)
    })
    
    child.on('close', (code) => {
      clearTimeout(timeoutId)
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
        command: spawnArgs.join(' '),
        duration: Date.now() - startTime,
      })
    })
    
    child.on('error', (error) => {
      clearTimeout(timeoutId)
      reject(error)
    })
  })
}

/**
 * Executes multiple commands in sequence
 */
export async function executeCommands(
  commands: { command: string; args?: string[]; options?: ShellOptions }[]
): Promise<ShellResult[]> {
  const results: ShellResult[] = []
  
  for (const { command, args = [], options = {} } of commands) {
    const result = await executeCommand(command, args, options)
    results.push(result)
    
    // Stop if a command fails
    if (result.exitCode !== 0) {
      break
    }
  }
  
  return results
}

/**
 * Parses JSON output from a command
 */
export async function executeCommandJson<T>(
  command: string,
  args: string[] = [],
  options: ShellOptions = {}
): Promise<T> {
  const result = await executeCommand(command, args, options)
  
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`)
  }
  
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    throw new Error(`Failed to parse JSON output: ${result.stdout}`)
  }
}

/**
 * Checks if a command exists on the system
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await executeCommand('which', [command])
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Gets the version of a command
 */
export async function getCommandVersion(command: string, versionFlag = '--version'): Promise<string | null> {
  try {
    const result = await executeCommand(command, [versionFlag])
    return result.exitCode === 0 ? result.stdout.split('\n')[0] : null
  } catch {
    return null
  }
}
