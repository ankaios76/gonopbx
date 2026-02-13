"""
SIP Debug - Captures SIP messages via Asterisk's res_pjsip_history module.
Polls `pjsip show history` via AMI Command, fetches full SIP text for new entries,
and indexes by Call-ID for quick lookup.
"""
import re
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from collections import deque

logger = logging.getLogger(__name__)

MAX_MESSAGES = 10_000
MAX_AGE = timedelta(hours=2)

# Header patterns for parsing full SIP message text
_CALL_ID_RE = re.compile(r"^Call-ID:\s*(.+)", re.IGNORECASE | re.MULTILINE)
_FROM_RE = re.compile(r"^From:\s*(.+)", re.IGNORECASE | re.MULTILINE)
_TO_RE = re.compile(r"^To:\s*(.+)", re.IGNORECASE | re.MULTILINE)
_CSEQ_RE = re.compile(r"^CSeq:\s*(.+)", re.IGNORECASE | re.MULTILINE)

# History list line pattern:
# "00123 1770969579 * <== 192.168.1.1:5060     INVITE sip:1001@... SIP/2.0"
# "00124 1770969579 * ==> 192.168.1.1:5060     SIP/2.0 200 OK"
_HISTORY_LINE_RE = re.compile(
    r"^(\d{5})\s+(\d+)\s+\*\s+(<==>|<==|==>)\s+(\S+)\s+(.+)$"
)

# Entry detail header:
# "<--- History Entry 0 Received from 1.2.3.4:5060 at 1770969579 --->"
# "<--- History Entry 1 Sent to 1.2.3.4:5060 at 1770969579 --->"
_ENTRY_HEADER_RE = re.compile(
    r"<---\s+History Entry \d+\s+(Received|Sent|Transmitted)\s+(?:from|to)\s+(\S+)\s+at\s+(\d+)\s+--->"
)


@dataclass
class SIPMessage:
    timestamp: datetime
    direction: str          # "sent" or "received"
    method: str             # INVITE, BYE, REGISTER, etc. or "" for responses
    status_code: int        # 0 for requests, 200/180/etc. for responses
    call_id: str
    from_header: str
    to_header: str
    cseq: str
    raw_text: str
    addr: str               # remote address


