#!/bin/bash

#############################################
# Asterisk PBX GUI - Automated Setup Script
# Version: 1.0 - PoC
#############################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then 
        print_warning "Bitte führe dieses Script NICHT als root aus"
        exit 1
    fi
}

# Check Docker installation
check_docker() {
    print_info "Prüfe Docker Installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker ist nicht installiert"
        print_info "Installiere Docker..."
        
        # Install Docker
        sudo apt-get update
        sudo apt-get install -y ca-certificates curl gnupg
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
          sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        # Add user to docker group
        sudo usermod -aG docker $USER
        print_warning "Du wurdest zur Docker-Gruppe hinzugefügt. Bitte logge dich aus und wieder ein, oder führe 'newgrp docker' aus."
    fi
    
    print_success "Docker ist installiert"
}

# Check Docker Compose
check_docker_compose() {
    print_info "Prüfe Docker Compose..."
    
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose ist nicht verfügbar"
        exit 1
    fi
    
    print_success "Docker Compose ist verfügbar"
}

# Configure Firewall
configure_firewall() {
    print_info "Konfiguriere Firewall-Regeln..."
    
    if command -v ufw &> /dev/null; then
        print_info "UFW gefunden, konfiguriere Ports..."
        
        # Allow SSH (keep existing)
        sudo ufw status | grep -q "22/tcp" || sudo ufw allow 22/tcp comment "SSH"
        
        # SIP
        sudo ufw allow 5060/udp comment "SIP"
        sudo ufw allow 5060/tcp comment "SIP TCP"
        
        # RTP
        sudo ufw allow 10000:10100/udp comment "RTP Media"
        
        # Web Interface
        sudo ufw allow 8000/tcp comment "PBX Backend API"
        sudo ufw allow 3000/tcp comment "PBX Frontend"
        
        print_success "Firewall-Regeln konfiguriert"
    else
        print_warning "UFW nicht gefunden, bitte Firewall manuell konfigurieren"
    fi
}

# Main setup
main() {
    print_header "Asterisk PBX GUI - Setup"
    
    check_root
    check_docker
    check_docker_compose
    
    print_header "Projekt-Verzeichnis"
    
    PROJECT_DIR="$HOME/asterisk-pbx-gui"
    
    if [ -d "$PROJECT_DIR" ]; then
        print_warning "Projekt-Verzeichnis existiert bereits: $PROJECT_DIR"
        read -p "Möchtest du es überschreiben? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Setup abgebrochen"
            exit 0
        fi
        rm -rf "$PROJECT_DIR"
    fi
    
    print_info "Erstelle Projekt-Verzeichnis: $PROJECT_DIR"
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    print_success "Projekt-Verzeichnis erstellt"
    
    print_header "Docker Images bauen"
    
    print_info "Starte Docker Compose Build..."
    docker compose build
    
    print_success "Docker Images gebaut"
    
    print_header "Starte Services"
    
    print_info "Starte alle Container..."
    docker compose up -d
    
    print_success "Services gestartet"
    
    print_header "Warte auf Service-Bereitschaft"
    
    print_info "Warte 10 Sekunden auf Initialisierung..."
    sleep 10
    
    # Check services
    print_info "Prüfe Service-Status..."
    docker compose ps
    
    print_header "Firewall konfigurieren"
    configure_firewall
    
    print_header "✓ Setup abgeschlossen!"
    
    echo ""
    print_success "Asterisk PBX GUI ist bereit!"
    echo ""
    echo -e "${GREEN}Zugriff auf die GUI:${NC}"
    echo -e "  Frontend: ${BLUE}http://$(hostname -I | awk '{print $1}'):3000${NC}"
    echo -e "  Backend API: ${BLUE}http://$(hostname -I | awk '{print $1}'):8000${NC}"
    echo -e "  API Docs: ${BLUE}http://$(hostname -I | awk '{print $1}'):8000/docs${NC}"
    echo ""
    echo -e "${GREEN}Asterisk Credentials:${NC}"
    echo -e "  Test Extensions: ${YELLOW}1000 / test1000${NC} und ${YELLOW}1001 / test1001${NC}"
    echo -e "  Echo Test: ${YELLOW}*43${NC}"
    echo -e "  Playback Test: ${YELLOW}*44${NC}"
    echo ""
    echo -e "${GREEN}Docker Befehle:${NC}"
    echo -e "  Logs anzeigen: ${BLUE}docker compose logs -f${NC}"
    echo -e "  Services stoppen: ${BLUE}docker compose down${NC}"
    echo -e "  Services neu starten: ${BLUE}docker compose restart${NC}"
    echo -e "  Asterisk CLI: ${BLUE}docker exec -it pbx_asterisk asterisk -rvvv${NC}"
    echo ""
    echo -e "${YELLOW}Hinweis:${NC} Stelle sicher, dass die Ports in der Hetzner Cloud Firewall geöffnet sind:"
    echo -e "  - 5060/UDP (SIP)"
    echo -e "  - 10000-10100/UDP (RTP)"
    echo -e "  - 8000/TCP (Backend)"
    echo -e "  - 3000/TCP (Frontend)"
    echo ""
}

# Run main
main
