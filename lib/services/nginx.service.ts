import { executeCommand, commandExists } from '../shell-executor'
import type { WebSite, SSLCertificate } from '@/types'
import { readFile, writeFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'

const SITES_AVAILABLE = '/etc/nginx/sites-available'
const SITES_ENABLED = '/etc/nginx/sites-enabled'
const WEBROOT_BASE = '/var/www'

/**
 * Checks if Nginx is available
 */
export async function isNginxAvailable(): Promise<boolean> {
  return await commandExists('nginx')
}

/**
 * Gets Nginx status
 */
export async function getNginxStatus(): Promise<{
  running: boolean
  version: string
  configValid: boolean
}> {
  const versionResult = await executeCommand('nginx', ['-v'])
  const version = versionResult.stderr.match(/nginx\/(\S+)/)?.[1] || 'unknown'
  
  const statusResult = await executeCommand('systemctl', ['is-active', 'nginx'])
  const running = statusResult.stdout.trim() === 'active'
  
  const testResult = await executeCommand('nginx', ['-t'], { sudo: true })
  const configValid = testResult.exitCode === 0
  
  return { running, version, configValid }
}

/**
 * Lists all websites
 */
export async function listSites(): Promise<WebSite[]> {
  const result = await executeCommand('ls', [SITES_AVAILABLE])
  if (result.exitCode !== 0) {
    return []
  }
  
  const sites: WebSite[] = []
  const files = result.stdout.split('\n').filter(f => f && f !== 'default')
  
  for (const file of files) {
    try {
      const content = await readFile(`${SITES_AVAILABLE}/${file}`, 'utf-8')
      const site = parseSiteConfig(file, content)
      if (site) {
        site.enabled = existsSync(`${SITES_ENABLED}/${file}`)
        sites.push(site)
      }
    } catch {
      // Skip unparseable files
    }
  }
  
  return sites
}

/**
 * Gets a specific site
 */
export async function getSite(id: string): Promise<WebSite | null> {
  const sites = await listSites()
  return sites.find(s => s.id === id) || null
}

/**
 * Creates a new website
 */
export async function createSite(options: {
  name: string
  domain: string
  root?: string
  php?: boolean
  phpVersion?: string
}): Promise<WebSite> {
  const id = options.domain.replace(/\./g, '-')
  const root = options.root || `${WEBROOT_BASE}/${options.domain}`
  
  // Create webroot directory
  await executeCommand('mkdir', ['-p', root], { sudo: true })
  await executeCommand('chown', ['-R', 'www-data:www-data', root], { sudo: true })
  
  // Create default index.html
  const indexContent = `<!DOCTYPE html>
<html>
<head>
    <title>Welcome to ${options.domain}</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>Welcome to ${options.domain}</h1>
    <p>This site is managed by HomeLab Manager.</p>
</body>
</html>`
  
  if (!existsSync(`${root}/index.html`)) {
    await writeFile(`${root}/index.html`, indexContent)
    await executeCommand('chown', ['www-data:www-data', `${root}/index.html`], { sudo: true })
  }
  
  // Generate nginx config
  const config = generateSiteConfig({
    id,
    name: options.name,
    domain: options.domain,
    root,
    php: options.php || false,
    phpVersion: options.phpVersion,
    ssl: false,
    enabled: true,
    accessLog: `/var/log/nginx/${options.domain}.access.log`,
    errorLog: `/var/log/nginx/${options.domain}.error.log`,
    config: '',
  })
  
  // Write config
  const configPath = `${SITES_AVAILABLE}/${id}`
  await writeFile(configPath, config)
  
  // Enable site
  await executeCommand('ln', ['-sf', configPath, `${SITES_ENABLED}/${id}`], { sudo: true })
  
  // Test and reload nginx
  const testResult = await executeCommand('nginx', ['-t'], { sudo: true })
  if (testResult.exitCode !== 0) {
    // Clean up on failure
    await executeCommand('rm', ['-f', configPath, `${SITES_ENABLED}/${id}`], { sudo: true })
    throw new Error(testResult.stderr || 'Invalid nginx configuration')
  }
  
  await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
  
  return {
    id,
    name: options.name,
    domain: options.domain,
    root,
    enabled: true,
    ssl: false,
    php: options.php || false,
    phpVersion: options.phpVersion,
    accessLog: `/var/log/nginx/${options.domain}.access.log`,
    errorLog: `/var/log/nginx/${options.domain}.error.log`,
    config,
  }
}

/**
 * Updates a website
 */
export async function updateSite(id: string, updates: Partial<WebSite>): Promise<WebSite> {
  const site = await getSite(id)
  if (!site) {
    throw new Error('Site not found')
  }
  
  const updated = { ...site, ...updates }
  const config = generateSiteConfig(updated)
  
  // Write config
  const configPath = `${SITES_AVAILABLE}/${id}`
  await writeFile(configPath, config)
  
  // Update enabled state
  if (updates.enabled !== undefined) {
    if (updates.enabled) {
      await executeCommand('ln', ['-sf', configPath, `${SITES_ENABLED}/${id}`], { sudo: true })
    } else {
      await executeCommand('rm', ['-f', `${SITES_ENABLED}/${id}`], { sudo: true })
    }
  }
  
  // Test and reload nginx
  const testResult = await executeCommand('nginx', ['-t'], { sudo: true })
  if (testResult.exitCode !== 0) {
    throw new Error(testResult.stderr || 'Invalid nginx configuration')
  }
  
  await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
  
  return updated
}

/**
 * Deletes a website
 */
export async function deleteSite(id: string, removeFiles = false): Promise<void> {
  const site = await getSite(id)
  
  // Remove from enabled
  await executeCommand('rm', ['-f', `${SITES_ENABLED}/${id}`], { sudo: true })
  
  // Remove config
  await executeCommand('rm', ['-f', `${SITES_AVAILABLE}/${id}`], { sudo: true })
  
  // Remove webroot if requested
  if (removeFiles && site?.root) {
    await executeCommand('rm', ['-rf', site.root], { sudo: true })
  }
  
  // Reload nginx
  await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
}

/**
 * Enables a site
 */
export async function enableSite(id: string): Promise<void> {
  await executeCommand('ln', ['-sf', `${SITES_AVAILABLE}/${id}`, `${SITES_ENABLED}/${id}`], { sudo: true })
  
  const testResult = await executeCommand('nginx', ['-t'], { sudo: true })
  if (testResult.exitCode !== 0) {
    await executeCommand('rm', ['-f', `${SITES_ENABLED}/${id}`], { sudo: true })
    throw new Error(testResult.stderr || 'Invalid nginx configuration')
  }
  
  await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
}

/**
 * Disables a site
 */
export async function disableSite(id: string): Promise<void> {
  await executeCommand('rm', ['-f', `${SITES_ENABLED}/${id}`], { sudo: true })
  await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
}

// ==================== SSL Functions ====================

/**
 * Lists SSL certificates
 */
export async function listCertificates(): Promise<SSLCertificate[]> {
  const certs: SSLCertificate[] = []
  
  // Check Let's Encrypt certificates
  const letsencryptDir = '/etc/letsencrypt/live'
  const lsResult = await executeCommand('ls', [letsencryptDir], { sudo: true })
  
  if (lsResult.exitCode === 0) {
    const domains = lsResult.stdout.split('\n').filter(d => d && d !== 'README')
    
    for (const domain of domains) {
      try {
        const certPath = `${letsencryptDir}/${domain}/fullchain.pem`
        const certInfo = await executeCommand('openssl', [
          'x509', '-in', certPath, '-noout',
          '-subject', '-issuer', '-dates'
        ], { sudo: true })
        
        if (certInfo.exitCode === 0) {
          const subject = certInfo.stdout.match(/subject=.*CN\s*=\s*([^\n,]+)/)?.[1] || domain
          const issuer = certInfo.stdout.match(/issuer=.*O\s*=\s*([^\n,]+)/)?.[1] || 'Unknown'
          const notBefore = certInfo.stdout.match(/notBefore=(.+)/)?.[1] || ''
          const notAfter = certInfo.stdout.match(/notAfter=(.+)/)?.[1] || ''
          
          certs.push({
            domain: subject,
            issuer,
            validFrom: notBefore,
            validTo: notAfter,
            path: certPath,
            keyPath: `${letsencryptDir}/${domain}/privkey.pem`,
            autoRenew: true,
            type: 'letsencrypt',
          })
        }
      } catch {
        // Skip problematic certificates
      }
    }
  }
  
  return certs
}

/**
 * Requests a Let's Encrypt certificate
 */
export async function requestCertificate(domain: string, email: string, webroot?: string): Promise<SSLCertificate> {
  const hasCertbot = await commandExists('certbot')
  if (!hasCertbot) {
    throw new Error('Certbot is not installed')
  }
  
  const args = [
    'certonly',
    '--non-interactive',
    '--agree-tos',
    '--email', email,
    '-d', domain,
  ]
  
  if (webroot) {
    args.push('--webroot', '-w', webroot)
  } else {
    args.push('--nginx')
  }
  
  const result = await executeCommand('certbot', args, { sudo: true, timeout: 120000 })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to obtain certificate')
  }
  
  // Get certificate info
  const certs = await listCertificates()
  const cert = certs.find(c => c.domain === domain)
  
  if (!cert) {
    throw new Error('Certificate obtained but not found')
  }
  
  return cert
}

