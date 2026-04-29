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
    name: "compra de contado incrementa stock tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
            headers: authHeaders(token)
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
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
  }
];