class SIPDebugBuffer:
    def __init__(self):
        self.enabled: bool = False
        self._messages: deque[SIPMessage] = deque()
        self._by_call_id: dict[str, list[SIPMessage]] = {}
        self._last_entry_num: int = -1  # last polled history entry number
        self._poll_task: asyncio.Task | None = None
        self._ami_client = None

    def set_ami_client(self, client):
        self._ami_client = client

    async def enable(self):
        """Enable history capture in Asterisk and start polling."""
        if not self._ami_client or not self._ami_client.connected:
            raise RuntimeError("AMI not connected")
        # Enable pjsip history in Asterisk
        await self._ami_client.send_action("Command", Command="pjsip set history on")
        # Clear previous history to start fresh
        await self._ami_client.send_action("Command", Command="pjsip set history clear")
        self._last_entry_num = -1
        self.enabled = True
        # Start poll loop
        if self._poll_task is None or self._poll_task.done():
            self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info("SIP debug capture enabled (pjsip history)")

    async def disable(self):
        """Disable history capture."""
        self.enabled = False
        if self._ami_client and self._ami_client.connected:
            try:
                await self._ami_client.send_action("Command", Command="pjsip set history off")
            except Exception as e:
                logger.warning(f"Failed to disable pjsip history: {e}")
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            self._poll_task = None
        logger.info("SIP debug capture disabled")

    async def _poll_loop(self):
        """Periodically poll for new history entries."""
        while self.enabled:
            try:
                await self._fetch_new_entries()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"SIP debug poll error: {e}", exc_info=True)
            await asyncio.sleep(3)

    async def _fetch_new_entries(self):
        """Fetch new entries from pjsip history since last poll."""
        if not self._ami_client or not self._ami_client.connected:
            return

        # Get history list
        response = await self._ami_client.send_action(
            "Command", Command="pjsip show history"
        )

        # Parse the command output
        output = self._extract_command_output(response)
        if not output:
            logger.debug(f"No output from pjsip show history, response type={type(response)}, repr={repr(response)[:300]}")
            return

        # Parse history lines to find new entries
        new_entries = []
        for line in output.split("\n"):
            m = _HISTORY_LINE_RE.match(line.strip())
            if m:
                entry_num = int(m.group(1))
                if entry_num > self._last_entry_num:
                    new_entries.append(entry_num)

        if not new_entries:
            return

        # Fetch details for each new entry (batch to avoid overload)
        # Limit to 50 new entries per poll cycle
        for entry_num in new_entries[:50]:
            try:
                await self._fetch_entry_detail(entry_num)
            except Exception as e:
                logger.warning(f"Failed to fetch history entry {entry_num}: {e}")

        self._last_entry_num = max(new_entries[:50])
        self.cleanup_old()

    async def _fetch_entry_detail(self, entry_num: int):
        """Fetch full SIP message for a history entry."""
        response = await self._ami_client.send_action(
            "Command", Command=f"pjsip show history entry {entry_num}"
        )
        output = self._extract_command_output(response)
        if not output:
            return

        lines = output.strip().split("\n")
        if not lines:
            return

        # Find the header line - it may not be the first line
        header_match = None
        header_idx = -1
        for i, line in enumerate(lines):
            m = _ENTRY_HEADER_RE.match(line.strip())
            if m:
                header_match = m
                header_idx = i
                break
        if not header_match:
            # Try to use the raw text anyway
            direction = "received"
            timestamp = datetime.utcnow()
            addr = ""
            raw_text = output
        else:
            dir_word = header_match.group(1)
            direction = "received" if dir_word == "Received" else "sent"
            addr = header_match.group(2)
            try:
                ts_epoch = int(header_match.group(3))
                timestamp = datetime.utcfromtimestamp(ts_epoch)
            except (ValueError, OSError):
                timestamp = datetime.utcnow()
            # Raw text is everything after the header line
            raw_text = "\n".join(lines[header_idx + 1:]).strip()

        if not raw_text:
            return

        # Parse first line of SIP message for method/status
        sip_first = raw_text.split("\n")[0].strip()
        method = ""
        status_code = 0
        if sip_first.startswith("SIP/"):
            parts = sip_first.split(None, 2)
            if len(parts) >= 2:
                try:
                    status_code = int(parts[1])
                except ValueError:
                    pass
        else:
            parts = sip_first.split(None, 1)
            if parts:
                method = parts[0]

        # Extract headers
        call_id_m = _CALL_ID_RE.search(raw_text)
        from_m = _FROM_RE.search(raw_text)
        to_m = _TO_RE.search(raw_text)
        cseq_m = _CSEQ_RE.search(raw_text)

        call_id = call_id_m.group(1).strip() if call_id_m else ""
        from_header = from_m.group(1).strip() if from_m else ""
        to_header = to_m.group(1).strip() if to_m else ""
        cseq = cseq_m.group(1).strip() if cseq_m else ""

        if not call_id:
            return

        msg = SIPMessage(
            timestamp=timestamp,
            direction=direction,
            method=method,
            status_code=status_code,
            call_id=call_id,
            from_header=from_header,
            to_header=to_header,
            cseq=cseq,
            raw_text=raw_text,
            addr=addr,
        )

        # Store
        self._messages.append(msg)
        if call_id not in self._by_call_id:
            self._by_call_id[call_id] = []
        self._by_call_id[call_id].append(msg)

        # Hard cap
        while len(self._messages) > MAX_MESSAGES:
            old = self._messages.popleft()
            cid_list = self._by_call_id.get(old.call_id)
            if cid_list:
                try:
                    cid_list.remove(old)
                except ValueError:
                    pass
                if not cid_list:
                    del self._by_call_id[old.call_id]

    def _extract_command_output(self, response) -> str:
        """Extract text output from an AMI Command response."""
        if not response:
            return ""
        # panoramisk returns a Message object (or list) for Command actions
        # The response may have nested structures
        output_parts = []
        items = response if isinstance(response, list) else [response]
        for item in items:
            if isinstance(item, str):
                output_parts.append(item)
                continue
            # Try Output key (multi-line command responses)
            out = item.get("Output", "")
            if out:
                if isinstance(out, list):
                    output_parts.extend(str(o) for o in out)
                else:
                    output_parts.append(str(out))
            # Also try content
            content = item.get("content", "")
            if content and not out:
                if isinstance(content, list):
                    output_parts.extend(str(c) for c in content)
                else:
                    output_parts.append(str(content))
        return "\n".join(output_parts)

    def cleanup_old(self):
        """Remove messages older than MAX_AGE."""
        cutoff = datetime.utcnow() - MAX_AGE
        while self._messages and self._messages[0].timestamp < cutoff:
            old = self._messages.popleft()
            cid_list = self._by_call_id.get(old.call_id)
            if cid_list:
                try:
                    cid_list.remove(old)
                except ValueError:
                    pass
                if not cid_list:
                    del self._by_call_id[old.call_id]

    def get_calls(self) -> list[dict]:
        """Return list of calls with summary info."""
        self.cleanup_old()
        calls = []
        for call_id, msgs in self._by_call_id.items():
            if not msgs:
                continue
            first = msgs[0]
            primary_method = ""
            for m in msgs:
                if m.method:
                    primary_method = m.method
                    break
            calls.append({
                "call_id": call_id,
                "first_seen": first.timestamp.isoformat(),
                "from": first.from_header,
                "to": first.to_header,
                "method": primary_method,
                "message_count": len(msgs),
            })
        calls.sort(key=lambda c: c["first_seen"], reverse=True)
        return calls

    def get_call_messages(self, call_id: str) -> list[dict]:
        """Return all messages for a given Call-ID."""
        self.cleanup_old()
        msgs = self._by_call_id.get(call_id, [])
        return [
            {
                "timestamp": m.timestamp.isoformat(),
                "direction": m.direction,
                "method": m.method,
                "status_code": m.status_code,
                "from": m.from_header,
                "to": m.to_header,
                "cseq": m.cseq,
                "raw_text": m.raw_text,
                "addr": m.addr,
            }
            for m in msgs
        ]

    def clear(self):
        """Clear all stored messages."""
        self._messages.clear()
        self._by_call_id.clear()
        self._last_entry_num = -1


# Singleton instance
sip_debug_buffer = SIPDebugBuffer()
