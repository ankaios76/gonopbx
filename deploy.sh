#!/bin/bash

#############################################
# Asterisk PBX GUI - Deployment auf CX33
# Für Upload auf deinen Hetzner Server
#############################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "============================================"
echo "  Asterisk PBX GUI - Deployment"
echo "============================================"
echo -e "${NC}\n"

# Installation auf Server
echo -e "${BLUE}📦 Installiere Projekt...${NC}\n"

# Gehe ins Projekt-Verzeichnis
cd "$(dirname "$0")"
PROJECT_DIR=$(pwd)

echo -e "${GREEN}✓${NC} Projekt-Verzeichnis: $PROJECT_DIR\n"

# Prüfe Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Docker nicht gefunden. Installiere Docker...\n"
    
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    echo -e "${GREEN}✓${NC} Docker installiert\n"
else
    echo -e "${GREEN}✓${NC} Docker bereits installiert\n"
fi

# Prüfe Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}✗${NC} Docker Compose nicht verfügbar!"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker Compose verfügbar\n"

# Stoppe alte Container (falls vorhanden)
echo -e "${BLUE}🛑 Stoppe alte Container...${NC}\n"
docker compose down 2>/dev/null || true

# Baue Images
echo -e "${BLUE}🔨 Baue Docker Images...${NC}\n"
docker compose build

echo -e "${GREEN}✓${NC} Images gebaut\n"

# Starte Services
echo -e "${BLUE}🚀 Starte Services...${NC}\n"
docker compose up -d

echo -e "${GREEN}✓${NC} Services gestartet\n"

# Warte auf Services
echo -e "${BLUE}⏳ Warte auf Service-Bereitschaft (15 Sekunden)...${NC}\n"
sleep 15

# Zeige Status
echo -e "${BLUE}📊 Service Status:${NC}\n"
docker compose ps

# Prüfe Gesundheit
echo -e "\n${BLUE}🏥 Health Check:${NC}\n"

MAX_RETRIES=10
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -f http://localhost:8000/api/health &> /dev/null; then
        echo -e "${GREEN}✓${NC} Backend API ist bereit!\n"
        break
    fi
    
    RETRY=$((RETRY+1))
    if [ $RETRY -eq $MAX_RETRIES ]; then
        echo -e "${YELLOW}⚠${NC}  Backend noch nicht bereit. Prüfe Logs mit: docker compose logs backend\n"
    else
        echo -e "${YELLOW}⏳${NC} Warte auf Backend... (Versuch $RETRY/$MAX_RETRIES)"
        sleep 2
    fi
done

# Konfiguriere UFW Firewall (falls vorhanden)
if command -v ufw &> /dev/null; then
    echo -e "${BLUE}🔥 Konfiguriere UFW Firewall...${NC}\n"
    
    sudo ufw status | grep -q "Status: active" && {
        sudo ufw allow 5060/udp comment "PBX - SIP" 2>/dev/null || true
        sudo ufw allow 5060/tcp comment "PBX - SIP TCP" 2>/dev/null || true
        sudo ufw allow 10000:10100/udp comment "PBX - RTP" 2>/dev/null || true
        sudo ufw allow 8000/tcp comment "PBX - Backend API" 2>/dev/null || true
        sudo ufw allow 3000/tcp comment "PBX - Frontend" 2>/dev/null || true
        
        echo -e "${GREEN}✓${NC} UFW-Regeln hinzugefügt\n"
    }
fi

# Hole Server-IP
SERVER_IP=$(hostname -I | awk '{print $1}')

# Abschluss
echo -e "${GREEN}"
echo "============================================"
echo "  ✓ Deployment erfolgreich!"
echo "============================================"
echo -e "${NC}\n"

echo -e "${GREEN}🌐 Zugriff auf die Anwendung:${NC}\n"
echo -e "  Frontend:  ${BLUE}http://$SERVER_IP:3000${NC}"
echo -e "  Backend:   ${BLUE}http://$SERVER_IP:8000${NC}"
echo -e "  API Docs:  ${BLUE}http://$SERVER_IP:8000/docs${NC}\n"

echo -e "${GREEN}📞 Test-Extensions:${NC}\n"
echo -e "  Extension: ${YELLOW}1000${NC} | Passwort: ${YELLOW}test1000${NC}"
echo -e "  Extension: ${YELLOW}1001${NC} | Passwort: ${YELLOW}test1001${NC}\n"

echo -e "${GREEN}🧪 Test-Rufnummern:${NC}\n"
echo -e "  ${YELLOW}*43${NC}  - Echo Test (wiederholt deine Stimme)"
echo -e "  ${YELLOW}*44${NC}  - Playback Test (spielt 'Hello World')\n"

echo -e "${GREEN}🐳 Docker Befehle:${NC}\n"
echo -e "  Logs:      ${BLUE}docker compose logs -f${NC}"
echo -e "  Stoppen:   ${BLUE}docker compose down${NC}"
echo -e "  Nestart:   ${BLUE}docker compose restart${NC}"
echo -e "  Asterisk:  ${BLUE}docker exec -it pbx_asterisk asterisk -rvvv${NC}\n"

echo -e "${YELLOW}⚠  Wichtig:${NC}"
echo -e "  Stelle sicher, dass in der ${BLUE}Hetzner Cloud Firewall${NC} folgende Ports"
echo -e "  für diesen Server geöffnet sind:\n"
echo -e "  • 5060/UDP + TCP (SIP)"
echo -e "  • 10000-10100/UDP (RTP)"
echo -e "  • 8000/TCP (Backend)"
echo -e "  • 3000/TCP (Frontend)\n"

echo -e "${GREEN}Viel Erfolg mit deinem PBX-System! 🚀${NC}\n"
