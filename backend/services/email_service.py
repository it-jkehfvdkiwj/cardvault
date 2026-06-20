"""
Transactional email via SMTP.

Configure with env vars to send real mail:
    SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD
    SMTP_FROM (default: SMTP_USER), SMTP_TLS (default true)

If SMTP isn't configured, emails are logged to the server console instead — handy
for local development (you can copy the password-reset link from the terminal).
"""

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("cardvault.email")


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER"))


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send an email. Returns True if sent via SMTP, False if only logged."""
    if not smtp_configured():
        logger.warning(
            "[email:not-configured] To=%s | %s\n%s", to, subject, text or html
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER")
    msg["To"] = to
    msg.set_content(text or "Bitte nutze einen HTML-fähigen Client.")
    msg.add_alternative(html, subtype="html")

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD", "")
    use_tls = os.getenv("SMTP_TLS", "true").lower() == "true"

    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            if use_tls:
                server.starttls()
            if password:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


def send_password_reset(to: str, reset_link: str) -> bool:
    subject = "CardVault — Passwort zurücksetzen"
    html = f"""
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2>Passwort zurücksetzen</h2>
      <p>Du hast angefordert, dein CardVault-Passwort zurückzusetzen.
         Klicke auf den Button — der Link ist 1 Stunde gültig.</p>
      <p><a href="{reset_link}"
            style="background:#facc15;color:#000;padding:10px 18px;border-radius:8px;
                   text-decoration:none;font-weight:bold">Neues Passwort setzen</a></p>
      <p style="color:#666;font-size:12px">Falls du das nicht warst, ignoriere diese
         E-Mail einfach.</p>
    </div>"""
    text = f"Passwort zurücksetzen (1 Std. gültig): {reset_link}"
    return send_email(to, subject, html, text)
