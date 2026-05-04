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
    name: "inventario inicial actualiza stock tras la extracción",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId: productResult.producto.id,
              quantity: 12,
              unitCost: 1.5
            })
          });
          assert.equal(initialInventoryResponse.status, 201);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: authHeaders(token)
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
    name: "inventario inicial se puede eliminar si no tiene movimientos",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Conos inicial borrable",
              tipo: "productos",
              stockMin: 1,
              precio: 4,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productId = (await productResponse.json()).producto.id;

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 8,
              unitCost: 1
            })
          });
          assert.equal(initialInventoryResponse.status, 201);
          const initialMovement = (await initialInventoryResponse.json()).movement;

          const deleteResponse = await fetch(`${baseUrl}/inventario/inicial/${encodeURIComponent(initialMovement.id)}`, {
            method: "DELETE",
            headers: authHeaders(token)
          });
          assert.equal(deleteResponse.status, 200);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: authHeaders(token)
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          assert.equal(inventory.productos.find(item => String(item.id) === String(productId)).stock, 0);

          const movementsResponse = await fetch(`${baseUrl}/inventario/movimientos`, {
            headers: authHeaders(token)
          });
          assert.equal(movementsResponse.status, 200);
          const movements = await movementsResponse.json();
          assert.equal(movements.some(movement => String(movement.id) === String(initialMovement.id)), false);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "inventario inicial no se elimina si tuvo venta",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Conos inicial vendido",
              tipo: "productos",
              stockMin: 1,
              precio: 4,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productId = (await productResponse.json()).producto.id;

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 8,
              unitCost: 1
            })
          });
          assert.equal(initialInventoryResponse.status, 201);
          const initialMovement = (await initialInventoryResponse.json()).movement;

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente con movimiento",
              fecha: "2026-04-27",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 4,
              items: [{ id: productId, cantidad: 1, precio: 4 }]
            })
          });
          assert.equal(saleResponse.status, 201);

          const deleteResponse = await fetch(`${baseUrl}/inventario/inicial/${encodeURIComponent(initialMovement.id)}`, {
            method: "DELETE",
            headers: authHeaders(token)
          });
          assert.equal(deleteResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "inventario inicial se puede editar aunque tenga movimientos",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Conos inicial editable",
              tipo: "productos",
              stockMin: 1,
              precio: 4,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productId = (await productResponse.json()).producto.id;

          const initialInventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 8,
              unitCost: 1
            })
          });
          assert.equal(initialInventoryResponse.status, 201);
          const initialMovement = (await initialInventoryResponse.json()).movement;

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente con movimiento editable",
              fecha: "2026-04-27",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 4,
              items: [{ id: productId, cantidad: 1, precio: 4 }]
            })
          });
          assert.equal(saleResponse.status, 201);

          const editResponse = await fetch(`${baseUrl}/inventario/inicial/${encodeURIComponent(initialMovement.id)}`, {
            method: "PATCH",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 15,
              unitCost: 1.25,
              note: "Inventario inicial corregido"
            })
          });
          assert.equal(editResponse.status, 200);
          const editResult = await editResponse.json();
          assert.equal(editResult.movement.cantidad, 15);
          assert.equal(editResult.movement.costoUnitario, 1.25);

          const inventoryResponse = await fetch(`${baseUrl}/inventario`, {
            headers: authHeaders(token)
          });
          assert.equal(inventoryResponse.status, 200);
          const inventory = await inventoryResponse.json();
          assert.equal(inventory.productos.find(item => String(item.id) === String(productId)).stock, 14);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "inventario inicial exige sabor cuando materia prima esta vinculada",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Helado vinculado",
              tipo: "materia prima",
              stockMin: 1,
              medida: "balde",
              rendimientoPorCompra: 20
            })
          });
          assert.equal(productResponse.status, 201);
          const productId = (await productResponse.json()).producto.id;

          const flavorResponse = await fetch(`${baseUrl}/sabores`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Chocolate vinculado",
              materiaPrimaId: productId
            })
          });
          assert.equal(flavorResponse.status, 201);

          const inventoryResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId,
              quantity: 20,
              unitCost: 2
            })
          });
          assert.equal(inventoryResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "producto con movimiento de inventario no se puede eliminar",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);
          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Envase con movimiento",
              tipo: "productos",
              stockMin: 1,
              precio: 3,
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
              quantity: 1,
              unitCost: 1
            })
          });
          assert.equal(inventoryResponse.status, 201);

          const deleteResponse = await fetch(`${baseUrl}/productos/${encodeURIComponent(productId)}`, {
            method: "DELETE",
            headers: authHeaders(token)
          });
          assert.equal(deleteResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  }
];
