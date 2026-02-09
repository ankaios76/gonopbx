# Asterisk PBX GUI 
Eine moderne Web-GUI für Asterisk PBX, entwickelt mit FastAPI (Backend) und React (Frontend).

## 🚀 Quick Start

### Voraussetzungen

- Linux Server (Ubuntu 22.04+ empfohlen)
- Docker & Docker Compose
- Mindestens 2 GB RAM
- Offene Ports: 5060/UDP, 10000-10100/UDP, 8000/TCP, 3000/TCP

### Installation

1. **Dateien auf Server hochladen**

```bash
# Alle Projektdateien nach /root/asterisk-pbx-gui/ hochladen
cd /root/asterisk-pbx-gui/
```

2. **Setup-Script ausführen**

```bash
chmod +x setup.sh
./setup.sh
```

Das Script:
- Installiert Docker (falls nicht vorhanden)
- Baut alle Docker Images
- Startet die Services
- Konfiguriert die Firewall

3. **Zugriff auf die GUI**

Nach erfolgreichem Setup:
- **Frontend**: `http://DEINE-SERVER-IP:3000`
- **Backend API**: `http://DEINE-SERVER-IP:8000`
- **API Dokumentation**: `http://DEINE-SERVER-IP:8000/docs`

## 📋 Projekt-Struktur

```
asterisk-pbx-gui/
├── docker-compose.yml          # Orchestrierung aller Services
├── setup.sh                    # Automatisches Setup-Script
├── ROADMAP.md                  # Projekt-Roadmap
│
├── asterisk/
│   └── config/                 # Asterisk Konfigurationsdateien
│       ├── manager.conf        # AMI Konfiguration
│       ├── sip.conf           # SIP Peers
│       └── extensions.conf    # Dialplan
│
├── backend/
│   ├── main.py                # FastAPI Hauptanwendung
│   ├── ami_client.py          # Asterisk AMI Client
│   ├── database.py            # SQLAlchemy Models
│   ├── requirements.txt       # Python Dependencies
│   ├── Dockerfile
│   └── routers/
│       ├── peers.py           # SIP Peers API
│       ├── dashboard.py       # Dashboard API
│       └── cdr.py             # Call Records API
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Haupt-React-Komponente
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts  # WebSocket Hook
│   │   └── services/
│   │       └── api.ts        # API Service
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
│
└── database/
    └── init.sql              # Datenbank-Schema
```

## 🔧 Services

### 1. PostgreSQL
- **Container**: `pbx_postgres`
- **Port**: 5432
- **Datenbank**: `asterisk_gui`
- **User**: `asterisk` / `asterisk_secure_2026`

### 2. Asterisk PBX
- **Container**: `pbx_asterisk`
- **SIP Port**: 5060 (UDP/TCP)
- **RTP Ports**: 10000-10100 (UDP)
- **AMI Port**: 5038
- **AMI User**: `admin` / `admin_secret`

### 3. Backend (FastAPI)
- **Container**: `pbx_backend`
- **Port**: 8000
- **Features**:
  - REST API
  - WebSocket für Live-Updates
  - AMI Integration
  - PostgreSQL Connection

### 4. Frontend (React)
- **Container**: `pbx_frontend`
- **Port**: 3000
- **Features**:
  - Dashboard mit Live-Daten
  - WebSocket-Integration
  - Responsive Design

## 📞 Test-Extensions

Das System kommt mit zwei vorkonfigurierten Test-Extensions:

| Extension | Passwort | Beschreibung |
|-----------|----------|--------------|
| 1000 | test1000 | Test User 1 |
| 1001 | test1001 | Test User 2 |

### Spezielle Extensions

- **\*43**: Echo Test (spricht zurück, was du sagst)
- **\*44**: Playback Test (spielt "Hello World" ab)
- **\*97**: Voicemail Zugriff

## 🛠️ Docker Befehle

### Services verwalten

```bash
# Alle Services starten
docker compose up -d

# Services stoppen
docker compose down

# Services neu starten
docker compose restart

# Logs anzeigen (alle Services)
docker compose logs -f

# Logs einzelner Service
docker compose logs -f backend
docker compose logs -f asterisk
```

### Asterisk CLI

