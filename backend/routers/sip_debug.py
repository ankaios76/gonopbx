"""
SIP Debug API Router
Enable/disable PJSIP history capture, view captured SIP messages by Call-ID.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging
from auth import get_current_user
from database import User
from sip_debug import sip_debug_buffer

logger = logging.getLogger(__name__)
router = APIRouter()


def set_ami_client(client):
    sip_debug_buffer.set_ami_client(client)


@router.get("/status")
async def get_status(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Get SIP debug capture status."""
    sip_debug_buffer.cleanup_old()
    return {
        "enabled": sip_debug_buffer.enabled,
        "message_count": len(sip_debug_buffer._messages),
        "call_count": len(sip_debug_buffer._by_call_id),
    }


@router.post("/enable")
async def enable_capture(current_user: User = Depends(get_current_user)):
    """Enable PJSIP history and start polling for SIP messages."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        await sip_debug_buffer.enable()
        return {"status": "enabled"}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disable")
async def disable_capture(current_user: User = Depends(get_current_user)):
    """Disable PJSIP history and stop polling."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    await sip_debug_buffer.disable()
    return {"status": "disabled"}


@router.get("/calls")
async def get_calls(current_user: User = Depends(get_current_user)):
    """Get list of calls with SIP data."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return sip_debug_buffer.get_calls()


@router.get("/calls/{call_id:path}")
async def get_call_messages(call_id: str, current_user: User = Depends(get_current_user)):
    """Get SIP messages for a specific Call-ID."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    messages = sip_debug_buffer.get_call_messages(call_id)
    if not messages:
        raise HTTPException(status_code=404, detail="Call-ID nicht gefunden")
    return messages
