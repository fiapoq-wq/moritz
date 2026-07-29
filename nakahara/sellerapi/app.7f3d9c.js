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
const pages = ["#loading", "#auth", "#status", "#password-reset-flow", "#dashboard"];
const panelViews = ["#overview-view", "#bots-view", "#profile-view", "#requests-view", "#notice-view"];
const authErrors = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um endereço de e-mail válido.",
  "auth/email-already-in-use": "Este e-mail já possui uma conta.",
  "auth/weak-password": "A senha permanente precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet.",
  "functions/not-found": "O serviço de senha temporária ainda não foi publicado.",
  "functions/permission-denied": "Você não possui permissão para executar esta ação.",
  "functions/failed-precondition": "O código temporário não está ativo ou expirou.",
  "functions/unauthenticated": "A sessão administrativa expirou. Entre novamente."
};

const viewMeta = {
  overview: { eyebrow: "WORKSPACE OVERVIEW", title: "Dashboard" },
  bots: { eyebrow: "BOT REGISTRY", title: "My Bots" },
  profile: { eyebrow: "ACCOUNT SETTINGS", title: "My Profile" },
  requests: { eyebrow: "ADMINISTRATION", title: "Access Requests" },
  notice: { eyebrow: "ADMINISTRATION", title: "System Notice" }
};

const DEFAULT_NOTICE = {
  active: true,
  title: "Manutenção programada",
  message: "Estamos adicionando novas funções ao painel. Durante esse período, alguns módulos podem ficar indisponíveis.",
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
let requestsLoaded = false;
let currentNotice = null;
let hiddenAt = null;
let shortcutToastTimer = null;

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
function errorMessage(error) { return authErrors[error?.code] || error?.message || "Não foi possível concluir. Tente novamente."; }
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
  $("#form-eyebrow").textContent = register ? "SOLICITAR ACESSO" : "ÁREA RESTRITA";
  $("#form-title").textContent = register ? "Criar sua conta" : "Bem-vindo de volta";
  $("#form-subtitle").textContent = register ? "Seu cadastro será enviado para análise." : "Entre com suas credenciais para continuar.";
  $("#submit-button span").textContent = register ? "ENVIAR PARA ANÁLISE" : "ENTRAR NO PAINEL";
  $("#switch-label").textContent = register ? "Já possui uma conta?" : "Ainda não possui acesso?";
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
function displayRole(role) { return role === "admin" ? "Administrator" : "Seller w API"; }

function setAvatar(key = "a1") {
  const safeKey = avatars[key] ? key : "a1";
  const src = avatars[safeKey];
  $("#avatar-image").src = src;
  $("#profile-avatar-image").src = src;
  $$("#avatar-picker [data-avatar]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.avatar === safeKey);
    button.querySelector("img").src = avatars[button.dataset.avatar];
  });
}

function configureStatusPage(user, profile) {
  const rejected = profile.status === "rejected";
  $("#status-label").textContent = rejected ? "SOLICITAÇÃO REVISADA" : "SOLICITAÇÃO RECEBIDA";
  $("#status-title").textContent = rejected ? "Acesso não liberado" : "Aguardando aprovação";
  $("#status-text").textContent = rejected
    ? "Este cadastro foi revisado e não recebeu acesso ao painel. Entre em contato com a administração para obter mais informações."
    : "Seu cadastro está salvo e entrou na fila de revisão. A liberação será aplicada automaticamente após a decisão de um administrador.";
  $("#status-user-name").textContent = profile.name || user.displayName || user.email || "Usuário";
  $("#status-state").textContent = rejected ? "Recusado" : "Em análise";
  showPage("#status");
}

function fillProfile(user, profile) {
  const displayName = profile.name || user.displayName || "Usuário";
  $("#user-name").textContent = displayName;
  $("#profile-name").textContent = displayName;
  $("#profile-email").textContent = profile.email || user.email || "—";
  $("#profile-discord").textContent = profile.discord || "Not informed";
  $("#profile-role").textContent = displayRole(profile.role);
  setAvatar(profile.avatar || "a1");
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
  if (admin) loadRequests({ updateOnly: true });
}

async function loadProfile(user) {
  showPage("#loading");
  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) {
      $("#status-label").textContent = "PERFIL NÃO ENCONTRADO";
      $("#status-title").textContent = "Não foi possível validar seu acesso";
      $("#status-text").textContent = "A conta existe, mas o cadastro de acesso não foi localizado. Entre em contato com a administração.";
      $("#status-user-name").textContent = user.displayName || user.email || "Usuário";
      $("#status-state").textContent = "Indisponível";
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
      await setupDashboard(user, profile);
      return;
    }
    configureStatusPage(user, profile);
    await loadMaintenanceNotice();
  } catch (error) {
    console.error(error);
    $("#status-label").textContent = "ERRO DE CONEXÃO";
    $("#status-title").textContent = "Não foi possível consultar o acesso";
    $("#status-text").textContent = "Verifique sua conexão e tente novamente.";
    $("#status-user-name").textContent = user.displayName || user.email || "Usuário";
    $("#status-state").textContent = "Não consultado";
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
  created.textContent = `${displayRole(item.role)} · ${formatCreatedAt(item.createdAt)}`;
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
      .filter((item) => item.role !== "admin")
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
  if (currentUser?.uid) sessionStorage.removeItem(`moritz-workspace-intro:${currentUser.uid}`);
  closeMobileSidebar();
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
    box.textContent = "O Firebase ainda não foi configurado. Mantenha firebase-config.js na raiz do repositório.";
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
      requestsLoaded = false;
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
    const email = $("#email").value.trim();
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
    showMessage(error.message === "PASSWORD_MISMATCH" ? "As senhas não coincidem." : errorMessage(error));
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = mode === "register" ? "ENVIAR PARA ANÁLISE" : "ENTRAR NO PAINEL";
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
  const email = $("#email").value.trim();
  if (!email) return showMessage("Digite seu e-mail para recuperar a senha.");
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Enviamos o link de redefinição para seu e-mail.", "success");
  } catch (error) { showMessage(errorMessage(error)); }
});

$$(".nav-item[data-view]").forEach((button) => button.addEventListener("click", () => openDashboardView(button.dataset.view)));
$("#profile-trigger").addEventListener("click", () => openDashboardView("profile"));
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
    error.textContent = "Configuration service is temporarily unavailable. REASON: MANUTENÇÃO MENSAL, VOLTAMOS HOJE AINDA";
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
