import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { firebaseConfig } from "../../firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const pages = ["#loading", "#auth", "#status", "#password-reset-flow", "#dashboard", "#client-dashboard"];
const clientPanelViews = [
  "#client-overview-view",
  "#client-bots-view",
  "#client-bot-config-view",
  "#client-profile-view",
  "#client-advanced-search-view",
  "#client-api-console-view",
  "#client-invoices-view"
];
const PRIVATE_CLIENT_EMAIL = "leticiank@moritz.services";
const privateLoginAliases = {
  leticiank: PRIVATE_CLIENT_EMAIL
};
const PAYMENTS_API_BASE = "https://api.moritz.services";
const DEMO_DISCORD_TOKEN = atob("TVRVek9UUXhOelUxT1RjeU5qWTVNRE13TkEuR2l4b25OLnNVNU0tTWtmMVZ5YWd2TC0zdUptZmFySnNWSjEtX1ZiWlJvRkxr");
const WALLET_POLL_INTERVAL = 10000;
const panelViews = ["#overview-view", "#bots-view", "#profile-view", "#requests-view", "#notice-view"];
const authErrors = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um endereÃ§o de e-mail vÃ¡lido.",
  "auth/email-already-in-use": "Este e-mail jÃ¡ possui uma conta.",
  "auth/weak-password": "A senha permanente precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "NÃ£o foi possÃ­vel conectar. Verifique sua internet.",
  "functions/not-found": "O serviÃ§o de senha temporÃ¡ria ainda nÃ£o foi publicado.",
  "functions/permission-denied": "VocÃª nÃ£o possui permissÃ£o para executar esta aÃ§Ã£o.",
  "functions/failed-precondition": "O cÃ³digo temporÃ¡rio nÃ£o estÃ¡ ativo ou expirou.",
  "functions/unauthenticated": "A sessÃ£o administrativa expirou. Entre novamente."
};

const viewMeta = {
  overview: { eyebrow: "WORKSPACE OVERVIEW", title: "Dashboard" },
  bots: { eyebrow: "BOT REGISTRY", title: "My Bots" },
  profile: { eyebrow: "ACCOUNT SETTINGS", title: "My Profile" },
  requests: { eyebrow: "ADMINISTRATION", title: "Access Requests" },
  notice: { eyebrow: "ADMINISTRATION", title: "System Notice" }
};
const clientViewMeta = {
  "client-overview": { eyebrow: "PRIVATE WORKSPACE", title: "Dashboard" },
  "client-bots": { eyebrow: "BOT WORKSPACE", title: "My Bots" },
  "client-bot-config": { eyebrow: "BOT SETTINGS", title: "Moritz - VENDAS" },
  "client-profile": { eyebrow: "ACCOUNT SETTINGS", title: "Meu Perfil" },
  "client-advanced-search": { eyebrow: "MARKET TOOLS", title: "Advanced Search" },
  "client-api-console": { eyebrow: "MARKET TOOLS", title: "API Console" },
  "client-invoices": { eyebrow: "BILLING", title: "Faturas" }
};

const DEFAULT_NOTICE = {
  active: true,
  title: "ManutenÃ§Ã£o programada",
  message: "Estamos adicionando novas funÃ§Ãµes ao painel. Durante esse perÃ­odo, alguns mÃ³dulos podem ficar indisponÃ­veis.",
  returnTime: "22:15",
  version: "maintenance-2215-v1"
};

const avatarSvgs = {
  a1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38584a"/><stop offset="1" stop-color="#0c1711"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="48" cy="39" r="19" fill="#d8b094"/><path d="M27 38c1-20 12-27 24-27 14 0 23 10 21 29-6-8-13-12-24-12-8 0-15 4-21 10Z" fill="#161a18"/><path d="M19 96c2-25 13-38 29-38s28 13 30 38" fill="#1c3027"/><circle cx="41" cy="40" r="2"/><circle cx="55" cy="40" r="2"/><path d="M42 50c4 3 8 3 12 0" fill="none" stroke="#7c4c42" stroke-width="2"/></svg>`,
  a2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#273c34"/><circle cx="48" cy="39" r="19" fill="#9c684e"/><path d="M26 43c-2-20 8-31 22-31 18 0 25 14 21 32l-7-15-15-7-15 8Z" fill="#111715"/><path d="M17 96c3-25 15-38 31-38 17 0 29 13 32 38" fill="#111d18"/><circle cx="41" cy="40" r="2"/><circle cx="55" cy="40" r="2"/><path d="M43 50h10" stroke="#5e342a" stroke-width="2"/></svg>`,
  a3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1f332b"/><circle cx="48" cy="40" r="18" fill="#e0b69b"/><path d="M27 39c0-18 9-27 22-27 16 0 24 10 22 28-7-7-16-10-25-9-8 1-13 4-19 8Z" fill="#552e27"/><path d="M16 96c4-24 15-37 32-37 16 0 28 13 32 37" fill="#37584a"/><circle cx="41" cy="41" r="2"/><circle cx="55" cy="41" r="2"/><path d="M42 50c4 4 8 4 12 0" fill="none" stroke="#8e5549" stroke-width="2"/></svg>`,
  a4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#22372f"/><circle cx="48" cy="40" r="18" fill="#6f4634"/><path d="M25 39c1-20 11-29 24-29 14 0 24 11 22 30-8-8-14-12-23-12-10 0-16 5-23 11Z" fill="#0b0f0d"/><path d="M16 96c4-25 15-38 32-38s29 13 32 38" fill="#17251f"/><circle cx="41" cy="41" r="2"/><circle cx="55" cy="41" r="2"/><path d="M42 51c4 2 8 2 12 0" fill="none" stroke="#47281f" stroke-width="2"/></svg>`,
  a5: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#2a4137"/><circle cx="48" cy="40" r="18" fill="#d5a47e"/><path d="M26 39c1-19 10-28 23-28 16 0 24 12 22 30-8-7-16-11-25-10-7 0-14 3-20 8Z" fill="#c5b08c"/><path d="M16 96c4-25 15-38 32-38s29 13 32 38" fill="#0e1914"/><circle cx="41" cy="41" r="2"/><circle cx="55" cy="41" r="2"/><path d="M42 51c4 3 8 3 12 0" fill="none" stroke="#7b4c3b" stroke-width="2"/></svg>`,
  a6: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1c3028"/><circle cx="48" cy="40" r="18" fill="#bb8366"/><path d="M27 43c-3-18 6-31 21-31 16 0 25 12 22 31-5-11-13-17-22-17-8 0-16 6-21 17Z" fill="#2b1915"/><path d="M16 96c4-25 15-38 32-38s29 13 32 38" fill="#304e41"/><circle cx="41" cy="41" r="2"/><circle cx="55" cy="41" r="2"/><path d="M42 51c4 2 8 2 12 0" fill="none" stroke="#72483b" stroke-width="2"/></svg>`
};
const avatars = Object.fromEntries(Object.entries(avatarSvgs).map(([key, svg]) => [key, `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`]));