/**
 * Renews all certificates
 */
export async function renewCertificates(): Promise<{ renewed: string[]; failed: string[] }> {
  const result = await executeCommand('certbot', ['renew', '--non-interactive'], { sudo: true, timeout: 300000 })
  
  const renewed: string[] = []
  const failed: string[] = []
  
  // Parse output for success/failure
  const successMatches = result.stdout.matchAll(/Congratulations.*?(\S+)/g)
  for (const match of successMatches) {
    renewed.push(match[1])
  }
  
  const failMatches = result.stdout.matchAll(/Failed to renew.*?(\S+)/g)
  for (const match of failMatches) {
    failed.push(match[1])
  }
  
  // Reload nginx if any renewed
  if (renewed.length > 0) {
    await executeCommand('systemctl', ['reload', 'nginx'], { sudo: true })
  }
  
  return { renewed, failed }
}

/**
 * Generates a self-signed certificate
 */
export async function generateSelfSignedCert(domain: string): Promise<SSLCertificate> {
  const certDir = `/etc/ssl/homelab/${domain}`
  const certPath = `${certDir}/cert.pem`
  const keyPath = `${certDir}/key.pem`
  
  // Create directory
  await executeCommand('mkdir', ['-p', certDir], { sudo: true })
  
  // Generate certificate
  const result = await executeCommand('openssl', [
    'req', '-x509', '-nodes',
    '-days', '365',
    '-newkey', 'rsa:2048',
    '-keyout', keyPath,
    '-out', certPath,
    '-subj', `/CN=${domain}`,
  ], { sudo: true })
  
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Failed to generate certificate')
  }
  
  return {
    domain,
    issuer: 'Self-Signed',
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    path: certPath,
    keyPath,
    autoRenew: false,
    type: 'self-signed',
  }
}

