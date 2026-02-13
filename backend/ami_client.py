"""
Asterisk Manager Interface (AMI) Client
Handles connection and communication with Asterisk
"""
import asyncio
import logging
import os
from typing import Optional, Dict, Any
from datetime import datetime
from panoramisk import Manager

logger = logging.getLogger(__name__)

# Database import for CDR
from database import SessionLocal, CDR
from mqtt_client import mqtt_publisher


class AsteriskAMIClient:
    def __init__(self):
        self.host = os.getenv("ASTERISK_HOST", "asterisk")
        self.port = int(os.getenv("ASTERISK_PORT", 5038))
        self.username = os.getenv("ASTERISK_USER", "admin")
        self.password = os.getenv("ASTERISK_PASSWORD", "admin_secret")
        
        self.manager: Optional[Manager] = None
        self.connected = False
        self.broadcast_callback = None
        
        # Track active calls - key is Linkedid (unique per call)
        self.active_calls: Dict[str, Dict[str, Any]] = {}
        
        logger.info(f"AMI Client initialized for {self.host}:{self.port}")

    def set_broadcast_callback(self, callback):
        """Set callback function for broadcasting events"""
        self.broadcast_callback = callback

    async def connect(self):
        """Connect to Asterisk AMI"""
        try:
            logger.info(f"Connecting to Asterisk AMI at {self.host}:{self.port}...")
            
            self.manager = Manager(
                host=self.host,
                port=self.port,
                username=self.username,
                secret=self.password,
                ping_delay=10,
                ping_attempts=3
            )
            
            await self.manager.connect()
            self.connected = True
            
            logger.info("✓ Successfully connected to Asterisk AMI")
            
            # Register event handlers
            self.manager.register_event('*', self.handle_event)

            # Keep connection alive
            while self.connected:
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(f"✗ Failed to connect to Asterisk AMI: {e}")
            self.connected = False
            
            # Retry connection after 5 seconds
            await asyncio.sleep(5)
            await self.connect()

    async def disconnect(self):
        """Disconnect from Asterisk AMI"""
        if self.manager:
            self.manager.close() if self.manager else None
            self.connected = False
            logger.info("Disconnected from Asterisk AMI")

    async def handle_event(self, manager, event):
        """Handle all Asterisk events"""
        event_name = event.get('Event', 'Unknown')
        
        # Track call events
        if event_name == 'DialBegin':
            await self.handle_dial_begin(event)
        elif event_name == 'DialEnd':
            await self.handle_dial_end(event)
        elif event_name == 'Hangup':
            await self.handle_hangup(event)
        
        # Publish peer/trunk status changes via MQTT
        if event_name == 'PeerStatus':
            peer = event.get('Peer', '')  # e.g. "PJSIP/1001"
            status = event.get('PeerStatus', '')
            ext = peer.split('/')[-1] if '/' in peer else peer
            mqtt_status = 'online' if status == 'Reachable' else 'offline'
            mqtt_publisher.publish_extension_status(ext, mqtt_status)
        elif event_name == 'Registry':
            trunk_name = event.get('Username', '') or event.get('Domain', '')
            reg_status = event.get('Status', '')
            mqtt_status = 'registered' if reg_status == 'Registered' else 'unregistered'
            mqtt_publisher.publish_trunk_status(trunk_name, mqtt_status)

        # Log important events
        if event_name in ['PeerStatus', 'Registry', 'Newchannel', 'Hangup', 'NewCallerid', 'DialBegin', 'DialEnd']:
            logger.info(f"AMI Event: {event_name}")

            # Broadcast to WebSocket clients
            if self.broadcast_callback:
                await self.broadcast_callback({
                    'type': 'ami_event',
                    'event_name': event_name,
                    'active_calls': list(self.active_calls.values())
                })

    async def handle_dial_begin(self, event):
        """Handle dial begin - this is when a call starts"""
        linkedid = event.get('Linkedid', '')
        caller = event.get('CallerIDNum', '')
        caller_name = event.get('CallerIDName', '')
        destination = event.get('DestCallerIDNum', '')
        dest_name = event.get('DestCallerIDName', '')
        channel = event.get('Channel', '')
        dest_channel = event.get('DestChannel', '')
        
        if linkedid:
            self.active_calls[linkedid] = {
                'id': linkedid,
                'channel': channel,
                'dest_channel': dest_channel,
                'caller': caller,
                'caller_name': caller_name,
                'destination': destination,
                'dest_name': dest_name,
                'state': 'ringing',
                'start_time': datetime.utcnow(),
                'answer_time': None
            }
            logger.info(f"📞 Call started: {caller} -> {destination} (ID: {linkedid})")
            mqtt_publisher.publish_call_started(caller, destination)

    async def handle_dial_end(self, event):
        """Handle dial end - call answered or failed"""
        linkedid = event.get('Linkedid', '')
        dial_status = event.get('DialStatus', '')
        
        if linkedid in self.active_calls:
            if dial_status == 'ANSWER':
                self.active_calls[linkedid]['state'] = 'connected'
                self.active_calls[linkedid]['answer_time'] = datetime.utcnow()
                logger.info(f"✅ Call answered: {linkedid}")
                call = self.active_calls[linkedid]
                mqtt_publisher.publish_call_answered(call['caller'], call['destination'])
            else:
                self.active_calls[linkedid]['state'] = dial_status.lower()
                logger.info(f"❌ Call failed: {linkedid} - {dial_status}")

    async def handle_hangup(self, event):
        """Handle call hangup and save CDR"""
        linkedid = event.get('Linkedid', '')
        
        if linkedid in self.active_calls:
            call = self.active_calls[linkedid]
            end_time = datetime.utcnow()
            
            # Calculate durations
            start_time = call.get('start_time')
            answer_time = call.get('answer_time')
            
            duration = int((end_time - start_time).total_seconds()) if start_time else 0
            billsec = int((end_time - answer_time).total_seconds()) if answer_time else 0
            
            # Determine disposition
            if call['state'] == 'connected':
                disposition = 'ANSWERED'
            elif call['state'] == 'ringing':
                disposition = 'NO ANSWER'
            elif call['state'] == 'busy':
                disposition = 'BUSY'
            else:
                disposition = call['state'].upper()
            
            # Save CDR to database
            try:
                await self.save_cdr(call, duration, billsec, disposition, linkedid)
                logger.info(f"💾 CDR saved: {call['caller']} -> {call['destination']} ({duration}s, {disposition})")
            except Exception as e:
                logger.error(f"Failed to save CDR: {e}")
            
            mqtt_publisher.publish_call_ended(
                call['caller'], call['destination'], duration, disposition
            )
            logger.info(f"📵 Call ended: {linkedid}")
            del self.active_calls[linkedid]

    async def save_cdr(self, call: dict, duration: int, billsec: int, disposition: str, uniqueid: str):
        """Save call detail record to database"""
        db = SessionLocal()
        try:
            cdr = CDR(
                call_date=call.get('start_time', datetime.utcnow()),
                clid=f'"{call.get("caller_name", "")}" <{call.get("caller", "")}>',
                src=call.get('caller', ''),
                dst=call.get('destination', ''),
                dcontext='internal',
                channel=call.get('channel', ''),
                dstchannel=call.get('dest_channel', ''),
                lastapp='Dial',
                lastdata=call.get('destination', ''),
                duration=duration,
                billsec=billsec,
                disposition=disposition,
                amaflags=3,
                uniqueid=uniqueid,
                userfield=''
            )
            db.add(cdr)
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    async def send_action(self, action: str, **kwargs) -> Dict[str, Any]:
        """Send an action to Asterisk and wait for response"""
        if not self.connected or not self.manager:
            raise Exception("Not connected to Asterisk")
        
        try:
            response = await self.manager.send_action({
                'Action': action,
                **kwargs
            })
            return response
        except Exception as e:
            logger.error(f"Error sending action {action}: {e}")
            raise

    async def get_active_channels(self):
        """Get currently active channels"""
        return list(self.active_calls.values())
