# Changelog

## [1.1.0] - 2026-02-10

### Neue Features

- **SMTP E-Mail-Konfiguration**: Admin-Seite zum Konfigurieren des SMTP-Servers
  fuer Voicemail-Benachrichtigungen per E-Mail. Inkl. Test-E-Mail-Funktion.
- **Voicemail-Mailbox-Verwaltung**: PIN, E-Mail-Adresse und Aktivierung
  pro Extension konfigurierbar. Automatische Mailbox-Erstellung bei neuen Peers.
- **Custom SIP-Trunk-Provider**: Neben Plusnet IPfonie koennen nun beliebige
  SIP-Trunk-Provider mit manuellem SIP-Server-Eintrag konfiguriert werden.

### Verbesserungen

- Asterisk-Container mit eigenem Dockerfile (msmtp fuer E-Mail-Versand)
- Docker-Compose gehaertet: Backend, Frontend und AMI nur ueber localhost erreichbar
- PostgreSQL-Port nicht mehr nach aussen exponiert
- API-Base-URL nutzt window.location.host (Reverse-Proxy-kompatibel)
- PJSIP Identify-Match dynamisch statt hardcodierter IP-Ranges

## [1.0.0] - 2026-02-09

### Initiales Release

- Dashboard mit Live-Status (WebSocket)
- SIP-Peer-Verwaltung (CRUD)
- SIP-Trunk-Verwaltung (Plusnet IPfonie Basic/Extended Connect)
- Inbound-Routing (DID-basiert)
- Anrufweiterleitung (Unconditional, Busy, No-Answer)
- Call Detail Records (CDR)
- JWT-Authentifizierung mit Admin/User-Rollen
- Benutzerverwaltung
- Interaktives Installationsscript
- Docker-Compose-Deployment
