"""
Settings Router - Admin-only system settings management
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db, SystemSettings, VoicemailMailbox, SIPPeer, SIPTrunk
from auth import require_admin, User
from email_config import write_msmtp_config, send_test_email
from voicemail_config import write_voicemail_config, reload_voicemail
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS

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
    write_pjsip_config(all_peers, all_trunks, global_codecs=",".join(codecs))
    reload_asterisk()

    return {"status": "ok", "global_codecs": ",".join(codecs)}
