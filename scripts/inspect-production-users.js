const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function normalizePrivateKey(value) {
  return typeof value === 'string' ? value.replace(/\\n/g, '\n') : undefined;
}

function buildCredential() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (serviceAccountPath) {
    const absolutePath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.join(__dirname, '..', serviceAccountPath);
    const parsedServiceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return admin.credential.cert({
      projectId: parsedServiceAccount.project_id,
      clientEmail: parsedServiceAccount.client_email,
      privateKey: normalizePrivateKey(parsedServiceAccount.private_key)
    });
  }

  return admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
  });
}

async function main() {
  const app = admin.initializeApp({ credential: buildCredential() }, 'prod-inspector');
  const db = getFirestore(app);
  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(doc => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      username: data.username || null,
      nombre: data.nombre || null,
      role: data.role || null,
      active: data.active !== false,
      updatedAt: data.updatedAt || null,
      lastLoginAt: data.lastLoginAt || null
    };
  });
  console.log(JSON.stringify({ count: users.length, users }, null, 2));
  await app.delete();
}

main().catch(error => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
