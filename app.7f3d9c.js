import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
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
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const pages = ["#loading", "#auth", "#status", "#dashboard"];
const panelViews = ["#overview-view", "#bots-view", "#profile-view", "#requests-view"];
const authErrors = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um endereço de e-mail válido.",
  "auth/email-already-in-use": "Este e-mail já possui uma conta.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet."
};

const viewMeta = {
  overview: { eyebrow: "WORKSPACE OVERVIEW", title: "Dashboard" },
  bots: { eyebrow: "BOT REGISTRY", title: "My Bots" },
  profile: { eyebrow: "ACCOUNT SETTINGS", title: "My Profile" },
  requests: { eyebrow: "ADMINISTRATION", title: "Access Requests" }
};

let mode = "login";
let registrationInProgress = false;
let auth;
let db;
let currentProfile = null;
let currentUser = null;
let currentView = "overview";
let requestsLoaded = false;

function showPage(id) {
  pages.forEach((page) => $(page).classList.toggle("hidden", page !== id));
}

function showMessage(text, type = "error") {
  const box = $("#form-message");
  box.textContent = text;
  box.className = `message ${type}`;
}

function hideMessage() {
  $("#form-message").className = "message hidden";
}

function showRequestsMessage(text, type = "error") {
  const box = $("#requests-message");
  box.textContent = text;
  box.className = `message ${type}`;
}

function hideRequestsMessage() {
  $("#requests-message").className = "message hidden";
}

function errorMessage(error) {
  return authErrors[error?.code] || "Não foi possível concluir. Tente novamente.";
}

function configIsReady() {
  return !Object.values(firebaseConfig).some((value) => !value || value.includes("COLE_AQUI") || value.includes("SEU-PROJETO"));
}

function setMode(nextMode) {
  mode = nextMode;
  const register = mode === "register";
  $("#register-fields").classList.toggle("hidden", !register);
  $("#confirm-field").classList.toggle("hidden", !register);
  $("#login-options").classList.toggle("hidden", register);
  $("#name").required = register;
  $("#discord").required = register;
  $("#confirm-password").required = register;
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
  } catch {
    return "Recent registration";
  }
}

function statusLabel(status) {
  return {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected"
  }[status] || "Unknown";
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
  const initial = displayName.charAt(0).toUpperCase();
  $("#user-name").textContent = displayName;
  $("#avatar").textContent = initial;
  $("#profile-avatar").textContent = initial;
  $("#profile-name").textContent = displayName;
  $("#profile-email").textContent = profile.email || user.email || "—";
  $("#profile-discord").textContent = profile.discord || "Not informed";
  $("#profile-role").textContent = profile.role === "admin" ? "Administrator" : "User";
}

function closeMobileSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-backdrop").classList.add("hidden");
}

function openDashboardView(view) {
  if (!viewMeta[view]) return;
  if (view === "requests" && currentProfile?.role !== "admin") return;

  currentView = view;
  panelViews.forEach((selector) => $(selector).classList.toggle("hidden", selector !== `#${view}-view`));
  $$(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));

  $("#dashboard-eyebrow").textContent = viewMeta[view].eyebrow;
  $("#dashboard-title").textContent = viewMeta[view].title;
  $("#reload-requests").classList.toggle("hidden", view !== "requests");

  if (view === "requests" && !requestsLoaded) loadRequests();
  closeMobileSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playWorkspaceIntro(userId) {
  const key = `moritz-workspace-intro:${userId}`;
  const overlay = $("#workspace-intro");
  if (!overlay || sessionStorage.getItem(key)) return;

  sessionStorage.setItem(key, "played");
  overlay.classList.remove("hidden", "closing");
  const modules = $$(".boot-module");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    modules.forEach((item) => item.classList.add("ready"));
    await wait(220);
  } else {
    for (const item of modules) {
      item.classList.add("active");
      await wait(220);
      item.classList.remove("active");
      item.classList.add("ready");
      await wait(90);
    }
    await wait(280);
  }

  overlay.classList.add("closing");
  await wait(380);
  overlay.classList.add("hidden");
  overlay.classList.remove("closing");
  modules.forEach((item) => item.classList.remove("active", "ready"));
}

