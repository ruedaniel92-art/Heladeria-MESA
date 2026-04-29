const assert = require("node:assert/strict");
const path = require("node:path");

function createFakeFirestore() {
  const collections = new Map();
  let sequence = 0;

  function ensureCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  function nextId() {
    sequence += 1;
    return `doc-${sequence}`;
  }

  return {
    collection(name) {
      const store = ensureCollection(name);
      return {
        async get() {
          return {
            docs: Array.from(store.values()).map(record => ({
              id: record.id,
              data: () => ({ ...record })
            }))
          };
        },
        doc(id) {
          const resolvedId = String(id || nextId());
          return {
            id: resolvedId,
            async set(payload) {
              store.set(resolvedId, { ...payload });
            },
            async delete() {
              store.delete(resolvedId);
            }
          };
        }
      };
    },
    batch() {
      const operations = [];
      return {
        set(ref, data) {
          operations.push({ type: "set", ref, data });
        },
        delete(ref) {
          operations.push({ type: "delete", ref });
        },
        async commit() {
          for (const operation of operations) {
            if (operation.type === "set") {
              await operation.ref.set(operation.data);
              continue;
            }
            await operation.ref.delete();
          }
        }
      };
    }
  };
}

function loadApp(envOverrides = {}) {
  const serverPath = path.resolve(__dirname, "..", "..", "server.js");
  const firebasePath = path.resolve(__dirname, "..", "..", "firebase.js");
  const originalEnv = { ...process.env };

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("APP_") || key.startsWith("FIREBASE_") || key === "NODE_ENV" || key === "VERCEL") {
      delete process.env[key];
    }
  }

  Object.assign(process.env, {
    APP_AUTH_SECRET: "test-auth-secret",
    ...envOverrides
  });

  const fakeDb = createFakeFirestore();
  delete require.cache[serverPath];
  delete require.cache[firebasePath];
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: fakeDb
  };

  const app = require(serverPath);

  return {
    app,
    db: fakeDb,
    restore() {
      delete require.cache[serverPath];
      delete require.cache[firebasePath];
      for (const key of Object.keys(process.env)) {
        delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
    }
  };
}

async function withServer(app, callback) {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

async function bootstrapAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Admin Mesa",
      username: "mesa-admin",
      password: "secreto123"
    })
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  return result.token;
}

function authHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`
  };
}

function jsonAuthHeaders(token) {
  return {
    ...authHeaders(token),
    "Content-Type": "application/json"
  };
}

async function createUser(baseUrl, adminToken, overrides = {}) {
  const response = await fetch(`${baseUrl}/auth/users`, {
    method: "POST",
    headers: jsonAuthHeaders(adminToken),
    body: JSON.stringify({
      nombre: overrides.nombre || "Usuario Prueba",
      username: overrides.username || "usuario-prueba",
      password: overrides.password || "secreto123",
      role: overrides.role || "user",
      permissions: overrides.permissions || {}
    })
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function loginUser(baseUrl, username, password = "secreto123") {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  return result.token;
}

module.exports = {
  authHeaders,
  bootstrapAdmin,
  createUser,
  jsonAuthHeaders,
  loadApp,
  loginUser,
  withServer
};