let mode = "login";
let registrationInProgress = false;
let auth;
let db;
let functions;
let requestTemporaryReset;
let loginWithTemporaryCode;
let completeTemporaryReset;
let currentProfile = null;
let currentUser = null;
let currentView = "overview";
let currentClientView = "client-overview";
let requestsLoaded = false;
let currentNotice = null;
let hiddenAt = null;
let shortcutToastTimer = null;
let walletPollingTimer = null;
let currentWallet = { balanceCents: 0, transactions: [] };
let currentInvoices = { invoices: [], pendingOrder: null };
let invoicePollingTimer = null;

function showPage(id) {
  pages.forEach((page) => $(page).classList.toggle("hidden", page !== id));
}
function showMessage(text, type = "error") {
  const box = $("#form-message");
  box.textContent = text;
  box.className = `message ${type}`;
}
function hideMessage() { $("#form-message").className = "message hidden"; }
function showRequestsMessage(text, type = "error") {
  const box = $("#requests-message");
  box.textContent = text;
  box.className = `message ${type}`;
}
function hideRequestsMessage() { $("#requests-message").className = "message hidden"; }
function showNoticeFormMessage(text, type = "error") {
  const box = $("#notice-form-message");
  box.textContent = text;
  box.className = `message ${type}`;
}
function errorMessage(error) { return authErrors[error?.code] || error?.message || "NÃ£o foi possÃ­vel concluir. Tente novamente."; }
function configIsReady() { return !Object.values(firebaseConfig).some((value) => !value || value.includes("COLE_AQUI") || value.includes("SEU-PROJETO")); }
function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function setMode(nextMode) {
  mode = nextMode;
  const register = mode === "register";
  $("#register-fields").classList.toggle("hidden", !register);
  $("#confirm-field").classList.toggle("hidden", !register);
  $("#login-options").classList.toggle("hidden", register);
  $("#name").required = register;
  $("#discord").required = register;
  $("#confirm-password").required = register;
  $("#password").minLength = register ? 6 : 3;
  $("#password").autocomplete = register ? "new-password" : "current-password";
  $("#email").type = register ? "email" : "text";
  $("#email").placeholder = register ? "E-mail" : "E-mail ou usuÃ¡rio";
  $("#email").autocomplete = register ? "email" : "username";
  $("#form-eyebrow").textContent = register ? "SOLICITAR ACESSO" : "ÃREA RESTRITA";
  $("#form-title").textContent = register ? "Criar sua conta" : "Bem-vindo de volta";
  $("#form-subtitle").textContent = register ? "Seu cadastro serÃ¡ enviado para anÃ¡lise." : "Entre com suas credenciais para continuar.";
  $("#submit-button span").textContent = register ? "ENVIAR PARA ANÃLISE" : "ENTRAR NO PAINEL";
  $("#switch-label").textContent = register ? "JÃ¡ possui uma conta?" : "Ainda nÃ£o possui acesso?";
  $("#switch-mode").textContent = register ? "Fazer login" : "Solicitar acesso";
  hideMessage();
}

function formatCreatedAt(value) {
  try {
    const date = value?.toDate?.();
    if (!date) return "Recent registration";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return "Recent registration"; }
}
function statusLabel(status) { return ({ pending: "Pending", approved: "Approved", rejected: "Rejected" })[status] || "Unknown"; }
function displayRole(role) {
  if (role === "admin") return "Administrator";
  if (role === "client") return "SELLER DIAMOND w- MORITZ";
  return "Seller w API";
}
function resolveLoginIdentifier(value) {
  const clean = String(value || "").trim();
  return privateLoginAliases[clean.toLowerCase()] || clean;
}
function isClientInterface(profile) {
  return profile?.interface === "client" || profile?.role === "client" || String(profile?.username || "").toLowerCase() === "leticiank";
}
function isPrivateClientUser(user) {
  return String(user?.email || "").trim().toLowerCase() === PRIVATE_CLIENT_EMAIL;
}
function buildPrivateClientProfile(user, storedProfile = {}) {
  return {
    ...storedProfile,
    name: storedProfile.name || user?.displayName || "Leticia Nakahara",
    email: PRIVATE_CLIENT_EMAIL,
    username: "leticiank",
    discord: storedProfile.discord || "leticiank",
    role: "client",
    status: "approved",
    interface: "client",
    botName: "Moritz - VENDAS",
    avatar: storedProfile.avatar || "a1"
  };
}

function setAvatar(key = "a1") {
  const safeKey = avatars[key] ? key : "a1";
  const src = avatars[safeKey];
  ["#avatar-image", "#profile-avatar-image", "#client-avatar-image", "#client-profile-avatar-image"].forEach((selector) => {
    const image = $(selector);
    if (image) image.src = src;
  });
  $$("#avatar-picker [data-avatar]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.avatar === safeKey);
    button.querySelector("img").src = avatars[button.dataset.avatar];
  });
  $$("#client-avatar-picker [data-client-avatar]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.clientAvatar === safeKey);
    button.querySelector("img").src = avatars[button.dataset.clientAvatar];
  });
}

function configureStatusPage(user, profile) {
  const rejected = profile.status === "rejected";
  $("#status-label").textContent = rejected ? "SOLICITAÃ‡ÃƒO REVISADA" : "SOLICITAÃ‡ÃƒO RECEBIDA";
  $("#status-title").textContent = rejected ? "Acesso nÃ£o liberado" : "Aguardando aprovaÃ§Ã£o";
  $("#status-text").textContent = rejected
    ? "Este cadastro foi revisado e nÃ£o recebeu acesso ao painel. Entre em contato com a administraÃ§Ã£o para obter mais informaÃ§Ãµes."
    : "Seu cadastro estÃ¡ salvo e entrou na fila de revisÃ£o. A liberaÃ§Ã£o serÃ¡ aplicada automaticamente apÃ³s a decisÃ£o de um administrador.";
  $("#status-user-name").textContent = profile.name || user.displayName || user.email || "UsuÃ¡rio";
  $("#status-state").textContent = rejected ? "Recusado" : "Em anÃ¡lise";
  showPage("#status");
}

function fillProfile(user, profile) {
  const displayName = profile.name || user.displayName || "UsuÃ¡rio";
  $("#user-name").textContent = displayName;
  $("#profile-name").textContent = displayName;
  $("#profile-email").textContent = profile.email || user.email || "â€”";
  $("#profile-discord").textContent = profile.discord || "Not informed";
  $("#profile-role").textContent = displayRole(profile.role);
  setAvatar(profile.avatar || "a1");
}

function firstName(name = "") {
  return String(name || "UsuÃ¡rio").trim().split(/\s+/)[0] || "UsuÃ¡rio";
}

