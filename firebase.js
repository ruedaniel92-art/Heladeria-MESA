const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

function loadLocalEnvironment() {
  if (process.env.VERCEL === '1') {
    return;
  }

  const envFiles = ['.env', '.env.local'];
  envFiles.forEach(fileName => {
    const envPath = path.join(__dirname, fileName);
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath, override: fileName === '.env.local' });
    }
  });
}

loadLocalEnvironment();

function normalizePrivateKey(value) {
  return typeof value === 'string' ? value.replace(/\\n/g, '\n') : undefined;
}

function buildCredentialFromServiceAccountFile() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    return null;
  }

  const absolutePath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.join(__dirname, serviceAccountPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`No se encontró el archivo de credenciales de Firebase en ${absolutePath}.`);
  }

  const parsedServiceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  return admin.credential.cert({
    projectId: parsedServiceAccount.project_id,
    clientEmail: parsedServiceAccount.client_email,
    privateKey: normalizePrivateKey(parsedServiceAccount.private_key)
  });
}

function buildCredentialFromServiceAccountJson() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) {
    return null;
  }

  const parsedServiceAccount = JSON.parse(rawServiceAccount);
  return admin.credential.cert({
    projectId: parsedServiceAccount.project_id,
    clientEmail: parsedServiceAccount.client_email,
    privateKey: normalizePrivateKey(parsedServiceAccount.private_key)
  });
}

function buildCredentialFromSplitVars() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  });
}

function buildCredential() {
  const credential = buildCredentialFromServiceAccountFile() || buildCredentialFromServiceAccountJson() || buildCredentialFromSplitVars();

  if (!credential) {
    throw new Error('Faltan credenciales de Firebase. Usa FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON o las variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.');
  }

  return credential;
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
