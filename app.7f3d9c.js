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
const pages = ["#loading", "#auth", "#status", "#dashboard"];
const authErrors = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "Digite um endereço de e-mail válido.",
  "auth/email-already-in-use": "Este e-mail já possui uma conta.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "auth/network-request-failed": "Não foi possível conectar. Verifique sua internet."
};

let mode = "login";
let registrationInProgress = false;
let auth;
let db;
let currentProfile = null;
let currentUser = null;

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
    if (!date) return "Cadastro recente";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "Cadastro recente";
  }
}

function statusLabel(status) {
  return {
    pending: "Em análise",
    approved: "Aprovado",
    rejected: "Recusado"
  }[status] || "Indefinido";
}

function configureStatusPage(user, profile) {
  const rejected = profile.status === "rejected";
  $("#status-label").textContent = rejected ? "SOLICITAÇÃO REVISADA" : "SOLICITAÇÃO RECEBIDA";
  $("#status-title").textContent = rejected ? "Acesso não liberado" : "Aguardando aprovação";
  $("#status-text").textContent = rejected
    ? "Este cadastro foi revisado e não recebeu acesso ao painel. Entre em contato com a administração para obter mais informações."
    : "Seu cadastro está salvo. Assim que um administrador concluir a análise, o acesso será liberado automaticamente.";
  $("#status-user-name").textContent = profile.name || user.displayName || user.email || "Usuário";
  $("#status-state").textContent = rejected ? "Recusado" : "Em análise";
  showPage("#status");
}

function setupDashboard(user, profile) {
  const admin = profile.role === "admin";
  currentProfile = profile;
  currentUser = user;

  $("#user-name").textContent = profile.name || user.displayName || "Usuário";
  $("#avatar").textContent = (profile.name || user.displayName || "U").charAt(0).toUpperCase();
  $("#user-role-label").textContent = admin ? "Administrador" : "Acesso aprovado";

  $("#nav-overview").classList.toggle("hidden", admin);
  $("#nav-requests").classList.toggle("hidden", !admin);
  $("#nav-requests").classList.toggle("active", admin);
  $("#regular-view").classList.toggle("hidden", admin);
  $("#admin-view").classList.toggle("hidden", !admin);
  $("#reload-requests").classList.toggle("hidden", !admin);
  $("#dashboard-eyebrow").textContent = admin ? "ADMINISTRAÇÃO" : "PAINEL PARCEIRO";
  $("#dashboard-title").textContent = admin ? "Solicitações de acesso" : "Visão geral";

  showPage("#dashboard");
  if (admin) loadRequests();
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
      setupDashboard(user, profile);
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
  name.textContent = item.name || "Sem nome";
  const created = document.createElement("span");
  created.textContent = formatCreatedAt(item.createdAt);
  person.append(name, created);

  const contact = document.createElement("div");
  contact.className = "request-contact";
  const email = document.createElement("strong");
  email.textContent = item.email || "E-mail não informado";
  const discord = document.createElement("span");
  discord.textContent = item.discord ? `Discord: ${item.discord}` : "Discord não informado";
  contact.append(email, discord);

  const status = document.createElement("span");
  status.className = `status-tag ${item.status || "pending"}`;
  status.textContent = statusLabel(item.status);

  const actions = document.createElement("div");
  actions.className = "request-actions";

  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "action-button approve";
  approve.textContent = item.status === "approved" ? "Aprovado" : "Aprovar";
  approve.disabled = item.status === "approved";
  approve.addEventListener("click", () => updateAccess(item.id, "approved", [approve, reject]));

  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "action-button reject";
  reject.textContent = item.status === "rejected" ? "Recusado" : "Recusar";
  reject.disabled = item.status === "rejected";
  reject.addEventListener("click", () => updateAccess(item.id, "rejected", [approve, reject]));

  actions.append(approve, reject);
  row.append(person, contact, status, actions);
  return row;
}

async function loadRequests() {
  if (!currentProfile || currentProfile.role !== "admin") return;
  hideRequestsMessage();
  $("#requests-summary").textContent = "Atualizando cadastros...";
  $("#requests-list").replaceChildren();

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
    $("#requests-summary").textContent = pending === 1
      ? "1 cadastro aguardando decisão."
      : `${pending} cadastros aguardando decisão.`;
    $("#pending-badge").textContent = String(pending);
    $("#pending-badge").classList.toggle("hidden", pending === 0);

    if (!users.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Nenhum cadastro foi recebido até o momento.";
      $("#requests-list").append(empty);
      return;
    }

    users.forEach((item) => $("#requests-list").append(createRequestRow(item)));
  } catch (error) {
    console.error(error);
    $("#requests-summary").textContent = "Não foi possível carregar os cadastros.";
    showRequestsMessage("Verifique se as novas regras do Firestore foram publicadas e tente novamente.");
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
    showRequestsMessage(nextStatus === "approved" ? "Cadastro aprovado." : "Cadastro recusado.", "success");
    await loadRequests();
  } catch (error) {
    console.error(error);
    showRequestsMessage("Não foi possível alterar o cadastro. Confira as regras do Firestore.");
    buttons.forEach((button) => { button.disabled = false; });
  }
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

$("#refresh-status").addEventListener("click", () => auth?.currentUser && loadProfile(auth.currentUser));
$("#reload-requests").addEventListener("click", loadRequests);
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => signOut(auth)));

setMode("login");
init();
