"""
Call Detail Records (CDR) API Router
Call history and statistics
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from database import get_db, CDR, User
from auth import get_current_user

router = APIRouter()


# Pydantic schemas
class CDRResponse(BaseModel):
    id: int
    call_date: datetime
    clid: str | None
    src: str | None
    dst: str | None
    channel: str | None
    dstchannel: str | None
    duration: int | None
    billsec: int | None
    disposition: str | None
    uniqueid: str | None
    
    class Config:
        from_attributes = True


class CDRStatsResponse(BaseModel):
    total_calls: int
    answered_calls: int
    missed_calls: int
    busy_calls: int
    failed_calls: int
    total_duration: int
    total_billsec: int
    avg_duration: float
    avg_billsec: float
    calls_today: int
    calls_this_week: int
    calls_this_month: int


@router.get("/", response_model=List[CDRResponse])
async def list_cdr(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    src: Optional[str] = None,
    dst: Optional[str] = None,
    disposition: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get call detail records with optional filters"""
    
    query = db.query(CDR)
    
    # Apply filters
    if src:
        query = query.filter(CDR.src.ilike(f"%{src}%"))
    if dst:
        query = query.filter(CDR.dst.ilike(f"%{dst}%"))
    if disposition:
        query = query.filter(CDR.disposition == disposition.upper())
    if date_from:
        query = query.filter(CDR.call_date >= date_from)
    if date_to:
        query = query.filter(CDR.call_date <= date_to)
    
    # Order and paginate
    records = query.order_by(CDR.call_date.desc()).offset(offset).limit(limit).all()
    return records


@router.get("/count")
async def count_cdr(
    src: Optional[str] = None,
    dst: Optional[str] = None,
    disposition: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total count of CDR records (for pagination)"""
    
    query = db.query(func.count(CDR.id))
    
    if src:
        query = query.filter(CDR.src.ilike(f"%{src}%"))
    if dst:
        query = query.filter(CDR.dst.ilike(f"%{dst}%"))
    if disposition:
        query = query.filter(CDR.disposition == disposition.upper())
    if date_from:
        query = query.filter(CDR.call_date >= date_from)
    if date_to:
        query = query.filter(CDR.call_date <= date_to)
    
    return {"count": query.scalar()}


@router.get("/stats", response_model=CDRStatsResponse)
async def get_cdr_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get comprehensive call statistics"""
    
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    # Total counts by disposition
    total_calls = db.query(func.count(CDR.id)).scalar() or 0
    answered_calls = db.query(func.count(CDR.id)).filter(CDR.disposition == 'ANSWERED').scalar() or 0
    missed_calls = db.query(func.count(CDR.id)).filter(CDR.disposition == 'NO ANSWER').scalar() or 0
    busy_calls = db.query(func.count(CDR.id)).filter(CDR.disposition == 'BUSY').scalar() or 0
    failed_calls = db.query(func.count(CDR.id)).filter(CDR.disposition == 'FAILED').scalar() or 0
    
    # Duration stats
    total_duration = db.query(func.sum(CDR.duration)).scalar() or 0
    total_billsec = db.query(func.sum(CDR.billsec)).scalar() or 0
    avg_duration = db.query(func.avg(CDR.duration)).scalar() or 0
    avg_billsec = db.query(func.avg(CDR.billsec)).filter(CDR.billsec > 0).scalar() or 0
    
    # Time-based counts
    calls_today = db.query(func.count(CDR.id)).filter(CDR.call_date >= today_start).scalar() or 0
    calls_this_week = db.query(func.count(CDR.id)).filter(CDR.call_date >= week_start).scalar() or 0
    calls_this_month = db.query(func.count(CDR.id)).filter(CDR.call_date >= month_start).scalar() or 0
    
    return CDRStatsResponse(
        total_calls=total_calls,
        answered_calls=answered_calls,
        missed_calls=missed_calls,
        busy_calls=busy_calls,
        failed_calls=failed_calls,
        total_duration=total_duration,
        total_billsec=total_billsec,
        avg_duration=round(avg_duration, 1),
        avg_billsec=round(avg_billsec, 1),
        calls_today=calls_today,
        calls_this_week=calls_this_week,
        calls_this_month=calls_this_month
    )


@router.get("/recent")
async def get_recent_calls(limit: int = 10, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get most recent calls for dashboard widget"""
    
    records = db.query(CDR).order_by(CDR.call_date.desc()).limit(limit).all()
    
    return {
        "calls": [
            {
                "id": r.id,
                "time": r.call_date.isoformat() if r.call_date else None,
                "src": r.src,
                "dst": r.dst,
                "duration": r.duration,
                "billsec": r.billsec,
                "disposition": r.disposition
            }
            for r in records
        ],
        "count": len(records)
    }
