"""
SIP Trunks API Router
CRUD operations for SIP trunk management with PJSIP config generation
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from database import get_db, SIPTrunk, SIPPeer, User, SystemSettings
from pjsip_config import write_pjsip_config, reload_asterisk, DEFAULT_CODECS
from auth import get_current_user
from audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter()

PROVIDER_SERVERS = {
    "plusnet_basic": "sip.ipfonie.de",
    "plusnet_connect": "sipconnect.ipfonie.de",
}


class SIPTrunkBase(BaseModel):
    name: str
    provider: str
    auth_mode: str = "registration"
    sip_server: str | None = None
    username: str | None = None
    password: str | None = None
    caller_id: str | None = None
    number_block: str | None = None
    context: str = "from-trunk"
    codecs: str = "ulaw,alaw,g722"
    enabled: bool = True


class SIPTrunkCreate(SIPTrunkBase):
    pass


class SIPTrunkUpdate(SIPTrunkBase):
    pass


class SIPTrunkResponse(SIPTrunkBase):
    id: int
    sip_server: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def regenerate_config(db: Session):
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
        logger.info(f"PJSIP config regenerated with {len(all_peers)} peers, {len(all_trunks)} trunks")
    except Exception as e:
        logger.error(f"Failed to regenerate PJSIP config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SIPTrunkResponse])
def list_trunks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(SIPTrunk).all()


@router.post("/", response_model=SIPTrunkResponse)
def create_trunk(trunk: SIPTrunkCreate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(SIPTrunk).filter(SIPTrunk.name == trunk.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Trunk name already exists")

    if trunk.auth_mode == "registration" and (not trunk.username or not trunk.password):
        raise HTTPException(status_code=400, detail="Username and password required for registration auth")

    # Determine SIP server: known provider or custom
    if trunk.provider in PROVIDER_SERVERS:
        sip_server = PROVIDER_SERVERS[trunk.provider]
    elif trunk.sip_server:
        sip_server = trunk.sip_server
    else:
        raise HTTPException(status_code=400, detail="SIP-Server muss angegeben werden")

    trunk_data = trunk.model_dump()
    trunk_data["sip_server"] = sip_server

    db_trunk = SIPTrunk(**trunk_data)
    db.add(db_trunk)
    db.commit()
    db.refresh(db_trunk)

    logger.info(f"Created SIP trunk: {trunk.name}")
    log_action(db, current_user.username, "trunk_created", "trunk", trunk.name,
               {"provider": trunk.provider}, request.client.host if request.client else None)
    regenerate_config(db)

    return db_trunk


@router.put("/{trunk_id}", response_model=SIPTrunkResponse)
def update_trunk(trunk_id: int, trunk: SIPTrunkUpdate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_trunk = db.query(SIPTrunk).filter(SIPTrunk.id == trunk_id).first()
    if not db_trunk:
        raise HTTPException(status_code=404, detail="Trunk not found")

    if trunk.name != db_trunk.name:
        existing = db.query(SIPTrunk).filter(SIPTrunk.name == trunk.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Trunk name already exists")

    if trunk.auth_mode == "registration" and (not trunk.username or not trunk.password):
        raise HTTPException(status_code=400, detail="Username and password required for registration auth")

    # Determine SIP server: known provider or custom
    if trunk.provider in PROVIDER_SERVERS:
        sip_server = PROVIDER_SERVERS[trunk.provider]
    elif trunk.sip_server:
        sip_server = trunk.sip_server
    else:
        raise HTTPException(status_code=400, detail="SIP-Server muss angegeben werden")

    for key, value in trunk.model_dump().items():
        setattr(db_trunk, key, value)

    db_trunk.sip_server = sip_server
    db_trunk.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_trunk)

    logger.info(f"Updated SIP trunk: {trunk.name}")
    log_action(db, current_user.username, "trunk_updated", "trunk", trunk.name,
               {"provider": trunk.provider}, request.client.host if request.client else None)
    regenerate_config(db)

    return db_trunk


@router.delete("/{trunk_id}")
def delete_trunk(trunk_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_trunk = db.query(SIPTrunk).filter(SIPTrunk.id == trunk_id).first()
    if not db_trunk:
        raise HTTPException(status_code=404, detail="Trunk not found")

    name = db_trunk.name
    db.delete(db_trunk)
    db.commit()

    logger.info(f"Deleted SIP trunk: {name}")
    log_action(db, current_user.username, "trunk_deleted", "trunk", name,
               None, request.client.host if request.client else None)
    regenerate_config(db)

    return {"status": "deleted", "name": name}
