const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');

function loadLocalEnvironment() {
  if (process.env.VERCEL === '1') {
    return;
  }

  const envFiles = ['.env', '.env.local'];
  envFiles.forEach(fileName => {
    const envPath = path.join(__dirname, fileName);
    dotenv.config({ path: envPath, override: fileName === '.env.local' });
  });
}

loadLocalEnvironment();

function normalizePrivateKey(value) {
  return typeof value === 'string' ? value.replace(/\\n/g, '\n') : undefined;
}

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan credenciales de Firebase. Configura FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.');
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  });
}

function getConfiguredFirestoreDatabaseId() {
  const configuredDatabaseId = String(process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_FIRESTORE_DATABASE_ID || '').trim();
  if (!configuredDatabaseId || configuredDatabaseId === '(default)') {
    return '';
  }
  return configuredDatabaseId;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: buildCredential()
  });
}

const firestoreDatabaseId = getConfiguredFirestoreDatabaseId();

module.exports = firestoreDatabaseId
  ? getFirestore(admin.app(), firestoreDatabaseId)
  : getFirestore(admin.app());
