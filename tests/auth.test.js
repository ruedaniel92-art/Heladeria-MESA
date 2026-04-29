const assert = require("node:assert/strict");
const {
  authHeaders,
  bootstrapAdmin,
  createUser,
  jsonAuthHeaders,
  loadApp,
  loginUser,
  withServer
} = require("./helpers/app");

module.exports = [
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
    name: "permisos de modulo se aplican en rutas del backend",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const adminToken = await bootstrapAdmin(baseUrl);

          await createUser(baseUrl, adminToken, {
            nombre: "Sin Ventas",
            username: "sin-ventas",
            permissions: {
              dashboard: true
            }
          });
          const restrictedToken = await loginUser(baseUrl, "sin-ventas");

          const restrictedResponse = await fetch(`${baseUrl}/ventas`, {
            headers: authHeaders(restrictedToken)
          });
          assert.equal(restrictedResponse.status, 403);

          await createUser(baseUrl, adminToken, {
            nombre: "Con Ventas",
            username: "con-ventas",
            permissions: {
              dashboard: true,
              ventas: true
            }
          });
          const allowedToken = await loginUser(baseUrl, "con-ventas");

          const allowedResponse = await fetch(`${baseUrl}/ventas`, {
            headers: authHeaders(allowedToken)
          });
          assert.equal(allowedResponse.status, 200);
        });
      } finally {
        restore();
      }
    }
  }
];
