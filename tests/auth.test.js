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
  const serverPath = path.resolve(__dirname, "..", "server.js");
  const firebasePath = path.resolve(__dirname, "..", "firebase.js");
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

const tests = [
  {
    name: "health expone el estado del entorno",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/health`);
          assert.equal(response.status, 200);

          const result = await response.json();
          assert.equal(result.ok, true);
          assert.equal(result.environment.mode, "test");
          assert.equal(result.environment.bootstrapSecretRequired, false);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "el servidor expone los assets del frontend modularizado",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/assets/js/core/api.js`);
          assert.equal(response.status, 200);
          const body = await response.text();
          assert.match(body, /export const API_BASE/);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "bootstrap crea el primer administrador en entorno local sin clave extra",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
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
          assert.ok(result.token);
          assert.equal(result.user.username, "mesa-admin");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "bootstrap en producción exige clave de instalación válida",
    async run() {
      const { app, restore } = loadApp({
        APP_ENV: "production",
        APP_BOOTSTRAP_SECRET: "instalacion-segura"
      });

      try {
        await withServer(app, async baseUrl => {
          const withoutSecret = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(withoutSecret.status, 403);

          const withSecret = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Bootstrap-Secret": "instalacion-segura"
            },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(withSecret.status, 201);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "las rutas de negocio siguen protegidas sin autenticación",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/productos`);
          assert.equal(response.status, 401);

          const result = await response.json();
          assert.match(result.error, /iniciar sesión/i);
        });
      } finally {
        restore();
      }
    }
  }
];

async function main() {
  let passed = 0;

  for (const currentTest of tests) {
    try {
      await currentTest.run();
      passed += 1;
      console.log(`PASS ${currentTest.name}`);
    } catch (error) {
      console.error(`FAIL ${currentTest.name}`);
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`OK ${passed}/${tests.length} pruebas`);
}

main();