function fillClientProfile(user, profile) {
  const displayName = profile.name || user.displayName || "Leticia Nakahara";
  const username = profile.username || "leticiank";
  const email = profile.email || user.email || PRIVATE_CLIENT_EMAIL;
  const discord = profile.discord || username;
  const botName = "Moritz - VENDAS";
  $("#client-user-name").textContent = displayName;
  $("#client-user-login").textContent = "Open profile";
  $("#client-welcome-name").textContent = firstName(displayName);
  $("#client-profile-name").textContent = displayName;
  $("#client-profile-username").textContent = email;
  $("#client-profile-login").textContent = email;
  $("#client-profile-discord").textContent = discord;
  $("#client-profile-role").textContent = displayRole(profile.role);
  const payerName = $("#client-deposit-name");
  if (payerName && !payerName.value) payerName.value = displayName;
  $("#client-overview-bot-name").textContent = botName;
  $("#client-bot-name").textContent = botName;
  setAvatar(profile.avatar || "a1");
}

function formatWalletCurrency(cents = 0) {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function parseMoneyInput(value) {
  const clean = String(value || "").trim().replace(/\s/g, "");
  if (!clean) return 0;
  let normalized = clean;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function walletErrorMessage(error) {
  const text = String(error?.message || "").trim();
  if (!text || text === "Failed to fetch") return "O serviÃ§o de saldo estÃ¡ indisponÃ­vel no momento.";
  return text;
}

function showWalletMessage(text, type = "info") {
  const box = $("#client-wallet-message");
  if (!box) return;
  box.textContent = text;
  box.className = `client-wallet-message ${type}`;
}

function hideWalletMessage() {
  const box = $("#client-wallet-message");
  if (box) box.className = "client-wallet-message hidden";
}

async function walletApi(path, options = {}) {
  if (!currentUser) throw new Error("SessÃ£o nÃ£o encontrada.");
  const token = await currentUser.getIdToken();
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${PAYMENTS_API_BASE}${path}`, { ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : payload.message;
    throw new Error(detail || `Erro ${response.status} ao consultar o saldo.`);
  }
  return payload;
}

function walletStatusMeta(status = "") {
  const key = String(status || "").toLowerCase();
  if (key === "complete") return { label: "ConcluÃ­do", className: "complete" };
  if (key === "failed") return { label: "Falhou", className: "failed" };
  if (key === "refunded") return { label: "Estornado", className: "refunded" };
  return { label: "Pendente", className: "pending" };
}

function formatWalletDate(value) {
  if (!value) return "â€”";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderWalletHistory(transactions = []) {
  const list = $("#client-wallet-history-list");
  if (!list) return;
  list.replaceChildren();
  if (!transactions.length) {
    const empty = document.createElement("div");
    empty.className = "client-wallet-empty";
    empty.textContent = "Nenhuma movimentaÃ§Ã£o ainda.";
    list.append(empty);
    return;
  }
  transactions.forEach((transaction) => {
    const row = document.createElement("div");
    row.className = "client-wallet-history-row";
    const type = document.createElement("span");
    type.className = `wallet-history-type ${transaction.type === "deposit" ? "deposit" : "withdraw"}`;
    type.textContent = transaction.type === "deposit" ? "DepÃ³sito" : "Saque";
    const amount = document.createElement("strong");
    amount.textContent = `${transaction.type === "withdraw" ? "âˆ’" : "+"}${formatWalletCurrency(transaction.amountCents)}`;
    const meta = walletStatusMeta(transaction.status);
    const status = document.createElement("span");
    status.className = `wallet-history-status ${meta.className}`;
    status.textContent = meta.label;
    const date = document.createElement("span");
    date.className = "wallet-history-date";
    date.textContent = formatWalletDate(transaction.createdAt);
    row.append(type, amount, status, date);
    list.append(row);
  });
}

function renderWallet(data = {}) {
  currentWallet = {
    balanceCents: Number(data.balanceCents || 0),
    transactions: Array.isArray(data.transactions) ? data.transactions : []
  };
  const formatted = formatWalletCurrency(currentWallet.balanceCents);
  if ($("#client-header-balance")) $("#client-header-balance").textContent = formatted;
  if ($("#client-wallet-balance")) $("#client-wallet-balance").textContent = formatted;
  if ($("#client-withdraw-available")) $("#client-withdraw-available").textContent = formatted;
  renderWalletHistory(currentWallet.transactions);
}

async function loadWallet({ silent = false } = {}) {
  if (!isPrivateClientUser(currentUser)) return;
  if (!silent) hideWalletMessage();
  try {
    const data = await walletApi("/api/wallet?sync=1");
    renderWallet(data);
    return data;
  } catch (error) {
    console.error("Wallet load failed", error);
    if (!silent) showWalletMessage(walletErrorMessage(error), "error");
    throw error;
  }
}

function setWalletTab(tab) {
  const allowed = ["deposit", "withdraw", "history"];
  if (!allowed.includes(tab)) return;
  $$("[data-wallet-tab]").forEach((button) => button.classList.toggle("active", button.dataset.walletTab === tab));
  allowed.forEach((name) => $("#client-wallet-" + name)?.classList.toggle("hidden", name !== tab));
  if (tab === "history") loadWallet({ silent: true }).catch(() => {});
}

function stopWalletPolling() {
  if (walletPollingTimer) window.clearInterval(walletPollingTimer);
  walletPollingTimer = null;
}

function startWalletPolling() {
  stopWalletPolling();
  let attempts = 0;
  walletPollingTimer = window.setInterval(async () => {
    attempts += 1;
    try {
      const data = await loadWallet({ silent: true });
      const pending = data?.transactions?.some((item) => item.status === "pending");
      if (!pending || attempts >= 30) stopWalletPolling();
    } catch {
      if (attempts >= 12) stopWalletPolling();
    }
  }, WALLET_POLL_INTERVAL);
}

function showPixResult(data) {
  const result = $("#client-deposit-result");
  if (!result) return;
  const image = $("#client-pix-qr");
  const imageSource = data.qrCodeBase64 || data.qrcodeUrl || "";
  image.src = imageSource;
  image.closest(".client-pix-qr-wrap")?.classList.toggle("hidden", !imageSource);
  $("#client-pix-copy-paste").value = data.copyPaste || "";
  $("#client-pix-transaction-id").textContent = data.transactionId || "â€”";
  $("#client-pix-status").textContent = "Aguardando pagamento";
  result.classList.remove("hidden");
}

async function submitWalletDeposit(event) {
  event.preventDefault();
  hideWalletMessage();
  const amountCents = parseMoneyInput($("#client-deposit-amount").value);
  const payerName = $("#client-deposit-name").value.trim();
  const payerDocument = $("#client-deposit-document").value.replace(/\D/g, "");
  if (amountCents < 100) return showWalletMessage("O depÃ³sito mÃ­nimo Ã© R$ 1,00.", "error");
  if (payerName.length < 3) return showWalletMessage("Informe o nome do pagador.", "error");
  if (payerDocument.length !== 11) return showWalletMessage("Informe um CPF com 11 dÃ­gitos.", "error");
  const button = $("#client-deposit-submit");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "Gerando PIX...";
  try {
    const data = await walletApi("/api/wallet/deposit", {
      method: "POST",
      body: JSON.stringify({ amountCents, payerName, payerDocument })
    });
    showPixResult(data);
    showWalletMessage("PIX gerado. O saldo serÃ¡ atualizado quando o pagamento for confirmado.", "success");
    await loadWallet({ silent: true });
    startWalletPolling();
  } catch (error) {
    console.error(error);
    showWalletMessage(walletErrorMessage(error), "error");
  } finally {
    button.disabled = false;
    label.textContent = "Gerar PIX";
  }
}

async function submitWalletWithdraw(event) {
  event.preventDefault();
  hideWalletMessage();
  const amountCents = parseMoneyInput($("#client-withdraw-amount").value);
  const pixKeyType = $("#client-withdraw-key-type").value;
  const pixKey = $("#client-withdraw-key").value.trim();
  if (amountCents < 100) return showWalletMessage("O saque mÃ­nimo Ã© R$ 1,00.", "error");
  if (amountCents > currentWallet.balanceCents) return showWalletMessage("Saldo insuficiente para este saque.", "error");
  if (!pixKey) return showWalletMessage("Informe a chave PIX.", "error");
  const button = $("#client-withdraw-submit");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "Enviando saque...";
  $("#client-withdraw-last-status").textContent = "Enviando";
  try {
    const data = await walletApi("/api/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ amountCents, pixKeyType, pixKey, requestId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}` })
    });
    $("#client-withdraw-last-status").textContent = data.status === "complete" ? "ConcluÃ­do" : "Processando";
    $("#client-withdraw-amount").value = "";
    $("#client-withdraw-key").value = "";
    showWalletMessage("Saque enviado para processamento.", "success");
    await loadWallet({ silent: true });
    startWalletPolling();
  } catch (error) {
    console.error(error);
    $("#client-withdraw-last-status").textContent = "Falhou";
    showWalletMessage(walletErrorMessage(error), "error");
    await loadWallet({ silent: true }).catch(() => {});
  } finally {
    button.disabled = false;
    label.textContent = "Solicitar saque";
  }
}

