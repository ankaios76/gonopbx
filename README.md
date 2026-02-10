<p align="center">
  <img src="https://gonopbx.de/logo.png" alt="GonoPBX Logo" width="120">
</p>

<h1 align="center">GonoPBX</h1>

<p align="center">
  <strong>Modern Open-Source Web GUI for Asterisk PBX</strong><br>
  Manage your phone system through an intuitive web interface – extensions, SIP trunks, call routing, voicemail, and real-time monitoring.
</p>

<p align="center">
  <a href="https://github.com/ankaios76/gonopbx/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ankaios76/gonopbx?color=blue" alt="License"></a>
  <a href="https://github.com/ankaios76/gonopbx/releases"><img src="https://img.shields.io/github/v/release/ankaios76/gonopbx?color=green" alt="Release"></a>
  <a href="https://github.com/ankaios76/gonopbx/stargazers"><img src="https://img.shields.io/github/stars/ankaios76/gonopbx?style=social" alt="Stars"></a>
  <a href="https://demo.gonopbx.de"><img src="https://img.shields.io/badge/Live-Demo-brightgreen" alt="Live Demo"></a>
  <a href="https://buymeacoffee.com/ankaios"><img src="https://img.shields.io/badge/Buy%20me%20a-Coffee-orange?logo=buymeacoffee&logoColor=white" alt="Buy me a Coffee"></a>
</p>

<p align="center">
  <a href="https://gonopbx.de">Website</a> •
  <a href="https://demo.gonopbx.de">Live Demo</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#-features">Features</a> •
  <a href="#-changelog">Changelog</a> •
  <a href="https://buymeacoffee.com/ankaios">Support the Project</a>
</p>

---

<p align="center">
  <img src="https://gonopbx.de/dashboard.png" alt="GonoPBX Dashboard" width="800">
</p>

## ✨ Features

- **📞 Extension Management** – Create, edit, and manage SIP extensions with caller ID, context, and activation status
- **🔌 SIP Trunk Configuration** – Connect to any SIP provider via registration or IP authentication, with built-in templates for Plusnet IPfonie and support for custom providers
- **📠 DID Routing** – Flexibly assign incoming phone numbers to extensions with number block management per trunk
- **🔄 Call Forwarding** – Unconditional, busy, and no-answer forwarding per extension, toggled with one click
- **📩 Voicemail** – Per-extension voicemail boxes with PIN, email notifications, and built-in audio player
- **📧 SMTP Email Configuration** – Configure your mail server for voicemail-to-email delivery, with built-in test email function
- **📊 Call Detail Records** – Full CDR with filters by source, destination, and status, plus call statistics at a glance
- **🔐 Multi-User & Roles** – Admin and user roles with JWT-based authentication
- **📡 Real-Time Dashboard** – Live overview via WebSocket: Asterisk status, registered endpoints, active lines, and recent calls
- **🐳 Docker Deployment** – Full system up and running in minutes with `docker compose up`

## 📸 Screenshots

| Extensions Overview | Extension Detail | SIP Trunk Config |
|:---:|:---:|:---:|
| ![Extensions](https://gonopbx.de/extensions.png) | ![Detail](https://gonopbx.de/extensions_detail.png) | ![Trunk](https://gonopbx.de/extensions_siptrunk.png) |

| Call History | User Management | Live Dashboard |
|:---:|:---:|:---:|
| ![CDR](https://gonopbx.de/anrufverlauf.png) | ![Users](https://gonopbx.de/benutzer.png) | ![Dashboard](https://gonopbx.de/dashboard.png) |

## 🚀 Quick Start

### Prerequisites

- Linux server (Ubuntu 22.04+ / Debian 12+ recommended)
- Docker & Docker Compose installed
- Ports 3000 (Web UI), 5060 (SIP), 10000-20000 (RTP) available

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ankaios76/gonopbx.git
cd gonopbx

# 2. Run the interactive installer
chmod +x install.sh
./install.sh

# 3. Access the web interface
# Open https://your-server-ip:3000 in your browser
```

The installer will automatically:
- Detect your server IP
- Generate secure passwords
- Create the Docker configuration
- Start all services

## 🏗️ Tech Stack

| Component | Technology |
|-----------|------------|
| **PBX Engine** | Asterisk 18 (PJSIP) |
| **Backend** | FastAPI (Python) |
| **Frontend** | React + TypeScript (Vite, Tailwind CSS) |
| **Database** | PostgreSQL |
| **Auth** | JWT + bcrypt |
| **Real-Time** | WebSocket |
| **Email** | msmtp (in Asterisk container) |
| **Deployment** | Docker Compose |

## 📁 Project Structure

```
gonopbx/
├── asterisk/           # Asterisk Dockerfile + configuration templates
├── backend/            # FastAPI backend (API, WebSocket, Asterisk integration)
├── frontend/           # React frontend (Vite + Tailwind)
├── docker-compose.yml  # Container orchestration
├── install.sh          # Interactive installer
└── CHANGELOG.md        # Version history
```

## 📋 Changelog

### v1.1.0 (2026-02-10)

**New Features:**
- SMTP email configuration for voicemail-to-email notifications (admin settings page with test email)
- Per-extension voicemail mailbox management (PIN, email, enable/disable)
- Support for custom SIP trunk providers (manual SIP server entry)

**Improvements:**
- Custom Asterisk Docker image with msmtp for email delivery
- Hardened Docker Compose: backend, frontend, and AMI bound to localhost only
- Dynamic PJSIP identify matching (replaces hardcoded IP ranges)

### v1.0.0 (2026-02-09)

Initial release with full PBX management: extensions, trunks, routing, call forwarding, voicemail, CDR, authentication, and real-time dashboard.

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## 🤝 Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests – all help is appreciated.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Have an idea but no time to code? [Open an issue](https://github.com/ankaios76/gonopbx/issues) – I'll implement it when I find the time.

## 🗺️ Roadmap

- [ ] Ring groups & call queues
- [ ] IVR / auto attendant builder
- [ ] Conference rooms
- [ ] Phonebook with CallerID lookup
- [ ] Multi-language support (EN/DE)
- [ ] Backup & restore functionality

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## ☕ Support

GonoPBX is free and open source. If you find it useful, please consider:

- ⭐ **Starring this repository** – it helps with visibility
- 🐛 **Reporting bugs** or suggesting features via [Issues](https://github.com/ankaios76/gonopbx/issues)
- ☕ **[Buy me a Coffee](https://buymeacoffee.com/ankaios)** – helps cover hosting costs

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ankaios76">Norbert Hengsteler</a><br>
  <a href="https://gonopbx.de">gonopbx.de</a>
</p>
