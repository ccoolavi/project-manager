"""Outbound messaging.

Messages are delivered through the Hermes WhatsApp (Baileys) bridge that already
runs on this server, rather than a second dedicated service. The bridge accepts::

    POST {WHATSAPP_BRIDGE_URL}
    {"to": "<digits>@s.whatsapp.net", "message": "<text>"}

Delivery is best-effort by design: if the bridge is down the caller still gets a
usable response, and the OTP remains verifiable through whatever channel the
operator chooses. Never let a messaging outage block authentication.
"""

import logging
import re

import httpx

from config import settings

logger = logging.getLogger("kaizenpm.notify")


def normalise_phone(phone: str) -> str:
    """Reduce a phone number to the digits the bridge expects."""
    digits = re.sub(r"\D", "", phone or "")
    return digits


async def send_whatsapp(phone: str, message: str) -> bool:
    """Send a WhatsApp message. Returns True only on confirmed delivery."""
    if not settings.whatsapp_bridge_url:
        logger.warning("WhatsApp bridge not configured; message to %s not sent", phone)
        return False

    digits = normalise_phone(phone)
    if not digits:
        logger.warning("Refusing to send to an unparseable phone number")
        return False

    payload = {"to": f"{digits}@s.whatsapp.net", "message": message}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(settings.whatsapp_bridge_url, json=payload)
        if res.status_code < 400:
            return True
        logger.warning("WhatsApp bridge returned %s", res.status_code)
    except Exception as exc:  # noqa: BLE001 - delivery must never raise to the caller
        logger.warning("WhatsApp bridge unreachable: %s", exc)
    return False
