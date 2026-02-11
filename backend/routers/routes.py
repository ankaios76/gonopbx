"""
Inbound Routes API Router
Maps DID numbers to extensions and generates dialplan
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime
import logging

from database import get_db, InboundRoute, SIPTrunk, SIPPeer, User, CallForward, VoicemailMailbox
from dialplan import write_extensions_config, reload_dialplan
from auth import get_current_user
from audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter()


class InboundRouteBase(BaseModel):
    did: str
    trunk_id: int
    destination_extension: str
    description: str | None = None
    enabled: bool = True


class InboundRouteCreate(InboundRouteBase):
    pass


class InboundRouteUpdate(InboundRouteBase):
    pass


class InboundRouteResponse(InboundRouteBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def regenerate_dialplan(db: Session):
    """Regenerate extensions.conf and reload Asterisk dialplan"""
    try:
        all_routes = db.query(InboundRoute).filter(InboundRoute.enabled == True).all()
        all_forwards = db.query(CallForward).filter(CallForward.enabled == True).all()
        all_mailboxes = db.query(VoicemailMailbox).all()
        write_extensions_config(all_routes, all_forwards, all_mailboxes)
        reload_dialplan()
        logger.info(f"Dialplan regenerated with {len(all_routes)} inbound routes")
    except Exception as e:
        logger.error(f"Failed to regenerate dialplan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[InboundRouteResponse])
def list_routes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(InboundRoute).all()


@router.get("/by-extension/{extension}", response_model=List[InboundRouteResponse])
def list_routes_by_extension(extension: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get all inbound routes pointing to a specific extension"""
    return db.query(InboundRoute).filter(InboundRoute.destination_extension == extension).all()


@router.post("/", response_model=InboundRouteResponse)
def create_route(route: InboundRouteCreate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Validate DID uniqueness
    existing = db.query(InboundRoute).filter(InboundRoute.did == route.did).first()
    if existing:
        raise HTTPException(status_code=400, detail="DID already assigned")

    # Validate trunk exists
    trunk = db.query(SIPTrunk).filter(SIPTrunk.id == route.trunk_id).first()
    if not trunk:
        raise HTTPException(status_code=400, detail="Trunk not found")

    # Validate destination extension exists
    peer = db.query(SIPPeer).filter(SIPPeer.extension == route.destination_extension).first()
    if not peer:
        raise HTTPException(status_code=400, detail="Destination extension not found")

    db_route = InboundRoute(**route.model_dump())
    db.add(db_route)
    db.commit()
    db.refresh(db_route)

    logger.info(f"Created inbound route: {route.did} -> {route.destination_extension}")
    log_action(db, current_user.username, "route_created", "route", route.did,
               {"destination": route.destination_extension}, request.client.host if request.client else None)
    regenerate_dialplan(db)

    return db_route


@router.put("/{route_id}", response_model=InboundRouteResponse)
def update_route(route_id: int, route: InboundRouteUpdate, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_route = db.query(InboundRoute).filter(InboundRoute.id == route_id).first()
    if not db_route:
        raise HTTPException(status_code=404, detail="Route not found")

    if route.did != db_route.did:
        existing = db.query(InboundRoute).filter(InboundRoute.did == route.did).first()
        if existing:
            raise HTTPException(status_code=400, detail="DID already assigned")

    for key, value in route.model_dump().items():
        setattr(db_route, key, value)

    db_route.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_route)

    logger.info(f"Updated inbound route: {route.did} -> {route.destination_extension}")
    log_action(db, current_user.username, "route_updated", "route", route.did,
               {"destination": route.destination_extension}, request.client.host if request.client else None)
    regenerate_dialplan(db)

    return db_route


@router.delete("/{route_id}")
def delete_route(route_id: int, request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_route = db.query(InboundRoute).filter(InboundRoute.id == route_id).first()
    if not db_route:
        raise HTTPException(status_code=404, detail="Route not found")

    did = db_route.did
    db.delete(db_route)
    db.commit()

    logger.info(f"Deleted inbound route: {did}")
    log_action(db, current_user.username, "route_deleted", "route", did,
               None, request.client.host if request.client else None)
    regenerate_dialplan(db)

    return {"status": "deleted", "did": did}
