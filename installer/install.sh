#!/bin/bash
#
# HomeLab Manager - Full Stack Installer (UFW + Nginx + Docker + KVM + Samba)
# Versão: 3.2 (Março 2026) - Atualizado com Sudoers em Grupo, ZFS e Firewall do Samba
#

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' 

# Variaveis de Configuração
HOMELAB_USER="homelab"
HOMELAB_DIR="/opt/homelab"
HOMELAB_PORT=3000
NODE_VERSION="20"
VNC_TOKEN_DIR="/etc/novnc/tokens"
LOG_FILE="/var/log/homelab-install.log"

# Funcoes de Log
log() { echo -e "${GREEN}[INFO]${NC} $1" && echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1" >> "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1" && echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" >> "$LOG_FILE"; }
error() { echo -e "${RED}[ERROR]${NC} $1" && echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"; exit 1; }

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║          HomeLab Manager - Full Stack Installer v3.2          ║"
    echo "║     Firewall | WebServer | Docker | KVM | Next.js Engine      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_env() {
    [[ $EUID -ne 0 ]] && error "Este script deve ser executado como root (sudo)"
    log "Verificando compatibilidade do sistema em Campo Grande/MS..."
}

install_dependencies() {
    log "Instalando dependências (Firewall, Web Server, Virtualização)..."
    apt-get update -qq
    apt-get install -y -qq curl wget git build-essential software-properties-common \
        apt-transport-https ca-certificates gnupg lsb-release net-tools \
        ufw nginx qemu-kvm libvirt-daemon-system libvirt-clients \
        bridge-utils virtinst novnc websockify iptables-persistent mailutils
}

setup_webserver_env() {
    log "Configurando estrutura para o Web Server (Nginx)..."
    mkdir -p /var/www
    chown -R $USER:$USER /var/www
    chmod -R 755 /var/www
}

setup_bridge_network() {
    log "Configurando Bridge br0 para acesso externo..."
    PHYSICAL_IFACE=$(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)' | head -1)
    
    if [ -z "$PHYSICAL_IFACE" ]; then
        warn "Interface física não detectada. Pulando Bridge."
        return
    fi

    cat > /etc/netplan/01-netcfg.yaml << EOF
network:
  version: 2
  renderer: networkd
  ethernets:
    $PHYSICAL_IFACE:
      dhcp4: no
  bridges:
    br0:
      interfaces: [$PHYSICAL_IFACE]
      dhcp4: yes
      parameters:
        stp: false
        forward-delay: 0
EOF
    chmod 600 /etc/netplan/01-netcfg.yaml
    systemctl enable --now systemd-networkd
    log "Aplicando rede Bridge..."
    netplan apply || warn "Falha ao aplicar netplan."
}

install_docker() {
    log "Configurando Docker Engine..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    
    local ARCH=$(dpkg --print-architecture)
    local CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
    
    echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
}

setup_vnc_proxy() {
    log "Configurando Infraestrutura VNC Console..."
    sed -i 's/#vnc_listen = "0.0.0.0"/vnc_listen = "0.0.0.0"/' /etc/libvirt/qemu.conf
    mkdir -p "$VNC_TOKEN_DIR"
    mkdir -p /var/lib/libvirt/images
    chmod -R 777 "$VNC_TOKEN_DIR"
    chmod -R 777 /var/lib/libvirt/images
    touch "$VNC_TOKEN_DIR/vms.token"

    cat > /etc/systemd/system/vnc-proxy.service << EOF
[Unit]
Description=Websockify VNC Proxy for HomeLab
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/websockify --web /usr/share/novnc/ 6080 --target-config=$VNC_TOKEN_DIR/vms.token
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now vnc-proxy
    systemctl restart libvirtd
}

install_nodejs_and_app() {
    log "Instalando Node.js $NODE_VERSION e Preparando App..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
    npm install -g pnpm

    mkdir -p "$HOMELAB_DIR/data"
    
    cd "$HOMELAB_DIR"
    # Assume que os arquivos já foram movidos ou clonados aqui
    pnpm install
    pnpm build
    cp -r public .next/standalone/
    cp -r .next/static .next/standalone/.next/

    cat > "$HOMELAB_DIR/.env" << EOF
NODE_ENV=production
PORT=$HOMELAB_PORT
JWT_SECRET=$(openssl rand -base64 32)
EOF

    chown -R $HOMELAB_USER:$HOMELAB_USER "$HOMELAB_DIR"
    chmod -R 775 "$HOMELAB_DIR/data"
}

create_services() {
    log "Criando serviços e Sudoers (Liberando UFW, Nginx, SH, ZFS)..."
    
    # Sudoers: Usando '%' para aplicar ao GRUPO homelab inteiro, e incluindo zfs/zpool
    cat > /etc/sudoers.d/homelab << EOF
%${HOMELAB_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, /usr/bin/virsh, /usr/sbin/nginx, /usr/bin/systemctl, /usr/sbin/lsblk, /usr/bin/node, /usr/bin/virt-install, /usr/bin/netplan, /usr/sbin/ufw, /usr/bin/sh, /usr/bin/cat, /usr/bin/hostnamectl, /usr/bin/df, /usr/sbin/zfs, /usr/sbin/zpool
EOF
    chmod 440 /etc/sudoers.d/homelab

    # Firewall inicial
    ufw allow 22/tcp
    ufw allow $HOMELAB_PORT/tcp
    ufw allow samba # Libera acesso do Windows ao Samba (WSL/Físico)

    # App Service
    cat > /etc/systemd/system/homelab.service << EOF
[Unit]
Description=HomeLab Manager
After=network.target docker.service libvirtd.service vnc-proxy.service

[Service]
Type=simple
User=$HOMELAB_USER
Group=$HOMELAB_USER
WorkingDirectory=$HOMELAB_DIR
ExecStart=/usr/bin/node $HOMELAB_DIR/.next/standalone/server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=$HOMELAB_PORT

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now homelab
}

main() {
    print_banner
    check_env
    
    # Garante que o usuário do serviço existe
    if ! id "$HOMELAB_USER" &>/dev/null; then useradd -r -m -s /bin/bash "$HOMELAB_USER"; fi
    
    install_dependencies
    setup_webserver_env
    setup_bridge_network
    install_docker
    setup_vnc_proxy
    
    # Adiciona o usuário do serviço aos grupos de virtualização
    usermod -aG docker,libvirt $HOMELAB_USER
    
    # SEGREDO DO DESENVOLVEDOR: Se o script foi rodado com "sudo ./install.sh", 
    # o $SUDO_USER é o seu usuário logado (ex: marcelo, vitor, ubuntu). 
    # Isso coloca você no grupo homelab e resolve todos os problemas de senha no 'npm run dev'
    if [ -n "$SUDO_USER" ]; then
        log "Adicionando o usuário de desenvolvimento ($SUDO_USER) aos grupos essenciais..."
        usermod -aG $HOMELAB_USER,docker,libvirt "$SUDO_USER"
    fi
    
    install_nodejs_and_app
    create_services

    local IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo -e "${GREEN}✅ INSTALAÇÃO v3.2 CONCLUÍDA!${NC}"
    echo -e "${BLUE}Dashboard: http://$IP:$HOMELAB_PORT${NC}"
    echo -e "${GREEN}Caminho de Dados: $HOMELAB_DIR/data${NC}"
    echo -e "${GREEN}Nota: Se você for rodar o ambiente de desenvolvimento local (npm run dev),${NC}"
    echo -e "${GREEN}      feche este terminal e abra um novo para atualizar suas permissões de grupo.${NC}"
    echo -e "${GREEN}=================================================${NC}"
}

main "$@"