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
    name: "configuracion y traslado de efectivo funcionan tras la extraccion",
    async run() {
      const { app, restore } = loadApp();
      try {
        await withServer(app, async baseUrl => {
          const token = await bootstrapAdmin(baseUrl);

          const settingsResponse = await fetch(`${baseUrl}/efectivo/configuracion`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              openingCashBalance: 100,
              openingBankBalance: 250,
              minimumCashReserve: 25
            })
          });
          assert.equal(settingsResponse.status, 200);
          const settingsResult = await settingsResponse.json();
          assert.equal(settingsResult.settings.openingCashBalance, 100);
          assert.equal(settingsResult.settings.openingBankBalance, 250);
          assert.equal(settingsResult.settings.minimumCashReserve, 25);

          const transferResponse = await fetch(`${baseUrl}/efectivo/traslados`, {
            method: "POST",
            headers: jsonAuthHeaders(token),
            body: JSON.stringify({
              fromAccount: "efectivo",
              toAccount: "banco",
              amount: 40,
              fecha: "2026-04-28",
              reference: "DEP-001"
            })
          });
          assert.equal(transferResponse.status, 201);
          const transferResult = await transferResponse.json();
          assert.equal(transferResult.transfer.fromAccount, "efectivo");
          assert.equal(transferResult.transfer.toAccount, "banco");
          assert.equal(transferResult.transfer.amount, 40);

          const transfersResponse = await fetch(`${baseUrl}/efectivo/traslados`, {
            headers: authHeaders(token)
          });
          assert.equal(transfersResponse.status, 200);
          const transfers = await transfersResponse.json();
          assert.equal(transfers.length, 1);
          assert.equal(transfers[0].reference, "DEP-001");
        });
      } finally {
        restore();
      }
    }
  }
];
