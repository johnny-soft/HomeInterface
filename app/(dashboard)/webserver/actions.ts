'use server'

import { executeCommand } from '@/lib/shell-executor'
import { revalidatePath } from 'next/cache'

const NGINX_PATH = '/etc/nginx';

/**
 * 1. BUSCAR DADOS REAIS DOS SITES
 */
export async function fetchNginxSitesAction() {
  try {
    // Listamos os sites disponíveis e os habilitados
    const availableRes = await executeCommand('ls', [`${NGINX_PATH}/sites-available`]);
    const enabledRes = await executeCommand('ls', [`${NGINX_PATH}/sites-enabled`]);

    const available = availableRes.stdout.split('\n').filter(Boolean);
    const enabled = enabledRes.stdout.split('\n').filter(Boolean);

    return available.map(name => {
      // Para cada site, poderíamos ler o conteúdo do arquivo para extrair o domínio/root
      // Por enquanto, vamos retornar se ele está ativo ou não
      return {
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        domain: name.includes('.') ? name : `${name}.local`,
        root: `/var/www/${name}`,
        enabled: enabled.includes(name),
        ssl: false, // Isso exigirá um parser de texto no futuro
        php: false
      };
    });
  } catch (error) {
    console.error("Erro ao ler diretórios do Nginx:", error);
    return [];
  }
}

/**
 * 2. RECARREGAR CONFIGURAÇÃO DO NGINX
 */
export async function reloadNginxAction() {
  try {
    // Primeiro testa a sintaxe
    const test = await executeCommand('sudo', ['nginx', '-t']);
    if (test.exitCode !== 0) throw new Error("Erro de sintaxe no Nginx!");

    // Se estiver ok, recarrega
    await executeCommand('sudo', ['nginx', '-s', 'reload']);
    revalidatePath('/webserver');
    return { success: true };
  } catch (e: any) {
    throw new Error(e.message);
  }
}

/**
 * 3. BUSCAR CERTIFICADOS REAIS (CERTBOT)
 */
export async function fetchRealCertificatesAction() {
  try {
    // Tenta listar certificados via certbot
    const res = await executeCommand('sudo', ['certbot', 'certificates']);
    const output = res.stdout;

    // Parser simples para extrair domínios e datas de expiração
    // (Lógica de Regex aqui no futuro conforme necessidade)
    
    return []; // Retornar array processado
  } catch (error) {
    return [];
  }
}

/**
 * LER CONTEÚDO DE UM VHOST
 */
export async function fetchVhostContentAction(fileName: string) {
  try {
    const res = await executeCommand('sudo', ['cat', `/etc/nginx/sites-available/${fileName}`]);
    return res.stdout;
  } catch (error) {
    throw new Error("Não foi possível ler o arquivo de configuração.");
  }
}

/**
 * LER ÚLTIMAS LINHAS DE LOG
 */
export async function fetchLogContentAction(siteId: string) {
  try {
    // Tenta ler o log padrão do Nginx ou o específico do site se seguir o padrão
    const logPath = `/var/log/nginx/${siteId}.error.log`;
    const res = await executeCommand('sudo', ['tail', '-n', '50', logPath]);
    return res.stdout || "Nenhum log encontrado ou arquivo vazio.";
  } catch (error) {
    // Fallback para o log de erro geral do Nginx
    const fallback = await executeCommand('sudo', ['tail', '-n', '20', '/var/log/nginx/error.log']);
    return fallback.stdout;
  }
}
/**
 * CRIAR NOVO SITE (VHOST)
 */
export async function createNginxSiteAction(data: { domain: string, php: boolean, phpVersion?: string }) {
  try {
    const fileName = data.domain;
    const rootPath = `/var/www/${data.domain}`;
    
    // Template básico de Nginx
    const configContent = `
server {
    listen 80;
    server_name ${data.domain};
    root ${rootPath};
    index index.html index.htm ${data.php ? 'index.php' : ''};

    location / {
        try_files $uri $uri/ =404;
    }

    ${data.php ? `
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php${data.phpVersion}-fpm.sock;
    }` : ''}
}`;

    // 1. Cria o diretório raiz se não existir
    await executeCommand('sudo', ['mkdir', '-p', rootPath]);
    await executeCommand('sudo', ['chown', '-R', '$USER:$USER', rootPath]);

    // 2. Escreve o arquivo de configuração usando tee (para lidar com sudo)
    await executeCommand('sh', ['-c', `echo '${configContent}' | sudo tee ${NGINX_PATH}/sites-available/${fileName}`]);

    // 3. Cria o link simbólico para ativar o site
    await executeCommand('sudo', ['ln', '-sf', `${NGINX_PATH}/sites-available/${fileName}`, `${NGINX_PATH}/sites-enabled/`]);

    revalidatePath('/webserver');
    return { success: true };
  } catch (e: any) {
    throw new Error("Falha ao criar vhost: " + e.message);
  }
}