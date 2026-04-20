const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const dotenv = require('dotenv');

function loadLocalEnvironment() {
  const projectRoot = path.join(__dirname, '..');
  const envFiles = ['.env', '.env.local'];
  envFiles.forEach(fileName => {
    dotenv.config({ path: path.join(projectRoot, fileName), override: fileName === '.env.local' });
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
