function createFundHandlers({
  app,
  asyncHandler,
  collections,
  createDocId,
  getCurrentFundSettings,
  getFundTransfers,
  hydrateStore,
  normalizeFundAccount,
  normalizeNonNegativeAmount,
  saveRecord,
  setFundSettings
}) {
  function registerFundRoutes() {
    app.get("/efectivo/traslados", asyncHandler(async (req, res) => {
      await hydrateStore([collections.fundTransfers]);
      const sortedTransfers = getFundTransfers()
        .slice()
        .sort((left, right) => new Date(right.fecha || right.createdAt || 0) - new Date(left.fecha || left.createdAt || 0));
      res.json(sortedTransfers);
    }));

    app.get("/efectivo/configuracion", asyncHandler(async (req, res) => {
      await hydrateStore([collections.fundSettings]);
      res.json(getCurrentFundSettings());
    }));

    app.post("/efectivo/configuracion", asyncHandler(async (req, res) => {
      await hydrateStore([collections.fundSettings]);

      const openingCashBalance = normalizeNonNegativeAmount(req.body?.openingCashBalance);
      const openingBankBalance = normalizeNonNegativeAmount(req.body?.openingBankBalance);
      const minimumCashReserve = normalizeNonNegativeAmount(req.body?.minimumCashReserve);

      if (openingCashBalance === null || openingBankBalance === null || minimumCashReserve === null) {
        return res.status(400).json({ error: "Los saldos iniciales y el fondo mÃ­nimo deben ser nÃºmeros mayores o iguales a cero." });
      }

      const currentSettings = getCurrentFundSettings();
      const now = new Date().toISOString();
      const nextSettings = {
        ...currentSettings,
        id: currentSettings.id || "main",
        openingCashBalance,
        openingBankBalance,
        minimumCashReserve,
        createdAt: currentSettings.createdAt || now,
        updatedAt: now
      };

      setFundSettings([nextSettings]);
      await saveRecord(collections.fundSettings, nextSettings);
      res.json({ message: "ConfiguraciÃ³n de efectivo y bancos guardada correctamente.", settings: nextSettings });
    }));

    app.post("/efectivo/traslados", asyncHandler(async (req, res) => {
      await hydrateStore([collections.fundTransfers]);
      const fundTransfers = getFundTransfers();
      const fromAccount = normalizeFundAccount(req.body?.fromAccount);
      const toAccount = normalizeFundAccount(req.body?.toAccount);
      const amount = Number(req.body?.amount);
      const transferDate = req.body?.fecha ? new Date(req.body.fecha) : new Date();
      const description = String(req.body?.description || "").trim();
      const reference = String(req.body?.reference || "").trim();
      const note = String(req.body?.note || "").trim();

      if (!fromAccount || !toAccount) {
        return res.status(400).json({ error: "Debes seleccionar una cuenta origen y una cuenta destino vÃ¡lidas." });
      }
      if (fromAccount === toAccount) {
        return res.status(400).json({ error: "El origen y el destino del traslado deben ser distintos." });
      }
      if (Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "El monto del traslado debe ser mayor a cero." });
      }
      if (Number.isNaN(transferDate.getTime())) {
        return res.status(400).json({ error: "La fecha del traslado no es vÃ¡lida." });
      }

      const now = new Date().toISOString();
      const transfer = {
        id: createDocId(collections.fundTransfers),
        fromAccount,
        toAccount,
        amount,
        fecha: transferDate.toISOString(),
        description: description || `Traslado de ${fromAccount} a ${toAccount}`,
        reference: reference || null,
        note: note || null,
        createdAt: now,
        updatedAt: now
      };

      fundTransfers.push(transfer);
      await saveRecord(collections.fundTransfers, transfer);
      res.status(201).json({ message: "Traslado de fondos registrado correctamente.", transfer });
    }));
  }

  return { registerFundRoutes };
}

module.exports = { createFundHandlers };
