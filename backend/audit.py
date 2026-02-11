"""
Audit logging helper
"""
import json
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from database import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    username: str,
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    details: dict = None,
    ip_address: str = None,
):
    """Log an action to the audit log."""
    try:
        entry = AuditLog(
            timestamp=datetime.utcnow(),
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=json.dumps(details, default=str) if details else None,
            ip_address=ip_address,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        db.rollback()
