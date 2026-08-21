from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import jwt
from cryptography import x509
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

APP_NAME = "Moritz Payments API"
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "moritz-cd1e1").strip()
MISTIC_CLIENT_ID = os.getenv("MISTIC_CLIENT_ID", "").strip()
MISTIC_CLIENT_SECRET = os.getenv("MISTIC_CLIENT_SECRET", "").strip()
MISTIC_BASE_URL = os.getenv("MISTIC_BASE_URL", "https://api.misticpay.com/api").rstrip("/")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://api.moritz.services").rstrip("/")
WEBHOOK_TOKEN = os.getenv("WEBHOOK_TOKEN", "").strip()
ALLOWED_EMAILS = {
    item.strip().lower()
    for item in os.getenv("WALLET_ALLOWED_EMAILS", "leticiank@moritz.services").split(",")
    if item.strip()
}
ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv("ALLOWED_ORIGINS", "https://moritz.services").split(",")
    if item.strip()
]
DB_PATH = Path(os.getenv("PAYMENTS_DB_PATH", str(BASE_DIR / "data" / "payments.db")))
DEPOSIT_MIN_CENTS = max(20000, int(os.getenv("DEPOSIT_MIN_CENTS", "20000")))
WITHDRAW_MIN_CENTS = int(os.getenv("WITHDRAW_MIN_CENTS", "100"))
WITHDRAW_MAX_CENTS = int(os.getenv("WITHDRAW_MAX_CENTS", "100000000"))
DEPOSIT_CREDIT_NET = os.getenv("DEPOSIT_CREDIT_NET", "true").strip().lower() not in {"0", "false", "no"}
GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

NORMAL_INVOICE_CATALOG = {
    "market_api": {
        "name": "MARKET API",
        "plans": {
            "quarterly": {"label": "Trimestral", "amount_cents": 14999, "months": 3},
            "semester": {"label": "Semestre + bônus de vendas", "amount_cents": 24999, "months": 6},
            "annual": {"label": "Anual", "amount_cents": 34999, "months": 12},
        },
    },
    "photos_accounts": {
        "name": "API PHOTOS ACCOUNTS",
        "plans": {
            "monthly": {"label": "Mensal", "amount_cents": 4999, "months": 1},
            "semester": {"label": "Semestre", "amount_cents": 19999, "months": 6},
        },
    },
}

PROMO_INVOICE_CATALOG = {
    "market_api": {
        "name": "MARKET API",
        "plans": {
            "semester": {"label": "Semestral", "amount_cents": 24999, "months": 6},
            "annual": {"label": "Anual - valor promocional", "amount_cents": 27999, "months": 12},
            "permanent": {"label": "Permanente - valor promocional", "amount_cents": 35999, "months": 0},
        },
    },
    "photos_accounts": {
        "name": "API PHOTOS ACCOUNTS",
        "plans": {
            "quarterly": {"label": "Trimestral", "amount_cents": 9999, "months": 3},
            "semester": {"label": "Semestral", "amount_cents": 14999, "months": 6},
            "annual": {"label": "Anual - valor promocional", "amount_cents": 18999, "months": 12},
        },
    },
}

PROMO_END_UTC = datetime(2026, 8, 21, 21, 0, 0, tzinfo=timezone.utc)  # 18:00 America/Sao_Paulo
INVOICE_PIX_TTL_SECONDS = 15 * 60


def invoice_promo_active() -> bool:
    return datetime.now(timezone.utc) < PROMO_END_UTC


def current_invoice_catalog() -> dict[str, Any]:
    return PROMO_INVOICE_CATALOG if invoice_promo_active() else NORMAL_INVOICE_CATALOG


if not MISTIC_CLIENT_ID or not MISTIC_CLIENT_SECRET:
    raise RuntimeError("MISTIC_CLIENT_ID and MISTIC_CLIENT_SECRET are required")
if not WEBHOOK_TOKEN:
    raise RuntimeError("WEBHOOK_TOKEN is required")

