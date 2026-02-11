"""
Call Forwarding API Router
Manages call forwarding rules per extension
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from database import get_db, CallForward, SIPPeer, User, VoicemailMailbox
from dialplan import write_extensions_config, reload_dialplan
from database import InboundRoute
from auth import get_current_user
from audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter()


class CallForwardBase(BaseModel):
    extension: str
    forward_type: str  # unconditional, busy, no_answer
    destination: str
    ring_time: int = 20
    enabled: bool = True


class CallForwardCreate(CallForwardBase):
    pass


class CallForwardUpdate(BaseModel):
    destination: str | None = None
    ring_time: int | None = None
    enabled: bool | None = None


class CallForwardResponse(CallForwardBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


VALID_FORWARD_TYPES = {"unconditional", "busy", "no_answer"}


def regenerate_dialplan(db: Session):
    """Regenerate dialplan after forwarding changes"""
    try:
        all_routes = db.query(InboundRoute).filter(InboundRoute.enabled == True).all()
        all_forwards = db.query(CallForward).filter(CallForward.enabled == True).all()
        all_mailboxes = db.query(VoicemailMailbox).all()
        write_extensions_config(all_routes, all_forwards, all_mailboxes)
        reload_dialplan()
        logger.info("Dialplan regenerated after call forward change")
    except Exception as e:
        logger.error(f"Failed to regenerate dialplan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-extension/{extension}", response_model=List[CallForwardResponse])
def get_forwards_by_extension(
    extension: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(CallForward).filter(CallForward.extension == extension).all()


@router.post("/", response_model=CallForwardResponse)
def create_forward(
    forward: CallForwardCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if forward.forward_type not in VALID_FORWARD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid forward_type. Must be one of: {VALID_FORWARD_TYPES}")

    # Validate extension exists
    peer = db.query(SIPPeer).filter(SIPPeer.extension == forward.extension).first()
    if not peer:
        raise HTTPException(status_code=400, detail="Extension not found")

    # Check for duplicate forward type on same extension
    existing = db.query(CallForward).filter(
        CallForward.extension == forward.extension,
        CallForward.forward_type == forward.forward_type,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Forward type '{forward.forward_type}' already exists for extension {forward.extension}",
        )

    db_forward = CallForward(**forward.model_dump())
    db.add(db_forward)
    db.commit()
    db.refresh(db_forward)

    logger.info(f"Created call forward: {forward.extension} ({forward.forward_type}) -> {forward.destination}")
    log_action(db, current_user.username, "callforward_created", "callforward", forward.extension,
               {"type": forward.forward_type, "destination": forward.destination},
               request.client.host if request.client else None)
    regenerate_dialplan(db)

    return db_forward


@router.put("/{forward_id}", response_model=CallForwardResponse)
def update_forward(
    forward_id: int,
    update: CallForwardUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_forward = db.query(CallForward).filter(CallForward.id == forward_id).first()
    if not db_forward:
        raise HTTPException(status_code=404, detail="Call forward not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_forward, key, value)

    db_forward.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_forward)

    logger.info(f"Updated call forward #{forward_id}")
    log_action(db, current_user.username, "callforward_updated", "callforward", str(forward_id),
               None, request.client.host if request.client else None)
    regenerate_dialplan(db)

    return db_forward


@router.delete("/{forward_id}")
def delete_forward(
    forward_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_forward = db.query(CallForward).filter(CallForward.id == forward_id).first()
    if not db_forward:
        raise HTTPException(status_code=404, detail="Call forward not found")

    ext = db_forward.extension
    ftype = db_forward.forward_type
    db.delete(db_forward)
    db.commit()

    logger.info(f"Deleted call forward: {ext} ({ftype})")
    log_action(db, current_user.username, "callforward_deleted", "callforward", ext,
               {"type": ftype}, request.client.host if request.client else None)
    regenerate_dialplan(db)

    return {"status": "deleted"}
