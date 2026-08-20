const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const auth = getAuth();
const REGION = "us-central1";
const RESET_WINDOW_MINUTES = 15;

async function assertAdmin(uid) {
  const snapshot = await db.doc(`users/${uid}`).get();
  const profile = snapshot.data();
  if (!snapshot.exists || profile?.role !== "admin" || profile?.status !== "approved") {
    throw new HttpsError("permission-denied", "Administrator permission required.");
  }
}


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