const INVOICE_PLAN_PRICES = {
  market_api: { quarterly: 14999, semester: 24999, annual: 34999 },
  photos_accounts: { monthly: 4999, semester: 19999 }
};

function invoiceApi(path, options = {}) {
  return walletApi(path, options);
}

function invoiceStatusMeta(status = "overdue") {
  return String(status).toLowerCase() === "active"
    ? { label: "ATIVA", className: "active" }
    : { label: "VENCIDA", className: "overdue" };
}

function renderInvoices(data = {}) {
  currentInvoices = {
    invoices: Array.isArray(data.invoices) ? data.invoices : [],
    pendingOrder: data.pendingOrder || null
  };
  const overdue = currentInvoices.invoices.filter((item) => item.status !== "active");
  const count = overdue.length;
  const countEl = $("#client-overdue-count");
  if (countEl) countEl.textContent = String(count);
  const summary = $("#client-invoices-summary");
  if (summary) summary.textContent = count ? `${count} vencida${count === 1 ? "" : "s"}` : "Tudo em dia";

  currentInvoices.invoices.forEach((invoice) => {
    const card = document.querySelector(`[data-invoice-service="${invoice.serviceId}"]`);
    if (!card) return;
    const badge = card.querySelector(".client-invoice-status");
    const meta = invoiceStatusMeta(invoice.status);
    badge.textContent = meta.label;
    badge.className = `client-invoice-status ${meta.className}`;
    card.classList.toggle("paid", invoice.status === "active");
    const accessRow = document.querySelector(`[data-access-service="${invoice.serviceId}"]`);
    if (accessRow) {
      const accessBadge = accessRow.querySelector("em");
      if (accessBadge) accessBadge.textContent = invoice.status === "active" ? "ATIVA" : "VENCIDA";
      accessRow.classList.toggle("overdue", invoice.status !== "active");
      accessRow.classList.toggle("enabled", invoice.status === "active");
    }
  });

  const dismissed = sessionStorage.getItem("moritz-leticia-invoices-dismissed") === "1";
  $("#client-billing-alert")?.classList.toggle("hidden", count === 0 || dismissed);
  const payButton = $("#client-pay-all-invoices");
  if (payButton) {
    payButton.disabled = count === 0 || Boolean(currentInvoices.pendingOrder);
    const label = payButton.querySelector("span");
    if (label) label.textContent = currentInvoices.pendingOrder ? "Pagamento pendente" : "Pagar todas agora";
  }
}

async function loadInvoices({ silent = false } = {}) {
  if (!isPrivateClientUser(currentUser)) return;
  try {
    const data = await invoiceApi("/api/invoices?sync=1");
    renderInvoices(data);
    return data;
  } catch (error) {
    console.error("Invoice load failed", error);
    if (!silent) {
      const summary = $("#client-invoices-summary");
      if (summary) summary.textContent = "NÃ£o foi possÃ­vel atualizar";
    }
    throw error;
  }
}

function invoiceSelectedTotal() {
  const market = $("#client-market-plan")?.value || "quarterly";
  const photos = $("#client-photos-plan")?.value || "monthly";
  return (INVOICE_PLAN_PRICES.market_api[market] || 0) + (INVOICE_PLAN_PRICES.photos_accounts[photos] || 0);
}

function updateInvoiceTotal() {
  const total = $("#client-invoice-total");
  if (total) total.textContent = formatWalletCurrency(invoiceSelectedTotal());
}

function openInvoiceModal() {
  $("#client-invoice-message").className = "client-wallet-message hidden";
  $("#client-invoice-pix-result").classList.add("hidden");
  $("#client-invoice-plan-form").classList.remove("hidden");
  const payer = $("#client-invoice-payer-name");
  if (payer && !payer.value) payer.value = currentProfile?.name || "Leticia Nakahara";
  updateInvoiceTotal();
  $("#client-invoice-modal").classList.remove("hidden");
}

function closeInvoiceModal() {
  $("#client-invoice-modal").classList.add("hidden");
}

function showInvoiceMessage(text, type = "info") {
  const box = $("#client-invoice-message");
  box.textContent = text;
  box.className = `client-wallet-message ${type}`;
}

function stopInvoicePolling() {
  if (invoicePollingTimer) window.clearInterval(invoicePollingTimer);
  invoicePollingTimer = null;
}

function startInvoicePolling() {
  stopInvoicePolling();
  let attempts = 0;
  invoicePollingTimer = window.setInterval(async () => {
    attempts += 1;
    try {
      const data = await loadInvoices({ silent: true });
      if (!data?.pendingOrder || attempts >= 30) {
        stopInvoicePolling();
        if (!data?.pendingOrder) {
          $("#client-invoice-pix-status").textContent = "Pagamento confirmado";
          showInvoiceMessage("Pagamento confirmado.", "success");
        }
      }
    } catch {
      if (attempts >= 12) stopInvoicePolling();
    }
  }, WALLET_POLL_INTERVAL);
}

