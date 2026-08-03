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


def notify_admins_new_user(
    email: str,
    display_name: str | None = None,
    invite_code: str | None = None,
    total_users: int | None = None,
) -> None:
    """Tell every ADMIN_EMAILS address that someone registered.

    Called as a background task: during a closed test you want to know
    immediately who came in, but a slow or misconfigured mail server must never
    turn a successful sign-up into an error for the person registering. Failures
    are logged and swallowed for the same reason.
    """
    admins = [a.strip() for a in os.getenv("ADMIN_EMAILS", "").split(",") if a.strip()]
    if not admins:
        return

    who = f"{display_name} ({email})" if display_name else email
    code_line = f"Einladungscode: {invite_code}" if invite_code else "Ohne Einladungscode (Admin-Adresse)"
    total_line = f"Nutzer insgesamt: {total_users}" if total_users is not None else ""

    subject = f"Cardeva: neue Registrierung — {email}"
    html = f"""
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin-bottom:4px">Neue Registrierung</h2>
      <p style="font-size:16px"><strong>{who}</strong></p>
      <p style="color:#555">{code_line}<br>{total_line}</p>
      <p style="color:#888;font-size:12px">Details im Admin-Panel unter „Admin".</p>
    </div>"""
    text = f"Neue Registrierung: {who}\n{code_line}\n{total_line}"

    for admin in admins:
        try:
            send_email(admin, subject, html, text)
        except Exception as exc:            # never propagate into the request
            logger.error("Admin notification to %s failed: %s", admin, exc)


def send_verification_code(to: str, code: str) -> bool:
    """Send the 6-digit sign-up confirmation code.

    The code is repeated in the plain-text part because some clients (and most
    smartwatch previews) never render the HTML — and a code you cannot read is
    worse than no code at all.
    """
    subject = f"Cardeva — dein Bestätigungscode {code}"
    html = f"""
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin-bottom:4px">Willkommen bei Cardeva</h2>
      <p>Gib diesen Code ein, um deine E-Mail-Adresse zu bestätigen:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;
                background:#FDF3D7;color:#7A4E07;padding:14px 18px;
                border-radius:10px;display:inline-block">{code}</p>
      <p style="color:#666;font-size:12px">Der Code gilt 30 Minuten.
         Wenn du dich nicht registriert hast, ignoriere diese E-Mail einfach —
         ohne den Code passiert nichts.</p>
    </div>"""
    text = (
        f"Dein Cardeva-Bestätigungscode: {code}\n\n"
        "Der Code gilt 30 Minuten. Wenn du dich nicht registriert hast, "
        "ignoriere diese E-Mail."
    )
    return send_email(to, subject, html, text)


def send_password_reset(to: str, reset_link: str) -> bool:
    subject = "Cardeva — Passwort zurücksetzen"
    html = f"""
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2>Passwort zurücksetzen</h2>
      <p>Du hast angefordert, dein Cardeva-Passwort zurückzusetzen.
         Klicke auf den Button — der Link ist 1 Stunde gültig.</p>
      <p><a href="{reset_link}"
            style="background:#facc15;color:#000;padding:10px 18px;border-radius:8px;
                   text-decoration:none;font-weight:bold">Neues Passwort setzen</a></p>
      <p style="color:#666;font-size:12px">Falls du das nicht warst, ignoriere diese
         E-Mail einfach.</p>
    </div>"""
    text = f"Passwort zurücksetzen (1 Std. gültig): {reset_link}"
    return send_email(to, subject, html, text)
