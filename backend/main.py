"""
Asterisk PBX GUI - Backend API
FastAPI application with Asterisk AMI integration
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import our modules
import os
from ami_client import AsteriskAMIClient
from database import engine, Base
from routers import peers, trunks, routes, dashboard, cdr, voicemail, callforward
from routers import auth as auth_router, users as users_router
from routers import settings as settings_router
from routers import audit as audit_router
from routers import sip_debug as sip_debug_router
from auth import get_password_hash, get_current_user
from database import SessionLocal, User, SIPPeer, VoicemailMailbox, SystemSettings
from voicemail_config import write_voicemail_config, reload_voicemail
from email_config import write_msmtp_config
from mqtt_client import mqtt_publisher
from version import VERSION

# Global AMI client instance
ami_client = None


# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()


# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global ami_client
    
    # Startup
    logger.info("Starting Asterisk PBX GUI Backend...")
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Migrate: add codecs column to sip_peers if missing
    try:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('sip_peers')]
        if 'codecs' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE sip_peers ADD COLUMN codecs VARCHAR(200)"))
                conn.commit()
            logger.info("Migration: added codecs column to sip_peers")
    except Exception as e:
        logger.warning(f"Migration check for codecs column: {e}")

    # Migrate: add ring_timeout column to voicemail_mailboxes if missing
    try:
        from sqlalchemy import text, inspect as sa_inspect
        vm_inspector = sa_inspect(engine)
        vm_columns = [c['name'] for c in vm_inspector.get_columns('voicemail_mailboxes')]
        if 'ring_timeout' not in vm_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE voicemail_mailboxes ADD COLUMN ring_timeout INTEGER DEFAULT 20"))
                conn.commit()
            logger.info("Migration: added ring_timeout column to voicemail_mailboxes")
    except Exception as e:
        logger.warning(f"Migration check for ring_timeout column: {e}")

    # Migrate: add outbound_cid and pai columns to sip_peers if missing
    try:
        from sqlalchemy import text, inspect as sa_inspect_peers
        peers_inspector = sa_inspect_peers(engine)
        peer_columns = [c['name'] for c in peers_inspector.get_columns('sip_peers')]
        with engine.connect() as conn:
            if 'outbound_cid' not in peer_columns:
                conn.execute(text("ALTER TABLE sip_peers ADD COLUMN outbound_cid VARCHAR(50)"))
                logger.info("Migration: added outbound_cid column to sip_peers")
            if 'pai' not in peer_columns:
                conn.execute(text("ALTER TABLE sip_peers ADD COLUMN pai VARCHAR(50)"))
                logger.info("Migration: added pai column to sip_peers")
            conn.commit()
    except Exception as e:
        logger.warning(f"Migration check for outbound_cid/pai columns: {e}")

    # Migrate: add avatar_url column to users if missing
    try:
        from sqlalchemy import text, inspect as sa_inspect_users
        users_inspector = sa_inspect_users(engine)
        users_columns = [c['name'] for c in users_inspector.get_columns('users')]
        if 'avatar_url' not in users_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255)"))
                conn.commit()
            logger.info("Migration: added avatar_url column to users")
    except Exception as e:
        logger.warning(f"Migration check for avatar_url column: {e}")

    # Migrate: drop unique constraint on users.email if it exists
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key"))
            conn.commit()
        logger.info("Migration: dropped unique constraint on users.email")
    except Exception as e:
        logger.warning(f"Migration check for users.email unique constraint: {e}")

    # Migrate: create audit_logs table if missing
    try:
        from sqlalchemy import text, inspect as sa_inspect2
        al_inspector = sa_inspect2(engine)
        if 'audit_logs' not in al_inspector.get_table_names():
            from database import AuditLog
            AuditLog.__table__.create(bind=engine)
            logger.info("Migration: created audit_logs table")
    except Exception as e:
        logger.warning(f"Migration check for audit_logs table: {e}")

    # Seed admin user if not exists
    db = SessionLocal()
    try:
        admin_pw = os.getenv("ADMIN_PASSWORD", "GonoPBX2026!")
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@gonopbx.local",
                password_hash=get_password_hash(admin_pw),
                full_name="Administrator",
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info("Admin user created")
        else:
            # Update password to match current ADMIN_PASSWORD env var
            admin.password_hash = get_password_hash(admin_pw)
            db.commit()
            logger.info("Admin user password synced with ADMIN_PASSWORD env")
        # Migrate: create voicemail mailboxes for existing peers
        peers = db.query(SIPPeer).all()
        created = 0
        for peer in peers:
            existing_mb = db.query(VoicemailMailbox).filter(VoicemailMailbox.extension == peer.extension).first()
            if not existing_mb:
                mb = VoicemailMailbox(extension=peer.extension, name=peer.caller_id or peer.extension)
                db.add(mb)
                created += 1
        if created > 0:
            db.commit()
            logger.info(f"Created {created} voicemail mailboxes for existing peers")

        # Load SMTP settings from DB
        smtp_settings = {}
        for key in ["smtp_host", "smtp_port", "smtp_tls", "smtp_user", "smtp_password", "smtp_from"]:
            s = db.query(SystemSettings).filter(SystemSettings.key == key).first()
            smtp_settings[key] = s.value if s else ""

        # Write msmtp config if SMTP is configured
        if smtp_settings.get("smtp_host"):
            write_msmtp_config(smtp_settings)
            logger.info("msmtp config written to Asterisk container")

        # Regenerate voicemail.conf with SMTP settings
        all_mailboxes = db.query(VoicemailMailbox).all()
        write_voicemail_config(all_mailboxes, smtp_settings)
        reload_voicemail()
        logger.info(f"Voicemail config generated with {len(all_mailboxes)} mailboxes")
    finally:
        db.close()

    # Load Home Assistant settings from DB
    try:
        from auth import update_ha_api_key
        ha_settings = {}
        for key in ["ha_enabled", "ha_api_key", "mqtt_broker", "mqtt_port", "mqtt_user", "mqtt_password"]:
            s = db.query(SystemSettings).filter(SystemSettings.key == key).first()
            ha_settings[key] = s.value if s else ""

        if ha_settings.get("ha_api_key"):
            update_ha_api_key(ha_settings["ha_api_key"])
            logger.info("HA API key loaded from DB")

        if ha_settings.get("ha_enabled") == "true" and ha_settings.get("mqtt_broker"):
            mqtt_publisher.reconfigure(
                broker=ha_settings["mqtt_broker"],
                port=int(ha_settings.get("mqtt_port") or 1883),
                user=ha_settings.get("mqtt_user", ""),
                password=ha_settings.get("mqtt_password", ""),
            )
            logger.info(f"MQTT configured from DB: {ha_settings['mqtt_broker']}")
    except Exception as e:
        logger.warning(f"Failed to load HA settings from DB: {e}")

    # Initialize AMI client
    ami_client = AsteriskAMIClient()
    
    # Set AMI client in dashboard and trunks router
    dashboard.set_ami_client(ami_client)
    trunks.set_ami_client(ami_client)
    sip_debug_router.set_ami_client(ami_client)
    
    # Set broadcast callback
    ami_client.set_broadcast_callback(manager.broadcast)
    
    # Connect MQTT publisher if not already configured from DB settings
    if not mqtt_publisher.connected and mqtt_publisher.enabled:
        mqtt_publisher.connect()

    # Start AMI connection in background
    asyncio.create_task(ami_client.connect())

    # Wait a bit for AMI to connect
    await asyncio.sleep(2)

    logger.info("Backend startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down backend...")
    mqtt_publisher.disconnect()
    if ami_client:
        await ami_client.disconnect()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Asterisk PBX GUI API",
    description="REST API for Asterisk PBX Management",
    version=VERSION,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users_router.router, prefix="/api/users", tags=["Users"])
app.include_router(peers.router, prefix="/api/peers", tags=["SIP Peers"])
app.include_router(trunks.router, prefix="/api/trunks", tags=["SIP Trunks"])
app.include_router(routes.router, prefix="/api/routes", tags=["Inbound Routes"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(cdr.router, prefix="/api/cdr", tags=["Call Records"])
app.include_router(voicemail.router, prefix="/api/voicemail", tags=["Voicemail"])
app.include_router(callforward.router, prefix="/api/callforward", tags=["Call Forwarding"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["Settings"])
app.include_router(audit_router.router, prefix="/api/audit", tags=["Audit"])
app.include_router(sip_debug_router.router, prefix="/api/sip-debug", tags=["SIP Debug"])


# Root endpoint
@app.get("/")
async def root():
    """API root - health check"""
    return {
        "name": "Asterisk PBX GUI API",
        "version": "0.1.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat()
    }


# Health check
@app.get("/api/health")
async def health_check():
    """System health check"""
    global ami_client
    
    asterisk_status = "disconnected"
    if ami_client and ami_client.connected:
        asterisk_status = "connected"
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "api": "running",
            "asterisk": asterisk_status,
            "database": "connected"
        }
    }


from pydantic import BaseModel


class OriginateRequest(BaseModel):
    extension: str
    number: str


# Originate a call (used by Home Assistant integration)
@app.post("/api/calls/originate")
async def originate_call(
    req: OriginateRequest,
    current_user: User = Depends(get_current_user),
):
    """Originate a call: rings the extension first, then dials the number."""
    global ami_client

    if not ami_client or not ami_client.connected:
        raise HTTPException(status_code=503, detail="Asterisk not connected")

    try:
        response = await ami_client.send_action(
            'Originate',
            Channel=f'PJSIP/{req.extension}',
            Exten=req.number,
            Context='from-internal',
            Priority='1',
            CallerID=req.extension,
            Timeout='30000',
            Async='true',
        )
        return {"status": "ok", "message": f"Calling {req.number} from {req.extension}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Active calls endpoint
@app.get("/api/calls/active")
async def get_active_calls(current_user: User = Depends(get_current_user)):
    """Get currently active calls"""
    global ami_client
    
    if ami_client and ami_client.connected:
        calls = await ami_client.get_active_channels()
        return {
            "calls": calls,
            "count": len(calls),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    return {
        "calls": [],
        "count": 0,
        "timestamp": datetime.utcnow().isoformat()
    }


# WebSocket endpoint for live updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    """WebSocket connection for real-time updates"""
    # Validate token for WebSocket connections
    if token:
        from jose import JWTError, jwt as jose_jwt
        from auth import JWT_SECRET, JWT_ALGORITHM
        try:
            jose_jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except JWTError:
            await websocket.close(code=4001)
            return
    else:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket)
    
    try:
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if ami_client:
            calls = await ami_client.get_active_channels()
            await websocket.send_json({
                "type": "active_calls",
                "active_calls": calls,
                "timestamp": datetime.utcnow().isoformat()
            })
        
        while True:
            data = await websocket.receive_text()
            logger.info(f"Received WebSocket message: {data}")
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
