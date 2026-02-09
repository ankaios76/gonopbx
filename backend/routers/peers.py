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

from database import get_db, SIPPeer, SIPTrunk, User
from pjsip_config import write_pjsip_config, reload_asterisk
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class SIPPeerBase(BaseModel):
    extension: str
    secret: str
    caller_id: str | None = None
    context: str = "internal"
    enabled: bool = True


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


def regenerate_pjsip_config(db: Session):
    """Regenerate pjsip.conf from database and reload Asterisk"""
    try:
        all_peers = db.query(SIPPeer).all()
        all_trunks = db.query(SIPTrunk).all()
        write_pjsip_config(all_peers, all_trunks)
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
    
    logger.info(f"✓ Created SIP peer: {peer.extension}")
    regenerate_pjsip_config(db)
    
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
    db.delete(db_peer)
    db.commit()
    
    logger.info(f"✓ Deleted SIP peer: {extension}")
    regenerate_pjsip_config(db)
    
    return {"status": "deleted", "extension": extension}
