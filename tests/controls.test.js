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
    name: "control de balde abre con compra disponible tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Base chocolate",
              tipo: "materia prima",
              stockMin: 1,
              medida: "balde",
              rendimientoPorCompra: 20
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const flavorResponse = await fetch(`${baseUrl}/sabores`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Chocolate",
              materiaPrimaId: productId
            })
          });
          assert.equal(flavorResponse.status, 201);
          const flavorResult = await flavorResponse.json();
          const flavorId = flavorResult.sabor.id;

          const purchaseResponse = await fetch(`${baseUrl}/compras`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              documento: "FC-BALDE-001",
              proveedor: "Proveedor baldes",
              fecha: "2026-04-27",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashOut: 40,
              items: [
                {
                  id: productId,
                  cantidad: 1,
                  costo: 40,
                  flavorId
                }
              ]
            })
          });
          assert.equal(purchaseResponse.status, 201);

          const openResponse = await fetch(`${baseUrl}/baldes-control/abrir`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              saborId: flavorId,
              fechaApertura: "2026-04-28"
            })
          });
          assert.equal(openResponse.status, 201);
          const openResult = await openResponse.json();
          assert.equal(openResult.balde.saborId, flavorId);
          assert.equal(openResult.balde.estado, "abierto");

          const listResponse = await fetch(`${baseUrl}/baldes-control`, {
            headers: authHeaders(token)
          });
          assert.equal(listResponse.status, 200);
          const controls = await listResponse.json();
          assert.equal(controls.length, 1);
          assert.equal(controls[0].saborNombre, "Chocolate");
        });
      } finally {
        restore();
      }
    }
  }
];
