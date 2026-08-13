"""Outbound email, for OTP codes.

Uses the SMTP account already configured for the Hermes gateway on this box
rather than standing up a second mail sender. As with WhatsApp delivery in
``utils/notify.py``, sending is best-effort: a mail outage must never be the
reason a login or a destructive action cannot proceed — the caller decides what
to do when ``send_email`` returns ``False``.
"""

import logging
import smtplib
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger("kaizenpm.email")


def send_email(to: str, subject: str, body: str) -> bool:
    if not (settings.smtp_server and settings.smtp_user and settings.smtp_password):
        logger.warning("SMTP not configured; email to %s not sent", to)
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user
    msg["To"] = to

    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, [to], msg.as_string())
        return True
    except Exception as exc:  # noqa: BLE001 - delivery must never raise to the caller
        logger.warning("Could not send email to %s: %s", to, exc)
        return False
