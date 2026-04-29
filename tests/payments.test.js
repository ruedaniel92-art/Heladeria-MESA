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
    name: "pago con tarjeta queda pendiente y puede reembolsarse tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const categoryResponse = await fetch(`${baseUrl}/pagos-categorias`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
            headers: jsonAuthHeaders(token),
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
  },
  {
    name: "pago por transferencia sin referencia se rechaza",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);
          const categoryResponse = await fetch(`${baseUrl}/pagos-categorias`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({ nombre: "Servicios" })
          });
          assert.equal(categoryResponse.status, 201);
          const categoryResult = await categoryResponse.json();

          const paymentResponse = await fetch(`${baseUrl}/pagos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              descripcion: "Servicio sin referencia",
              categoriaId: categoryResult.category.id,
              monto: 12,
              fecha: "2026-04-28",
              paymentMethod: "transferencia"
            })
          });
          assert.equal(paymentResponse.status, 400);
        });
      } finally {
        restore();
      }
    }
  },
  {
    name: "pagos y clasificaciones refrescan datos existentes en Firestore",
    async run() {
      const { app, db, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const initialCategoriesResponse = await fetch(`${baseUrl}/pagos-categorias`, {
            headers: authHeaders(token)
          });
          assert.equal(initialCategoriesResponse.status, 200);
          assert.deepEqual(await initialCategoriesResponse.json(), []);

          await db.collection("paymentCategories").doc("manual-category").set({
            id: "manual-category",
            nombre: "Gastos administrativos",
            descripcion: "Gasto",
            createdAt: "2026-04-28T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z"
          });

          const refreshedCategoriesResponse = await fetch(`${baseUrl}/pagos-categorias`, {
            headers: authHeaders(token)
          });
          assert.equal(refreshedCategoriesResponse.status, 200);
          const refreshedCategories = await refreshedCategoriesResponse.json();
          assert.equal(refreshedCategories.length, 1);
          assert.equal(refreshedCategories[0].id, "manual-category");

          const initialPaymentsResponse = await fetch(`${baseUrl}/pagos`, {
            headers: authHeaders(token)
          });
          assert.equal(initialPaymentsResponse.status, 200);
          assert.deepEqual(await initialPaymentsResponse.json(), []);

          await db.collection("pagos").doc("manual-payment").set({
            id: "manual-payment",
            descripcion: "Servicio registrado",
            beneficiario: "Proveedor",
            categoriaId: "manual-category",
            categoriaNombre: "Gastos administrativos",
            monto: 25,
            fecha: "2026-04-28T00:00:00.000Z",
            paymentMethod: "transferencia",
            referencia: "TR-025",
            status: "registrado",
            createdAt: "2026-04-28T00:00:00.000Z",
            updatedAt: "2026-04-28T00:00:00.000Z"
          });

          const refreshedPaymentsResponse = await fetch(`${baseUrl}/pagos`, {
            headers: authHeaders(token)
          });
          assert.equal(refreshedPaymentsResponse.status, 200);
          const refreshedPayments = await refreshedPaymentsResponse.json();
          assert.equal(refreshedPayments.length, 1);
          assert.equal(refreshedPayments[0].id, "manual-payment");
        });
      } finally {
        restore();
      }
    }
  }
];