async function submitInvoicePayment() {
  const marketPlan = $("#client-market-plan").value;
  const photosPlan = $("#client-photos-plan").value;
  const payerName = $("#client-invoice-payer-name").value.trim();
  const payerDocument = $("#client-invoice-payer-document").value.replace(/\D/g, "");
  if (payerName.length < 3) return showInvoiceMessage("Informe o nome do pagador.", "error");
  if (payerDocument.length !== 11) return showInvoiceMessage("Informe um CPF com 11 dÃ­gitos.", "error");

  const button = $("#client-invoice-confirm");
  const label = button.querySelector("span");
  button.disabled = true;
  label.textContent = "Gerando PIX...";
  try {
    const data = await invoiceApi("/api/invoices/pay", {
      method: "POST",
      body: JSON.stringify({
        selections: { market_api: marketPlan, photos_accounts: photosPlan },
        payerName,
        payerDocument
      })
    });
    $("#client-invoice-plan-form").classList.add("hidden");
    const result = $("#client-invoice-pix-result");
    const image = $("#client-invoice-pix-qr");
    const imageSource = data.qrCodeBase64 || data.qrcodeUrl || "";
    image.src = imageSource;
    image.closest(".client-pix-qr-wrap")?.classList.toggle("hidden", !imageSource);
    $("#client-invoice-pix-copy").value = data.copyPaste || "";
    $("#client-invoice-transaction-id").textContent = data.transactionId || "â€”";
    $("#client-invoice-pix-status").textContent = "Aguardando pagamento";
    result.classList.remove("hidden");
    showInvoiceMessage(`PIX gerado no valor de ${formatWalletCurrency(data.amountCents || invoiceSelectedTotal())}.`, "success");
    await loadInvoices({ silent: true });
    startInvoicePolling();
  } catch (error) {
    console.error(error);
    showInvoiceMessage(walletErrorMessage(error), "error");
  } finally {
    button.disabled = false;
    label.textContent = "Gerar PIX das faturas";
  }
}

function closeClientSidebar() {
  $("#client-sidebar").classList.remove("open");
  $("#client-sidebar-backdrop").classList.add("hidden");
}

function openClientView(view) {
  if (!clientViewMeta[view]) return;
  currentClientView = view;
  clientPanelViews.forEach((selector) => $(selector).classList.toggle("hidden", selector !== `#${view}-view`));
  $$(".client-nav-item[data-client-view]").forEach((button) => button.classList.toggle("active", button.dataset.clientView === view));
  $("#client-dashboard-eyebrow").textContent = clientViewMeta[view].eyebrow;
  $("#client-dashboard-title").textContent = clientViewMeta[view].title;
  closeClientSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMobileSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.add("hidden");
}
function openDashboardView(view) {
  if (!viewMeta[view]) return;
  if (["requests", "notice"].includes(view) && currentProfile?.role !== "admin") return;
  currentView = view;
  panelViews.forEach((selector) => $(selector).classList.toggle("hidden", selector !== `#${view}-view`));
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#dashboard-eyebrow").textContent = viewMeta[view].eyebrow;
  $("#dashboard-title").textContent = viewMeta[view].title;
  $("#reload-requests").classList.toggle("hidden", view !== "requests");
  if (view === "requests" && !requestsLoaded) loadRequests();
  if (view === "notice") loadNoticeEditor();
  closeMobileSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function playWorkspaceIntro(userId) {
  const key = `moritz-workspace-intro:${userId}`;
  const overlay = $("#workspace-intro");
  if (!overlay || sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "played");
  overlay.classList.remove("hidden", "closing");
  const modules = $$(".boot-module");
  const steps = [
    ["Validating session...", "Authentication confirmed", 24],
    ["Loading permissions...", "Seller API access mapped", 49],
    ["Reading bot registry...", "2 bot records connected", 74],
    ["Checking services...", "Maintenance schedule loaded", 100]
  ];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (let index = 0; index < modules.length; index += 1) {
    const item = modules[index];
    const [title, subtitle, percent] = steps[index];
    $("#boot-title").textContent = title;
    $("#boot-subtitle").textContent = subtitle;
    item.classList.add("active");
    $("#boot-progress-bar").style.width = `${percent}%`;
    $("#boot-percent").textContent = `${percent}%`;
    await wait(reducedMotion ? 120 : 560);
    item.classList.remove("active");
    item.classList.add("ready");
    await wait(reducedMotion ? 40 : 150);
  }
  $("#boot-title").textContent = "Workspace ready";
  $("#boot-subtitle").textContent = "Opening dashboard...";
  await wait(reducedMotion ? 120 : 540);
  overlay.classList.add("closing");
  await wait(430);
  overlay.classList.add("hidden");
  overlay.classList.remove("closing");
  $("#boot-progress-bar").style.width = "0";
  $("#boot-percent").textContent = "0%";
  modules.forEach((item) => item.classList.remove("active", "ready"));
}

function noticeDismissKey(notice) { return `moritz-notice-dismissed:${notice.version || "default"}`; }
function isNoticeDismissed(notice) { return localStorage.getItem(noticeDismissKey(notice)) === "1"; }
function closeMaintenanceNotice() {
  if (currentNotice && $("#maintenance-dismiss-check").checked) {
    localStorage.setItem(noticeDismissKey(currentNotice), "1");
  }
  $("#maintenance-modal").classList.add("hidden");
}
function showMaintenanceNotice(notice, force = false) {
  if (!notice?.active) return;
  currentNotice = notice;
  if (!force && isNoticeDismissed(notice)) return;
  $("#maintenance-modal-title").textContent = notice.title || DEFAULT_NOTICE.title;
  $("#maintenance-modal-message").textContent = notice.message || DEFAULT_NOTICE.message;
  $("#maintenance-modal-time").textContent = notice.returnTime || DEFAULT_NOTICE.returnTime;
  $("#maintenance-dismiss-check").checked = false;
  $("#maintenance-modal").classList.remove("hidden");
}
async function loadMaintenanceNotice(force = false) {
  if (!db || !currentUser) return;
  try {
    const snapshot = await getDoc(doc(db, "system", "maintenance"));
    const notice = snapshot.exists() ? snapshot.data() : DEFAULT_NOTICE;
    showMaintenanceNotice(notice, force);
  } catch (error) {
    console.error(error);
    showMaintenanceNotice(DEFAULT_NOTICE, force);
  }
}

async function setupDashboard(user, profile) {
  currentProfile = profile;
  currentUser = user;
  requestsLoaded = false;
  fillProfile(user, profile);
  const admin = profile.role === "admin";
  $("#nav-requests").classList.toggle("hidden", !admin);
  $("#nav-notice").classList.toggle("hidden", !admin);
  openDashboardView("overview");
  showPage("#dashboard");
  await playWorkspaceIntro(user.uid);
  await loadMaintenanceNotice();
  if (admin) {
    loadRequests({ updateOnly: true });
  }
}

async function setupClientDashboard(user, profile) {
  currentProfile = profile;
  currentUser = user;
  currentNotice = null;
  $("#maintenance-modal").classList.add("hidden");
  requestsLoaded = false;
  fillClientProfile(user, profile);
  openClientView("client-overview");
  showPage("#client-dashboard");
  loadWallet().catch(() => {});
  loadInvoices({ silent: true }).catch(() => {
    $("#client-billing-alert")?.classList.remove("hidden");
  });
}

async function loadProfile(user) {
  showPage("#loading");

  // This account always receives the private client interface.
  // It does not depend on the role/status saved by the public registration flow.
  if (isPrivateClientUser(user)) {
    let storedProfile = {};
    try {
      const privateSnapshot = await getDoc(doc(db, "users", user.uid));
      if (privateSnapshot.exists()) storedProfile = privateSnapshot.data();
    } catch (error) {
      console.warn("Private client profile could not be read; using local defaults.", error);
    }
    await setupClientDashboard(user, buildPrivateClientProfile(user, storedProfile));
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) {
      $("#status-label").textContent = "PERFIL NÃƒO ENCONTRADO";
      $("#status-title").textContent = "NÃ£o foi possÃ­vel validar seu acesso";
      $("#status-text").textContent = "A conta existe, mas o cadastro de acesso nÃ£o foi localizado. Entre em contato com a administraÃ§Ã£o.";
      $("#status-user-name").textContent = user.displayName || user.email || "UsuÃ¡rio";
      $("#status-state").textContent = "IndisponÃ­vel";
      $("#refresh-status").classList.add("hidden");
      showPage("#status");
      return;
    }
    const profile = snapshot.data();
    currentUser = user;
    currentProfile = profile;
    $("#refresh-status").classList.remove("hidden");
    if (profile.passwordReset?.active || profile.passwordReset?.mustChange) {
      showPage("#password-reset-flow");
      await loadMaintenanceNotice();
      return;
    }
    if (profile.status === "approved") {
      if (isClientInterface(profile)) await setupClientDashboard(user, profile);
      else await setupDashboard(user, profile);
      return;
    }
    configureStatusPage(user, profile);
    await loadMaintenanceNotice();
  } catch (error) {
    console.error(error);
    $("#status-label").textContent = "ERRO DE CONEXÃƒO";
    $("#status-title").textContent = "NÃ£o foi possÃ­vel consultar o acesso";
    $("#status-text").textContent = "Verifique sua conexÃ£o e tente novamente.";
    $("#status-user-name").textContent = user.displayName || user.email || "UsuÃ¡rio";
    $("#status-state").textContent = "NÃ£o consultado";
    showPage("#status");
  }
}

