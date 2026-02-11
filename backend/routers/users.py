"""
User Management Router
Admin-only CRUD operations for users
"""

import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db, User, SIPPeer, SystemSettings
from auth import get_password_hash, require_admin
from audit import log_action
from email_config import send_welcome_email

router = APIRouter()

UPLOAD_DIR = "/app/uploads/avatars"


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
    full_name: Optional[str] = None
    email: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class PasswordChange(BaseModel):
    password: str


class ExtensionAssign(BaseModel):
    extension: Optional[str] = None


class WelcomeEmailRequest(BaseModel):
    login_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str]
    email: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[UserResponse])
def list_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(User).all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.username == user_data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists",
        )

    user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
        full_name=user_data.full_name or user_data.username,
        email=user_data.email or f"{user_data.username}@gonopbx.local",
    )
    db.add(user)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benutzer konnte nicht erstellt werden (evtl. Benutzername oder E-Mail bereits vergeben)",
        )
    db.refresh(user)
    log_action(db, admin.username, "user_created", "user", user_data.username,
               {"role": user_data.role}, request.client.host if request.client else None)
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.role is not None:
        user.role = data.role

    db.commit()
    db.refresh(user)
    log_action(db, admin.username, "user_updated", "user", user.username,
               {"full_name": data.full_name, "email": data.email, "role": data.role},
               request.client.host if request.client else None)
    return user


@router.post("/{user_id}/avatar")
def upload_avatar(
    user_id: int,
    request: Request,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP images allowed")

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    ext = "jpg" if "jpeg" in file.content_type else file.content_type.split("/")[1]
    filename = f"{user_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    user.avatar_url = f"/api/users/{user_id}/avatar"
    db.commit()

    log_action(db, admin.username, "avatar_uploaded", "user", user.username,
               None, request.client.host if request.client else None)
    return {"avatar_url": user.avatar_url}


@router.get("/{user_id}/avatar")
def get_avatar(user_id: int):
    for ext in ("jpg", "png", "webp"):
        filepath = os.path.join(UPLOAD_DIR, f"{user_id}.{ext}")
        if os.path.exists(filepath):
            media_type = "image/jpeg" if ext == "jpg" else f"image/{ext}"
            return FileResponse(filepath, media_type=media_type)
    raise HTTPException(status_code=404, detail="Avatar not found")


@router.patch("/{user_id}/extension")
def assign_extension_to_user(
    user_id: int,
    data: ExtensionAssign,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Clear any existing assignment for this user
    old_peers = db.query(SIPPeer).filter(SIPPeer.user_id == user_id).all()
    for p in old_peers:
        p.user_id = None

    if data.extension:
        peer = db.query(SIPPeer).filter(SIPPeer.extension == data.extension).first()
        if not peer:
            raise HTTPException(status_code=404, detail="Extension not found")
        peer.user_id = user_id

    db.commit()
    log_action(db, admin.username, "extension_assigned", "user", user.username,
               {"extension": data.extension}, request.client.host if request.client else None)
    return {"message": "Extension assigned", "extension": data.extension}


SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_tls", "smtp_user", "smtp_password", "smtp_from"]


@router.post("/{user_id}/send-welcome")
def send_welcome(
    user_id: int,
    data: WelcomeEmailRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send welcome email with login and SIP credentials"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.email or user.email.endswith("@gonopbx.local"):
        raise HTTPException(status_code=400, detail="Benutzer hat keine gültige E-Mail-Adresse")

    # Load SMTP settings
    smtp_settings = {}
    for key in SMTP_KEYS:
        s = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        smtp_settings[key] = s.value if s else ""

    if not smtp_settings.get("smtp_host"):
        raise HTTPException(status_code=400, detail="SMTP ist nicht konfiguriert")

    # Find assigned extension
    peer = db.query(SIPPeer).filter(SIPPeer.user_id == user_id).first()
    extension = peer.extension if peer else None
    sip_password = peer.secret if peer else None

    success = send_welcome_email(
        settings=smtp_settings,
        to_address=user.email,
        full_name=user.full_name or user.username,
        username=user.username,
        login_password=data.login_password,
        extension=extension,
        sip_password=sip_password,
    )

    if not success:
        raise HTTPException(status_code=500, detail="E-Mail konnte nicht gesendet werden")

    log_action(db, admin.username, "welcome_email_sent", "user", user.username,
               {"email": user.email}, request.client.host if request.client else None)
    return {"message": f"Willkommens-E-Mail an {user.email} gesendet"}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.username == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the admin account",
        )

    username = user.username
    db.delete(user)
    db.commit()
    log_action(db, admin.username, "user_deleted", "user", username,
               None, request.client.host if request.client else None)
    return {"message": f"User '{username}' deleted"}


@router.patch("/{user_id}/password")
def change_password(
    user_id: int,
    data: PasswordChange,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )

    user.password_hash = get_password_hash(data.password)
    db.commit()
    log_action(db, admin.username, "password_changed", "user", user.username,
               None, request.client.host if request.client else None)
    return {"message": f"Password for '{user.username}' changed"}