```bash
# Asterisk Console öffnen
docker exec -it pbx_asterisk asterisk -rvvv

# Wichtige Asterisk-Befehle:
asterisk> sip show peers        # Zeige SIP Peers
asterisk> core show channels    # Zeige aktive Kanäle
asterisk> dialplan show         # Zeige Dialplan
asterisk> core reload           # Config neu laden
```

### Datenbank Zugriff

```bash
# PostgreSQL Console
docker exec -it pbx_postgres psql -U asterisk -d asterisk_gui

# Beispiel-Queries:
SELECT * FROM sip_peers;
SELECT * FROM cdr ORDER BY call_date DESC LIMIT 10;
```

## 🔐 Sicherheit

### Ändern der Default-Passwörter

**Asterisk AMI** (`asterisk/config/manager.conf`):
```ini
[admin]
secret = DEIN_NEUES_SICHERES_PASSWORT
```

**Datenbank** (`docker-compose.yml`):
```yaml
POSTGRES_PASSWORD: DEIN_NEUES_DB_PASSWORT
```

**Test SIP Extensions** (`asterisk/config/sip.conf`):
```ini
[1000](peer-template)
secret=NEUES_SICHERES_PASSWORT
```

Nach Änderungen:
```bash
docker compose down
docker compose up -d
```

## 🌐 Hetzner Cloud Firewall

Stelle sicher, dass folgende Ports in der Hetzner Cloud Firewall geöffnet sind:

| Port | Protokoll | Zweck |
|------|-----------|-------|
| 22 | TCP | SSH |
| 5060 | UDP/TCP | SIP Signaling |
| 10000-10100 | UDP | RTP Media (Audio) |
| 8000 | TCP | Backend API |
| 3000 | TCP | Frontend GUI |

## 📊 API Endpoints

### Health Check
```bash
curl http://localhost:8000/api/health
```

### Dashboard Status
```bash
curl http://localhost:8000/api/dashboard/status
```

### SIP Peers auflisten
```bash
curl http://localhost:8000/api/peers/
```

### Neuen SIP Peer anlegen
```bash
curl -X POST http://localhost:8000/api/peers/ \
  -H "Content-Type: application/json" \
  -d '{
    "extension": "1002",
    "secret": "test1002",
    "caller_id": "Test User 1002"
  }'
```

### API Dokumentation
Vollständige API-Docs unter: `http://DEINE-SERVER-IP:8000/docs`

## 🐛 Troubleshooting

### Services starten nicht

```bash
# Status prüfen
docker compose ps

# Logs aller Services
docker compose logs

# Einzelne Services neu starten
docker compose restart backend
docker compose restart asterisk
```

### Asterisk verbindet nicht

```bash
# Asterisk Logs
docker compose logs asterisk

# AMI Verbindung testen
docker exec -it pbx_asterisk asterisk -rx "manager show connected"

# Config-Syntax prüfen
docker exec -it pbx_asterisk asterisk -rx "dialplan reload"
```

### Frontend zeigt keine Daten

```bash
# Backend Logs prüfen
docker compose logs backend

# WebSocket-Verbindung im Browser Console prüfen
# Öffne Browser DevTools → Console
```

### Datenbank-Probleme

```bash
# Datenbank neu initialisieren
docker compose down -v  # ACHTUNG: Löscht alle Daten!
docker compose up -d
```

## 🎯 Nächste Schritte (nach PoC)

- [ ] Echte AMI-Events vom Asterisk empfangen
- [ ] SIP-Peers über GUI bearbeiten funktional machen
- [ ] Dialplan-Editor implementieren
- [ ] Authentication & Authorization
- [ ] Voicemail-Player
- [ ] Call Recording
- [ ] Queue-Management

Siehe `ROADMAP.md` für vollständigen Projektplan.

## 📝 Lizenz

Dieses Projekt ist für den privaten und Entwicklungs-Einsatz gedacht.

## 🤝 Support

Bei Fragen oder Problemen:
1. Prüfe die Logs: `docker compose logs -f`
2. Checke die API Docs: `http://localhost:8000/docs`
3. Siehe Troubleshooting-Sektion oben

---

**Version**: 0.1.0 (Proof of Concept)
**Erstellt**: Februar 2026
