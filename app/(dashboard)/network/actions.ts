'use server'

import { executeCommand } from '@/lib/shell-executor'

const NGINX_ENABLED = '/etc/nginx/sites-enabled'
const NGINX_AVAILABLE = '/etc/nginx/sites-available'
const DEFAULT_DNS_INTERFACE = 'br0' 

export async function fetchNetworkDataAction() {
  try {
    const [ifaceRes, dnsRes] = await Promise.all([
      executeCommand('ip', ['-j', 'addr']),
      executeCommand('resolvectl', ['status'])
    ]);

    const interfaces = JSON.parse(ifaceRes.stdout).map((i: any) => ({
      name: i.ifname,
      type: i.link_type === 'ether' ? 'ethernet' : (i.ifname === 'lo' ? 'loopback' : 'virtual'),
      mac: i.address,
      state: i.operstate.toLowerCase(),
      addresses: i.addr_info.map((a: any) => ({ 
        address: a.local, 
        mask: a.prefixlen, 
        family: a.family 
      })),
      speed: i.speed || null
    }));

    const rawDns = dnsRes.stdout.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
    const uniqueDns = Array.from(new Set(rawDns));

    return { interfaces, dns: { nameservers: uniqueDns } };
  } catch (e) { 
    console.error("Erro ao buscar dados de rede:", e);
    return { interfaces: [], dns: { nameservers: [] } }; 
  }
}

export async function updateDNSAction(dnsServers: string[]) {
  try {
    await executeCommand('sudo', ['resolvectl', 'dns', DEFAULT_DNS_INTERFACE, ...dnsServers]);
    return { success: true };
  } catch (e: any) { throw new Error(e.message); }
}

export async function createProxyHostAction(data: { domain: string, target: string, port: number, ssl: boolean, websocket: boolean }) {
  try {
    const fileName = `homelab-${data.domain.replace(/\./g, '-')}`;
    const config = `
server {
    listen 80;
    server_name ${data.domain};
    
    location / {
        proxy_pass http://${data.target}:${data.port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        ${data.websocket ? `
        proxy_http_version 1.1; 
        proxy_set_header Upgrade $http_upgrade; 
        proxy_set_header Connection "upgrade";` : ''}
    }
}`;

    await executeCommand('sudo', ['bash', '-c', `echo '${config}' > ${NGINX_AVAILABLE}/${fileName}`]);
    await executeCommand('sudo', ['ln', '-sf', `${NGINX_AVAILABLE}/${fileName}`, `${NGINX_ENABLED}/${fileName}`]);

    if (data.ssl) {
      await executeCommand('sudo', ['certbot', '--nginx', '-d', data.domain, '--non-interactive', '--agree-tos', '-m', 'admin@homelab.local']);
    }
    // Garante que não há linhas duplicadas e adiciona o novo domínio no /etc/hosts
    // A tag #homelab-auto nos ajuda a identificar o que o painel criou
    await executeCommand('sudo', ['sed', '-i', `/[[:space:]]${data.domain}/d`, '/etc/hosts']);
    await executeCommand('sudo', ['bash', '-c', `echo "127.0.0.1 ${data.domain} #homelab-auto" | tee -a /etc/hosts`]);
    await executeCommand('sudo', ['nginx', '-t']);
    await executeCommand('sudo', ['systemctl', 'reload', 'nginx']);
    return { success: true };
  } catch (e: any) { throw new Error(e.message); }
}

export async function fetchProxiesAction() {
  try {
    const lsRes = await executeCommand('sudo', ['ls', '-1', NGINX_ENABLED]);
    if (lsRes.exitCode !== 0) return [];

    const files = lsRes.stdout.trim().split('\n').filter(f => f.startsWith('homelab-'));
    const proxies = [];

    for (const file of files) {
      const catRes = await executeCommand('sudo', ['cat', `${NGINX_ENABLED}/${file}`]);
      const text = catRes.stdout;

      const domainMatch = text.match(/server_name\s+(.+);/);
      const proxyPassMatch = text.match(/proxy_pass\s+http:\/\/([^:]+):(\d+);/);
      const hasSsl = text.includes('ssl_certificate') || text.includes('listen 443 ssl');
      const hasWs = text.includes('Upgrade $http_upgrade');

      proxies.push({
        id: file,
        domain: domainMatch ? domainMatch[1].trim() : 'Desconhecido',
        target: proxyPassMatch ? proxyPassMatch[1] : 'Desconhecido',
        port: proxyPassMatch ? parseInt(proxyPassMatch[2]) : 80,
        ssl: hasSsl,
        websocket: hasWs,
        enabled: true
      });
    }
    return proxies;
  } catch (error) { return []; }
}

