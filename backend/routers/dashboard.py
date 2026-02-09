"""
Dashboard API Router
Real-time statistics and system status with REAL Asterisk data
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any
from datetime import datetime
from sqlalchemy import text
import logging
from database import SessionLocal, User, SIPPeer, SIPTrunk
from auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Reference to AMI client (set from main.py)
ami_client = None

def set_ami_client(client):
    global ami_client
    ami_client = client

@router.get("/status")
async def get_dashboard_status(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Get current system status for dashboard"""
    
    asterisk_status = "disconnected"
    endpoints = []
    
    # Check Asterisk connection and get endpoints
    if ami_client and ami_client.connected:
        asterisk_status = "connected"
        
        try:
            response = await ami_client.manager.send_action({
                'Action': 'PJSIPShowEndpoints'
            })
            
            if response:
                for item in response:
                    # Item ist bereits ein dict-ähnliches Objekt
                    event = item.get('Event', '')
                    
                    if event == 'EndpointList':
                        endpoint = item.get('ObjectName', '')
                        device_state = item.get('DeviceState', '')
                        
                        # Hole Contact-Infos für RTT
                        rtt_ms = 0
                        try:
                            contact_response = await ami_client.manager.send_action({
                                'Action': 'PJSIPShowContacts',
                                'Endpoint': endpoint
                            })
                            
                            if contact_response:
                                for contact_item in contact_response:
                                    if contact_item.get('Event') == 'ContactList':
                                        rtt = contact_item.get('RoundtripUsec', '0')
                                        try:
                                            rtt_ms = float(rtt) / 1000
                                        except:
                                            rtt_ms = 0
                                        break
                        except:
                            pass
                        
                        # Status basiert auf DeviceState
                        status = 'online' if device_state == 'Not in use' else 'offline'
                        
                        endpoints.append({
                            'endpoint': endpoint,
                            'status': status,
                            'rtt': round(rtt_ms, 1)
                        })
                        
        except Exception as e:
            logger.error(f"Error fetching endpoints: {e}")
    
    # Build lookup maps from DB for friendly names
    db_status = "disconnected"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_status = "connected"

        # Map extension -> caller_id for peers
        peer_map = {}
        for p in db.query(SIPPeer).all():
            peer_map[p.extension] = p.caller_id or p.extension

        # Map "trunk-ep-{id}" -> {name, provider} for trunks
        trunk_map = {}
        for t in db.query(SIPTrunk).all():
            trunk_map[f"trunk-ep-{t.id}"] = {"name": t.name, "provider": t.provider}

        db.close()

        # Enrich endpoints with display_name and type
        for ep in endpoints:
            ep_name = ep['endpoint']
            if ep_name in trunk_map:
                ep['display_name'] = trunk_map[ep_name]['name']
                ep['provider'] = trunk_map[ep_name]['provider']
                ep['type'] = 'trunk'
            elif ep_name in peer_map:
                ep['display_name'] = peer_map[ep_name]
                ep['type'] = 'peer'
            else:
                ep['display_name'] = ep_name
                ep['type'] = 'peer'

    except Exception as e:
        logger.error(f"Database check failed: {e}")
    
    # Determine overall system health
    system_health = "healthy"
    health_issues = []
    
    if asterisk_status != "connected":
        system_health = "degraded"
        health_issues.append("Asterisk nicht verbunden")
    
    if db_status != "connected":
        system_health = "critical"
        health_issues.append("Datenbank nicht erreichbar")
    
    online_endpoints = len([e for e in endpoints if e['status'] == 'online'])
    total_endpoints = len(endpoints)
    
    if total_endpoints > 0 and online_endpoints == 0:
        if system_health == "healthy":
            system_health = "warning"
        health_issues.append("Keine Endpunkte online")
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "asterisk": asterisk_status,
        "endpoints": endpoints,
        "system": {
            "health": system_health,
            "issues": health_issues,
            "database": db_status,
            "api": "running"
        }
    }
