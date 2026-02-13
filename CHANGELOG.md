# Changelog

## [1.7.0] - 2026-02-13

### Neue Features

- **SIP Debug**: Live-Ansicht aller SIP-Nachrichten (INVITE, 200 OK, BYE etc.)
  direkt in der Web-Oberflaeche. Capture per Toggle aktivieren, Nachrichten nach
  Call-ID gruppiert anzeigen, expandierbare Roh-SIP-Texte. Basiert auf Asterisks
  res_pjsip_history-Modul mit automatischem Polling alle 3 Sekunden.
  Nachrichten werden max. 2 Stunden im Speicher gehalten (Hard-Cap: 10.000).
  Nur fuer Admins sichtbar.

## [1.5.1] - 2026-02-12

### Verbesserungen

- **Dashboard-Redesign**: Persoenliche Begruessung (Moin/Hallo/Guten Abend)
  mit Benutzername, Wochentag und Datum. System-Health-Karte entfernt.
- **Versionsanzeige im Dashboard**: Backend liefert die aktuelle Version
  ueber die Dashboard-API, angezeigt unter dem GonoPBX-Status.
- **dus.net Server korrigiert**: SIP-Server von sip.dus.net auf proxy.dus.net geaendert.
- **Footer bereinigt**: Versionsanzeige aus dem Footer entfernt (nur noch im Dashboard).

## [1.5.0] - 2026-02-11

### Neue Features

- **Benutzerprofile**: Vollstaendiger Name, Avatar-Upload und Nebenstellen-Zuweisung pro User.
- **Multi-DID-Routing**: Mehrere eingehende Rufnummern pro Extension konfigurierbar.
- **Willkommens-E-Mail**: Automatischer Versand der Zugangsdaten an neue Benutzer.
- **Self-Service Passwortwechsel**: Benutzer koennen ihr eigenes Passwort aendern.
- **FAQ-Seite**: Haeufig gestellte Fragen direkt in der Oberflaeche.
- **Navigation ueberarbeitet**: Extensions und Trunks unter Settings zusammengefasst.
- **One-Click Update**: System-Update direkt aus der Web-Oberflaeche ausfuehren.

### Bugfixes

- User-Erstellung korrigiert (Unique-Email-Constraint entfernt).

## [1.4.0] - 2026-02-11

### Neue Features

- **SIP-Passwort-Staerke-Pruefung**: Echtzeit-Bewertung der Passwortstaerke
  beim Anlegen/Bearbeiten von Extensions (farbiger Balken rot/gelb/gruen).
  Button zum Generieren sicherer 16-Zeichen-Passwoerter.
  Uebersicht schwacher Passwoerter im Sicherheit-Tab.
- **Audit-Log**: Protokollierung aller administrativen Aktionen (Erstellen,
  Bearbeiten, Loeschen von Extensions, Trunks, Routen, Weiterleitungen,
  Benutzern und Einstellungen). Neuer Audit-Log-Tab in den Einstellungen
  mit farblich markierter Tabelle und Pagination.
- **Fail2Ban-Status**: Live-Anzeige des Fail2Ban-Status im Sicherheit-Tab.
  Zeigt aktive Bans, Jails, Bans der letzten 24h und eine Tabelle der
  zuletzt gesperrten IP-Adressen. Liest direkt die Fail2Ban-SQLite-Datenbank.

## [1.3.0] - 2026-02-11

### Neue Features

- **IP-Whitelist fuer SIP-Registrierung**: Beschraenkt die Registrierung auf
  bestimmte IP-Adressen oder CIDR-Netzwerke. Konfigurierbar ueber die
  Admin-Einstellungsseite mit Validierung und Warnhinweisen.
- **Music on Hold**: Vorinstallierte Wartemusik (g722-Format) wird automatisch
  im Asterisk-Container bereitgestellt.
- **HTML Voicemail E-Mails**: Neues Sender-Script fuer professionelle
  HTML-formatierte Voicemail-Benachrichtigungen per E-Mail.
- **Klingeldauer pro Extension**: Individuelle Ring-Timeout-Einstellung
  pro Voicemail-Mailbox (5-120 Sekunden), bevor die Voicemail annimmt.
- **Deutsche Sprachansagen**: Asterisk-Prompt-Paket (de) wird automatisch
  installiert, Endpunkte auf language=de gesetzt.

### Verbesserungen

- **Externe IP Auto-Erkennung**: Backend erkennt die oeffentliche IP automatisch
  ueber mehrere Services, falls EXTERNAL_IP nicht gesetzt ist.
- **SMTP Port 465 Support**: Automatische Erkennung von implizitem TLS
  (tls_starttls=off) fuer Port 465 vs. STARTTLS fuer Port 587.
- **Dialplan-Optimierungen**: Device-State-Pruefung vor dem Dial (UNAVAILABLE
  geht direkt zur Voicemail), Early Answer fuer Inbound-Trunk-Calls
  (verhindert Provider-BYE-Race-Condition).
- **DID-Extraktion aus To-Header**: Fallback fuer Provider, die die DID nicht
  in der Request-URI senden (Extraktion aus SIP To-Header).
- **Duplikat-Identify-Schutz**: Mehrere Trunks vom gleichen Provider teilen
  sich eine PJSIP-Identify-Section (verhindert Asterisk-Konflikte).
- **Timezone**: Asterisk-Container auf Europe/Berlin gesetzt.
- **Installer**: Docker-Berechtigung wird vor Start geprueft.

## [1.2.0] - 2026-02-10

### Neue Features

- **Codec-Verwaltung**: Globale und pro-Extension Codec-Konfiguration
  mit Drag-and-Drop-Priorisierung.

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
