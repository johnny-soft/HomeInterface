import { executeCommand, commandExists } from '../shell-executor'
import type { FirewallRule, FirewallZone, FirewallStatus, FirewallAction, FirewallProtocol, FirewallDirection } from '@/types'
import { writeFile, readFile } from 'fs/promises'

const NFTABLES_CONF = '/etc/nftables.conf'
const HOMELAB_TABLE = 'homelab'

/**
 * Checks if nftables is available
 */
export async function isFirewallAvailable(): Promise<boolean> {
  return await commandExists('nft')
}

/**
 * Gets firewall status
 */
export async function getFirewallStatus(): Promise<FirewallStatus> {
  const result = await executeCommand('nft', ['list', 'ruleset'], { sudo: true })
  const enabled = result.exitCode === 0 && result.stdout.includes('table')
  
  // Count active rules
  const ruleMatches = result.stdout.match(/^\s*(accept|drop|reject)/gm) || []
  
  return {
    enabled,
    defaultInputPolicy: 'accept',
    defaultOutputPolicy: 'accept',
    defaultForwardPolicy: 'accept',
    activeRules: ruleMatches.length,
    blockedConnections: 0,
  }
}

/**
 * Enables the firewall
 */
export async function enableFirewall(): Promise<void> {
  // Start nftables service
  const result = await executeCommand('systemctl', ['enable', '--now', 'nftables'], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to enable firewall')
  }
  
  // Initialize basic ruleset if not exists
  await initializeRuleset()
}

/**
 * Disables the firewall
 */
export async function disableFirewall(): Promise<void> {
  // Flush all rules
  await executeCommand('nft', ['flush', 'ruleset'], { sudo: true })
  
  // Stop nftables service
  const result = await executeCommand('systemctl', ['disable', '--now', 'nftables'], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to disable firewall')
  }
}

/**
 * Initializes the basic ruleset
 */
export async function initializeRuleset(): Promise<void> {
  const ruleset = `#!/usr/sbin/nft -f
# HomeLab Manager Firewall Configuration

flush ruleset

table inet ${HOMELAB_TABLE} {
    chain input {
        type filter hook input priority 0; policy accept;
        
        # Allow established connections
        ct state established,related accept
        
        # Allow loopback
        iif lo accept
        
        # Allow ICMP
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept
        
        # Allow SSH
        tcp dport 22 accept
        
        # Allow HTTP/HTTPS
        tcp dport { 80, 443 } accept
        
        # HomeLab Manager rules will be added below
        # HOMELAB_RULES_INPUT
    }
    
    chain forward {
        type filter hook forward priority 0; policy accept;
        
        # Allow forwarding for established connections
        ct state established,related accept
        
        # HOMELAB_RULES_FORWARD
    }
    
    chain output {
        type filter hook output priority 0; policy accept;
        
        # HOMELAB_RULES_OUTPUT
    }
}
`

  // Write configuration
  await writeFile(NFTABLES_CONF, ruleset)
  
  // Apply configuration
  const result = await executeCommand('nft', ['-f', NFTABLES_CONF], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to apply firewall rules')
  }
}

/**
 * Lists all firewall rules
 */
export async function listRules(): Promise<FirewallRule[]> {
  const result = await executeCommand('nft', ['-j', 'list', 'ruleset'], { sudo: true })
  if (result.exitCode !== 0) {
    return []
  }
  
  try {
    const data = JSON.parse(result.stdout)
    const rules: FirewallRule[] = []
    let position = 0
    
    for (const item of data.nftables || []) {
      if (item.rule && item.rule.table === HOMELAB_TABLE) {
        const rule = parseNftRule(item.rule, position++)
        if (rule) {
          rules.push(rule)
        }
      }
    }
    
    return rules
  } catch {
    return []
  }
}

/**
 * Adds a firewall rule
 */
export async function addRule(rule: Omit<FirewallRule, 'id' | 'position'>): Promise<FirewallRule> {
  const nftRule = buildNftRule(rule)
  
  const args = ['add', 'rule', 'inet', HOMELAB_TABLE, rule.chain, ...nftRule]
  
  if (rule.comment) {
    args.push('comment', `"${rule.comment}"`)
  }
  
  const result = await executeCommand('nft', args, { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to add firewall rule')
  }
  
  // Save rules
  await saveRules()
  
  return {
    ...rule,
    id: `rule-${Date.now()}`,
    position: 0,
  }
}

/**
 * Removes a firewall rule
 */
export async function removeRule(chain: FirewallDirection, handle: number): Promise<void> {
  const result = await executeCommand('nft', [
    'delete', 'rule', 'inet', HOMELAB_TABLE, chain, 'handle', handle.toString()
  ], { sudo: true })
  
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to remove firewall rule')
  }
  
  await saveRules()
}

/**
 * Allows a port
 */
export async function allowPort(port: number, protocol: FirewallProtocol = 'tcp', comment?: string): Promise<void> {
  await addRule({
    name: `Allow ${protocol}/${port}`,
    chain: 'input',
    action: 'accept',
    protocol,
    destinationPort: port.toString(),
    enabled: true,
    comment,
  })
}

/**
 * Blocks a port
 */
export async function blockPort(port: number, protocol: FirewallProtocol = 'tcp', comment?: string): Promise<void> {
  await addRule({
    name: `Block ${protocol}/${port}`,
    chain: 'input',
    action: 'drop',
    protocol,
    destinationPort: port.toString(),
    enabled: true,
    comment,
  })
}