function createRequestRow(item) {
  const row = document.createElement("article");
  row.className = "request-row";
  const person = document.createElement("div");
  person.className = "request-person";
  const name = document.createElement("strong");
  name.textContent = item.name || "Unnamed user";
  const created = document.createElement("span");
  created.textContent = `${displayRole(item.role)} Â· ${formatCreatedAt(item.createdAt)}`;
  person.append(name, created);
  const contact = document.createElement("div");
  contact.className = "request-contact";
  const email = document.createElement("strong");
  email.textContent = item.email || "E-mail not informed";
  const discord = document.createElement("span");
  discord.textContent = item.discord ? `Discord: ${item.discord}` : "Discord not informed";
  contact.append(email, discord);
  const status = document.createElement("span");
  status.className = `status-tag ${item.status || "pending"}`;
  status.textContent = statusLabel(item.status);
  const actions = document.createElement("div");
  actions.className = "request-actions";
  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "action-button approve";
  approve.textContent = item.status === "approved" ? "Approved" : "Approve";
  approve.disabled = item.status === "approved";
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "action-button reject";
  reject.textContent = item.status === "rejected" ? "Rejected" : "Reject";
  reject.disabled = item.status === "rejected";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "action-button reset";
  reset.textContent = "Reset password";
  approve.addEventListener("click", () => updateAccess(item.id, "approved", [approve, reject, reset]));
  reject.addEventListener("click", () => updateAccess(item.id, "rejected", [approve, reject, reset]));
  reset.addEventListener("click", () => activateTemporaryReset(item, reset));
  actions.append(approve, reject, reset);
  row.append(person, contact, status, actions);
  return row;
}

async function loadRequests(options = {}) {
  if (!currentProfile || currentProfile.role !== "admin") return;
  const { updateOnly = false } = options;
  hideRequestsMessage();
  if (!updateOnly) {
    $("#requests-summary").textContent = "Updating access requests...";
    $("#requests-list").replaceChildren();
  }
  try {
    const snapshot = await getDocs(collection(db, "users"));
    const users = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((item) => item.role === "Seller w API" && String(item.email || "").toLowerCase() !== PRIVATE_CLIENT_EMAIL)
      .sort((a, b) => {
        const priority = { pending: 0, rejected: 1, approved: 2 };
        const statusDifference = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
        if (statusDifference !== 0) return statusDifference;
        return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      });
    const pending = users.filter((item) => item.status === "pending").length;
    $("#pending-badge").textContent = String(pending);
    $("#pending-badge").classList.toggle("hidden", pending === 0);
    if (updateOnly && currentView !== "requests") { requestsLoaded = false; return; }
    requestsLoaded = true;
    $("#requests-summary").textContent = pending === 1 ? "1 registration is waiting for a decision." : `${pending} registrations are waiting for a decision.`;
    $("#requests-list").replaceChildren();
    if (!users.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No registrations have been received yet.";
      $("#requests-list").append(empty);
      return;
    }
    users.forEach((item) => $("#requests-list").append(createRequestRow(item)));
  } catch (error) {
    console.error(error);
    if (!updateOnly) {
      $("#requests-summary").textContent = "Access requests could not be loaded.";
      showRequestsMessage("Check the published Firestore rules and try again.");
    }
  }
}