/**
 * Enables SSL for a site
 */
export async function enableSiteSSL(siteId: string, certPath: string, keyPath: string): Promise<void> {
  const site = await getSite(siteId)
  if (!site) {
    throw new Error('Site not found')
  }
  
  await updateSite(siteId, {
    ssl: true,
    sslCertPath: certPath,
    sslKeyPath: keyPath,
  })
}

// Helper functions
function parseSiteConfig(filename: string, content: string): WebSite | null {
  const serverNameMatch = content.match(/server_name\s+([^;]+);/)
  const rootMatch = content.match(/root\s+([^;]+);/)
  const sslMatch = content.match(/listen\s+443\s+ssl/)
  const phpMatch = content.match(/fastcgi_pass.*php/)
  
  if (!serverNameMatch) return null
  
  return {
    id: filename,
    name: filename,
    domain: serverNameMatch[1].trim(),
    root: rootMatch?.[1]?.trim() || '/var/www/html',
    enabled: false,
    ssl: !!sslMatch,
    php: !!phpMatch,
    accessLog: `/var/log/nginx/${filename}.access.log`,
    errorLog: `/var/log/nginx/${filename}.error.log`,
    config: content,
  }
}

function generateSiteConfig(site: WebSite): string {
  let config = `# Site: ${site.name}
# Generated by HomeLab Manager

server {
    listen 80;
    server_name ${site.domain};

    root ${site.root};
    index index.html index.htm${site.php ? ' index.php' : ''};

    access_log ${site.accessLog};
    error_log ${site.errorLog};

    location / {
        try_files $uri $uri/ ${site.php ? '/index.php?$query_string' : '=404'};
    }
`

  if (site.php) {
    const phpVersion = site.phpVersion || '8.2'
    config += `
    location ~ \\.php$ {
        fastcgi_split_path_info ^(.+\\.php)(/.+)$;
        fastcgi_pass unix:/var/run/php/php${phpVersion}-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }
`
  }

  config += `
    location ~ /\\.ht {
        deny all;
    }
}
`

  if (site.ssl) {
    config += `
server {
    listen 443 ssl http2;
    server_name ${site.domain};

    ssl_certificate ${site.sslCertPath};
    ssl_certificate_key ${site.sslKeyPath};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    root ${site.root};
    index index.html index.htm${site.php ? ' index.php' : ''};

    access_log ${site.accessLog};
    error_log ${site.errorLog};

    location / {
        try_files $uri $uri/ ${site.php ? '/index.php?$query_string' : '=404'};
    }
`

    if (site.php) {
      const phpVersion = site.phpVersion || '8.2'
      config += `
    location ~ \\.php$ {
        fastcgi_split_path_info ^(.+\\.php)(/.+)$;
        fastcgi_pass unix:/var/run/php/php${phpVersion}-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }
`
    }

    config += `
    location ~ /\\.ht {
        deny all;
    }
}
`
  }

  return config
}
