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
    name: "producto se crea lista y elimina tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const productResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Vaso prueba",
              tipo: "productos",
              stockMin: 1,
              precio: 8,
              modoControl: "directo"
            })
          });
          assert.equal(productResponse.status, 201);
          const productResult = await productResponse.json();
          const productId = productResult.producto.id;

          const listResponse = await fetch(`${baseUrl}/productos`, {
            headers: authHeaders(token)
          });
          assert.equal(listResponse.status, 200);
          const products = await listResponse.json();
          assert.ok(products.some(product => String(product.id) === String(productId)));

          const deleteResponse = await fetch(`${baseUrl}/productos/${encodeURIComponent(productId)}`, {
            method: "DELETE",
            headers: authHeaders(token)
          });
          assert.equal(deleteResponse.status, 200);

          const nextListResponse = await fetch(`${baseUrl}/productos`, {
            headers: authHeaders(token)
          });
          assert.equal(nextListResponse.status, 200);
          const nextProducts = await nextListResponse.json();
          assert.equal(nextProducts.some(product => String(product.id) === String(productId)), false);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "producto duplicado se rechaza para evitar registros escondidos",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);
          const payload = {
            nombre: "Cuchara prueba",
            tipo: "productos",
            stockMin: 1,
            precio: 2,
            modoControl: "directo"
          };

          const firstResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify(payload)
          });
          assert.equal(firstResponse.status, 201);

          const duplicateResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify(payload)
          });
          assert.equal(duplicateResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  }
];