export async function deleteProxyAction(fileName: string, domain: string) {
  try {
    // Remove do Nginx
    await executeCommand('sudo', ['rm', '-f', `${NGINX_AVAILABLE}/${fileName}`, `${NGINX_ENABLED}/${fileName}`]);
    
    // Remove do /etc/hosts
    await executeCommand('sudo', ['sed', '-i', `/[[:space:]]${domain}/d`, '/etc/hosts']);
    
    await executeCommand('sudo', ['systemctl', 'reload', 'nginx']);
    return { success: true };
  } catch (e: any) { throw new Error(e.message); }
}

/**
 * NOVA FUNÇÃO: EDITAR PROXY HOST
 */
export async function editProxyHostAction(oldId: string, data: { domain: string, target: string, port: number, ssl: boolean, websocket: boolean }) {
  try {
    // 1. Remove a configuração antiga
    await executeCommand('sudo', ['rm', '-f', `${NGINX_AVAILABLE}/${oldId}`, `${NGINX_ENABLED}/${oldId}`]);
    
    // 2. Reutiliza a lógica de criação com os novos dados
    return await createProxyHostAction(data);
  } catch (e: any) { 
    throw new Error(e.message); 
  }
}
/**
 * 6. CONFIGURAR INTERFACE DE REDE (NETPLAN)
 */
export async function updateInterfaceIPAction(data: {
  iface: string;
  dhcp: boolean;
  ip: string;
  mask: string;
  gateway: string;
}) {
  try {
    const fileName = `99-homelab-${data.iface}.yaml`;
    const filePath = `/etc/netplan/${fileName}`;

    // Monta o YAML de configuração do Netplan respeitando a indentação estrita
    let yaml = `network:\n  version: 2\n  ethernets:\n    ${data.iface}:\n`;

    if (data.dhcp) {
      yaml += `      dhcp4: true\n`;
    } else {
      yaml += `      dhcp4: false\n`;
      if (data.ip && data.mask) {
        yaml += `      addresses: [${data.ip}/${data.mask}]\n`;
      }
      if (data.gateway) {
        yaml += `      routes:\n        - to: default\n          via: ${data.gateway}\n`;
      }
      // Opcional: Você pode forçar os nameservers do Netplan aqui, 
      // mas como já usamos o resolvectl na outra aba, não é estritamente necessário.
    }

    // Escreve o arquivo e aplica a configuração de rede
    await executeCommand('sudo', ['bash', '-c', `echo "${yaml}" > ${filePath}`]);
    
    // ATENÇÃO: O netplan apply pode derrubar a conexão temporariamente
    await executeCommand('sudo', ['netplan', 'apply']);

    return { success: true };
  } catch (e: any) {
    throw new Error(e.message);
  }
}
/**
 * 7. LISTAR REDES VIRTUAIS DO KVM (LIBVIRT)
 */
export async function fetchKvmNetworksAction() {
  try {
    // Busca apenas os nomes das redes virtuais
    const listRes = await executeCommand('sudo', ['virsh', 'net-list', '--all', '--name']);
    if (listRes.exitCode !== 0) return [];

    const netNames = listRes.stdout.trim().split('\n').filter(Boolean);
    const networks = [];

    for (const name of netNames) {
      // Busca informações de estado e o XML de configuração completo
      const infoRes = await executeCommand('sudo', ['virsh', 'net-info', name]);
      const xmlRes = await executeCommand('sudo', ['virsh', 'net-dumpxml', name]);

      const info = infoRes.stdout;
      const xml = xmlRes.stdout;

      // Extrai os dados essenciais via Regex
      const bridgeMatch = xml.match(/<bridge name='([^']+)'/);
      const ipMatch = xml.match(/<ip address='([^']+)' netmask='([^']+)'/);
      const dhcpStartMatch = xml.match(/<range start='([^']+)'/);
      const dhcpEndMatch = xml.match(/end='([^']+)'/);

      networks.push({
        name,
        active: info.includes('Active: yes'),
        autostart: info.includes('Autostart: yes'),
        bridge: bridgeMatch ? bridgeMatch[1] : 'N/A',
        ip: ipMatch ? `${ipMatch[1]} / ${ipMatch[2]}` : 'Sem IP configurado',
        dhcp: (dhcpStartMatch && dhcpEndMatch) ? `${dhcpStartMatch[1]} - ${dhcpEndMatch[1]}` : 'Desativado'
      });
    }
    return networks;
  } catch (error) {
    console.error("Erro ao buscar redes KVM:", error);
    return [];
  }
}

/**
 * 8. ALTERAR ESTADO DA REDE KVM
 */
export async function toggleKvmNetworkAction(name: string, action: 'start' | 'destroy' | 'autostart' | 'disable-autostart') {
  try {
    if (action === 'disable-autostart') {
      await executeCommand('sudo', ['virsh', 'net-autostart', name, '--disable']);
    } else {
      await executeCommand('sudo', ['virsh', `net-${action}`, name]);
    }
    return { success: true };
  } catch (e: any) {
    throw new Error(e.message);
  }
}