# HomeLab Manager

![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A5%206-blue)
![Next.js](https://img.shields.io/badge/Next.js-16.2.0-black)
![React](https://img.shields.io/badge/React-19.2.4-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6)

## Descrição

HomeLab Manager é uma aplicação web de gerenciamento de infraestrutura local, projetada para ambientes Linux. O sistema reúne monitoramento e controle de containers Docker, máquinas virtuais KVM, firewall UFW, proxy reverso Nginx, storage ZFS/Samba, rede e configurações de sistema em um painel centralizado.

## Stack Tecnológica

- Linguagem: `TypeScript`
- Frontend: `Next.js 16.2.0`
- UI: `React 19.2.4`, `Tailwind CSS`, `Radix UI` (via componentes shadcn/ui)
- Gerenciamento de pacotes: `pnpm`
- Autenticação/formulários: `react-hook-form`, `zod`, `bcryptjs`, `jose`, `swr`
- Backend: `Node.js`, rotas API do Next.js
- Shell automation: `lib/shell-executor.ts` com `child_process`
- Infraestrutura Linux: `Docker`, `Nginx`, `UFW`, `Libvirt/KVM`, `Samba`, `Netplan`, `Certbot`, `ZFS`

## Funcionalidades (Features)

- 📊 Painel de monitoramento de hardware, containers Docker, VMs KVM e serviços de sistema
- 🔥 Gerenciamento completo de firewall UFW com criação, remoção e ativação/desativação de regras
- 🌐 Configuração de proxy reverso Nginx com suporte a SSL via `certbot`
- 🌍 Administração de rede com leitura de interfaces, DNS e netplan
- 💾 Controle de storage com detecção de discos, pools ZFS e criação de compartilhamentos Samba
- 📁 Upload de ISOs para `/var/lib/libvirt/images` via API de upload
- 👤 Gestão de usuários, configurações gerais e notifications internas
- 🛠️ Instalador automático que cria serviço systemd, sudoers e ambiente de produção

## Permissões de Sistema

### Requisitos de permissão

- O instalador `installer/install.sh` precisa ser executado como `root` ou via `sudo`.
- O sistema deve permitir a execução de comandos administrativos e acesso a arquivos de sistema.
- O projeto espera rodar em Linux, preferencialmente distribuições baseadas em Debian/Ubuntu.

### Comandos administrativos usados

O código invoca `sudo` para comandos como:

- `docker`, `docker-compose`
- `virsh`, `virt-install`, `qemu-img`
- `nginx`, `certbot`, `systemctl`
- `ufw`, `netplan`, `resolvectl`, `hostnamectl`
- `zpool`, `zfs`, `lsblk`, `smartctl`
- `chown`, `chmod`, `mkdir`, `cp`, `cat`, `bash`

### Diretórios e arquivos críticos

- `/opt/homelab` — diretório principal da aplicação
- `/opt/homelab/data` — armazenamento de dados persistentes (`users.json`, `settings.json`, `notifications.json`)
- `/var/lib/libvirt/images` — destino de upload de ISOs
- `/etc/netplan` — configurações de rede gerenciadas pelo app
- `/etc/nginx/sites-available` e `/etc/nginx/sites-enabled` — configurações de proxy
- `/etc/hosts` — entradas de domínio automático adicionadas pelo app
- `/etc/samba/smb.conf` — compartilhamentos Samba configurados pelo app

### Portas de rede necessárias

- `3000` — porta padrão do HomeLab Manager
- `80` / `443` — Nginx para proxy reverso e certificados
- `6080` — NoVNC / proxy WebSocket para acesso VNC
- `22` — SSH (liberado pelo instalador)
- portas Samba/SMB (usadas para compartilhamentos de rede)

## Instalação e Configuração

> O projeto foi desenvolvido para execução nativa em Linux. O instalador automatiza a maior parte das dependências e configuração de serviços.

### 1. Preparar o diretório do projeto

```bash
sudo mkdir -p /opt/homelab
sudo chown $USER:$USER /opt/homelab
cd /opt/homelab
# copie ou clone o repositório para este diretório
```

### 2. Executar o instalador principal

```bash
sudo bash installer/install.sh
```

### 3. O que o instalador configura

- Instala dependências base do sistema (`curl`, `wget`, `git`, `build-essential`, `software-properties-common`, `net-tools`, `ufw`, `nginx`, `qemu-kvm`, `libvirt`, `virtinst`, `novnc`, `mailutils`)
- Prepara ambiente web e diretórios
- Configura rede bridge com `netplan`
- Instala Docker Engine e habilita o serviço
- Configura VNC proxy via `websockify`
- Instala Node.js 20 e `pnpm`
- Executa `pnpm install` e `pnpm build`
- Gera arquivo `.env` com `NODE_ENV=production`, `PORT=3000` e `JWT_SECRET`
- Cria o serviço `homelab.service` no systemd
- Cria arquivo sudoers em `/etc/sudoers.d/homelab`
- Libera portas no UFW

### 4. Observações de configuração

- O instalador assume o uso de `/opt/homelab` como raiz do projeto.
- O systemd service do app roda como usuário `homelab`.
- Caso use o modo de desenvolvimento, é comum abrir um novo terminal para atualizar a associação de grupos do usuário.

## Como Rodar

### Rodando em produção

```bash
sudo systemctl enable --now homelab
sudo systemctl status homelab
```

### Atualizar/buildar e reiniciar serviço

```bash
cd /opt/homelab
pnpm build
sudo cp -r public .next/standalone/
sudo cp -r .next/static .next/standalone/.next/
sudo systemctl restart homelab
```

### Rodando em desenvolvimento

```bash
cd /opt/homelab
pnpm install
pnpm dev
```

Acesse a aplicação em:

```text
http://localhost:3000
```

### Scripts disponíveis

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Observações Adicionais

- Não há `Dockerfile` presente no repositório atual.
- O script `atualizar.sh` contém um fluxo de build e reinicialização do serviço.
- O upload de imagens ISO é tratado por `app/api/vms/upload/route.ts` e grava diretamente em `/var/lib/libvirt/images`.
- As configurações do painel são salvas em JSON no diretório `/opt/homelab/data`.
- O serviço criado pelo instalador é `homelab.service` e depende de `docker.service` e `libvirtd.service`.
