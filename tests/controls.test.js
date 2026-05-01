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
  },
  {
    name: "cierre de salsa descuenta merma fisica sin cambiar costo por rendimiento real",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const rawResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Aderezo prueba",
              tipo: "materia prima",
              stockMin: 1,
              medida: "unidad",
              rendimientoPorCompra: 60
            })
          });
          assert.equal(rawResponse.status, 201);
          const rawProduct = (await rawResponse.json()).producto;

          const cupResponse = await fetch(`${baseUrl}/productos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Vaso para aderezo",
              tipo: "productos",
              stockMin: 1,
              precio: 10,
              modoControl: "directo"
            })
          });
          assert.equal(cupResponse.status, 201);
          const cupProduct = (await cupResponse.json()).producto;

          const initialCupResponse = await fetch(`${baseUrl}/inventario/inicial`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              productId: cupProduct.id,
              quantity: 5,
              unitCost: 1
            })
          });
          assert.equal(initialCupResponse.status, 201);

          const sauceResponse = await fetch(`${baseUrl}/salsas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              nombre: "Aderezo prueba",
              materiaPrimaId: rawProduct.id
            })
          });
          assert.equal(sauceResponse.status, 201);
          const sauce = (await sauceResponse.json()).sauce;

          const purchaseResponse = await fetch(`${baseUrl}/compras`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              documento: "FC-ADEREZO-001",
              proveedor: "Proveedor aderezos",
              fecha: "2026-05-01",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashOut: 3000,
              items: [
                {
                  id: rawProduct.id,
                  cantidad: 20,
                  costo: 150,
                  sauceId: sauce.id
                }
              ]
            })
          });
          assert.equal(purchaseResponse.status, 201);

          const openResponse = await fetch(`${baseUrl}/salsas-control/abrir`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              sauceId: sauce.id,
              fechaApertura: "2026-05-01"
            })
          });
          assert.equal(openResponse.status, 201);
          const openControl = (await openResponse.json()).control;
          assert.equal(openControl.rendimientoTeorico, 60);

          const saleResponse = await fetch(`${baseUrl}/ventas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              cliente: "Cliente aderezo",
              fecha: "2026-05-01",
              paymentType: "contado",
              paymentMethod: "efectivo",
              cashReceived: 10,
              items: [
                {
                  id: cupProduct.id,
                  cantidad: 1,
                  precio: 10,
                  adicionales: [
                    {
                      id: sauce.id,
                      tipo: "extra",
                      nombre: sauce.nombre,
                      cantidad: 2,
                      precio: 0
                    }
                  ]
                }
              ]
            })
          });
          assert.equal(saleResponse.status, 201);

          const closeResponse = await fetch(`${baseUrl}/salsas-control/${encodeURIComponent(openControl.id)}/cerrar`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              fechaCierre: "2026-05-01",
              rendimientoReal: 2
            })
          });
          assert.equal(closeResponse.status, 200);
          const closedControl = (await closeResponse.json()).control;
          assert.equal(closedControl.rendimientoReal, 2);
          assert.equal(closedControl.mermaReal, 58);
          assert.equal(closedControl.costoPorcionFinal, 75);

          const inventory = await (await fetch(`${baseUrl}/inventario`, {
            headers: authHeaders(token)
          })).json();
          assert.equal(inventory.productos.find(item => item.id === rawProduct.id).stock, 1140);

          const movements = await (await fetch(`${baseUrl}/inventario/movimientos`, {
            headers: authHeaders(token)
          })).json();
          const closeMovement = movements.find(movement => String(movement.controlId) === String(openControl.id));
          assert.equal(closeMovement.tipo, "cierre-control");
          assert.equal(closeMovement.direccion, "salida");
          assert.equal(closeMovement.cantidad, 58);
        });
      } finally {
        restore();
      }
    }
  }
];
