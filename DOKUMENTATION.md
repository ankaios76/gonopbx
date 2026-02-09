# GonoPBX - Technische Dokumentation

**Version:** 1.0.0
**Stand:** 08.02.2026
**Autor:** Norbert Hengsteler

---

## Inhaltsverzeichnis

1. [Projektbeschreibung](#projektbeschreibung)
2. [Architektur](#architektur)
3. [Systemvoraussetzungen](#systemvoraussetzungen)
4. [Installation und Deployment](#installation-und-deployment)
5. [Funktionsumfang](#funktionsumfang)
6. [Backend-Architektur](#backend-architektur)
7. [Frontend-Architektur](#frontend-architektur)
8. [Datenbank-Schema](#datenbank-schema)
9. [API-Referenz](#api-referenz)
10. [Asterisk-Integration](#asterisk-integration)
11. [Authentifizierung und Sicherheit](#authentifizierung-und-sicherheit)
12. [Konfigurationsgenerierung](#konfigurationsgenerierung)
13. [Dateistruktur](#dateistruktur)
14. [Release-Prozess](#release-prozess)
15. [Changelog](#changelog)

---

## Projektbeschreibung

GonoPBX ist eine webbasierte Verwaltungsoberfläche für Asterisk PBX. Die Anwendung ermöglicht die vollständige Konfiguration und Echtzeit-Überwachung einer Asterisk-Telefonanlage über eine moderne Browser-Oberfläche. Alle Konfigurationsänderungen (PJSIP, Dialplan) werden automatisch generiert und in Asterisk geladen - ein manuelles Editieren von Konfigurationsdateien ist nicht erforderlich.

### Kernfunktionen

- Echtzeit-Dashboard mit Systemstatus, Leitungen, Nebenstellen und letzten Anrufen
- Verwaltung von SIP-Nebenstellen (PJSIP-Peers) und SIP-Leitungen (Trunks)
- DID-Routing: Zuweisung externer Rufnummern zu internen Nebenstellen
- Ausgehende Telefonie über zugeordnete DIDs mit automatischem Trunk-Routing
- Rufumleitungen (CFU/CFB/CFNA) pro Nebenstelle
- Anrufverlauf (CDR) mit Statistiken und Filterung
- Voicemail-Verwaltung mit Browser-Wiedergabe
- JWT-basierte Benutzerverwaltung mit Rollenkonzept

---

## Architektur

### Systemübersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Network (pbx_network)             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Frontend     │  │  Backend     │  │  Asterisk            │  │
│  │  (Nginx)      │──│  (FastAPI)   │──│  (PJSIP)             │  │
│  │  Port 3000    │  │  Port 8000   │  │  Port 5060 (SIP)     │  │
│  │               │  │              │  │  Port 5038 (AMI)     │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘  │
│                           │                                     │
│                    ┌──────┴───────┐                             │
│                    │  PostgreSQL  │                             │
│                    │  Port 5432   │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

### Komponenten

| Komponente | Technologie | Container | Port |
|---|---|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons | `pbx_frontend` | 3000 (HTTP) |
| Backend | Python 3, FastAPI, SQLAlchemy, Panoramisk (AMI) | `pbx_backend` | 8000 (HTTP) |
| Datenbank | PostgreSQL 15 (Alpine) | `pbx_postgres` | 5432 |
| Telefonanlage | Asterisk 18 (PJSIP) | `pbx_asterisk` | 5060 (SIP), 5038 (AMI) |

### Kommunikation

- **Frontend → Backend:** REST API über HTTP (Port 8000), WebSocket für Echtzeit-Events
- **Backend → Asterisk:** AMI (Asterisk Manager Interface) über Port 5038 via Panoramisk-Bibliothek
- **Backend → PostgreSQL:** SQLAlchemy ORM über TCP (Port 5432)
- **Backend → Asterisk Config:** Schreibt generierte Konfigurationsdateien auf ein gemeinsames Docker-Volume (`/etc/asterisk/custom/`)
- **Backend → Asterisk Reload:** Führt `docker exec` Befehle aus, um Asterisk-Konfiguration neu zu laden

---

## Systemvoraussetzungen

- **Betriebssystem:** Linux (Ubuntu 22.04+ empfohlen)
- **Docker:** Docker Engine 24+ und Docker Compose v2+
- **Ports:** 3000 (Web), 8000 (API), 5060/udp+tcp (SIP), 5432 (DB), 5038 (AMI), 10000-10100/udp (RTP)
- **RAM:** mindestens 2 GB
- **Festplatte:** mindestens 5 GB (+ Platz für Voicemails und CDR)

---

## Installation und Deployment

### Erstinstallation

```bash
cd /root/asterisk-pbx-gui
docker compose up -d
```

Alle vier Container werden gestartet. Das Backend erstellt die Datenbanktabellen automatisch und legt einen Admin-Benutzer an.

### Erster Login

- **URL:** `http://<server-ip>:3000`
- **Benutzer:** `admin`
- **Passwort:** `GonoPBX2026!`

### Frontend neu bauen (nach Code-Änderungen)

```bash
docker compose build frontend && docker compose up -d frontend
```

### Backend neustarten (nach Code-Änderungen)

Das Backend ist per Volume (`./backend:/app`) gemountet. Code-Änderungen werden durch einen Neustart aktiv:

```bash
docker restart pbx_backend
```

### Alle Container neustarten

```bash
docker compose down && docker compose up -d
```

### Logs anzeigen

```bash
docker logs -f pbx_backend     # Backend-Logs
docker logs -f pbx_asterisk    # Asterisk-Logs
docker logs -f pbx_frontend    # Nginx-Logs
```

---

## Funktionsumfang

### Dashboard

Das Dashboard ist die Hauptseite und zeigt den aktuellen Systemzustand in Echtzeit (Auto-Refresh alle 10 Sekunden).

**Status-Cards (oberer Bereich):**
- **Asterisk:** Online/Offline-Status der AMI-Verbindung
- **Endpoints Online:** Anzahl der registrierten Endpoints vs. Gesamtzahl
- **System:** Gesamtgesundheit (Healthy/Warning/Degraded/Critical) mit Problemliste

**Leitungen:**
- Alle konfigurierten SIP-Trunks als Kacheln
- Provider-Logo (SVG) und Provider-Name als Haupttext
- Trunk-Name als Untertitel
- Grün hinterlegt wenn online, grau wenn offline
- Provider-Logos werden aus `/logos/` geladen (aktuell: Plusnet)

**Nebenstellen:**
- Alle registrierten PJSIP-Endpoints als klickbare Kacheln
- Online/Offline-Status mit farbiger Hervorhebung
- Zugeordnete DIDs mit Icons: Eingehend (grüner Pfeil), Ausgehend (blauer Pfeil, nur erste DID)
- Klick navigiert zur Extension-Detail-Seite

**Letzte 5 Anrufe:**
- Anrufrichtung mit farbigen Icons und Badges:
  - Eingehend: Grüner Pfeil + grünes Badge
  - Ausgehend: Blauer Pfeil + blaues Badge
  - Intern: Graues Repeat-Icon + graues Badge
- Quelle und Ziel mit aufgelösten Nebenstellen-Namen
- Disposition (Angenommen/Verpasst/Besetzt) als farbiges Badge
- Zeitstempel und Gesprächsdauer
- Button "Alle Anrufe" navigiert zur CDR-Seite

**Richtungserkennung:** Basiert auf den CDR-Feldern `channel` und `dstchannel`:
- `PJSIP/1XXX-*` → Peer (interne Nebenstelle)
- `PJSIP/trunk-*` → Trunk (externe Leitung)
- Peer → Trunk = Ausgehend, Trunk → Peer = Eingehend, Peer → Peer = Intern

### Nebenstellen-Verwaltung (Extensions)

#### SIP-Peers

Interne Nebenstellen, die über PJSIP in Asterisk registriert werden.

- **Anlegen:** Extension-Nummer (z.B. 1001), SIP-Passwort, Caller-ID, Context (Standard: `internal`), Aktivierung
- **Bearbeiten:** Alle Felder änderbar
- **Löschen:** Entfernt Peer und regeneriert PJSIP-Konfiguration
- **Automatische Konfiguration:** Bei jeder Änderung wird `pjsip.conf` neu generiert und in Asterisk geladen (`pjsip reload`)

#### SIP-Trunks

Externe SIP-Leitungen zu Providern für ein- und ausgehende Telefonie.

- **Provider-Auswahl:**
  - `plusnet_basic` → Plusnet IPfonie Basic/Extended (SIP-Server: `sip.ipfonie.de`)
  - `plusnet_connect` → Plusnet IPfonie Extended Connect (SIP-Server: `sipconnect.ipfonie.de`)
- **Authentifizierungsmodi:**
  - **Registrierung:** Username/Passwort-basiert mit SIP-REGISTER
  - **Fix-IP:** IP-basierte Authentifizierung ohne Registrierung
- **Rufnummernblock:** Definiert die verfügbaren DID-Nummern des Trunks (z.B. `042198961300-042198961399`)
- **Codecs:** Konfigurierbar (Standard: `ulaw,alaw,g722`)
- **Automatische Konfiguration:** Generiert PJSIP-Sections (endpoint, auth, aor, registration, identify)
- **Provider-Logos:** SVG-Logos im Dashboard (erweiterbar für neue Provider)

### Nebenstellen-Detail (Extension Detail)

Detailseite für eine einzelne Nebenstelle, erreichbar durch Klick auf eine Nebenstelle im Dashboard.

#### Rufnummern-Zuordnung (DID)

- **Zuweisen:** Externe Rufnummer (DID) einer Nebenstelle zuordnen
- **Trunk-Auswahl:** Dropdown zeigt verfügbare Trunks
- **Verfügbare Nummern:** Zeigt den Rufnummernblock des gewählten Trunks
- **Bereits vergebene DIDs:** Zeigt welche Nummern des Trunks schon zugeordnet sind (mit Ziel-Nebenstelle)
- **Eingehend:** Anrufe auf die DID werden zur Nebenstelle geroutet (via `[from-trunk]` Context)
- **Ausgehend:** Die erste zugeordnete DID wird als Caller-ID für externe Anrufe verwendet
- **Anzeige:** Blaue Info-Box zeigt die aktive ausgehende Rufnummer mit Trunk-Information
- **Badges:** "Eingehend" (grün) bei allen DIDs, "Ausgehend" (blau) nur bei der ersten DID

#### Rufumleitungen (Call Forwarding)

Pro Nebenstelle können drei Umleitungstypen konfiguriert werden:

| Typ | Beschreibung | Dialplan-Verhalten |
|---|---|---|
| **CFU** (Unconditional/Sofort) | Alle Anrufe werden direkt umgeleitet | Extension wird gar nicht angerufen |
| **CFB** (Busy/Besetzt) | Umleitung nur wenn Nebenstelle besetzt | Greift nach `DIALSTATUS=BUSY` |
| **CFNA** (No Answer/Nichtmelden) | Umleitung nach konfigurierbarer Klingelzeit | Greift nach Timeout |

- Jede Umleitung einzeln aktivierbar/deaktivierbar
- Konfigurierbare Klingelzeit bei CFNA (Standard: 20 Sekunden)
- Ziel kann eine interne Nebenstelle oder externe Rufnummer sein
- Änderungen aktualisieren sofort den Asterisk-Dialplan

### Anrufverlauf (CDR)

- **Liste:** Alle Anrufe chronologisch sortiert (neueste zuerst)
- **Filterung:** Nach Datum, Quelle, Ziel, Disposition
- **Pagination:** Konfigurierbare Anzahl (Standard: 50, Maximum: 500)
- **Statistiken:**
  - Gesamt-/Angenommene/Verpasste/Besetzte/Fehlgeschlagene Anrufe
  - Durchschnittliche Gesprächsdauer
  - Anrufe heute/diese Woche/diesen Monat

### Voicemail

- **Übersicht:** Alle Voicemail-Nachrichten pro Nebenstelle
- **Synchronisation:** Automatischer Abgleich zwischen Asterisk-Dateisystem und Datenbank
- **Wiedergabe:** Audio-Dateien direkt im Browser abspielen
- **Verwaltung:** Als gelesen markieren, löschen
- **Statistiken:** Gesamt, ungelesen, pro Mailbox
- **Zugang per Telefon:**
  - `*98` → Eigene Mailbox abhören
  - `*97XXXX` → Mailbox einer bestimmten Nebenstelle

### Benutzerverwaltung

- **Rollen:** `admin` (voller Zugriff) und `user` (eingeschränkter Zugriff)
- **Admin-Bereich:** Benutzer anlegen und löschen (nur für Admins sichtbar)
- **JWT-Token:** 24 Stunden gültig, automatischer Logout bei Ablauf
- **Seed:** Beim ersten Start wird automatisch ein Admin-Benutzer angelegt

---

## Backend-Architektur

### Technologie-Stack

| Bibliothek | Version | Zweck |
|---|---|---|
| FastAPI | 0.104.1 | Web-Framework, REST API |
| Uvicorn | 0.24.0 | ASGI Server |
| SQLAlchemy | 2.0.23 | ORM, Datenbankzugriff |
| Psycopg2 | 2.9.9 | PostgreSQL-Adapter |
| Pydantic | 2.5.2 | Datenvalidierung, Schemas |
| Panoramisk | 1.4 | Asterisk AMI Client (asyncio) |
| python-jose | 3.3.0 | JWT Token Erstellung/Validierung |
| passlib + bcrypt | 1.7.4 / 4.1.3 | Passwort-Hashing |
| docker | 7.0.0 | Docker API (für Asterisk-Reload) |

### Modulübersicht

| Modul | Beschreibung |
|---|---|
| `main.py` | FastAPI App, Lifecycle (Startup/Shutdown), WebSocket-Endpoint, AMI-Initialisierung, Admin-Seed |
| `database.py` | SQLAlchemy Engine, Session, alle ORM-Models |
| `auth.py` | JWT-Erstellung/Validierung, Passwort-Hashing, `get_current_user` Dependency |
| `ami_client.py` | Asterisk AMI Verbindung (Panoramisk), Event-Handler (DialBegin/DialEnd/Hangup), CDR-Speicherung |
| `pjsip_config.py` | PJSIP-Konfigurationsgenerator für Peers und Trunks |
| `dialplan.py` | Dialplan-Generator (extensions.conf) mit Forwarding und Outbound-Routing |

### AMI Client (`ami_client.py`)

Der AMI Client verbindet sich asynchron mit Asterisk und:
- Registriert einen globalen Event-Handler für alle Asterisk-Events
- Trackt aktive Anrufe in-memory (`active_calls` Dictionary)
- Schreibt CDR-Einträge in die Datenbank bei Hangup
- Broadcastet Events an verbundene WebSocket-Clients
- Reconnected automatisch bei Verbindungsverlust (5 Sekunden Delay)

### Router-Module

| Router | Prefix | Beschreibung |
|---|---|---|
| `routers/auth.py` | `/api/auth` | Login (POST), Token-Validierung (GET /me) |
| `routers/users.py` | `/api/users` | Benutzerverwaltung (Admin-only) |
| `routers/peers.py` | `/api/peers` | SIP-Peers CRUD + PJSIP-Config-Regenerierung |
| `routers/trunks.py` | `/api/trunks` | SIP-Trunks CRUD + PJSIP-Config-Regenerierung |
| `routers/routes.py` | `/api/routes` | Inbound Routes CRUD + Dialplan-Regenerierung |
| `routers/callforward.py` | `/api/callforward` | Rufumleitungen CRUD + Dialplan-Regenerierung |
| `routers/dashboard.py` | `/api/dashboard` | Systemstatus, Endpoint-Liste mit Provider-Info und RTT |
| `routers/cdr.py` | `/api/cdr` | CDR-Abfrage mit Filtern, Statistiken |
| `routers/voicemail.py` | `/api/voicemail` | Voicemail-Liste, Audio-Streaming, Statistiken |

---

## Frontend-Architektur

### Technologie-Stack

| Bibliothek | Zweck |
|---|---|
| React 18 | UI-Framework |
| TypeScript | Typsicherheit |
| Vite 5 | Build-Tool und Dev-Server |
| Tailwind CSS 3 | Utility-First CSS |
| Lucide React | Icon-Bibliothek |
| Recharts | Diagramme/Charts |

### Seitenstruktur

| Seite | Datei | Beschreibung |
|---|---|---|
| Dashboard | `Dashboard.tsx` | Hauptseite: Status, Leitungen, Nebenstellen, Letzte Anrufe |
| Extensions | `ExtensionsPage.tsx` | SIP-Peers und SIP-Trunks Verwaltung (CRUD) |
| Extension Detail | `ExtensionDetailPage.tsx` | DID-Zuordnung und Rufumleitungen pro Nebenstelle |
| CDR | `CDRPage.tsx` | Anrufverlauf mit Filterung und Statistiken |
| Voicemail | `VoicemailPage.tsx` | Voicemail-Übersicht mit Audio-Player |
| Login | `LoginPage.tsx` | Anmeldeseite |
| Benutzer | `UsersPage.tsx` | Benutzerverwaltung (nur Admin) |

### Navigation

- Desktop: Horizontale Navigation in der Header-Leiste
- Mobile: Hamburger-Menü mit Slide-Down Navigation
- Benutzer-Info und Logout-Button rechts im Header
- Admin-Badge bei Admin-Benutzern
- Versionsnummer und Copyright im Footer

### API-Client (`api.ts`)

Zentrale API-Klasse mit:
- Automatischer Bearer-Token-Injection aus localStorage
- Automatischer Logout bei HTTP 401 (Token abgelaufen)
- Methoden für alle Backend-Endpoints
- Dynamische Base-URL basierend auf `window.location`

### Auth-System (`AuthContext.tsx`)

React Context Provider für:
- Token-Speicherung in localStorage
- Token-Validierung beim Start (GET `/api/auth/me`)
- Login/Logout-Funktionen
- Bereitstellung von User-Objekt und Auth-Status

---

## Datenbank-Schema

### Tabellen

#### `users`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| username | String(50) UNIQUE | Benutzername |
| email | String(100) UNIQUE | E-Mail |
| password_hash | String(255) | bcrypt Hash |
| full_name | String(100) | Anzeigename |
| role | String(20) | `admin` oder `user` |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `sip_peers`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| user_id | Integer FK → users | Zugeordneter Benutzer (optional) |
| extension | String(20) UNIQUE | Nebenstellennummer (z.B. 1001) |
| secret | String(100) | SIP-Passwort |
| caller_id | String(100) | Anzeigename (Caller-ID) |
| context | String(50) | Dialplan-Context (Standard: `internal`) |
| host | String(50) | Host-Typ (Standard: `dynamic`) |
| nat | String(20) | NAT-Einstellungen |
| type | String(20) | SIP-Typ (Standard: `friend`) |
| enabled | Boolean | Aktiviert/Deaktiviert |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `sip_trunks`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| name | String(100) UNIQUE | Trunk-Name |
| provider | String(50) | Provider-Kennung (`plusnet_basic`, `plusnet_connect`) |
| auth_mode | String(20) | `registration` oder `ip` |
| sip_server | String(200) | SIP-Server-Adresse (automatisch aus Provider) |
| username | String(100) | SIP-Benutzername |
| password | String(200) | SIP-Passwort |
| caller_id | String(100) | Standard Caller-ID |
| number_block | String(100) | Verfügbare Rufnummern (z.B. `042198961300-042198961399`) |
| context | String(50) | Eingangs-Context (Standard: `from-trunk`) |
| codecs | String(200) | Erlaubte Codecs (Standard: `ulaw,alaw,g722`) |
| enabled | Boolean | Aktiviert/Deaktiviert |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `inbound_routes`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| did | String(50) UNIQUE | Externe Rufnummer (DID) |
| trunk_id | Integer FK → sip_trunks | Zugehöriger Trunk |
| destination_extension | String(20) | Ziel-Nebenstelle |
| description | String(200) | Beschreibung |
| enabled | Boolean | Aktiviert/Deaktiviert |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `call_forwards`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| extension | String(20) | Nebenstelle |
| forward_type | String(20) | `unconditional`, `busy`, `no_answer` |
| destination | String(100) | Umleitungsziel |
| ring_time | Integer | Klingelzeit in Sekunden (für CFNA) |
| enabled | Boolean | Aktiviert/Deaktiviert |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `cdr`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| call_date | DateTime | Anrufzeitpunkt |
| clid | String(80) | Caller-ID String |
| src | String(80) | Quellrufnummer |
| dst | String(80) | Zielrufnummer |
| dcontext | String(80) | Dialplan-Context |
| channel | String(80) | Quell-Channel (z.B. `PJSIP/1001-00000001`) |
| dstchannel | String(80) | Ziel-Channel |
| lastapp | String(80) | Letzte Dialplan-Applikation |
| lastdata | String(80) | Daten der letzten Applikation |
| duration | Integer | Gesamtdauer in Sekunden |
| billsec | Integer | Gesprächsdauer in Sekunden |
| disposition | String(45) | `ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED` |
| amaflags | Integer | AMA-Flags |
| uniqueid | String(150) | Eindeutige Call-ID |
| userfield | String(255) | Benutzerfeld |

#### `voicemail_records`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| mailbox | String(20) | Mailbox-Nummer (= Extension) |
| caller_id | String(100) | Anrufer-ID |
| duration | Integer | Dauer in Sekunden |
| date | DateTime | Zeitpunkt der Nachricht |
| is_read | Boolean | Gelesen/Ungelesen |
| file_path | String(500) | Pfad zur Audio-Datei |
| folder | String(20) | `INBOX` oder `Old` |
| msg_id | String(50) | Message-ID (z.B. `msg0000`) |
| created_at | DateTime | Erstellzeitpunkt |

#### `extensions`

| Spalte | Typ | Beschreibung |
|---|---|---|
| id | Integer PK | Auto-Increment |
| extension | String(20) UNIQUE | Extension-Nummer |
| description | String(255) | Beschreibung |
| type | String(20) | `internal`, `external`, `queue`, `ivr` |
| destination | String(100) | Ziel |
| user_id | Integer FK → users | Zugeordneter Benutzer |
| enabled | Boolean | Aktiviert |
| created_at | DateTime | Erstellzeitpunkt |
| updated_at | DateTime | Letzte Änderung |

#### `system_settings`

| Spalte | Typ | Beschreibung |
|---|---|---|
| key | String(100) PK | Einstellungsname |
| value | Text | Einstellungswert |
| description | Text | Beschreibung |
| updated_at | DateTime | Letzte Änderung |

---

## API-Referenz

Alle API-Endpunkte (außer Login) erfordern einen gültigen JWT-Token im `Authorization: Bearer <token>` Header.

### Authentifizierung

| Methode | Pfad | Beschreibung |
|---|---|---|
| POST | `/api/auth/login` | Login mit Username/Passwort, gibt JWT-Token zurück |
| GET | `/api/auth/me` | Aktueller Benutzer (Token-Validierung) |

### Dashboard

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/dashboard/status` | Systemstatus: Asterisk, Endpoints (mit Provider, RTT, Status), System-Health |

**Response-Format `/api/dashboard/status`:**
```json
{
  "timestamp": "2026-02-08T12:00:00",
  "asterisk": "connected",
  "endpoints": [
    {
      "endpoint": "1001",
      "display_name": "Büro Norbert",
      "type": "peer",
      "status": "online",
      "rtt": 12.5
    },
    {
      "endpoint": "trunk-ep-1",
      "display_name": "Hauptleitung",
      "type": "trunk",
      "provider": "plusnet_basic",
      "status": "online",
      "rtt": 8.2
    }
  ],
  "system": {
    "health": "healthy",
    "issues": [],
    "database": "connected",
    "api": "running"
  }
}
```

### SIP-Peers

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/peers/` | Alle Peers auflisten |
| GET | `/api/peers/{id}` | Einzelnen Peer abrufen |
| POST | `/api/peers/` | Neuen Peer anlegen |
| PUT | `/api/peers/{id}` | Peer bearbeiten |
| DELETE | `/api/peers/{id}` | Peer löschen |

Bei jeder Schreiboperation wird `pjsip.conf` regeneriert und Asterisk neu geladen.

### SIP-Trunks

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/trunks/` | Alle Trunks auflisten |
| POST | `/api/trunks/` | Neuen Trunk anlegen |
| PUT | `/api/trunks/{id}` | Trunk bearbeiten |
| DELETE | `/api/trunks/{id}` | Trunk löschen |

SIP-Server wird automatisch aus dem Provider-Mapping gesetzt. Bei jeder Schreiboperation wird `pjsip.conf` regeneriert.

### Inbound Routes (DID-Zuordnung)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/routes/` | Alle Routen auflisten |
| GET | `/api/routes/by-extension/{ext}` | Routen einer Nebenstelle |
| POST | `/api/routes/` | Neue Route anlegen |
| PUT | `/api/routes/{id}` | Route bearbeiten |
| DELETE | `/api/routes/{id}` | Route löschen |

Validierung: DID muss einzigartig sein, Trunk und Ziel-Extension müssen existieren. Bei jeder Änderung wird `extensions.conf` regeneriert.

### Rufumleitungen

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/callforward/by-extension/{ext}` | Umleitungen einer Nebenstelle |
| POST | `/api/callforward/` | Neue Umleitung anlegen |
| PUT | `/api/callforward/{id}` | Umleitung bearbeiten |
| DELETE | `/api/callforward/{id}` | Umleitung löschen |

Validierung: `forward_type` muss `unconditional`, `busy` oder `no_answer` sein. Pro Extension+Typ nur eine Regel erlaubt.

### CDR (Anrufverlauf)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/cdr/` | Anrufe abrufen (Filter: `limit`, `offset`, `src`, `dst`, `disposition`, `date_from`, `date_to`) |
| GET | `/api/cdr/count` | Anzahl der CDR-Einträge (für Pagination) |
| GET | `/api/cdr/stats` | Anrufstatistiken |
| GET | `/api/cdr/recent` | Letzte X Anrufe (für Dashboard) |

### Voicemail

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/voicemail/` | Voicemail-Nachrichten (Filter: `mailbox`, `unread_only`) |
| GET | `/api/voicemail/stats` | Voicemail-Statistiken |
| GET | `/api/voicemail/{id}/audio` | Audio-Datei streamen |
| PATCH | `/api/voicemail/{id}/mark-read` | Als gelesen markieren |
| DELETE | `/api/voicemail/{id}` | Voicemail löschen (inkl. Audio-Datei) |

### Benutzer (Admin)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/users/` | Alle Benutzer auflisten |
| POST | `/api/users/` | Neuen Benutzer anlegen |
| DELETE | `/api/users/{id}` | Benutzer löschen |

### System

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/` | API Root (Health-Check) |
| GET | `/api/health` | Systemstatus (API, Asterisk, Database) |
| GET | `/api/calls/active` | Aktive Anrufe (In-Memory aus AMI) |
| WS | `/ws?token=<jwt>` | WebSocket für Echtzeit-Events |

---

## Asterisk-Integration

### PJSIP-Konfiguration (`pjsip.conf`)

Die PJSIP-Konfiguration wird vollständig aus der Datenbank generiert.

**Globale Einstellungen:**
- Transport: UDP und TCP auf Port 5060
- External Media/Signaling: Konfiguriert für NAT-Traversal
- Basis-Templates: `endpoint-basic`, `auth-basic`, `aor-basic`

**Peer-Konfiguration (pro Nebenstelle):**
```ini
[1001](endpoint-basic)
auth=auth1001
aors=1001
callerid="Büro Norbert" <1001>

[auth1001](auth-basic)
username=1001
password=<secret>

[1001](aor-basic)
```

**Trunk-Konfiguration (pro Trunk):**
- Registrierungsmodus: registration, endpoint, auth, aor, identify Sections
- IP-Modus: endpoint, aor, identify Sections (kein auth/registration)

### Dialplan (`extensions.conf`)

Der Dialplan wird aus Datenbank-Daten generiert und enthält:

**Context `[internal]`:**
- `_1XXX` → Interne Anrufe zwischen Nebenstellen
- Per-Extension Overrides für Rufumleitungen (CFU/CFB/CFNA)
- `_0X.` → Ausgehende nationale/internationale Anrufe
- `_+X.` → Ausgehende Anrufe mit + Prefix
- `*98` → Eigene Voicemail abhören
- `*97XXXX` → Voicemail einer bestimmten Nebenstelle
- `*43` → Echo-Test

**Context `[from-trunk]`:**
- DID-basiertes Routing: Jede DID wird zur konfigurierten Nebenstelle geroutet
- Rufumleitungen greifen auch bei eingehenden Anrufen
- Catch-all für nicht zugeordnete DIDs

### Ausgehendes Routing

Das Outbound-Routing nutzt `CHANNEL(endpoint)` um die anrufende Nebenstelle zu identifizieren:

1. Anruf auf `_0X.` oder `_+X.` wird eingeleitet
2. Dialplan prüft für jede Nebenstelle mit DID-Zuordnung: `GotoIf(CHANNEL(endpoint) = "1001")`
3. Bei Match: Setzt `CALLERID(num)` auf die zugeordnete DID
4. Routet den Anruf über den zugehörigen Trunk: `Dial(PJSIP/${EXTEN}@trunk-ep-{id})`
5. Nebenstellen ohne DID hören "No Service" Ansage

### Rufumleitungen im Dialplan

- **CFU (Unconditional):** `Dial(PJSIP/{destination}@trunk)` - Extension wird übersprungen
- **CFB (Busy):** `GotoIf(DIALSTATUS=BUSY)` → Weiterleitung an Ziel
- **CFNA (No Answer):** Klingelzeit konfigurierbar, danach Weiterleitung
- Kombination möglich: CFB + CFNA gleichzeitig aktiv
- Fallback auf Voicemail wenn keine Umleitung konfiguriert

### AMI-Verbindung

- Host: `pbx_asterisk` (Docker-Netzwerk)
- Port: 5038
- Nutzt Panoramisk-Bibliothek (asyncio-basiert)
- Auto-Reconnect bei Verbindungsverlust
- Trackt DialBegin, DialEnd, Hangup Events

---

## Authentifizierung und Sicherheit

### JWT-Token

- **Algorithmus:** HS256
- **Gültigkeit:** 24 Stunden
- **Secret:** Konfigurierbar in `auth.py` (Standard-Key vorhanden)
- **Payload:** `{"sub": "<username>", "exp": <timestamp>}`

### Passwort-Hashing

- **Verfahren:** bcrypt über passlib
- **Speicherung:** Nur Hash in Datenbank (kein Klartext)

### Endpoint-Schutz

- Alle API-Endpunkte (außer Login) geschützt durch `get_current_user` Dependency
- WebSocket: Token wird als Query-Parameter (`?token=<jwt>`) übergeben
- Frontend: Automatischer Logout bei HTTP 401 Response

### Admin-Bereich

- `require_admin` Dependency für Admin-only Endpoints
- Benutzerverwaltung nur für Admins sichtbar
- Admin-Badge im Frontend

---

## Konfigurationsgenerierung

### Workflow

```
Benutzer ändert Daten (UI)
        │
        ▼
   API-Endpoint (Backend)
        │
        ▼
   Datenbank-Update
        │
        ▼
   Config-Generator aufrufen
   (pjsip_config.py / dialplan.py)
        │
        ▼
   Datei schreiben nach
   /etc/asterisk/custom/
        │
        ▼
   docker exec pbx_asterisk
   "cp ... && asterisk -rx reload"
        │
        ▼
   Asterisk lädt neue Config
```

### Generierte Dateien

| Datei | Generator | Trigger |
|---|---|---|
| `pjsip.conf` | `pjsip_config.py` | Peer/Trunk anlegen/ändern/löschen |
| `extensions.conf` | `dialplan.py` | Route/Forward anlegen/ändern/löschen |

---

## Dateistruktur

```
asterisk-pbx-gui/
├── docker-compose.yml              # Container-Orchestrierung
├── docker-compose.override.yml     # Lokale Overrides
├── DOKUMENTATION.md                # Diese Datei
├── release.sh                      # Release-Script (Version bump, Doku, Release Notes)
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt            # Python-Abhängigkeiten
│   ├── main.py                     # FastAPI App, Startup, WebSocket, AMI-Init
│   ├── database.py                 # SQLAlchemy Engine, Models
│   ├── auth.py                     # JWT-Auth, Passwort-Hashing
│   ├── ami_client.py               # Asterisk AMI Client (Panoramisk)
│   ├── pjsip_config.py             # PJSIP-Konfigurationsgenerator
│   ├── dialplan.py                 # Dialplan-Generator (extensions.conf)
│   └── routers/
│       ├── auth.py                 # Login/Token-Endpunkte
│       ├── users.py                # Benutzerverwaltung (Admin)
│       ├── peers.py                # SIP-Peers CRUD
│       ├── trunks.py               # SIP-Trunks CRUD
│       ├── routes.py               # Inbound Routes CRUD
│       ├── callforward.py          # Rufumleitungen CRUD
│       ├── dashboard.py            # Dashboard-Status mit AMI-Daten
│       ├── cdr.py                  # Call Detail Records
│       └── voicemail.py            # Voicemail-Verwaltung
│
├── frontend/
│   ├── Dockerfile                  # Multi-Stage: Node (Build) + Nginx (Serve)
│   ├── package.json                # Version: 1.0.0
│   ├── nginx.conf                  # Nginx-Konfiguration (SPA-Routing, API-Proxy)
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   ├── public/
│   │   ├── logo.png                # GonoPBX Logo
│   │   └── logos/
│   │       └── plusnet.svg          # Plusnet Provider-Logo
│   └── src/
│       ├── App.tsx                  # Hauptkomponente, Navigation, Routing, Footer
│       ├── main.tsx                 # React Entry Point
│       ├── index.css                # Tailwind Base-Styles
│       ├── context/
│       │   └── AuthContext.tsx       # JWT Auth Context Provider
│       ├── services/
│       │   └── api.ts               # REST API Client mit Auth-Interceptor
│       ├── pages/
│       │   ├── Dashboard.tsx        # Dashboard: Status, Leitungen, Nebenstellen, Anrufe
│       │   ├── ExtensionsPage.tsx   # Peers & Trunks Verwaltung
│       │   ├── ExtensionDetailPage.tsx  # DID-Zuordnung, Rufumleitungen
│       │   ├── CDRPage.tsx          # Anrufverlauf mit Filter
│       │   ├── VoicemailPage.tsx    # Voicemail-Übersicht
│       │   ├── LoginPage.tsx        # Anmeldeseite
│       │   └── UsersPage.tsx        # Benutzerverwaltung (Admin)
│       └── components/
│           ├── ActiveCalls.tsx       # Aktive Anrufe Widget
│           ├── VoicemailPlayer.tsx   # Audio-Player
│           └── VoicemailStats.tsx    # Voicemail-Statistiken
│
├── asterisk/
│   └── config/                      # Generierte Asterisk-Konfiguration (Volume)
│       ├── pjsip.conf               # Auto-generiert aus DB
│       ├── extensions.conf          # Auto-generiert aus DB
│       ├── voicemail.conf           # Voicemail-Konfiguration
│       └── ...
│
├── releases/                        # Release Notes pro Version
│   ├── v0.1.1.md
│   ├── ...
│   └── v1.0.0.md
│
└── database/                        # PostgreSQL-Daten (Docker Volume)
```

---

## Release-Prozess

### Release-Script (`release.sh`)

```bash
./release.sh "Beschreibung der Änderungen"
```

Das Script führt folgende Schritte aus:

1. Liest aktuelle Version aus `frontend/package.json`
2. Erhöht die Patch-Version (z.B. 0.1.8 → 0.1.9)
3. Aktualisiert `package.json` mit neuer Version
4. Aktualisiert `DOKUMENTATION.md` (Version, Datum, Changelog-Eintrag)
5. Erstellt Release-Notes-Datei in `releases/vX.Y.Z.md`

### Deployment nach Release

```bash
docker compose build frontend && docker compose up -d frontend
```

---

## Changelog

### v1.0.0 (08.02.2026)
- Vollständige technische Dokumentation erstellt
- Copyright im Footer hinzugefügt
- Versionssprung auf 1.0.0 (stabiler Funktionsumfang)

### v0.1.8 (08.02.2026)
- Plusnet-Logo bei Leitungen im Dashboard eingebaut, Provider-Logos werden als SVG angezeigt

### v0.1.7 (08.02.2026)
- Dashboard Leitungen zeigt Provider-Namen statt Trunk-Namen an, Provider-Logo-Unterstützung vorbereitet

### v0.1.6 (08.02.2026)
- Anrufrichtung korrigiert: Erkennung basiert jetzt auf PJSIP-Channel statt nur Rufnummer, ausgehende Calls zeigen korrekt den Nebenstellen-Namen statt DID

### v0.1.5 (08.02.2026)
- Anrufrichtung in Letzte Anrufe: Eingehend (grüner Pfeil), Ausgehend (blauer Pfeil), Intern (graues Repeat-Icon) mit farbigen Badges

### v0.1.4 (08.02.2026)
- Dashboard umgebaut: Active Calls entfernt, Leitungen nach oben verschoben, Letzte 5 Anrufe mit Nebenstellen-Zuordnung und Navigation zur vollständigen Anrufliste

### v0.1.3 (08.02.2026)
- DID-Verfügbarkeit und bereits vergebene Nummern im Zuordnungs-Formular sichtbar, Ein-/Ausgehend-Kennzeichnung bei DIDs im Dashboard und Extension-Detail

### v0.1.2 (08.02.2026)
- Release-Script eingeführt, automatische Versionierung und Release Notes, Versionsnummer im Frontend-Footer sichtbar

### v0.1.1 (08.02.2026)
- Rufumleitungen (CFU, CFB, CFNA) implementiert
- Ausgehende Telefonie über zugeordnete DID/Trunk
- DID-Anzeige im Dashboard bei Nebenstellen
- Ausgehende Rufnummer in Extension-Detail sichtbar
- Versionierung im Frontend eingeführt

### v0.1.0 (06.02.2026)
- Initiale Version
- Dashboard mit Echtzeit-Status
- SIP-Peers und SIP-Trunks Verwaltung
- Inbound DID-Routing
- CDR (Anrufverlauf)
- Voicemail
- JWT-Authentifizierung und Benutzerverwaltung
