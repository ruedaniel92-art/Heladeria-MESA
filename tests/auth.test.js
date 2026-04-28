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
  },
  {
    name: "catalogo de sabores funciona autenticado tras la extracción",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Base fresa",
              tipo: "materia prima",
              stockMin: 0,
              medida: "balde",
              rendimientoPorCompra: 20
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();

          const flavorResponse = await fetch(`${baseUrl}/sabores`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Fresa",
              materiaPrimaId: productResult.producto.id
            })
          });
          assert.equal(flavorResponse.status, 201);

          const listResponse = await fetch(`${baseUrl}/sabores`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          assert.equal(listResponse.status, 200);
          const flavors = await listResponse.json();
          assert.equal(flavors.length, 1);
          assert.equal(flavors[0].nombre, "Fresa");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "inventario inicial actualiza stock tras la extracción",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Conos",
              tipo: "productos",
              stockMin: 2,
              precio: 5,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              productId: productResult.producto.id,
              quantity: 12,
              unitCost: 1.5
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          assert.equal(inventory.totalProductos, 1);
          assert.equal(inventory.totalStock, 12);
          assert.equal(inventory.productos[0].stock, 12);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "venta de producto directo descuenta stock disponible",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Barquilla",
              tipo: "productos",
              stockMin: 2,
              precio: 10,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              productId,
              quantity: 12,
              unitCost: 4
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              cliente: "Cliente prueba",
              fecha: "2026-04-27",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 30,
              items: [
                {
                  id: productId,
                  cantidad: 3,
                  precio: 10
                }
              ]
            })
          });
          assert.equal(saleResponse.status, 201);
          const saleResult = await saleResponse.json();
          assert.equal(saleResult.venta.totalAmount, 30);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          const product = inventory.productos.find(item => String(item.id) === String(productId));
          assert.equal(product.stock, 9);
          assert.equal(inventory.totalStock, 9);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "abono de venta a crédito actualiza saldo tras la extracción",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Paleta",
              tipo: "productos",
              stockMin: 1,
              precio: 15,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              productId,
              quantity: 10,
              unitCost: 6
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              cliente: "Cliente crédito",
              fecha: "2026-04-27",
              dueDate: "2026-05-01",
              paymentType: "credito",
              paymentMethod: "efectivo",
              items: [
                {
                  id: productId,
                  cantidad: 2,
                  precio: 15
                }
              ]
            })
          });
          assert.equal(saleResponse.status, 201);
          const saleResult = await saleResponse.json();
          assert.equal(saleResult.venta.balanceDue, 30);

          const paymentResponse = await fetch(`${baseUrl}/ventas/${encodeURIComponent(saleResult.venta.id)}/pagar`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              amount: 10,
              paymentMethod: "efectivo",
              paidAt: "2026-04-28"
            })
          });
          assert.equal(paymentResponse.status, 200);
          const paymentResult = await paymentResponse.json();
          assert.equal(paymentResult.venta.totalPaid, 10);
          assert.equal(paymentResult.venta.balanceDue, 20);
          assert.equal(paymentResult.venta.status, "abonada");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "compra de contado incrementa stock tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Base vainilla",
              tipo: "materia prima",
              stockMin: 1,
              medida: "balde",
              rendimientoPorCompra: 10
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const purchaseResponse = await fetch(`${baseUrl}/compras`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              documento: "FC-001",
              proveedor: "Proveedor prueba",
              fecha: "2026-04-27",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashOut: 50,
              items: [
                {
                  id: productId,
                  cantidad: 2,
                  costo: 25
                }
              ]
            })
          });
          assert.equal(purchaseResponse.status, 201);
          const purchaseResult = await purchaseResponse.json();
          assert.equal(purchaseResult.compra.totalAmount, 50);
          assert.equal(purchaseResult.compra.status, "pagada");

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          const product = inventory.productos.find(item => String(item.id) === String(productId));
          assert.equal(product.stock, 20);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "abono de compra a credito actualiza saldo tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Azucar",
              tipo: "materia prima",
              stockMin: 1,
              medida: "libra",
              rendimientoPorCompra: 1
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const purchaseResponse = await fetch(`${baseUrl}/compras`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              documento: "FC-002",
              proveedor: "Proveedor credito",
              fecha: "2026-04-27",
              dueDate: "2026-05-01",
              paymentType: "credito",
              paymentMethod: "efectivo",
              items: [
                {
                  id: productId,
                  cantidad: 4,
                  costo: 12
                }
              ]
            })
          });
          assert.equal(purchaseResponse.status, 201);
          const purchaseResult = await purchaseResponse.json();
          assert.equal(purchaseResult.compra.totalAmount, 48);
          assert.equal(purchaseResult.compra.balanceDue, 48);

          const paymentResponse = await fetch(`${baseUrl}/compras/${encodeURIComponent(purchaseResult.compra.id)}/pagar`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              amount: 18,
              paymentMethod: "efectivo",
              paidAt: "2026-04-28"
            })
          });
          assert.equal(paymentResponse.status, 200);
          const paymentResult = await paymentResponse.json();
          assert.equal(paymentResult.compra.totalPaid, 18);
          assert.equal(paymentResult.compra.balanceDue, 30);
          assert.equal(paymentResult.compra.status, "abonada");
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "pago con tarjeta queda pendiente y puede reembolsarse tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const bootstrapResponse = await fetch(`${baseUrl}/auth/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: "Admin Mesa",
              username: "mesa-admin",
              password: "secreto123"
            })
          });
          assert.equal(bootstrapResponse.status, 201);
          const bootstrapResult = await bootstrapResponse.json();
          const token = bootstrapResult.token;

          const categoryResponse = await fetch(`${baseUrl}/pagos-categorias`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              nombre: "Servicios",
              descripcion: "Pagos operativos"
            })
          });
          assert.equal(categoryResponse.status, 201);
          const categoryResult = await categoryResponse.json();
          const categoryId = categoryResult.category.id;

          const paymentResponse = await fetch(`${baseUrl}/pagos`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              descripcion: "Internet",
              beneficiario: "Proveedor internet",
              categoriaId: categoryId,
              monto: 35,
              fecha: "2026-04-27",
              paymentMethod: "tarjeta-credito",
              referencia: "TC-001"
            })
          });
          assert.equal(paymentResponse.status, 201);
          const paymentResult = await paymentResponse.json();
          assert.equal(paymentResult.payment.status, "pendiente-reembolso");
          assert.equal(paymentResult.payment.reimbursementMethod, "transferencia");

          const reimbursementResponse = await fetch(`${baseUrl}/pagos/${encodeURIComponent(paymentResult.payment.id)}/reembolsar`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              reimbursementReference: "TR-001",
              reimbursedAt: "2026-04-28"
            })
          });
          assert.equal(reimbursementResponse.status, 200);
          const reimbursementResult = await reimbursementResponse.json();
          assert.equal(reimbursementResult.payment.status, "reembolsado");
          assert.equal(reimbursementResult.payment.reimbursementReference, "TR-001");
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
