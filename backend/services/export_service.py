import csv
import io
from datetime import datetime

from fpdf import FPDF
from sqlalchemy.orm import Session

from models import Card


def _owned(db: Session, user_id: int):
    return (
        db.query(Card)
        .filter(Card.user_id == user_id)
        .order_by(Card.set_name, Card.name)
        .all()
    )


def export_csv(db: Session, user_id: int) -> bytes:
    cards = _owned(db, user_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Name", "Set", "Rarity", "Condition", "Quantity",
        "Market Price (USD)", "Foil", "For Trade", "Added At",
    ])
    for c in cards:
        writer.writerow([
            c.id, c.name, c.set_name, c.rarity, c.condition, c.quantity,
            c.market_price_usd or "", "Yes" if c.is_foil else "No",
            "Yes" if c.for_trade else "No",
            c.added_at.isoformat() if c.added_at else "",
        ])
    return output.getvalue().encode("utf-8")


def export_pdf(db: Session, user_id: int) -> bytes:
    cards = _owned(db, user_id)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "CardVault – Collection Export", ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", ln=True, align="C")
    pdf.ln(4)

    current_set = None
    for card in cards:
        if card.set_name != current_set:
            current_set = card.set_name
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_fill_color(230, 230, 230)
            pdf.cell(0, 8, f"  {current_set or 'Unknown Set'}", ln=True, fill=True)
            pdf.set_font("Helvetica", "B", 8)
            _pdf_header_row(pdf)
            pdf.set_font("Helvetica", "", 8)

        _pdf_card_row(pdf, card)

    total_value = sum((c.market_price_usd or 0) * c.quantity for c in cards)
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 8, f"Total Collection Value: ${total_value:.2f} USD", ln=True)

    return pdf.output()


def _pdf_header_row(pdf: FPDF) -> None:
    cols = [("Name", 55), ("Rarity", 30), ("Condition", 32), ("Qty", 12), ("Price USD", 28)]
    for label, w in cols:
        pdf.cell(w, 6, label, border="B")
    pdf.ln()


def _pdf_card_row(pdf: FPDF, card: Card) -> None:
    price = f"${card.market_price_usd:.2f}" if card.market_price_usd else "–"
    cols = [
        (card.name[:30], 55),
        ((card.rarity or "")[:20], 30),
        (card.condition or "", 32),
        (str(card.quantity), 12),
        (price, 28),
    ]
    for text, w in cols:
        pdf.cell(w, 5, text)
    pdf.ln()


def export_json(db: Session, user_id: int) -> list[dict]:
    cards = _owned(db, user_id)
    result = []
    for c in cards:
        result.append({
            "id": c.id,
            "tcg_card_id": c.tcg_card_id,
            "name": c.name,
            "set_name": c.set_name,
            "set_code": c.set_code,
            "rarity": c.rarity,
            "card_type": c.card_type,
            "hp": c.hp,
            "image_url": c.image_url,
            "condition": c.condition,
            "quantity": c.quantity,
            "notes": c.notes,
            "is_foil": c.is_foil,
            "for_trade": c.for_trade,
            "market_price_usd": c.market_price_usd,
            "price_low_usd": c.price_low_usd,
            "price_mid_usd": c.price_mid_usd,
            "price_high_usd": c.price_high_usd,
            "added_at": c.added_at.isoformat() if c.added_at else None,
        })
    return result
