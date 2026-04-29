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
    name: "cors permite el frontend local durante desarrollo",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/health`, {
            headers: {
              Origin: "http://localhost:5173"
            }
          });

          assert.equal(response.status, 200);
          assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "cors permite origen configurado en producción",
    async run() {
      const { app, restore } = loadApp({
        APP_ENV: "production",
        APP_AUTH_SECRET: "production-auth-secret",
        APP_ALLOWED_ORIGINS: "https://heladeria-mesa.vercel.app"
      });

      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/health`, {
            headers: {
              Origin: "https://heladeria-mesa.vercel.app"
            }
          });

          assert.equal(response.status, 200);
          assert.equal(response.headers.get("access-control-allow-origin"), "https://heladeria-mesa.vercel.app");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "cors bloquea preflight desde origen no permitido en producción",
    async run() {
      const { app, restore } = loadApp({
        APP_ENV: "production",
        APP_AUTH_SECRET: "production-auth-secret",
        APP_ALLOWED_ORIGINS: "https://heladeria-mesa.vercel.app"
      });

      try {
        await withServer(app, async baseUrl => {
          const response = await fetch(`${baseUrl}/productos`, {
            method: "OPTIONS",
            headers: {
              Origin: "https://sitio-raro.example",
              "Access-Control-Request-Method": "GET"
            }
          });

          assert.equal(response.status, 403);
          assert.equal(response.headers.get("access-control-allow-origin"), null);
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
  },
  {
    name: "modulos principales refrescan registros existentes en Firestore",
    async run() {
      const { app, db, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);
          const headers = authHeaders(token);

          async function getJson(path) {
            const response = await fetch(`${baseUrl}${path}`, { headers });
            assert.equal(response.status, 200);
            return response.json();
          }

          await getJson("/productos");
          await getJson("/inventario");
          await getJson("/compras");
          await getJson("/ventas");
          await getJson("/inventario/movimientos");
          await getJson("/deudas-externas");
          await getJson("/efectivo/traslados");
          await getJson("/efectivo/configuracion");
          await getJson("/sabores");
          await getJson("/toppings");
          await getJson("/salsas");
          await getJson("/baldes-control");
          await getJson("/toppings-control");
          await getJson("/salsas-control");
          await getJson("/auth/users");

          await db.collection("productos").doc("fresh-product").set({
            id: "fresh-product",
            nombre: "Producto fresco",
            tipo: "productos",
            modoControl: "directo",
            stock: 8,
            stockMin: 2,
            precio: 12
          });
          await db.collection("compras").doc("fresh-purchase").set({
            id: "fresh-purchase",
            proveedor: "Proveedor fresco",
            fecha: "2026-04-28T00:00:00.000Z",
            items: [],
            paymentType: "contado",
            total: 0,
            createdAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("ventas").doc("fresh-sale").set({
            id: "fresh-sale",
            cliente: "Cliente fresco",
            fecha: "2026-04-28T00:00:00.000Z",
            items: [],
            paymentType: "contado",
            total: 0,
            createdAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("inventoryMovements").doc("fresh-movement").set({
            id: "fresh-movement",
            productoId: "fresh-product",
            productoNombre: "Producto fresco",
            tipo: "inventario-inicial",
            direccion: "entrada",
            cantidad: 8,
            fecha: "2026-04-28T00:00:00.000Z",
            createdAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("externalDebts").doc("fresh-debt").set({
            id: "fresh-debt",
            tercero: "Tercero fresco",
            concepto: "Cuenta fresca",
            type: "por-pagar",
            fecha: "2026-04-28T00:00:00.000Z",
            originalAmount: 40,
            paymentHistory: [],
            createdAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("fundTransfers").doc("fresh-transfer").set({
            id: "fresh-transfer",
            fromAccount: "caja",
            toAccount: "banco",
            amount: 15,
            fecha: "2026-04-28T00:00:00.000Z",
            createdAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("fundSettings").doc("main").set({
            id: "main",
            openingCashBalance: 12,
            openingBankBalance: 34,
            minimumCashReserve: 5,
            updatedAt: "2026-04-28T00:00:00.000Z"
          });
          await db.collection("sabores").doc("fresh-flavor").set({
            id: "fresh-flavor",
            nombre: "Sabor fresco",
            materiaPrimaId: "fresh-product",
            materiaPrimaNombre: "Producto fresco"
          });
          await db.collection("toppings").doc("fresh-topping").set({
            id: "fresh-topping",
            nombre: "Topping fresco",
            materiaPrimaId: "fresh-product",
            materiaPrimaNombre: "Producto fresco"
          });
          await db.collection("salsas").doc("fresh-sauce").set({
            id: "fresh-sauce",
            nombre: "Salsa fresca",
            materiaPrimaId: "fresh-product",
            materiaPrimaNombre: "Producto fresco"
          });
          await db.collection("baldesControl").doc("fresh-bucket-control").set({
            id: "fresh-bucket-control",
            saborId: "fresh-flavor",
            saborNombre: "Sabor fresco",
            estado: "abierto",
            capaCostoKey: "manual",
            costoAperturaTotal: 1
          });
          await db.collection("toppingControls").doc("fresh-topping-control").set({
            id: "fresh-topping-control",
            toppingId: "fresh-topping",
            toppingNombre: "Topping fresco",
            estado: "abierto",
            capaCostoKey: "manual",
            costoAperturaTotal: 1
          });
          await db.collection("sauceControls").doc("fresh-sauce-control").set({
            id: "fresh-sauce-control",
            sauceId: "fresh-sauce",
            sauceNombre: "Salsa fresca",
            estado: "abierto",
            capaCostoKey: "manual",
            costoAperturaTotal: 1
          });
          await db.collection("users").doc("fresh-user").set({
            id: "fresh-user",
            username: "usuario-fresco",
            nombre: "Usuario fresco",
            role: "user",
            permissions: {},
            active: true,
            createdAt: "2026-04-28T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z"
          });

          const inventory = await getJson("/inventario");
          assert.ok(inventory.productos.some(product => product.id === "fresh-product"));
          assert.ok((await getJson("/productos")).some(product => product.id === "fresh-product"));
          assert.ok((await getJson("/compras")).some(purchase => purchase.id === "fresh-purchase"));
          assert.ok((await getJson("/ventas")).some(sale => sale.id === "fresh-sale"));
          assert.ok((await getJson("/inventario/movimientos")).some(movement => movement.id === "fresh-movement"));
          assert.ok((await getJson("/deudas-externas")).some(debt => debt.id === "fresh-debt"));
          assert.ok((await getJson("/efectivo/traslados")).some(transfer => transfer.id === "fresh-transfer"));
          assert.equal((await getJson("/efectivo/configuracion")).openingCashBalance, 12);
          assert.ok((await getJson("/sabores")).some(flavor => flavor.id === "fresh-flavor"));
          assert.ok((await getJson("/toppings")).some(topping => topping.id === "fresh-topping"));
          assert.ok((await getJson("/salsas")).some(sauce => sauce.id === "fresh-sauce"));
          assert.ok((await getJson("/baldes-control")).some(control => control.id === "fresh-bucket-control"));
          assert.ok((await getJson("/toppings-control")).some(control => control.id === "fresh-topping-control"));
          assert.ok((await getJson("/salsas-control")).some(control => control.id === "fresh-sauce-control"));
          assert.ok((await getJson("/auth/users")).some(user => user.id === "fresh-user"));
        });
      } finally {
        restore();
      }
    }
  }
];
