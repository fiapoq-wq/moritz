import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "/firebase-config.js";

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

async function loadProfile(user) {
  showPage("#loading");
  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) {
      showPage("#status");
      $("#status-icon").classList.add("rejected");
      $("#status-icon-use").setAttribute("href", "#i-lock");
      $("#status-label").textContent = "PERFIL NÃO ENCONTRADO";
      $("#status-title").textContent = "Não foi possível validar seu acesso";
      $("#status-text").textContent = "A conta existe, mas o cadastro de acesso não foi localizado. Entre em contato com a responsável pelo sistema.";
      $("#progress-box").classList.add("hidden");
      $("#refresh-status").classList.add("hidden");
      return;
    }

    const profile = snapshot.data();
    if (profile.status === "approved") {
      $("#user-name").textContent = profile.name || user.displayName || "Usuário";
      $("#avatar").textContent = (profile.name || user.displayName || "U").charAt(0).toUpperCase();
      showPage("#dashboard");
      return;
    }

    const rejected = profile.status === "rejected";
    $("#status-icon").classList.toggle("rejected", rejected);
    $("#status-icon-use").setAttribute("href", rejected ? "#i-lock" : "#i-clock");
    $("#status-label").textContent = rejected ? "ACESSO NÃO APROVADO" : "CADASTRO RECEBIDO";
    $("#status-title").textContent = rejected ? "Seu acesso não foi liberado" : "Sua conta está em análise";
    $("#status-text").textContent = rejected
      ? "Entre em contato com a responsável pelo sistema para obter mais informações."
      : `Olá, ${profile.name || user.displayName || "usuário"}. Recebemos sua solicitação e avisaremos assim que o acesso ao painel for liberado.`;
    $("#progress-box").classList.toggle("hidden", rejected);
    $("#refresh-status").classList.remove("hidden");
    showPage("#status");
  } catch (error) {
    console.error(error);
    showPage("#status");
    $("#status-icon").classList.add("rejected");
    $("#status-icon-use").setAttribute("href", "#i-lock");
    $("#status-label").textContent = "ERRO DE CONEXÃO";
    $("#status-title").textContent = "Não foi possível consultar o acesso";
    $("#status-text").textContent = "Verifique sua conexão e tente atualizar o status.";
    $("#progress-box").classList.add("hidden");
  }
}

async function init() {
  if (!configIsReady()) {
    showPage("#auth");
    const box = $("#config-error");
    box.textContent = "O Firebase ainda não foi configurado. Abra public/firebase-config.js e cole os dados do seu aplicativo Web do Firebase.";
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
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", () => signOut(auth)));
setMode("login");
init();
