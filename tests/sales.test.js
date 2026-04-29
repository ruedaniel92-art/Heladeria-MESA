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
    name: "venta de producto directo descuenta stock disponible",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 12,
              unitCost: 4
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: authHeaders(token)
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
    name: "venta personalizada libre descuenta componentes elegidos",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          async function createProduct(payload) {
            const response = await fetch(`${baseUrl}/productos`, {
              method: "POST",
              headers: jsonAuthHeaders(token),
              body: JSON.stringify(payload)
            });
            assert.equal(response.status, 201);
            return (await response.json()).producto;
          }

          const milk = await createProduct({
            nombre: "Leche para batido",
            tipo: "materia prima",
            stockMin: 1,
            medida: "litro",
            rendimientoPorCompra: 1
          });
          const cookie = await createProduct({
            nombre: "Galleta directa",
            tipo: "productos",
            stockMin: 1,
            precio: 8,
            modoControl: "directo"
          });
          const shake = await createProduct({
            nombre: "Batido personalizado",
            tipo: "productos",
            stockMin: 0,
            precio: 80,
            modoControl: "personalizado"
          });

          for (const [productId, quantity] of [[milk.id, 10], [cookie.id, 5]]) {
            const inventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
              method: "POST",
              headers: jsonAuthHeaders(token),
              body: JSON.stringify({ productId, quantity, unitCost: 1 })
            });
            assert.equal(inventoryResponse.status, 201);
          }

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente personalizado",
              fecha: "2026-04-28",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 200,
              items: [{
                id: shake.id,
                cantidad: 2,
                precio: 80,
                componentes: [
                  { id: milk.id, cantidad: 1.5 },
                  { id: cookie.id, cantidad: 1, precio: 5 }
                ]
              }]
            })
          });
          assert.equal(saleResponse.status, 201);
          const saleResult = await saleResponse.json();
          assert.equal(saleResult.venta.totalAmount, 170);
          assert.equal(saleResult.venta.items[0].componentes.length, 2);
          assert.equal(saleResult.venta.items[0].componentes[0].cantidadTotal, 3);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: authHeaders(token)
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          assert.equal(inventory.productos.find(item => item.id === milk.id).stock, 7);
          assert.equal(inventory.productos.find(item => item.id === cookie.id).stock, 3);
          assert.equal(inventory.productos.find(item => item.id === shake.id).stock, 0);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "venta personalizada libre exige componentes con stock",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const rawResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Banano para batido",
              tipo: "materia prima",
              stockMin: 1,
              medida: "unidad",
              rendimientoPorCompra: 1
            })
          });
          assert.equal(rawResponse.status, 201);
          const raw = (await rawResponse.json()).producto;

          const customResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Especial libre",
              tipo: "productos",
              stockMin: 0,
              precio: 50,
              modoControl: "personalizado"
            })
          });
          assert.equal(customResponse.status, 201);
          const custom = (await customResponse.json()).producto;

          const missingComponentsResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente sin componentes",
              fecha: "2026-04-28",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 50,
              items: [{ id: custom.id, cantidad: 1, precio: 50 }]
            })
          });
          assert.equal(missingComponentsResponse.status, 400);

          const inventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({ productId: raw.id, quantity: 1, unitCost: 1 })
          });
          assert.equal(inventoryResponse.status, 201);

          const insufficientStockResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente sin stock",
              fecha: "2026-04-28",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 50,
              items: [{
                id: custom.id,
                cantidad: 1,
                precio: 50,
                componentes: [{ id: raw.id, cantidad: 2 }]
              }]
            })
          });
          assert.equal(insufficientStockResponse.status, 400);

          const repeatedComponentResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente componente repetido",
              fecha: "2026-04-28",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 50,
              items: [{
                id: custom.id,
                cantidad: 1,
                precio: 50,
                componentes: [
                  { id: raw.id, cantidad: 0.75 },
                  { id: raw.id, cantidad: 0.75 }
                ]
              }]
            })
          });
          assert.equal(repeatedComponentResponse.status, 400);
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
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 10,
              unitCost: 6
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
    name: "abono mayor al saldo de venta se rechaza",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);
          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Helado mini",
              tipo: "productos",
              stockMin: 1,
              precio: 10,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const inventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 5,
              unitCost: 4
            })
          });
          assert.equal(inventoryResponse.status, 201);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente saldo",
              fecha: "2026-04-28",
              dueDate: "2026-05-02",
              paymentType: "credito",
              paymentMethod: "efectivo",
              items: [{ id: productId, cantidad: 1, precio: 10 }]
            })
          });
          assert.equal(saleResponse.status, 201);
          const saleResult = await saleResponse.json();

          const paymentResponse = await fetch(`${baseUrl}/ventas/${encodeURIComponent(saleResult.venta.id)}/pagar`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              amount: 11,
              paymentMethod: "efectivo",
              paidAt: "2026-04-29"
            })
          });
          assert.equal(paymentResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  }
];
