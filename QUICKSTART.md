# 🚀 Schnellstart-Anleitung

## Option 1: Komplettes Projekt auf Server hochladen

### Schritt 1: Dateien übertragen

```bash
# Von deinem lokalen Computer:
# Lade alle Dateien runter und übertrage sie per SCP auf deinen Server

scp -r asterisk-pbx-gui/ root@DEINE-SERVER-IP:/root/
```

### Schritt 2: Auf Server einloggen und deployen

```bash
ssh root@DEINE-SERVER-IP

cd /root/asterisk-pbx-gui

# Setup-Script ausführen
./deploy.sh
```

Das war's! 🎉

---

## Option 2: Git Clone (falls Git-Repo eingerichtet)

```bash
ssh root@DEINE-SERVER-IP

# Projekt klonen
git clone https://dein-repo-url.git /root/asterisk-pbx-gui
cd /root/asterisk-pbx-gui

# Deployen
./deploy.sh
```

---

## Nach dem Deployment

### 1. Prüfe ob alles läuft

```bash
docker compose ps
```

Alle 4 Container sollten "Up" status haben:
- pbx_postgres
- pbx_asterisk
- pbx_backend
- pbx_frontend

### 2. Öffne die GUI im Browser

```
http://DEINE-SERVER-IP:3000
```

### 3. Teste mit einem SIP-Client

**Empfohlene SIP-Clients:**
- **Windows/Mac**: [Zoiper](https://www.zoiper.com/)
- **Linux**: Linphone
- **Android**: Linphone
- **iOS**: Linphone

**Konfiguration:**
```
Username: 1000
Passwort: test1000
Domain: DEINE-SERVER-IP
Port: 5060
```

### 4. Teste Anrufe

Nach erfolgreicher Registrierung:
- Rufe `*43` an für Echo-Test
- Rufe `*44` an für Playback-Test
- Mit zweitem Client: Rufe `1001` an

---

## Troubleshooting

### Container startet nicht?

```bash
# Logs prüfen
docker compose logs -f backend
docker compose logs -f asterisk
```

### Frontend zeigt nichts?

```bash
# Backend-Status prüfen
curl http://localhost:8000/api/health

# Falls nicht erreichbar:
docker compose restart backend
```

### SIP-Registrierung schlägt fehl?

```bash
# Asterisk Console öffnen
docker exec -it pbx_asterisk asterisk -rvvv

# In der Console:
asterisk> sip show peers
```

---

## Wichtige Befehle

```bash
# Logs live verfolgen
docker compose logs -f

# Services neu starten
docker compose restart

# Services stoppen
docker compose down

# Services starten
docker compose up -d

# Asterisk CLI
docker exec -it pbx_asterisk asterisk -rvvv
```

---

## Hetzner Cloud Firewall

**WICHTIG:** Öffne diese Ports in der Hetzner Cloud Firewall:

| Port | Protokoll | Beschreibung |
|------|-----------|--------------|
| 5060 | UDP + TCP | SIP Signaling |
| 10000-10100 | UDP | RTP (Audio) |
| 8000 | TCP | Backend API |
| 3000 | TCP | Web Frontend |

**So geht's:**
1. Gehe zu Cloud Console → Firewalls
2. Wähle die Firewall für deinen Server
3. Füge Inbound-Regeln hinzu für die Ports oben
4. Weise die Firewall deinem Server zu

---

## Support & Weiterentwicklung

- **Roadmap**: Siehe `ROADMAP.md`
- **Vollständige Doku**: Siehe `README.md`
- **API Docs**: `http://DEINE-SERVER-IP:8000/docs`

Viel Erfolg! 🎊
