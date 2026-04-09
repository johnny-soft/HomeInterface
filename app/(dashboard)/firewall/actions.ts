'use server'

import { executeCommand } from '@/lib/shell-executor'
import { revalidatePath } from 'next/cache'

// Função auxiliar para encontrar o caminho do UFW
const UFW_PATH = '/usr/sbin/ufw'; 

export async function fetchFirewallDataAction() {
  try {
    revalidatePath('/firewall');
    // Busca o status simples
    const result = await executeCommand('sudo', [UFW_PATH, 'status']);
    const output = result.stdout.toLowerCase().trim();
    
    // Verifica se está ativo (funciona em EN e PT)
    const isActive = output.includes('active') || output.includes('ativo');
    
    let rules: any[] = [];
    if (isActive) {
      const detailed = await executeCommand('sudo', [UFW_PATH, 'status', 'numbered']);
      const lines = detailed.stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/\[\s*(\d+)\]\s+(.*?)\s+(ALLOW|DENY|REJECT|PERMITIR|NEGAR)\s+(IN|OUT)?\s*(.*)/i);
        if (match) {
          let action = match[3].trim().toUpperCase();
          if (action === 'PERMITIR') action = 'ALLOW';
          if (action === 'NEGAR') action = 'DENY';
          rules.push({
            id: parseInt(match[1]),
            to: match[2].trim(),
            action: action,
            direction: match[4] ? match[4].trim() : 'IN',
            from: match[5] ? match[5].trim() : 'Anywhere'
          });
        }
      }
    }
    return { active: isActive, rules };
  } catch (error) {
    return { active: false, rules: [] };
  }
}

export async function toggleFirewallAction(enable: boolean) {
  try {
    const action = enable ? 'enable' : 'disable';
    // O --force é vital aqui para não travar o processo do Node
    await executeCommand('sudo', [UFW_PATH, '--force', action]);
    
    // No WSL, às vezes o firewall precisa ser "chutado" para subir o serviço
    if (enable) {
      await executeCommand('sudo', [UFW_PATH, 'reload']);
    }

    revalidatePath('/firewall');
    return { success: true };
  } catch (e: any) {
    console.error("Erro no toggle:", e.message);
    throw e;
  }
}

export async function addFirewallRuleAction(data: { port: string, protocol: string, action: string }) {
  try {
    const proto = data.protocol === 'any' ? '' : `/${data.protocol}`;
    await executeCommand('sudo', [UFW_PATH, data.action.toLowerCase(), `${data.port}${proto}`]);
    revalidatePath('/firewall');
    return { success: true };
  } catch (e: any) { throw e; }
}

export async function deleteFirewallRuleAction(id: number) {
  try {
    await executeCommand('sudo', [UFW_PATH, '--force', 'delete', id.toString()]);
    revalidatePath('/firewall');
    return { success: true };
  } catch (e: any) { throw e; }
}