async function setupDashboard(user, profile) {
  currentProfile = profile;
  currentUser = user;
  requestsLoaded = false;

  fillProfile(user, profile);
  const admin = profile.role === "admin";
  $("#nav-requests").classList.toggle("hidden", !admin);

  openDashboardView("overview");
  showPage("#dashboard");
  await playWorkspaceIntro(user.uid);

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
    $("#refresh-status").classList.remove("hidden");

    if (profile.status === "approved") {
      await setupDashboard(user, profile);
      return;
    }

    configureStatusPage(user, profile);
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
  created.textContent = formatCreatedAt(item.createdAt);
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

  approve.addEventListener("click", () => updateAccess(item.id, "approved", [approve, reject]));
  reject.addEventListener("click", () => updateAccess(item.id, "rejected", [approve, reject]));

  actions.append(approve, reject);
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
    const users = snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .filter((item) => item.role !== "admin")
      .sort((a, b) => {
        const priority = { pending: 0, rejected: 1, approved: 2 };
        const statusDifference = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
        if (statusDifference !== 0) return statusDifference;
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    const pending = users.filter((item) => item.status === "pending").length;
    $("#pending-badge").textContent = String(pending);
    $("#pending-badge").classList.toggle("hidden", pending === 0);

    if (updateOnly && currentView !== "requests") {
      requestsLoaded = false;
      return;
    }

    requestsLoaded = true;
    $("#requests-summary").textContent = pending === 1
      ? "1 registration is waiting for a decision."
      : `${pending} registrations are waiting for a decision.`;
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
    await updateDoc(doc(db, "users", userId), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    showRequestsMessage(nextStatus === "approved" ? "Access approved." : "Access rejected.", "success");
    await loadRequests();
  } catch (error) {
    console.error(error);
    showRequestsMessage("The registration could not be changed. Check the Firestore rules.");
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function logout() {
  if (currentUser?.uid) sessionStorage.removeItem(`moritz-workspace-intro:${currentUser.uid}`);
  closeMobileSidebar();
  await signOut(auth);
}

async function init() {
  if (!configIsReady()) {
    showPage("#auth");
    const box = $("#config-error");
    box.textContent = "O Firebase ainda não foi configurado. Abra firebase-config.js e cole os dados do aplicativo Web do Firebase.";
    box.classList.remove("hidden");
    $("#submit-button").disabled = true;
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

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
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      registrationInProgress = false;
      await loadProfile(credential.user);
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

$("#reset-password").addEventListener("click", async () => {
  const email = $("#email").value.trim();
  if (!email) return showMessage("Digite seu e-mail para recuperar a senha.");
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Enviamos o link de redefinição para seu e-mail.", "success");
  } catch (error) {
    showMessage(errorMessage(error));
  }
});

$$(".nav-item[data-view]").forEach((button) => {
  button.addEventListener("click", () => openDashboardView(button.dataset.view));
});

$("#profile-trigger").addEventListener("click", () => openDashboardView("profile"));
$("#refresh-status").addEventListener("click", () => auth?.currentUser && loadProfile(auth.currentUser));
$("#reload-requests").addEventListener("click", () => loadRequests());
$$("[data-logout]").forEach((button) => button.addEventListener("click", logout));

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

    await wait(950);

    button.disabled = false;
    button.classList.remove("loading");
    label.textContent = "Configure";
    error.textContent = "Configuration service is temporarily unavailable. REASON: MANUTENÇÃO MENSAL, VOLTAMOS HOJE AINDA";
    error.classList.remove("hidden");
  });
});

$("#mobile-menu").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#sidebar-backdrop").classList.remove("hidden");
});
$("#sidebar-close").addEventListener("click", closeMobileSidebar);
$("#sidebar-backdrop").addEventListener("click", closeMobileSidebar);

setMode("login");
init();
