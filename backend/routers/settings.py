"""
Settings Router - Admin-only system settings management
"""

import json
import ipaddress
import os
import shutil
import subprocess
import logging
import urllib.request
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db, SystemSettings, VoicemailMailbox, SIPPeer, SIPTrunk
from auth import require_admin, User
from email_config import write_msmtp_config, send_test_email
from voicemail_config import write_voicemail_config, reload_voicemail
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS
from acl_config import write_acl_config, remove_acl_config, reload_acl
from version import VERSION
from audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Settings"])

SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_tls", "smtp_user", "smtp_password", "smtp_from"]

AVAILABLE_CODECS = [
    {"id": "ulaw", "name": "G.711 u-law", "description": "Standard Nord-Amerika, 64 kbit/s"},
    {"id": "alaw", "name": "G.711 a-law", "description": "Standard Europa, 64 kbit/s"},
    {"id": "g722", "name": "G.722", "description": "HD-Audio, 64 kbit/s"},
    {"id": "opus", "name": "Opus", "description": "Moderner Codec, variabel"},
    {"id": "g729", "name": "G.729", "description": "Niedrige Bandbreite, 8 kbit/s"},
    {"id": "gsm", "name": "GSM", "description": "GSM-Codec, 13 kbit/s"},
]


class SettingsUpdate(BaseModel):
    smtp_host: Optional[str] = ""
    smtp_port: Optional[str] = "587"
    smtp_tls: Optional[str] = "true"
    smtp_user: Optional[str] = ""
    smtp_password: Optional[str] = ""
    smtp_from: Optional[str] = ""


class TestEmailRequest(BaseModel):
    to: str


@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get all system settings (password masked)"""
    result = {}
    for key in SMTP_KEYS:
        setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if setting:
            if key == "smtp_password":
                result[key] = "****" if setting.value else ""
            else:
                result[key] = setting.value or ""
        else:
            if key == "smtp_port":
                result[key] = "587"
            elif key == "smtp_tls":
                result[key] = "true"
            else:
                result[key] = ""
    return result


@router.put("/")
def update_settings(
    data: SettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Save system settings, regenerate msmtp + voicemail config"""
    settings_dict = data.model_dump()

    # If password is masked, keep old value
    if settings_dict.get("smtp_password") == "****":
        existing = db.query(SystemSettings).filter(SystemSettings.key == "smtp_password").first()
        if existing:
            settings_dict["smtp_password"] = existing.value

    for key, value in settings_dict.items():
        setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if setting:
            setting.value = value or ""
        else:
            setting = SystemSettings(key=key, value=value or "")
            db.add(setting)

    db.commit()

    # Reload full settings from DB for config generation
    full_settings = {}
    for key in SMTP_KEYS:
        s = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        full_settings[key] = s.value if s else ""

    # Write msmtp config into Asterisk container
    if full_settings.get("smtp_host"):
        write_msmtp_config(full_settings)

    # Regenerate voicemail.conf with SMTP settings
    mailboxes = db.query(VoicemailMailbox).all()
    write_voicemail_config(mailboxes, full_settings)
    reload_voicemail()

    log_action(db, current_user.username, "settings_updated", "settings", "smtp",
               None, request.client.host if request.client else None)
    return {"status": "ok"}


