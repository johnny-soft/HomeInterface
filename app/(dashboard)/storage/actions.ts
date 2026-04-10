'use server'

import { executeCommand } from '@/lib/shell-executor'

const SMB_CONF = '/etc/samba/smb.conf'

/**
 * 1. DISCOS E SAÚDE FÍSICA (S.M.A.R.T)
 */
export async function fetchDisksAction() {
  try {
    // Filtro pesado: exclui RAM disks (1), Loop (7) e CD (11)
    const result = await executeCommand('lsblk', [
      '-J', '-b', 
      '-e', '1,7,11', 
      '-o', 'NAME,PATH,SIZE,MODEL,TYPE,FSTYPE,MOUNTPOINT,ROTA'
    ]);
    
    const data = JSON.parse(result.stdout);
    if (!data.blockdevices) return [];

    const diskPromises = data.blockdevices
      .filter((dev: any) => dev.type === 'disk')
      .map(async (dev: any) => {
        // Tenta rodar o SMART
        const smart = await executeCommand('sudo', ['smartctl', '-H', dev.path]);
        
        let healthStatus = 'warning';

        // Se o comando retornou 0 (sucesso) e tem "PASSED", está saudável
        if (smart.exitCode === 0 && smart.stdout.includes('PASSED')) {
          healthStatus = 'healthy';
        } 
        // Se o comando falhou (exitCode != 0), geralmente é porque o disco é virtual
        else if (smart.exitCode !== 0 || smart.stderr.includes('unavailable') || smart.stdout.includes('Unknown')) {
          healthStatus = 'unsupported';
        }

        return {
          name: dev.name,
          path: dev.path,
          size: parseInt(dev.size),
          model: dev.model?.trim() || 'Virtual Disk',
          type: dev.rota === "0" ? 'ssd' : 'hdd',
          status: (dev.fstype || dev.mountpoint || dev.children?.length > 0) ? 'in-use' : 'available',
          health: healthStatus
        };
      });

    return await Promise.all(diskPromises);
  } catch (error) {
    return [];
  }
}
/**
 * 2. POOLS ZFS E SNAPSHOTS
 */
export async function fetchPoolsAction() {
  try {
    const res = await executeCommand('sudo', ['zpool', 'list', '-H', '-p', '-o', 'name,size,alloc,free,health,mountpoint']);
    if (res.exitCode !== 0) return [];

    return res.stdout.trim().split('\n').map(line => {
      const [name, size, used, free, health, mountpoint] = line.split('\t');
      return {
        name,
        type: 'zfs',
        status: health.toLowerCase() === 'online' ? 'online' : 'degraded',
        size: parseInt(size),
        used: parseInt(used),
        mountpoint,
      };
    });
  } catch (e) { return []; }
}

export async function createPoolAction(name: string, raid: string, disks: string[], autoSnap: boolean) {
  try {
    const args = ['zpool', 'create', '-f', name];
    if (raid !== 'stripe') args.push(raid);
    args.push(...disks);
    
    await executeCommand('sudo', args);

    if (autoSnap) {
      const cronCmd = `(crontab -l 2>/dev/null; echo "0 0 * * * /usr/sbin/zfs snapshot ${name}@$(date +\\%Y-\\%m-\\%d)") | crontab -`;
      await executeCommand('sudo', ['bash', '-c', cronCmd]);
    }
    return { success: true };
  } catch (error: any) { throw new Error(error.message); }
}

/**
 * 3. COMPARTILHAMENTO SAMBA (HÍBRIDO COM CRIAÇÃO DE PASTA)
 */
export async function createShareAction(data: { name: string, path: string, readOnly: boolean }) {
  try {
    // Garante que a pasta exista (mkdir -p) e define permissões
    await executeCommand('sudo', ['mkdir', '-p', data.path]);
    await executeCommand('sudo', ['chown', '-R', 'homelab:homelab', data.path]);
    await executeCommand('sudo', ['chmod', '-R', '775', data.path]);

    // Verifica se já existe o bloco no smb.conf
    const check = await executeCommand('sudo', ['grep', '-q', `\\[${data.name}\\]`, SMB_CONF]);
    if (check.exitCode === 0) {
      throw new Error("Um compartilhamento com este nome já existe.");
    }

    const entry = `\n[${data.name}]\n   path = ${data.path}\n   browseable = yes\n   read only = ${data.readOnly ? 'yes' : 'no'}\n   guest ok = yes\n   force user = homelab\n   create mask = 0664\n   directory mask = 0775\n`;

    await executeCommand('sudo', ['bash', '-c', `echo "${entry}" | tee -a ${SMB_CONF}`]);
    await executeCommand('sudo', ['systemctl', 'restart', 'smbd']);
    
    return { success: true };
  } catch (e: any) { 
    throw new Error(e.message); 
  }
}

/**
 * 4. LISTAGEM DE SHARES (PARSING SMB.CONF)
 */
export async function fetchSharesAction() {
  try {
    const res = await executeCommand('sudo', ['cat', SMB_CONF]);
    if (res.exitCode !== 0) return [];

    const lines = res.stdout.split('\n');
    const shares: any[] = [];
    let currentShare: any = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && !['[global]', '[printers]', '[homes]'].includes(trimmed.toLowerCase())) {
        if (currentShare) shares.push(currentShare);
        currentShare = { name: trimmed.replace('[', '').replace(']', ''), path: 'Caminho não definido' };
      } else if (currentShare && trimmed.startsWith('path =')) {
        currentShare.path = trimmed.split('=')[1].trim();
      }
    });

    if (currentShare) shares.push(currentShare);
    return shares;
  } catch (e) {
    return [];
  }
}