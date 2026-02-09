"""
Voicemail API Router with database integration
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from database import Base, get_db, User
from auth import get_current_user
from typing import Dict, Any, List, Optional
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
VOICEMAIL_PATH = "/var/spool/asterisk/voicemail/default"

class VoicemailRecord(Base):
    __tablename__ = "voicemail_records"
    id = Column(Integer, primary_key=True, index=True)
    mailbox = Column(String(20), nullable=False, index=True)
    caller_id = Column(String(100))
    duration = Column(Integer, default=0)
    date = Column(DateTime, default=datetime.utcnow)
    is_read = Column(Boolean, default=False)
    file_path = Column(String(500), nullable=False)
    folder = Column(String(20), default="INBOX")
    msg_id = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)

def parse_voicemail_info(info_file: str) -> Dict[str, Any]:
    info = {}
    try:
        with open(info_file, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    info[key] = value
    except Exception as e:
        logger.error(f"Error parsing voicemail info: {e}")
    return info

def sync_voicemail_from_disk(db: Session):
    if not os.path.exists(VOICEMAIL_PATH):
        return
    for mailbox in os.listdir(VOICEMAIL_PATH):
        mailbox_path = os.path.join(VOICEMAIL_PATH, mailbox)
        if not os.path.isdir(mailbox_path):
            continue
        for folder in ["INBOX", "Old"]:
            folder_path = os.path.join(mailbox_path, folder)
            if not os.path.exists(folder_path):
                continue
            for filename in os.listdir(folder_path):
                if filename.startswith("msg") and filename.endswith(".txt"):
                    msg_id = filename.replace(".txt", "")
                    existing = db.query(VoicemailRecord).filter(
                        VoicemailRecord.mailbox == mailbox,
                        VoicemailRecord.msg_id == msg_id,
                        VoicemailRecord.folder == folder
                    ).first()
                    if existing:
                        continue
                    info_path = os.path.join(folder_path, filename)
                    info = parse_voicemail_info(info_path)
                    audio_file = None
                    for ext in ['.wav', '.WAV', '.wav49']:
                        audio_path = os.path.join(folder_path, f"{msg_id}{ext}")
                        if os.path.exists(audio_path):
                            audio_file = audio_path
                            break
                    if not audio_file:
                        continue
                    vm_record = VoicemailRecord(
                        mailbox=mailbox,
                        caller_id=info.get("callerid", "Unknown"),
                        duration=int(info.get("duration", 0)),
                        date=datetime.fromtimestamp(int(info.get("origtime", 0))) if info.get("origtime") else datetime.utcnow(),
                        is_read=(folder == "Old"),
                        file_path=audio_file,
                        folder=folder,
                        msg_id=msg_id
                    )
                    db.add(vm_record)
    db.commit()

@router.get("/")
async def list_voicemails(mailbox: Optional[str] = None, unread_only: Optional[bool] = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_voicemail_from_disk(db)
    query = db.query(VoicemailRecord)
    if mailbox:
        query = query.filter(VoicemailRecord.mailbox == mailbox)
    if unread_only:
        query = query.filter(VoicemailRecord.is_read == False)
    voicemails = query.order_by(VoicemailRecord.date.desc()).all()
    return [{"id": vm.id, "mailbox": vm.mailbox, "caller_id": vm.caller_id, "duration": vm.duration, "date": vm.date.isoformat(), "is_read": vm.is_read, "file_path": vm.file_path} for vm in voicemails]

@router.get("/stats")
async def get_voicemail_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sync_voicemail_from_disk(db)
    total = db.query(VoicemailRecord).count()
    unread = db.query(VoicemailRecord).filter(VoicemailRecord.is_read == False).count()
    by_mailbox = {}
    mailbox_counts = db.query(VoicemailRecord.mailbox, func.count(VoicemailRecord.id)).group_by(VoicemailRecord.mailbox).all()
    for mailbox, count in mailbox_counts:
        by_mailbox[mailbox] = count
    return {"total": total, "unread": unread, "by_mailbox": by_mailbox}

@router.get("/{voicemail_id}/audio")
async def get_voicemail_audio(voicemail_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vm = db.query(VoicemailRecord).filter(VoicemailRecord.id == voicemail_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="Voicemail not found")
    if not os.path.exists(vm.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(vm.file_path, media_type="audio/wav", filename=f"voicemail_{voicemail_id}.wav")

@router.patch("/{voicemail_id}/mark-read")
async def mark_as_read(voicemail_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vm = db.query(VoicemailRecord).filter(VoicemailRecord.id == voicemail_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="Voicemail not found")
    vm.is_read = True
    db.commit()
    db.refresh(vm)
    return {"id": vm.id, "mailbox": vm.mailbox, "caller_id": vm.caller_id, "duration": vm.duration, "date": vm.date.isoformat(), "is_read": vm.is_read, "file_path": vm.file_path}

@router.delete("/{voicemail_id}")
async def delete_voicemail(voicemail_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vm = db.query(VoicemailRecord).filter(VoicemailRecord.id == voicemail_id).first()
    if not vm:
        raise HTTPException(status_code=404, detail="Voicemail not found")
    if os.path.exists(vm.file_path):
        try:
            os.remove(vm.file_path)
            txt_path = vm.file_path.replace('.wav', '.txt').replace('.WAV', '.txt')
            if os.path.exists(txt_path):
                os.remove(txt_path)
        except Exception as e:
            logger.error(f"Error deleting files: {e}")
    db.delete(vm)
    db.commit()
    return {"success": True, "message": "Voicemail deleted"}