async function updateAccess(userId, nextStatus, buttons) {
  buttons.forEach((button) => { button.disabled = true; });
  hideRequestsMessage();
  try {
    await updateDoc(doc(db, "users", userId), { status: nextStatus, updatedAt: serverTimestamp() });
    showRequestsMessage(nextStatus === "approved" ? "Access approved." : "Access rejected.", "success");
    await loadRequests();
  } catch (error) {
    console.error(error);
    showRequestsMessage("The registration could not be changed. Check the Firestore rules.");
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function activateTemporaryReset(item, button) {
  if (!requestTemporaryReset) return showRequestsMessage("Temporary password service is not initialized.");
  button.disabled = true;
  button.textContent = "Activating...";
  hideRequestsMessage();
  try {
    const result = await requestTemporaryReset({ uid: item.id });
    const minutes = result.data?.expiresInMinutes || 15;
    showRequestsMessage(`Temporary code 000 enabled for ${item.email}. It expires in ${minutes} minutes.`, "success");
  } catch (error) {
    console.error(error);
    showRequestsMessage(errorMessage(error));
  } finally {
    button.disabled = false;
    button.textContent = "Reset password";
  }
}

async function loadNoticeEditor() {
  if (currentProfile?.role !== "admin") return;
  try {
    const snapshot = await getDoc(doc(db, "system", "maintenance"));
    const notice = snapshot.exists() ? snapshot.data() : DEFAULT_NOTICE;
    $("#notice-title-input").value = notice.title || DEFAULT_NOTICE.title;
    $("#notice-message-input").value = notice.message || DEFAULT_NOTICE.message;
    $("#notice-return-input").value = notice.returnTime || DEFAULT_NOTICE.returnTime;
    $("#notice-active-input").checked = notice.active !== false;
    updateNoticePreview();
  } catch (error) { console.error(error); }
}
function updateNoticePreview() {
  $("#notice-preview-title").textContent = $("#notice-title-input").value || DEFAULT_NOTICE.title;
  $("#notice-preview-message").textContent = $("#notice-message-input").value || DEFAULT_NOTICE.message;
  $("#notice-preview-time").textContent = $("#notice-return-input").value || DEFAULT_NOTICE.returnTime;
}
async function saveSystemNotice(event) {
  event.preventDefault();
  if (currentProfile?.role !== "admin") return;
  const button = $("#notice-save");
  button.disabled = true;
  showNoticeFormMessage("Publishing notice...", "success");
  try {
    const notice = {
      title: $("#notice-title-input").value.trim(),
      message: $("#notice-message-input").value.trim(),
      returnTime: $("#notice-return-input").value,
      active: $("#notice-active-input").checked,
      version: `notice-${Date.now()}`,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    };
    await setDoc(doc(db, "system", "maintenance"), notice, { merge: true });
    currentNotice = notice;
    showNoticeFormMessage(notice.active ? "Notice published for all users." : "Notice disabled.", "success");
    if (notice.active) showMaintenanceNotice(notice, true);
  } catch (error) {
    console.error(error);
    showNoticeFormMessage("The notice could not be published. Check the Firestore rules.");
  } finally { button.disabled = false; }
}

async function logout() {
  stopWalletPolling();
  stopInvoicePolling();
  sessionStorage.removeItem("moritz-leticia-invoices-dismissed");
  if (currentUser?.uid) sessionStorage.removeItem(`moritz-workspace-intro:${currentUser.uid}`);
  closeMobileSidebar();
  closeClientSidebar();
  $("#maintenance-modal").classList.add("hidden");
  await signOut(auth);
}

function installShortcutGuards() {
  const toast = document.createElement("div");
  toast.className = "shortcut-toast";
  toast.textContent = "Shortcut unavailable in this workspace.";
  document.body.append(toast);
  const blocked = () => {
    toast.classList.add("show");
    clearTimeout(shortcutToastTimer);
    shortcutToastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
  };
  document.addEventListener("contextmenu", (event) => { event.preventDefault(); blocked(); });
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const devShortcut = event.key === "F12" || (event.ctrlKey && key === "u") || (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key));
    if (devShortcut) { event.preventDefault(); event.stopPropagation(); blocked(); }
  }, true);
}

async function init() {
  installShortcutGuards();
  if (!configIsReady()) {
    showPage("#auth");
    const box = $("#config-error");
    box.textContent = "O Firebase ainda nÃ£o foi configurado. Mantenha firebase-config.js na raiz do repositÃ³rio.";
    box.classList.remove("hidden");
    $("#submit-button").disabled = true;
    return;
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, "us-central1");
  requestTemporaryReset = httpsCallable(functions, "requestTemporaryReset");
  loginWithTemporaryCode = httpsCallable(functions, "loginWithTemporaryCode");
  completeTemporaryReset = httpsCallable(functions, "completeTemporaryReset");
  onAuthStateChanged(auth, async (user) => {
    if (registrationInProgress) return;
    if (!user) {
      currentProfile = null;
      currentUser = null;
      currentNotice = null;
      requestsLoaded = false;
      stopWalletPolling();
      currentWallet = { balanceCents: 0, transactions: [] };
      showPage("#auth");
      return;
    }
    await loadProfile(user);
  });
}

$("#switch-mode").addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth || !db) return;
  hideMessage();
  const submit = $("#submit-button");
  submit.disabled = true;
  submit.querySelector("span").textContent = "PROCESSANDO...";
  try {
    const identifier = $("#email").value.trim();
    const email = mode === "register" ? identifier : resolveLoginIdentifier(identifier);
    const password = $("#password").value;
    if (mode === "register") {
      if (password !== $("#confirm-password").value) throw new Error("PASSWORD_MISMATCH");
      registrationInProgress = true;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const name = $("#name").value.trim();
      await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        discord: $("#discord").value.trim(),
        email: credential.user.email,
        status: "pending",
        role: "Seller w API",
        avatar: "a1",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      registrationInProgress = false;
      await loadProfile(credential.user);
    } else if (password === "000") {
      const result = await loginWithTemporaryCode({ email, code: "000" });
      await signInWithCustomToken(auth, result.data.token);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    registrationInProgress = false;
    showMessage(error.message === "PASSWORD_MISMATCH" ? "As senhas nÃ£o coincidem." : errorMessage(error));
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = mode === "register" ? "ENVIAR PARA ANÃLISE" : "ENTRAR NO PAINEL";
  }
});

$("#forced-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#forced-password").value;
  const confirmation = $("#forced-password-confirm").value;
  const message = $("#forced-password-message");
  message.className = "message hidden";
  if (password !== confirmation) {
    message.textContent = "The passwords do not match.";
    message.className = "message error";
    return;
  }
  const button = $("#forced-password-submit");
  button.disabled = true;
  button.querySelector("span").textContent = "SAVING...";
  try {
    await updatePassword(auth.currentUser, password);
    await completeTemporaryReset({});
    message.textContent = "Password updated successfully.";
    message.className = "message success";
    await wait(500);
    await loadProfile(auth.currentUser);
  } catch (error) {
    console.error(error);
    message.textContent = errorMessage(error);
    message.className = "message error";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "SAVE NEW PASSWORD";
  }
});

$("#reset-password").addEventListener("click", async () => {
  const identifier = $("#email").value.trim();
  if (!identifier) return showMessage("Digite seu e-mail ou usuÃ¡rio para recuperar a senha.");
  if (privateLoginAliases[identifier.toLowerCase()]) {
    return showMessage("Esta Ã© uma conta privada por usuÃ¡rio. A redefiniÃ§Ã£o de senha deve ser feita pela administraÃ§Ã£o.");
  }
  const email = resolveLoginIdentifier(identifier);
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Enviamos o link de redefiniÃ§Ã£o para seu e-mail.", "success");
  } catch (error) { showMessage(errorMessage(error)); }
});

