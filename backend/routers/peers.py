"""
SIP Peers API Router
CRUD operations for SIP peers management with PJSIP config generation
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from database import get_db, SIPPeer, SIPTrunk, User, VoicemailMailbox, SystemSettings
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS
from voicemail_config import write_voicemail_config, reload_voicemail
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


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
        write_pjsip_config(all_peers, all_trunks, global_codecs=global_codecs)
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
def create_peer(peer: SIPPeerCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
    regenerate_pjsip_config(db)
    regenerate_voicemail_config(db)

    return db_peer


@router.put("/{peer_id}", response_model=SIPPeerResponse)
def update_peer(peer_id: int, peer: SIPPeerUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
    regenerate_pjsip_config(db)
    
    return db_peer


@router.delete("/{peer_id}")
def delete_peer(peer_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_peer = db.query(SIPPeer).filter(SIPPeer.id == peer_id).first()
    if not db_peer:
        raise HTTPException(status_code=404, detail="Peer not found")
    
    extension = db_peer.extension

    # Delete associated voicemail mailbox
    mb = db.query(VoicemailMailbox).filter(VoicemailMailbox.extension == extension).first()
    if mb:
        db.delete(mb)

    db.delete(db_peer)
    db.commit()

    logger.info(f"✓ Deleted SIP peer: {extension}")
    regenerate_pjsip_config(db)
    regenerate_voicemail_config(db)

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