@router.post("/test-email")
def test_email(
    data: TestEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Send a test email"""
    full_settings = {}
    for key in SMTP_KEYS:
        s = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        full_settings[key] = s.value if s else ""

    if not full_settings.get("smtp_host"):
        raise HTTPException(status_code=400, detail="SMTP ist nicht konfiguriert")

    # Ensure msmtp config is up to date
    write_msmtp_config(full_settings)

    success = send_test_email(full_settings, data.to)
    if not success:
        raise HTTPException(status_code=500, detail="E-Mail konnte nicht gesendet werden. Bitte SMTP-Einstellungen prüfen.")

    return {"status": "ok", "message": f"Test-E-Mail an {data.to} gesendet"}


class CodecUpdate(BaseModel):
    global_codecs: str


@router.get("/codecs")
def get_codec_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get global codec settings"""
    setting = db.query(SystemSettings).filter(SystemSettings.key == "global_codecs").first()
    return {
        "global_codecs": setting.value if setting else DEFAULT_CODECS,
        "available_codecs": AVAILABLE_CODECS,
    }


@router.put("/codecs")
def update_codec_settings(
    data: CodecUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update global codec settings and regenerate pjsip.conf"""
    # Validate codecs
    valid_ids = {c["id"] for c in AVAILABLE_CODECS}
    codecs = [c.strip() for c in data.global_codecs.split(",") if c.strip()]
    if not codecs:
        raise HTTPException(status_code=400, detail="Mindestens ein Codec muss ausgewählt sein")
    for c in codecs:
        if c not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Unbekannter Codec: {c}")

    setting = db.query(SystemSettings).filter(SystemSettings.key == "global_codecs").first()
    if setting:
        setting.value = ",".join(codecs)
    else:
        setting = SystemSettings(key="global_codecs", value=",".join(codecs), description="Global audio codecs")
        db.add(setting)
    db.commit()

    # Regenerate pjsip.conf
    all_peers = db.query(SIPPeer).all()
    all_trunks = db.query(SIPTrunk).all()
    acl_on = _is_acl_enabled(db)
    write_pjsip_config(all_peers, all_trunks, global_codecs=",".join(codecs), acl_enabled=acl_on)
    reload_asterisk()

    return {"status": "ok", "global_codecs": ",".join(codecs)}


# --- IP Whitelist ---

def _is_acl_enabled(db: Session) -> bool:
    """Check if IP whitelist is enabled in DB."""
    s = db.query(SystemSettings).filter(SystemSettings.key == "ip_whitelist_enabled").first()
    return s is not None and s.value == "true"


def _validate_ip_or_cidr(value: str) -> bool:
    """Validate that a string is a valid IP address or CIDR network."""
    try:
        if "/" in value:
            ipaddress.ip_network(value, strict=False)
        else:
            ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


class IpWhitelistUpdate(BaseModel):
    enabled: bool
    ips: List[str]


@router.get("/ip-whitelist")
def get_ip_whitelist(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get IP whitelist settings."""
    enabled_setting = db.query(SystemSettings).filter(
        SystemSettings.key == "ip_whitelist_enabled"
    ).first()
    ips_setting = db.query(SystemSettings).filter(
        SystemSettings.key == "ip_whitelist"
    ).first()

    enabled = enabled_setting.value == "true" if enabled_setting else False
    ips = json.loads(ips_setting.value) if ips_setting and ips_setting.value else []

    return {"enabled": enabled, "ips": ips}


@router.put("/ip-whitelist")
def update_ip_whitelist(
    data: IpWhitelistUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Save IP whitelist, regenerate acl.conf + pjsip.conf, reload Asterisk."""
    # Validate all IPs/CIDRs
    for ip in data.ips:
        if not _validate_ip_or_cidr(ip.strip()):
            raise HTTPException(status_code=400, detail=f"Ungültige IP-Adresse oder CIDR: {ip}")

    clean_ips = [ip.strip() for ip in data.ips if ip.strip()]

    # Save to DB
    for key, value in [
        ("ip_whitelist_enabled", "true" if data.enabled else "false"),
        ("ip_whitelist", json.dumps(clean_ips)),
    ]:
        setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if setting:
            setting.value = value
        else:
            setting = SystemSettings(key=key, value=value, description="IP whitelist for SIP registration")
            db.add(setting)
    db.commit()

    # Generate/remove ACL config
    if data.enabled and clean_ips:
        write_acl_config(clean_ips)
    else:
        remove_acl_config()
    reload_acl()

    # Regenerate pjsip.conf with or without acl line
    codec_setting = db.query(SystemSettings).filter(SystemSettings.key == "global_codecs").first()
    global_codecs = codec_setting.value if codec_setting else DEFAULT_CODECS
    all_peers = db.query(SIPPeer).all()
    all_trunks = db.query(SIPTrunk).all()
    write_pjsip_config(all_peers, all_trunks, global_codecs=global_codecs, acl_enabled=data.enabled and len(clean_ips) > 0)
    reload_asterisk()

    log_action(db, current_user.username, "whitelist_updated", "settings", "ip_whitelist",
               {"enabled": data.enabled, "count": len(clean_ips)},
               request.client.host if request.client else None)
    return {"status": "ok", "enabled": data.enabled, "ips": clean_ips}


# --- Fail2Ban Status ---

FAIL2BAN_DB_PATH = "/var/lib/fail2ban/fail2ban.sqlite3"


def _get_fail2ban_status() -> dict:
    """Read fail2ban status from its SQLite database."""
    if not os.path.exists(FAIL2BAN_DB_PATH):
        return {"available": False, "error": "Fail2Ban-Datenbank nicht gefunden"}

    try:
        conn = sqlite3.connect(f"file:{FAIL2BAN_DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        now = int(time.time())

        # Get jails
        jails = []
        try:
            cursor.execute("SELECT name, enabled FROM jails")
            for row in cursor.fetchall():
                jail_name = row["name"]
                # Count active bans for this jail
                cursor2 = conn.cursor()
                cursor2.execute(
                    "SELECT COUNT(*) as cnt FROM bans WHERE jail = ? AND (timeofban + bantime > ? OR bantime < 0)",
                    (jail_name, now)
                )
                active_count = cursor2.fetchone()["cnt"]
                jails.append({"name": jail_name, "enabled": bool(row["enabled"]), "active_bans": active_count})
        except sqlite3.OperationalError:
            pass

        # Total bans ever
        total_bans = 0
        try:
            cursor.execute("SELECT COUNT(*) as cnt FROM bans")
            total_bans = cursor.fetchone()["cnt"]
        except sqlite3.OperationalError:
            pass

        # Bans last 24h
        bans_24h = 0
        try:
            cursor.execute("SELECT COUNT(*) as cnt FROM bans WHERE timeofban > ?", (now - 86400,))
            bans_24h = cursor.fetchone()["cnt"]
        except sqlite3.OperationalError:
            pass

        # Recent bans
        recent_bans = []
        try:
            cursor.execute(
                "SELECT jail, ip, timeofban, bantime FROM bans ORDER BY timeofban DESC LIMIT 20"
            )
            for row in cursor.fetchall():
                from datetime import datetime as dt
                recent_bans.append({
                    "jail": row["jail"],
                    "ip": row["ip"],
                    "timestamp": dt.utcfromtimestamp(row["timeofban"]).isoformat(),
                    "active": (row["timeofban"] + row["bantime"] > now) or row["bantime"] < 0,
                })
        except sqlite3.OperationalError:
            pass

        conn.close()

        total_active = sum(j["active_bans"] for j in jails)

        return {
            "available": True,
            "jails": jails,
            "total_bans": total_bans,
            "bans_24h": bans_24h,
            "active_bans": total_active,
            "recent_bans": recent_bans,
        }
    except Exception as e:
        logger.error(f"Failed to read fail2ban DB: {e}")
        return {"available": False, "error": str(e)}


@router.get("/fail2ban")
def get_fail2ban_status(
    current_user: User = Depends(require_admin),
):
    """Get Fail2Ban status from its SQLite database."""
    return _get_fail2ban_status()


# --- Server Management ---

GITHUB_REPO = "ankaios76/gonopbx"


def _get_uptime() -> str:
    """Get system uptime as human-readable string."""
    try:
        with open("/proc/uptime") as f:
            seconds = int(float(f.read().split()[0]))
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        mins = (seconds % 3600) // 60
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        parts.append(f"{mins}m")
        return " ".join(parts)
    except Exception:
        return "unbekannt"


def _get_disk_usage() -> dict:
    """Get disk usage for root partition."""
    try:
        usage = shutil.disk_usage("/")
        return {
            "total_gb": round(usage.total / (1024 ** 3), 1),
            "used_gb": round(usage.used / (1024 ** 3), 1),
            "free_gb": round(usage.free / (1024 ** 3), 1),
            "percent": round(usage.used / usage.total * 100, 1),
        }
    except Exception:
        return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0}


def _get_memory_usage() -> dict:
    """Get memory usage from /proc/meminfo."""
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if parts[0] in ("MemTotal:", "MemAvailable:"):
                    info[parts[0].rstrip(":")] = int(parts[1])
        total = info.get("MemTotal", 0) / 1024
        available = info.get("MemAvailable", 0) / 1024
        used = total - available
        return {
            "total_mb": round(total),
            "used_mb": round(used),
            "free_mb": round(available),
            "percent": round(used / total * 100, 1) if total > 0 else 0,
        }
    except Exception:
        return {"total_mb": 0, "used_mb": 0, "free_mb": 0, "percent": 0}


def _get_container_status() -> list:
    """Get Docker container statuses."""
    try:
        result = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True, text=True, timeout=10,
            cwd="/root/asterisk-pbx-gui"
        )
        if result.returncode != 0:
            return []
        containers = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            try:
                c = json.loads(line)
                containers.append({
                    "name": c.get("Name", ""),
                    "service": c.get("Service", ""),
                    "state": c.get("State", ""),
                    "status": c.get("Status", ""),
                })
            except json.JSONDecodeError:
                continue
        return containers
    except Exception as e:
        logger.warning(f"Failed to get container status: {e}")
        return []


@router.get("/server-info")
def get_server_info(
    current_user: User = Depends(require_admin),
):
    """Get server system information."""
    f2b = _get_fail2ban_status()
    f2b_summary = None
    if f2b.get("available"):
        f2b_summary = {"active_bans": f2b["active_bans"], "bans_24h": f2b["bans_24h"]}

    return {
        "version": VERSION,
        "uptime": _get_uptime(),
        "disk": _get_disk_usage(),
        "memory": _get_memory_usage(),
        "containers": _get_container_status(),
        "fail2ban": f2b_summary,
    }


@router.get("/check-update")
def check_update(
    current_user: User = Depends(require_admin),
):
    """Check GitHub for a newer release."""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "GonoPBX"})
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        latest_tag = data.get("tag_name", "").lstrip("v")
        published = data.get("published_at", "")
        body = data.get("body", "")
        html_url = data.get("html_url", "")

        update_available = latest_tag != VERSION and latest_tag > VERSION

        return {
            "current_version": VERSION,
            "latest_version": latest_tag,
            "update_available": update_available,
            "published_at": published,
            "release_notes": body,
            "release_url": html_url,
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {
                "current_version": VERSION,
                "latest_version": VERSION,
                "update_available": False,
                "published_at": "",
                "release_notes": "",
                "release_url": "",
            }
        raise HTTPException(status_code=502, detail=f"GitHub API Fehler: {e.code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Konnte GitHub nicht erreichen: {str(e)}")


class RestartServiceRequest(BaseModel):
    service: str


@router.post("/restart-service")
def restart_service(
    data: RestartServiceRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Restart a specific Docker service."""
    allowed = {"asterisk", "backend", "frontend"}
    if data.service not in allowed:
        raise HTTPException(status_code=400, detail=f"Ungültiger Service: {data.service}")

    try:
        result = subprocess.run(
            ["docker", "compose", "restart", data.service],
            capture_output=True, text=True, timeout=60,
            cwd="/root/asterisk-pbx-gui"
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Neustart fehlgeschlagen: {result.stderr}")
        logger.info(f"Service {data.service} restarted by {current_user.username}")
        log_action(db, current_user.username, "service_restarted", "service", data.service,
                   None, request.client.host if request.client else None)
        return {"status": "ok", "message": f"Service '{data.service}' wird neu gestartet"}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timeout beim Neustart")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reboot")
def reboot_server(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Reboot the entire server."""
    logger.warning(f"Server reboot initiated by {current_user.username}")
    log_action(db, current_user.username, "server_reboot", "server", None,
               None, request.client.host if request.client else None)
    try:
        subprocess.Popen(["sh", "-c", "sleep 2 && reboot"], start_new_session=True)
        return {"status": "ok", "message": "Server wird in 2 Sekunden neu gestartet"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reboot fehlgeschlagen: {str(e)}")