$$(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => openDashboardView(button.dataset.view)));
$("#profile-trigger").addEventListener("click", () => openDashboardView("profile"));
$$(".client-nav-item[data-client-view]").forEach((button) => button.addEventListener("click", () => openClientView(button.dataset.clientView)));
$$("[data-open-client-view]").forEach((button) => button.addEventListener("click", () => openClientView(button.dataset.openClientView)));
$$("[data-open-invoices]").forEach((button) => button.addEventListener("click", () => openClientView("client-invoices")));
$("#client-profile-trigger").addEventListener("click", () => openClientView("client-profile"));
$("#client-view-invoices").addEventListener("click", () => openClientView("client-invoices"));
$("#client-dismiss-billing-alert").addEventListener("click", () => {
  sessionStorage.setItem("moritz-leticia-invoices-dismissed", "1");
  $("#client-billing-alert").classList.add("hidden");
});
$("#client-pay-all-invoices").addEventListener("click", openInvoiceModal);
$("#client-invoice-modal-close").addEventListener("click", closeInvoiceModal);
$("#client-invoice-modal").addEventListener("click", (event) => {
  if (event.target === $("#client-invoice-modal")) closeInvoiceModal();
});
["#client-market-plan", "#client-photos-plan"].forEach((selector) => $(selector).addEventListener("change", updateInvoiceTotal));
$("#client-invoice-confirm").addEventListener("click", submitInvoicePayment);
$("#client-invoice-payer-document").addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
  event.target.value = digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});
$("#client-invoice-copy-button").addEventListener("click", async () => {
  const value = $("#client-invoice-pix-copy").value;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); }
  catch { $("#client-invoice-pix-copy").select(); document.execCommand("copy"); }
  showInvoiceMessage("PIX copia e cola copiado.", "success");
});
$("#client-balance-header").addEventListener("click", () => {
  openClientView("client-profile");
  window.setTimeout(() => $("#client-wallet-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
});
$$("[data-wallet-tab]").forEach((button) => button.addEventListener("click", () => setWalletTab(button.dataset.walletTab)));
$("#client-wallet-refresh").addEventListener("click", () => loadWallet().catch(() => {}));
$("#client-wallet-history-refresh").addEventListener("click", () => loadWallet().catch(() => {}));
$("#client-deposit-form").addEventListener("submit", submitWalletDeposit);
$("#client-withdraw-form").addEventListener("submit", submitWalletWithdraw);
$("#client-pix-copy-button").addEventListener("click", async () => {
  const value = $("#client-pix-copy-paste").value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    showWalletMessage("PIX copia e cola copiado.", "success");
  } catch {
    $("#client-pix-copy-paste").select();
    document.execCommand("copy");
    showWalletMessage("PIX copia e cola copiado.", "success");
  }
});
$("#client-deposit-document").addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
  event.target.value = digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});
$("#refresh-status").addEventListener("click", () => auth?.currentUser && loadProfile(auth.currentUser));
$("#reload-requests").addEventListener("click", () => loadRequests());
$$("[data-logout]").forEach((button) => button.addEventListener("click", logout));

$("#change-avatar").addEventListener("click", () => $("#avatar-picker").classList.toggle("hidden"));
$$("#avatar-picker [data-avatar]").forEach((button) => {
  button.addEventListener("click", async () => {
    const key = button.dataset.avatar;
    setAvatar(key);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { avatar: key, updatedAt: serverTimestamp() });
      currentProfile.avatar = key;
      $("#avatar-picker").classList.add("hidden");
    } catch (error) { console.error(error); }
  });
});

$("#client-change-avatar").addEventListener("click", () => $("#client-avatar-picker").classList.toggle("hidden"));
$$("#client-avatar-picker [data-client-avatar]").forEach((button) => {
  button.addEventListener("click", async () => {
    const key = button.dataset.clientAvatar;
    setAvatar(key);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { avatar: key, updatedAt: serverTimestamp() });
      currentProfile.avatar = key;
      $("#client-avatar-picker").classList.add("hidden");
    } catch (error) { console.error(error); }
  });
});

$$(".bot-configure").forEach((button) => {
  button.addEventListener("click", async () => {
    const row = button.closest(".bot-row");
    const error = row.querySelector(".bot-error");
    const label = button.querySelector("span");
    error.classList.add("hidden");
    error.textContent = "";
    button.disabled = true;
    button.classList.add("loading");
    label.textContent = "Loading...";
    await wait(1100);
    button.disabled = false;
    button.classList.remove("loading");
    label.textContent = "Configure";
    error.textContent = "Configuration service is temporarily unavailable. REASON: MANUTENÃ‡ÃƒO MENSAL, VOLTAMOS HOJE AINDA";
    error.classList.remove("hidden");
  });
});

$("#notice-form").addEventListener("submit", saveSystemNotice);
["#notice-title-input", "#notice-message-input", "#notice-return-input"].forEach((selector) => $(selector).addEventListener("input", updateNoticePreview));
$("#maintenance-close").addEventListener("click", closeMaintenanceNotice);
$("#maintenance-confirm").addEventListener("click", closeMaintenanceNotice);

$("#mobile-menu").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#sidebar-backdrop").classList.remove("hidden");
});
$("#sidebar-close").addEventListener("click", closeMobileSidebar);
$("#sidebar-backdrop").addEventListener("click", closeMobileSidebar);

$("#client-mobile-menu").addEventListener("click", () => {
  $("#client-sidebar").classList.add("open");
  $("#client-sidebar-backdrop").classList.remove("hidden");
});
$("#client-sidebar-close").addEventListener("click", closeClientSidebar);
$("#client-sidebar-backdrop").addEventListener("click", closeClientSidebar);

$("#client-configure-bot").addEventListener("click", () => openClientView("client-bot-config"));

const clientBotTokenInput = $("#client-bot-token");
if (clientBotTokenInput) clientBotTokenInput.value = DEMO_DISCORD_TOKEN;

$("#client-toggle-token").addEventListener("click", () => {
  const input = $("#client-bot-token");
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  $("#client-toggle-token").textContent = reveal ? "Ocultar" : "Mostrar";
});

$("#client-open-source").addEventListener("click", async () => {
  const button = $("#client-open-source");
  const label = button.querySelector("span");
  const message = $("#client-source-message");
  button.disabled = true;
  label.textContent = "Carregando...";
  message.classList.add("hidden");
  await wait(1300);
  message.textContent = "NÃ£o foi possÃ­vel carregar o source.";
  message.className = "client-inline-message error";
  label.textContent = "Falha ao abrir";
  await wait(900);
  window.location.href = "https://moritz.services/";
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  if (hiddenAt && Date.now() - hiddenAt >= 120000 && currentUser && currentNotice && !isNoticeDismissed(currentNotice)) {
    showMaintenanceNotice(currentNotice, true);
  }
  hiddenAt = null;
});

setMode("login");
setAvatar("a1");
init();