app = FastAPI(title=APP_NAME, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def invoice_expires_at(created_at: str | None) -> datetime | None:
    created = parse_iso_datetime(created_at)
    return created + timedelta(seconds=INVOICE_PIX_TTL_SECONDS) if created else None


def expire_pending_invoice_orders(uid: str) -> int:
    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []
    with db_conn() as con:
        rows = con.execute(
            "SELECT id, created_at FROM invoice_orders WHERE uid=? AND status='pending'",
            (uid,),
        ).fetchall()
        for row in rows:
            expires = invoice_expires_at(row["created_at"])
            if expires and now >= expires:
                expired_ids.append(row["id"])
        for local_id in expired_ids:
            con.execute(
                "UPDATE invoice_orders SET status='failed', gateway_status='EXPIRED_15M', updated_at=? WHERE id=? AND status='pending'",
                (now_iso(), local_id),
            )
        if expired_ids:
            con.commit()
    return len(expired_ids)


def cents_to_brl(cents: int) -> float:
    return round(int(cents) / 100, 2)


def brl_to_cents(value: Any) -> int | None:
    try:
        return int(round(float(value) * 100))
    except (TypeError, ValueError):
        return None


def clean_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def mask_pix_key(value: str, key_type: str) -> str:
    value = str(value or "").strip()
    if not value:
        return "—"
    if key_type in {"CPF", "CNPJ", "TELEFONE"}:
        digits = clean_digits(value)
        if len(digits) <= 4:
            return "•" * len(digits)
        return f"{'•' * (len(digits) - 4)}{digits[-4:]}"
    if key_type == "EMAIL" and "@" in value:
        local, domain = value.split("@", 1)
        return f"{local[:2]}***@{domain}"
    if len(value) <= 8:
        return value[:2] + "***"
    return f"{value[:4]}…{value[-4:]}"


def ensure_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS wallets (
              uid TEXT PRIMARY KEY,
              email TEXT NOT NULL UNIQUE,
              balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transactions (
              id TEXT PRIMARY KEY,
              uid TEXT NOT NULL,
              email TEXT NOT NULL,
              type TEXT NOT NULL CHECK (type IN ('deposit','withdraw')),
              amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
              fee_cents INTEGER NOT NULL DEFAULT 0,
              net_cents INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL CHECK (status IN ('pending','complete','failed','refunded')),
              gateway_status TEXT,
              gateway_transaction_id TEXT,
              client_transaction_id TEXT UNIQUE,
              request_id TEXT,
              pix_key_masked TEXT,
              pix_key_type TEXT,
              copy_paste TEXT,
              qrcode_url TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              settled_at TEXT,
              refunded_at TEXT,
              FOREIGN KEY(uid) REFERENCES wallets(uid)
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_transaction_id
              ON transactions(gateway_transaction_id)
              WHERE gateway_transaction_id IS NOT NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS idx_withdraw_request_id
              ON transactions(uid, request_id)
              WHERE request_id IS NOT NULL;

            CREATE INDEX IF NOT EXISTS idx_transactions_uid_created
              ON transactions(uid, created_at DESC);

            CREATE TABLE IF NOT EXISTS hidden_wallet_transactions (
              transaction_id TEXT PRIMARY KEY,
              uid TEXT NOT NULL,
              hidden_at TEXT NOT NULL,
              FOREIGN KEY(uid) REFERENCES wallets(uid)
            );

            CREATE INDEX IF NOT EXISTS idx_hidden_wallet_transactions_uid
              ON hidden_wallet_transactions(uid);

            CREATE TABLE IF NOT EXISTS invoice_orders (
              id TEXT PRIMARY KEY,
              uid TEXT NOT NULL,
              email TEXT NOT NULL,
              total_cents INTEGER NOT NULL CHECK (total_cents > 0),
              status TEXT NOT NULL CHECK (status IN ('pending','complete','failed')),
              gateway_status TEXT,
              gateway_transaction_id TEXT UNIQUE,
              client_transaction_id TEXT UNIQUE,
              selections_json TEXT NOT NULL,
              copy_paste TEXT,
              qrcode_url TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              settled_at TEXT,
              FOREIGN KEY(uid) REFERENCES wallets(uid)
            );

            CREATE INDEX IF NOT EXISTS idx_invoice_orders_uid_created
              ON invoice_orders(uid, created_at DESC);
            """
        )


ensure_db()


@contextmanager
def db_conn():
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        yield con
    finally:
        con.close()


_cert_cache: dict[str, Any] = {"expires": 0.0, "certs": {}}


async def get_google_certs() -> dict[str, str]:
    if _cert_cache["certs"] and _cert_cache["expires"] > time.time():
        return _cert_cache["certs"]
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(GOOGLE_CERTS_URL)
        response.raise_for_status()
        certs = response.json()
        cache_control = response.headers.get("cache-control", "")
        match = re.search(r"max-age=(\d+)", cache_control)
        max_age = int(match.group(1)) if match else 3600
        _cert_cache["certs"] = certs
        _cert_cache["expires"] = time.time() + max(300, max_age - 60)
        return certs


async def verify_firebase_token(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sessão não encontrada.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise ValueError("missing kid")
        certs = await get_google_certs()
        cert = certs.get(kid)
        if not cert:
            _cert_cache["expires"] = 0
            certs = await get_google_certs()
            cert = certs.get(kid)
        if not cert:
            raise ValueError("unknown signing key")
        public_key = x509.load_pem_x509_certificate(cert.encode("utf-8")).public_key()
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada.") from exc

    uid = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not uid or not email:
        raise HTTPException(status_code=401, detail="Conta Firebase inválida.")
    if ALLOWED_EMAILS and email not in ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="Esta conta não possui carteira habilitada.")
    return {"uid": uid, "email": email, "claims": claims}


class MisticPayError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class MisticPayClient:
    def __init__(self) -> None:
        self.headers = {
            "ci": MISTIC_CLIENT_ID,
            "cs": MISTIC_CLIENT_SECRET,
            "Content-Type": "application/json",
        }

    async def request(self, method: str, path: str, *, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=25) as client:
            try:
                response = await client.request(
                    method,
                    f"{MISTIC_BASE_URL}{path}",
                    headers=self.headers,
                    json=json_body,
                )
            except httpx.HTTPError as exc:
                raise MisticPayError("Não foi possível conectar à MisticPay.") from exc
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if response.status_code >= 400:
            message = payload.get("message") or payload.get("error") or "A MisticPay recusou a operação."
            raise MisticPayError(str(message), status_code=502)
        return payload

    async def create_deposit(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", "/transactions/create", json_body=payload)

    async def withdraw(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", "/transactions/withdraw", json_body=payload)

    async def check(self, transaction_id: str) -> dict[str, Any]:
        return await self.request("POST", "/transactions/check", json_body={"transactionId": transaction_id})

    async def merchant_balance(self) -> dict[str, Any]:
        return await self.request("GET", "/users/balance")


mistic = MisticPayClient()


class DepositRequest(BaseModel):
    amountCents: int = Field(gt=0)
    payerName: str = Field(min_length=3, max_length=120)
    payerDocument: str = Field(min_length=11, max_length=20)


class WithdrawRequest(BaseModel):
    amountCents: int = Field(gt=0)
    pixKey: str = Field(min_length=1, max_length=160)
    pixKeyType: str = Field(min_length=1, max_length=40)
    requestId: str | None = Field(default=None, max_length=120)


class InvoicePayRequest(BaseModel):
    selections: dict[str, str]
    payerName: str = Field(min_length=3, max_length=120)
    payerDocument: str = Field(min_length=11, max_length=20)
    forceNew: bool = False


def ensure_wallet(uid: str, email: str) -> None:
    stamp = now_iso()
    with db_conn() as con:
        con.execute(
            """
            INSERT INTO wallets(uid, email, balance_cents, created_at, updated_at)
            VALUES(?, ?, 0, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET email=excluded.email, updated_at=excluded.updated_at
            """,
            (uid, email, stamp, stamp),
        )
        con.commit()


def row_to_public_transaction(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "type": row["type"],
        "amountCents": row["amount_cents"],
        "feeCents": row["fee_cents"],
        "netCents": row["net_cents"],
        "status": row["status"],
        "gatewayStatus": row["gateway_status"],
        "transactionId": row["gateway_transaction_id"],
        "pixKey": row["pix_key_masked"],
        "pixKeyType": row["pix_key_type"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def get_wallet_snapshot(uid: str, email: str) -> dict[str, Any]:
    ensure_wallet(uid, email)
    with db_conn() as con:
        wallet = con.execute("SELECT * FROM wallets WHERE uid=?", (uid,)).fetchone()
        rows = con.execute(
            """
            SELECT t.* FROM transactions t
            WHERE t.uid=?
              AND NOT EXISTS (
                SELECT 1 FROM hidden_wallet_transactions h
                WHERE h.transaction_id=t.id AND h.uid=t.uid
              )
            ORDER BY t.created_at DESC LIMIT 30
            """,
            (uid,),
        ).fetchall()
    return {
        "balanceCents": int(wallet["balance_cents"]),
        "transactions": [row_to_public_transaction(row) for row in rows],
    }


def completed_invoice_selections(uid: str) -> dict[str, dict[str, Any]]:
    completed: dict[str, dict[str, Any]] = {}
    with db_conn() as con:
        rows = con.execute(
            "SELECT selections_json, settled_at, created_at FROM invoice_orders WHERE uid=? AND status='complete' ORDER BY created_at DESC",
            (uid,),
        ).fetchall()
    for row in rows:
        try:
            selections = json.loads(row["selections_json"] or "{}")
        except (TypeError, ValueError):
            continue
        for service_id, plan_id in selections.items():
            if service_id in completed:
                continue
            completed[service_id] = {
                "planId": plan_id,
                "paidAt": row["settled_at"] or row["created_at"],
            }
    return completed


def invoice_snapshot(uid: str, email: str) -> dict[str, Any]:
    ensure_wallet(uid, email)
    expire_pending_invoice_orders(uid)
    completed = completed_invoice_selections(uid)
    catalog = current_invoice_catalog()
    invoices = []
    for service_id, service in catalog.items():
        paid = completed.get(service_id)
        invoices.append(
            {
                "serviceId": service_id,
                "name": service["name"],
                "status": "active" if paid else "overdue",
                "activePlan": (paid or {}).get("planId"),
                "paidAt": (paid or {}).get("paidAt"),
                "plans": [
                    {
                        "id": plan_id,
                        "label": plan["label"],
                        "amountCents": plan["amount_cents"],
                        "months": plan["months"],
                    }
                    for plan_id, plan in service["plans"].items()
                ],
            }
        )
    with db_conn() as con:
        pending = con.execute(
            "SELECT * FROM invoice_orders WHERE uid=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
            (uid,),
        ).fetchone()
    pending_public = None
    if pending:
        try:
            pending_selections = json.loads(pending["selections_json"] or "{}")
        except (TypeError, ValueError):
            pending_selections = {}
        expires = invoice_expires_at(pending["created_at"])
        pending_public = {
            "id": pending["id"],
            "amountCents": pending["total_cents"],
            "transactionId": pending["gateway_transaction_id"],
            "createdAt": pending["created_at"],
            "expiresAt": expires.isoformat() if expires else None,
            "copyPaste": pending["copy_paste"],
            "qrcodeUrl": pending["qrcode_url"],
            "selections": pending_selections,
        }
    return {
        "invoices": invoices,
        "pendingOrder": pending_public,
        "promoActive": invoice_promo_active(),
        "promoEndsAt": PROMO_END_UTC.isoformat(),
        "pixTtlSeconds": INVOICE_PIX_TTL_SECONDS,
    }


def validate_invoice_selections(selections: dict[str, str]) -> tuple[dict[str, str], int]:
    normalized: dict[str, str] = {}
    total = 0
    catalog = current_invoice_catalog()
    for service_id in catalog:
        plan_id = str(selections.get(service_id) or "").strip()
        if not plan_id:
            raise HTTPException(status_code=400, detail=f"Escolha um plano para {catalog[service_id]['name']}.")
        plan = catalog[service_id]["plans"].get(plan_id)
        if not plan:
            raise HTTPException(status_code=400, detail="Plano de faturamento inválido.")
        normalized[service_id] = plan_id
        total += int(plan["amount_cents"])
    return normalized, total


def normalize_gateway_state(value: Any) -> str:
    return str(value or "").strip().upper()


def local_status_from_gateway(value: Any) -> str:
    state = normalize_gateway_state(value)
    if state in {"COMPLETO", "COMPLETE", "COMPLETED", "SUCCESS", "SUCCESSFUL", "PAID"}:
        return "complete"
    if state in {"FALHA", "FAILED", "FAIL", "REJECTED", "CANCELADO", "CANCELLED", "CANCELED"}:
        return "failed"
    return "pending"


def apply_gateway_result(local_id: str, gateway: dict[str, Any]) -> None:
    gateway_state = normalize_gateway_state(gateway.get("transactionState") or gateway.get("status"))
    target_status = local_status_from_gateway(gateway_state)
    gateway_value_cents = brl_to_cents(gateway.get("value"))
    fee_cents = brl_to_cents(gateway.get("fee")) or 0
    stamp = now_iso()

    with db_conn() as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute("SELECT * FROM transactions WHERE id=?", (local_id,)).fetchone()
        if not row:
            con.rollback()
            return

        # A confirmation endpoint is authoritative. If it reports a different
        # amount, keep the item pending rather than crediting/debiting the wrong value.
        if gateway_value_cents is not None and abs(gateway_value_cents - row["amount_cents"]) > 1:
            con.execute(
                "UPDATE transactions SET gateway_status=?, updated_at=? WHERE id=?",
                (f"AMOUNT_MISMATCH:{gateway_state}", stamp, local_id),
            )
            con.commit()
            return

        if row["status"] in {"complete", "failed", "refunded"}:
            con.execute(
                "UPDATE transactions SET gateway_status=?, updated_at=? WHERE id=?",
                (gateway_state, stamp, local_id),
            )
            con.commit()
            return

        if row["type"] == "deposit" and target_status == "complete":
            net_cents = max(row["amount_cents"] - fee_cents, 0) if DEPOSIT_CREDIT_NET else row["amount_cents"]
            con.execute(
                "UPDATE wallets SET balance_cents=balance_cents+?, updated_at=? WHERE uid=?",
                (net_cents, stamp, row["uid"]),
            )
            con.execute(
                """
                UPDATE transactions
                SET status='complete', gateway_status=?, fee_cents=?, net_cents=?, settled_at=?, updated_at=?
                WHERE id=?
                """,
                (gateway_state, fee_cents, net_cents, stamp, stamp, local_id),
            )
        elif row["type"] == "withdraw" and target_status == "complete":
            con.execute(
                """
                UPDATE transactions
                SET status='complete', gateway_status=?, fee_cents=?, net_cents=amount_cents, settled_at=?, updated_at=?
                WHERE id=?
                """,
                (gateway_state, fee_cents, stamp, stamp, local_id),
            )
        elif target_status == "failed":
            if row["type"] == "withdraw":
                con.execute(
                    "UPDATE wallets SET balance_cents=balance_cents+?, updated_at=? WHERE uid=?",
                    (row["amount_cents"], stamp, row["uid"]),
                )
                con.execute(
                    """
                    UPDATE transactions
                    SET status='refunded', gateway_status=?, refunded_at=?, updated_at=?
                    WHERE id=?
                    """,
                    (gateway_state, stamp, stamp, local_id),
                )
            else:
                con.execute(
                    "UPDATE transactions SET status='failed', gateway_status=?, updated_at=? WHERE id=?",
                    (gateway_state, stamp, local_id),
                )
        else:
            con.execute(
                "UPDATE transactions SET gateway_status=?, updated_at=? WHERE id=?",
                (gateway_state or "PENDENTE", stamp, local_id),
            )
        con.commit()


async def sync_transaction_row(row: sqlite3.Row) -> None:
    gateway_id = str(row["gateway_transaction_id"] or "").strip()
    if not gateway_id or row["status"] not in {"pending"}:
        return
    try:
        payload = await mistic.check(gateway_id)
    except MisticPayError:
        return
    transaction = payload.get("transaction") or payload.get("data") or {}
    if transaction:
        apply_gateway_result(row["id"], transaction)


async def sync_pending(uid: str, limit: int = 12) -> None:
    with db_conn() as con:
        rows = con.execute(
            """
            SELECT * FROM transactions
            WHERE uid=? AND status='pending' AND gateway_transaction_id IS NOT NULL
            ORDER BY created_at DESC LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
    for row in rows:
        await sync_transaction_row(row)


def apply_invoice_gateway_result(local_id: str, gateway: dict[str, Any]) -> None:
    gateway_state = normalize_gateway_state(gateway.get("transactionState") or gateway.get("status"))
    target_status = local_status_from_gateway(gateway_state)
    gateway_value_cents = brl_to_cents(gateway.get("value"))
    stamp = now_iso()
    with db_conn() as con:
        row = con.execute("SELECT * FROM invoice_orders WHERE id=?", (local_id,)).fetchone()
        if not row or row["status"] != "pending":
            return
        if gateway_value_cents is not None and abs(gateway_value_cents - row["total_cents"]) > 1:
            con.execute(
                "UPDATE invoice_orders SET gateway_status=?, updated_at=? WHERE id=?",
                (f"AMOUNT_MISMATCH:{gateway_state}", stamp, local_id),
            )
            con.commit()
            return
        if target_status == "complete":
            con.execute(
                "UPDATE invoice_orders SET status='complete', gateway_status=?, settled_at=?, updated_at=? WHERE id=?",
                (gateway_state, stamp, stamp, local_id),
            )
        elif target_status == "failed":
            con.execute(
                "UPDATE invoice_orders SET status='failed', gateway_status=?, updated_at=? WHERE id=?",
                (gateway_state, stamp, local_id),
            )
        else:
            con.execute(
                "UPDATE invoice_orders SET gateway_status=?, updated_at=? WHERE id=?",
                (gateway_state or "PENDENTE", stamp, local_id),
            )
        con.commit()


async def sync_invoice_order(row: sqlite3.Row) -> None:
    gateway_id = str(row["gateway_transaction_id"] or "").strip()
    if not gateway_id or row["status"] != "pending":
        return
    try:
        payload = await mistic.check(gateway_id)
    except MisticPayError:
        return
    transaction = payload.get("transaction") or payload.get("data") or {}
    if transaction:
        apply_invoice_gateway_result(row["id"], transaction)


async def sync_pending_invoices(uid: str, limit: int = 6) -> None:
    with db_conn() as con:
        rows = con.execute(
            "SELECT * FROM invoice_orders WHERE uid=? AND status='pending' AND gateway_transaction_id IS NOT NULL ORDER BY created_at DESC LIMIT ?",
            (uid, limit),
        ).fetchall()
    for row in rows:
        await sync_invoice_order(row)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": APP_NAME}


@app.get("/api/wallet")
async def wallet(sync: int = 0, user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    ensure_wallet(user["uid"], user["email"])
    if sync:
        await sync_pending(user["uid"])
    return get_wallet_snapshot(user["uid"], user["email"])


@app.post("/api/wallet/deposit")
async def create_deposit(body: DepositRequest, user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    if body.amountCents < DEPOSIT_MIN_CENTS:
        raise HTTPException(status_code=400, detail=f"O depósito mínimo é R$ {DEPOSIT_MIN_CENTS / 100:.2f}.")
    payer_document = clean_digits(body.payerDocument)
    if len(payer_document) != 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido com 11 dígitos.")

    ensure_wallet(user["uid"], user["email"])
    local_id = uuid.uuid4().hex
    client_transaction_id = f"moritz-dep-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    webhook_url = f"{PUBLIC_BASE_URL}/api/mistic/webhook/{WEBHOOK_TOKEN}"

    try:
        response = await mistic.create_deposit(
            {
                "amount": cents_to_brl(body.amountCents),
                "payerName": body.payerName.strip(),
                "payerDocument": payer_document,
                "transactionId": client_transaction_id,
                "description": "Depósito de saldo Moritz × ZT Accounts",
                "projectWebhook": webhook_url,
            }
        )
    except MisticPayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = response.get("data") or {}
    gateway_id = str(data.get("transactionId") or "").strip()
    if not gateway_id:
        raise HTTPException(status_code=502, detail="A MisticPay não retornou o ID da transação.")

    stamp = now_iso()
    with db_conn() as con:
        con.execute(
            """
            INSERT INTO transactions(
              id, uid, email, type, amount_cents, fee_cents, net_cents, status,
              gateway_status, gateway_transaction_id, client_transaction_id,
              copy_paste, qrcode_url, created_at, updated_at
            ) VALUES(?, ?, ?, 'deposit', ?, 0, 0, 'pending', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                local_id,
                user["uid"],
                user["email"],
                body.amountCents,
                normalize_gateway_state(data.get("transactionState") or "PENDENTE"),
                gateway_id,
                client_transaction_id,
                data.get("copyPaste"),
                data.get("qrcodeUrl"),
                stamp,
                stamp,
            ),
        )
        con.commit()

    return {
        "id": local_id,
        "status": "pending",
        "transactionId": gateway_id,
        "copyPaste": data.get("copyPaste"),
        "qrcodeUrl": data.get("qrcodeUrl"),
        "qrCodeBase64": data.get("qrCodeBase64"),
    }


@app.post("/api/wallet/withdraw")
async def create_withdraw(body: WithdrawRequest, user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    if body.amountCents < WITHDRAW_MIN_CENTS:
        raise HTTPException(status_code=400, detail=f"O saque mínimo é R$ {WITHDRAW_MIN_CENTS / 100:.2f}.")
    if body.amountCents > WITHDRAW_MAX_CENTS:
        raise HTTPException(status_code=400, detail="O valor do saque ultrapassa o limite configurado.")

    key_type = body.pixKeyType.strip().upper()
    allowed_key_types = {"CPF", "CNPJ", "EMAIL", "TELEFONE", "CHAVE_ALEATORIA"}
    if key_type not in allowed_key_types:
        raise HTTPException(status_code=400, detail="Tipo de chave PIX inválido.")
    pix_key = body.pixKey.strip()
    if key_type in {"CPF", "CNPJ"}:
        pix_key = clean_digits(pix_key)
    if not pix_key:
        raise HTTPException(status_code=400, detail="Informe a chave PIX.")

    ensure_wallet(user["uid"], user["email"])
    local_id = uuid.uuid4().hex
    request_id = (body.requestId or uuid.uuid4().hex).strip()
    client_transaction_id = f"moritz-wd-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    stamp = now_iso()

    with db_conn() as con:
        con.execute("BEGIN IMMEDIATE")
        existing = con.execute(
            "SELECT * FROM transactions WHERE uid=? AND request_id=?",
            (user["uid"], request_id),
        ).fetchone()
        if existing:
            con.rollback()
            return {
                "id": existing["id"],
                "status": existing["status"],
                "transactionId": existing["gateway_transaction_id"],
            }
        wallet_row = con.execute("SELECT balance_cents FROM wallets WHERE uid=?", (user["uid"],)).fetchone()
        balance = int(wallet_row["balance_cents"] if wallet_row else 0)
        if balance < body.amountCents:
            con.rollback()
            raise HTTPException(status_code=409, detail="Saldo insuficiente para este saque.")
        con.execute(
            "UPDATE wallets SET balance_cents=balance_cents-?, updated_at=? WHERE uid=?",
            (body.amountCents, stamp, user["uid"]),
        )
        con.execute(
            """
            INSERT INTO transactions(
              id, uid, email, type, amount_cents, fee_cents, net_cents, status,
              gateway_status, client_transaction_id, request_id,
              pix_key_masked, pix_key_type, created_at, updated_at
            ) VALUES(?, ?, ?, 'withdraw', ?, 0, ?, 'pending', 'CREATING', ?, ?, ?, ?, ?, ?)
            """,
            (
                local_id,
                user["uid"],
                user["email"],
                body.amountCents,
                body.amountCents,
                client_transaction_id,
                request_id,
                mask_pix_key(pix_key, key_type),
                key_type,
                stamp,
                stamp,
            ),
        )
        con.commit()

    webhook_url = f"{PUBLIC_BASE_URL}/api/mistic/webhook/{WEBHOOK_TOKEN}"
    try:
        response = await mistic.withdraw(
            {
                "amount": cents_to_brl(body.amountCents),
                "pixKey": pix_key,
                "pixKeyType": key_type,
                "description": "Saque de saldo Moritz × ZT Accounts",
                "projectWebhook": webhook_url,
            }
        )
    except MisticPayError as exc:
        with db_conn() as con:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT status FROM transactions WHERE id=?", (local_id,)).fetchone()
            if row and row["status"] == "pending":
                con.execute(
                    "UPDATE wallets SET balance_cents=balance_cents+?, updated_at=? WHERE uid=?",
                    (body.amountCents, now_iso(), user["uid"]),
                )
                con.execute(
                    "UPDATE transactions SET status='refunded', gateway_status='CREATE_FAILED', refunded_at=?, updated_at=? WHERE id=?",
                    (now_iso(), now_iso(), local_id),
                )
            con.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = response.get("data") or {}
    gateway_id = str(data.get("transactionId") or "").strip()
    gateway_state = normalize_gateway_state(data.get("status") or data.get("transactionState") or "QUEUED")
    with db_conn() as con:
        con.execute(
            "UPDATE transactions SET gateway_transaction_id=?, gateway_status=?, updated_at=? WHERE id=?",
            (gateway_id or None, gateway_state, now_iso(), local_id),
        )
        con.commit()

    if gateway_id and local_status_from_gateway(gateway_state) == "complete":
        try:
            check = await mistic.check(gateway_id)
            gateway_tx = check.get("transaction") or check.get("data") or {}
            if gateway_tx:
                apply_gateway_result(local_id, gateway_tx)
        except MisticPayError:
            pass

    snapshot = get_wallet_snapshot(user["uid"], user["email"])
    local_tx = next((item for item in snapshot["transactions"] if item["id"] == local_id), None)
    return {
        "id": local_id,
        "status": (local_tx or {}).get("status", "pending"),
        "transactionId": gateway_id or None,
        "balanceCents": snapshot["balanceCents"],
    }


@app.post("/api/wallet/history/clear")
async def clear_wallet_history(user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    ensure_wallet(user["uid"], user["email"])
    stamp = now_iso()
    with db_conn() as con:
        con.execute(
            """
            INSERT OR IGNORE INTO hidden_wallet_transactions(transaction_id, uid, hidden_at)
            SELECT id, uid, ? FROM transactions WHERE uid=?
            """,
            (stamp, user["uid"]),
        )
        con.commit()
    return {"ok": True}


@app.get("/api/invoices")
async def invoices(sync: int = 0, user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    ensure_wallet(user["uid"], user["email"])
    if sync:
        await sync_pending_invoices(user["uid"])
    expire_pending_invoice_orders(user["uid"])
    return invoice_snapshot(user["uid"], user["email"])


@app.post("/api/invoices/pay")
async def pay_invoices(body: InvoicePayRequest, user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    payer_document = clean_digits(body.payerDocument)
    if len(payer_document) != 11:
        raise HTTPException(status_code=400, detail="Informe um CPF válido com 11 dígitos.")
    selections, total_cents = validate_invoice_selections(body.selections)
    ensure_wallet(user["uid"], user["email"])

    with db_conn() as con:
        pending = con.execute(
            "SELECT * FROM invoice_orders WHERE uid=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
            (user["uid"],),
        ).fetchone()
    if pending:
        await sync_invoice_order(pending)
        expire_pending_invoice_orders(user["uid"])
        with db_conn() as con:
            pending = con.execute("SELECT * FROM invoice_orders WHERE id=?", (pending["id"],)).fetchone()
        if pending and pending["status"] == "pending" and not body.forceNew:
            try:
                pending_selections = json.loads(pending["selections_json"] or "{}")
            except (TypeError, ValueError):
                pending_selections = {}
            return {
                "id": pending["id"],
                "status": "pending",
                "existing": True,
                "amountCents": pending["total_cents"],
                "transactionId": pending["gateway_transaction_id"],
                "copyPaste": pending["copy_paste"],
                "qrcodeUrl": pending["qrcode_url"],
                "expiresAt": (invoice_expires_at(pending["created_at"]).isoformat() if invoice_expires_at(pending["created_at"]) else None),
                "selections": pending_selections,
            }
        if pending and pending["status"] == "pending" and body.forceNew:
            with db_conn() as con:
                con.execute(
                    "UPDATE invoice_orders SET status='failed', gateway_status='REPLACED', updated_at=? WHERE id=?",
                    (now_iso(), pending["id"]),
                )
                con.commit()

    local_id = uuid.uuid4().hex
    client_transaction_id = f"moritz-inv-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    webhook_url = f"{PUBLIC_BASE_URL}/api/mistic/webhook/{WEBHOOK_TOKEN}"
    try:
        response = await mistic.create_deposit(
            {
                "amount": cents_to_brl(total_cents),
                "payerName": body.payerName.strip(),
                "payerDocument": payer_document,
                "transactionId": client_transaction_id,
                "description": "Pagamento de faturas Moritz × ZT Accounts",
                "projectWebhook": webhook_url,
            }
        )
    except MisticPayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = response.get("data") or {}
    gateway_id = str(data.get("transactionId") or "").strip()
    if not gateway_id:
        raise HTTPException(status_code=502, detail="A MisticPay não retornou o ID da transação.")
    stamp = now_iso()
    with db_conn() as con:
        con.execute(
            """
            INSERT INTO invoice_orders(
              id, uid, email, total_cents, status, gateway_status,
              gateway_transaction_id, client_transaction_id, selections_json,
              copy_paste, qrcode_url, created_at, updated_at
            ) VALUES(?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                local_id,
                user["uid"],
                user["email"],
                total_cents,
                normalize_gateway_state(data.get("transactionState") or "PENDENTE"),
                gateway_id,
                client_transaction_id,
                json.dumps(selections, ensure_ascii=False, separators=(",", ":")),
                data.get("copyPaste"),
                data.get("qrcodeUrl"),
                stamp,
                stamp,
            ),
        )
        con.commit()

    expires = invoice_expires_at(stamp)
    return {
        "id": local_id,
        "status": "pending",
        "existing": False,
        "amountCents": total_cents,
        "transactionId": gateway_id,
        "createdAt": stamp,
        "expiresAt": expires.isoformat() if expires else None,
        "copyPaste": data.get("copyPaste"),
        "qrcodeUrl": data.get("qrcodeUrl"),
        "qrCodeBase64": data.get("qrCodeBase64"),
    }


@app.post("/api/mistic/webhook/{token}")
async def mistic_webhook(token: str, request: Request) -> dict[str, Any]:
    if token != WEBHOOK_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    gateway_id = str(payload.get("transactionId") or "").strip()
    if not gateway_id:
        return {"ok": True}

    with db_conn() as con:
        row = con.execute(
            "SELECT * FROM transactions WHERE gateway_transaction_id=?",
            (gateway_id,),
        ).fetchone()
        invoice_row = None if row else con.execute(
            "SELECT * FROM invoice_orders WHERE gateway_transaction_id=?",
            (gateway_id,),
        ).fetchone()
    if not row and not invoice_row:
        return {"ok": True}

    # Webhook is only a trigger; status is confirmed again through MisticPay.
    if row:
        await sync_transaction_row(row)
    else:
        await sync_invoice_order(invoice_row)
    return {"ok": True}


@app.get("/api/admin/gateway-health")
async def gateway_health(user: dict[str, Any] = Depends(verify_firebase_token)) -> dict[str, Any]:
    try:
        payload = await mistic.merchant_balance()
    except MisticPayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "gatewayConnected": True, "email": user["email"], "rawAvailable": bool(payload)}