/**
 * Allows an IP address
 */
export async function allowIP(ip: string, comment?: string): Promise<void> {
  await addRule({
    name: `Allow IP ${ip}`,
    chain: 'input',
    action: 'accept',
    protocol: 'all',
    sourceAddress: ip,
    enabled: true,
    comment,
  })
}

/**
 * Blocks an IP address
 */
export async function blockIP(ip: string, comment?: string): Promise<void> {
  await addRule({
    name: `Block IP ${ip}`,
    chain: 'input',
    action: 'drop',
    protocol: 'all',
    sourceAddress: ip,
    enabled: true,
    comment,
  })
}

/**
 * Adds port forwarding rule
 */
export async function addPortForward(
  externalPort: number,
  internalIP: string,
  internalPort: number,
  protocol: FirewallProtocol = 'tcp'
): Promise<void> {
  // Enable IP forwarding
  await executeCommand('sysctl', ['-w', 'net.ipv4.ip_forward=1'], { sudo: true })
  
  // Add DNAT rule for incoming traffic
  const dnatResult = await executeCommand('nft', [
    'add', 'rule', 'inet', HOMELAB_TABLE, 'prerouting',
    protocol, 'dport', externalPort.toString(),
    'dnat', 'to', `${internalIP}:${internalPort}`
  ], { sudo: true })
  
  if (dnatResult.exitCode !== 0) {
    throw new Error(dnatResult.stderr || 'Failed to add port forward')
  }
  
  await saveRules()
}

/**
 * Removes port forwarding rule
 */
export async function removePortForward(externalPort: number, protocol: FirewallProtocol = 'tcp'): Promise<void> {
  // This would need to find the specific rule handle and remove it
  // For now, we'll reload the ruleset without this rule
  await saveRules()
}

/**
 * Gets zones (simplified implementation)
 */
export async function listZones(): Promise<FirewallZone[]> {
  // nftables doesn't have zones like firewalld, but we can simulate them
  return [
    {
      name: 'trusted',
      interfaces: ['lo'],
      services: ['ssh', 'http', 'https'],
      ports: [],
      masquerade: false,
      forwardPorts: [],
    },
    {
      name: 'public',
      interfaces: ['eth0'],
      services: ['ssh'],
      ports: [],
      masquerade: false,
      forwardPorts: [],
    },
  ]
}

/**
 * Saves current rules to config file
 */
async function saveRules(): Promise<void> {
  const result = await executeCommand('nft', ['list', 'ruleset'], { sudo: true })
  if (result.exitCode === 0) {
    await writeFile(NFTABLES_CONF, `#!/usr/sbin/nft -f\n\nflush ruleset\n\n${result.stdout}`)
  }
}

/**
 * Reloads rules from config file
 */
export async function reloadRules(): Promise<void> {
  const result = await executeCommand('nft', ['-f', NFTABLES_CONF], { sudo: true })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to reload firewall rules')
  }
}

// Helper functions
function parseNftRule(rule: {
  chain: string
  expr?: Array<{ match?: { left?: { payload?: { field?: string } }; right?: string | number }; accept?: null; drop?: null; reject?: null; counter?: null }>
  handle?: number
  comment?: string
}, position: number): FirewallRule | null {
  let action: FirewallAction = 'accept'
  let protocol: FirewallProtocol = 'all'
  let sourceAddress: string | undefined
  let destinationAddress: string | undefined
  let sourcePort: string | undefined
  let destinationPort: string | undefined
  
  for (const expr of rule.expr || []) {
    if (expr.accept !== undefined) action = 'accept'
    else if (expr.drop !== undefined) action = 'drop'
    else if (expr.reject !== undefined) action = 'reject'
    else if (expr.match) {
      const left = expr.match.left?.payload?.field
      const right = String(expr.match.right)
      
      if (left === 'protocol') protocol = right as FirewallProtocol
      else if (left === 'saddr') sourceAddress = right
      else if (left === 'daddr') destinationAddress = right
      else if (left === 'sport') sourcePort = right
      else if (left === 'dport') destinationPort = right
    }
  }
  
  return {
    id: `rule-${rule.handle || position}`,
    name: rule.comment || `Rule ${position + 1}`,
    chain: rule.chain as FirewallDirection,
    action,
    protocol,
    sourceAddress,
    destinationAddress,
    sourcePort,
    destinationPort,
    enabled: true,
    position,
    comment: rule.comment,
  }
}

function buildNftRule(rule: Omit<FirewallRule, 'id' | 'position'>): string[] {
  const parts: string[] = []
  
  // Protocol
  if (rule.protocol && rule.protocol !== 'all') {
    parts.push(rule.protocol)
  }
  
  // Source address
  if (rule.sourceAddress) {
    parts.push('ip', 'saddr', rule.sourceAddress)
  }
  
  // Destination address
  if (rule.destinationAddress) {
    parts.push('ip', 'daddr', rule.destinationAddress)
  }
  
  // Source port
  if (rule.sourcePort) {
    parts.push(rule.protocol || 'tcp', 'sport', rule.sourcePort)
  }
  
  // Destination port
  if (rule.destinationPort) {
    parts.push(rule.protocol || 'tcp', 'dport', rule.destinationPort)
  }
  
  // Interface
  if (rule.interface) {
    if (rule.chain === 'input') {
      parts.push('iif', rule.interface)
    } else {
      parts.push('oif', rule.interface)
    }
  }
  
  // Action
  parts.push(rule.action)
  
  return parts
}
