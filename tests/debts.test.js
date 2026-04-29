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
    name: "deuda externa recibe abono y actualiza saldo tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const debtResponse = await fetch(`${baseUrl}/deudas-externas`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              tercero: "Proveedor externo",
              concepto: "Prestamo temporal",
              tipo: "por-pagar",
              fecha: "2026-04-27",
              dueDate: "2026-05-10",
              monto: 120
            })
          });
          assert.equal(debtResponse.status, 201);
          const debtResult = await debtResponse.json();
          assert.equal(debtResult.debt.balanceDue, 120);
          assert.equal(debtResult.debt.status, "pendiente");

          const paymentResponse = await fetch(`${baseUrl}/deudas-externas/${encodeURIComponent(debtResult.debt.id)}/abonos`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              amount: 45,
              account: "efectivo",
              fecha: "2026-04-28"
            })
          });
          assert.equal(paymentResponse.status, 200);
          const paymentResult = await paymentResponse.json();
          assert.equal(paymentResult.debt.totalPaid, 45);
          assert.equal(paymentResult.debt.balanceDue, 75);
          assert.equal(paymentResult.debt.status, "abonada");
          assert.equal(paymentResult.debt.paymentHistory.length, 1);
        });
      } finally {
        restore();
      }
    }
  }
];
