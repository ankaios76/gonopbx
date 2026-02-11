"""
SIP Peers API Router
CRUD operations for SIP peers management with PJSIP config generation
"""
import re
import string
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from database import get_db, SIPPeer, SIPTrunk, User, VoicemailMailbox, SystemSettings, InboundRoute, CallForward
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS
from voicemail_config import write_voicemail_config, reload_voicemail
from dialplan import write_extensions_config, reload_dialplan
from auth import get_current_user
from audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter()


def check_password_strength(password: str, extension: str = "") -> dict:
    """Check SIP password strength. Returns score (0-100), level, and warnings."""
    warnings = []
    score = 0

    if len(password) >= 16:
        score += 30
    elif len(password) >= 12:
        score += 20
    elif len(password) >= 8:
        score += 10
        warnings.append("Passwort sollte mindestens 12 Zeichen lang sein")
    else:
        warnings.append("Passwort ist zu kurz (mindestens 8 Zeichen)")

    if re.search(r'[a-z]', password):
        score += 15
    else:
        warnings.append("Kleinbuchstaben fehlen")

    if re.search(r'[A-Z]', password):
        score += 15
    else:
        warnings.append("Großbuchstaben fehlen")

    if re.search(r'\d', password):
        score += 15
    else:
        warnings.append("Ziffern fehlen")

    if re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]', password):
        score += 15
    else:
        warnings.append("Sonderzeichen fehlen")

    if extension and extension in password:
        score = max(0, score - 20)
        warnings.append("Passwort enthält die Extension-Nummer")

    common_patterns = ["password", "passwort", "123456", "qwerty", "abc123"]
    if password.lower() in common_patterns:
        score = max(0, score - 30)
        warnings.append("Passwort ist zu einfach")

    # Bonus for length > 20
    if len(password) >= 20:
        score = min(100, score + 10)

    if score >= 70:
        level = "strong"
    elif score >= 40:
        level = "medium"
    else:
        level = "weak"

    return {"score": score, "level": level, "warnings": warnings}


@router.get("/generate-password")
def generate_password(current_user: User = Depends(get_current_user)):
    """Generate a secure random 16-character password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*+-="
    while True:
        pw = ''.join(secrets.choice(alphabet) for _ in range(16))
        # Ensure it has all character types
        if (re.search(r'[a-z]', pw) and re.search(r'[A-Z]', pw)
                and re.search(r'\d', pw) and re.search(r'[!@#$%&*+\-=]', pw)):
            break
    strength = check_password_strength(pw)
    return {"password": pw, "strength": strength}


@router.get("/weak-passwords")
def get_weak_passwords(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all peers with weak passwords."""
    peers = db.query(SIPPeer).all()
    weak = []
    for peer in peers:
        strength = check_password_strength(peer.secret, peer.extension)
        if strength["level"] != "strong":
            weak.append({
                "id": peer.id,
                "extension": peer.extension,
                "caller_id": peer.caller_id,
                "strength": strength,
            })
    return weak


class SIPPeerBase(BaseModel):
    extension: str
    secret: str
    caller_id: str | None = None
    context: str = "internal"
    codecs: str | None = None
    enabled: bool = True


class PeerCodecUpdate(BaseModel):
    codecs: str | None = None


class SIPPeerCreate(SIPPeerBase):
    pass


class SIPPeerUpdate(SIPPeerBase):
    pass


