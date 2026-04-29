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
    name: "catalogo de sabores funciona autenticado tras la extracción",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Fresa",
              materiaPrimaId: productResult.producto.id
            })
          });
          assert.equal(flavorResponse.status, 201);

          const listResponse = await fetch(`${baseUrl}/sabores`, {
            headers: authHeaders(token)
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
  }
];
