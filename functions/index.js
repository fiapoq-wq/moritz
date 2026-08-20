const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { defineSecret } = require("firebase-functions/params");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const auth = getAuth();
const REGION = "us-central1";
const RESET_WINDOW_MINUTES = 15;
const LETICIANK_PASSWORD = defineSecret("LETICIANK_PASSWORD");

async function assertAdmin(uid) {
  const snapshot = await db.doc(`users/${uid}`).get();
  const profile = snapshot.data();
  if (!snapshot.exists || profile?.role !== "admin" || profile?.status !== "approved") {
    throw new HttpsError("permission-denied", "Administrator permission required.");
  }
}


exports.provisionPrivateClients = onCall({ region: REGION, secrets: [LETICIANK_PASSWORD] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  await assertAdmin(request.auth.uid);

  const password = String(LETICIANK_PASSWORD.value() || "");
  if (password.length < 6) {
    throw new HttpsError("failed-precondition", "LETICIANK_PASSWORD secret is not configured.");
  }

  const account = {
    username: "leticiank",
    email: "leticiank@moritz.services",
    name: "Leticia Nakahara",
    discord: "leticiank",
    role: "client",
    status: "approved",
    interface: "client",
    botName: "ZT Accounts"
  };

  let userRecord;
  let created = false;
  try {
    userRecord = await auth.getUserByEmail(account.email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    userRecord = await auth.createUser({
      email: account.email,
      password,
      displayName: account.name,
      emailVerified: true,
      disabled: false
    });
    created = true;
  }

  const profileRef = db.doc(`users/${userRecord.uid}`);
  const profileSnapshot = await profileRef.get();
  const existing = profileSnapshot.exists ? profileSnapshot.data() : {};
  const profile = {
    ...account,
    email: userRecord.email,
    avatar: existing.avatar || "a1",
    updatedAt: FieldValue.serverTimestamp()
  };
  if (!profileSnapshot.exists) profile.createdAt = FieldValue.serverTimestamp();
  await profileRef.set(profile, { merge: true });

  return { ok: true, username: account.username, created };
});

exports.requestTemporaryReset = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  await assertAdmin(request.auth.uid);

  const uid = String(request.data?.uid || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "A user uid is required.");

  const targetRef = db.doc(`users/${uid}`);
  const target = await targetRef.get();
  if (!target.exists) throw new HttpsError("not-found", "User profile not found.");
  if (target.data()?.role === "admin") throw new HttpsError("failed-precondition", "Admin accounts cannot be reset from this panel.");

  const expiresAt = Timestamp.fromMillis(Date.now() + RESET_WINDOW_MINUTES * 60 * 1000);
  await targetRef.set({
    passwordReset: {
      active: true,
      mustChange: false,
      expiresAt,
      requestedAt: FieldValue.serverTimestamp(),
      requestedBy: request.auth.uid
    },
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await auth.revokeRefreshTokens(uid);
  return { ok: true, temporaryCode: "000", expiresInMinutes: RESET_WINDOW_MINUTES };
});

exports.loginWithTemporaryCode = onCall({ region: REGION }, async (request) => {
  const email = String(request.data?.email || "").trim().toLowerCase();
  const code = String(request.data?.code || "").trim();
  if (!email || code !== "000") throw new HttpsError("invalid-argument", "Invalid temporary credentials.");

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch {
    throw new HttpsError("failed-precondition", "Temporary access is not active.");
  }

  const profileRef = db.doc(`users/${userRecord.uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    const reset = snapshot.data()?.passwordReset;
    const expiresAt = reset?.expiresAt?.toMillis?.() || 0;
    if (!snapshot.exists || reset?.active !== true || expiresAt < Date.now()) {
      throw new HttpsError("failed-precondition", "Temporary access is not active or has expired.");
    }
    transaction.set(profileRef, {
      passwordReset: {
        ...reset,
        active: false,
        mustChange: true,
        consumedAt: FieldValue.serverTimestamp()
      },
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });

  const token = await auth.createCustomToken(userRecord.uid, { temporaryPasswordReset: true });
  return { token };
});

exports.completeTemporaryReset = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const profileRef = db.doc(`users/${request.auth.uid}`);
  await profileRef.set({
    passwordReset: {
      active: false,
      mustChange: false,
      completedAt: FieldValue.serverTimestamp()
    },
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});
