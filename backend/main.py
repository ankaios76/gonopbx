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
from auth import get_password_hash, get_current_user
from database import SessionLocal, User

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

    # Seed admin user if not exists
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@gonopbx.local",
                password_hash=get_password_hash(os.getenv("ADMIN_PASSWORD", "GonoPBX2026!")),
                full_name="Administrator",
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info("Admin user created")
        else:
            logger.info("Admin user already exists")
    finally:
        db.close()

    # Initialize AMI client
    ami_client = AsteriskAMIClient()
    
    # Set AMI client in dashboard router
    dashboard.set_ami_client(ami_client)
    
    # Set broadcast callback
    ami_client.set_broadcast_callback(manager.broadcast)
    
    # Start AMI connection in background
    asyncio.create_task(ami_client.connect())
    
    # Wait a bit for AMI to connect
    await asyncio.sleep(2)
    
    logger.info("Backend startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down backend...")
    if ami_client:
        await ami_client.disconnect()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Asterisk PBX GUI API",
    description="REST API for Asterisk PBX Management",
    version="0.1.0",
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