class SIPPeerResponse(SIPPeerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


def regenerate_voicemail_config(db: Session):
    """Regenerate voicemail.conf from database and reload Asterisk"""
    try:
        all_mailboxes = db.query(VoicemailMailbox).all()
        write_voicemail_config(all_mailboxes)
        reload_voicemail()
        logger.info(f"✓ Voicemail config regenerated with {len(all_mailboxes)} mailboxes")
    except Exception as e:
        logger.error(f"✗ Failed to regenerate voicemail config: {e}")


def regenerate_pjsip_config(db: Session):
    """Regenerate pjsip.conf from database and reload Asterisk"""
    try:
        all_peers = db.query(SIPPeer).all()
        all_trunks = db.query(SIPTrunk).all()
        setting = db.query(SystemSettings).filter(SystemSettings.key == "global_codecs").first()
        global_codecs = setting.value if setting else DEFAULT_CODECS
        acl_setting = db.query(SystemSettings).filter(SystemSettings.key == "ip_whitelist_enabled").first()
        acl_on = acl_setting is not None and acl_setting.value == "true"
        write_pjsip_config(all_peers, all_trunks, global_codecs=global_codecs, acl_enabled=acl_on)
        reload_asterisk()
        logger.info(f"✓ PJSIP config regenerated with {len(all_peers)} peers")
    except Exception as e:
        logger.error(f"✗ Failed to regenerate PJSIP config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SIPPeerResponse])
def list_peers(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(SIPPeer).all()


@router.get("/{peer_id}", response_model=SIPPeerResponse)
def get_peer(peer_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    peer = db.query(SIPPeer).filter(SIPPeer.id == peer_id).first()
    if not peer:
        raise HTTPException(status_code=404, detail="Peer not found")
    return peer


@router.post("/", response_model=SIPPeerResponse)
def create_peer(peer: SIPPeerCreate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(SIPPeer).filter(SIPPeer.extension == peer.extension).first()
    if existing:
        raise HTTPException(status_code=400, detail="Extension already exists")

    db_peer = SIPPeer(**peer.model_dump())
    db.add(db_peer)
    db.commit()
    db.refresh(db_peer)

    # Auto-create voicemail mailbox
    existing_mb = db.query(VoicemailMailbox).filter(VoicemailMailbox.extension == peer.extension).first()
    if not existing_mb:
        mb = VoicemailMailbox(extension=peer.extension, name=peer.caller_id or peer.extension)
        db.add(mb)
        db.commit()

    logger.info(f"✓ Created SIP peer: {peer.extension}")
    log_action(db, current_user.username, "peer_created", "peer", peer.extension,
               {"caller_id": peer.caller_id}, request.client.host if request.client else None)
    regenerate_pjsip_config(db)
    regenerate_voicemail_config(db)

    # Add password strength warning
    strength = check_password_strength(peer.secret, peer.extension)
    response = SIPPeerResponse.model_validate(db_peer)
    return response


@router.put("/{peer_id}", response_model=SIPPeerResponse)
def update_peer(peer_id: int, peer: SIPPeerUpdate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_peer = db.query(SIPPeer).filter(SIPPeer.id == peer_id).first()
    if not db_peer:
        raise HTTPException(status_code=404, detail="Peer not found")

    if peer.extension != db_peer.extension:
        existing = db.query(SIPPeer).filter(SIPPeer.extension == peer.extension).first()
        if existing:
            raise HTTPException(status_code=400, detail="Extension already exists")

    for key, value in peer.model_dump().items():
        setattr(db_peer, key, value)

    db_peer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_peer)

    logger.info(f"✓ Updated SIP peer: {peer.extension}")
    log_action(db, current_user.username, "peer_updated", "peer", peer.extension,
               {"caller_id": peer.caller_id}, request.client.host if request.client else None)
    regenerate_pjsip_config(db)

    return db_peer


@router.delete("/{peer_id}")
def delete_peer(peer_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_peer = db.query(SIPPeer).filter(SIPPeer.id == peer_id).first()
    if not db_peer:
        raise HTTPException(status_code=404, detail="Peer not found")
    
    extension = db_peer.extension

    # Delete associated inbound routes (free up DIDs)
    routes = db.query(InboundRoute).filter(InboundRoute.destination_extension == extension).all()
    for route in routes:
        db.delete(route)

    # Delete associated call forwards
    forwards = db.query(CallForward).filter(CallForward.extension == extension).all()
    for fwd in forwards:
        db.delete(fwd)

    # Delete associated voicemail mailbox
    mb = db.query(VoicemailMailbox).filter(VoicemailMailbox.extension == extension).first()
    if mb:
        db.delete(mb)

    db.delete(db_peer)
    db.commit()

    logger.info(f"✓ Deleted SIP peer: {extension} (freed {len(routes)} routes, {len(forwards)} forwards)")
    log_action(db, current_user.username, "peer_deleted", "peer", extension,
               None, request.client.host if request.client else None)
    regenerate_pjsip_config(db)
    regenerate_voicemail_config(db)

    # Regenerate dialplan to remove references to deleted extension
    all_routes = db.query(InboundRoute).all()
    all_forwards = db.query(CallForward).all()
    all_mailboxes = db.query(VoicemailMailbox).all()
    write_extensions_config(all_routes, all_forwards, all_mailboxes)
    reload_dialplan()

    return {"status": "deleted", "extension": extension}


@router.patch("/{peer_id}/codecs")
def update_peer_codecs(peer_id: int, data: PeerCodecUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_peer = db.query(SIPPeer).filter(SIPPeer.id == peer_id).first()
    if not db_peer:
        raise HTTPException(status_code=404, detail="Peer not found")

    db_peer.codecs = data.codecs
    db_peer.updated_at = datetime.utcnow()
    db.commit()

    logger.info(f"Updated codecs for peer {db_peer.extension}: {data.codecs or 'global'}")
    regenerate_pjsip_config(db)

    return {"status": "ok", "codecs": db_peer.codecs}
