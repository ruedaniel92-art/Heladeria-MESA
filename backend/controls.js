function createControlHandlers({
  app,
  applyConsumableCostSnapshot,
  applyFinalCostToSalesForControl,
  asyncHandler,
  collections,
  commitBatch,
  createDocId,
  ensureConsumableControlSnapshot,
  getActiveBucketForFlavor,
  getActiveSauceControlForSauce,
  getActiveToppingControlForTopping,
  getBaldesControl,
  getFlavorAvailableStock,
  getInventoryMovements,
  getNextConsumableLayer,
  getProductos,
  getSalsas,
  getSauceAvailableStock,
  getSauceControls,
  getSabores,
  getToppingAvailableStock,
  getToppingControls,
  getToppings,
  getVentas,
  hydrateStore,
  removeConsumableCloseInventoryMovements,
  repairConsumableControls,
  saveRecord
}) {
  const controlConfigs = {
    bucket: {
      collection: collections.baldesControl,
      controlGetter: getBaldesControl,
      entityGetter: getSabores,
      requestIdField: "saborId",
      controlIdField: "saborId",
      controlNameField: "saborNombre",
      responseKey: "balde",
      listPath: "/baldes-control",
      openPath: "/baldes-control/abrir",
      closePath: "/baldes-control/:id/cerrar",
      activeControl: getActiveBucketForFlavor,
      availableStock: getFlavorAvailableStock,
      selectMessage: "Selecciona un sabor para abrir el balde.",
      notFoundMessage: "Sabor no encontrado.",
      linkedRawMaterialMessage: "La materia prima vinculada al sabor no existe.",
      unavailableMessage: (entity, rawMaterial) => `No puedes abrir el balde de ${entity.nombre} porque no hay compra disponible para ese sabor en ${rawMaterial.nombre}.`,
      noLayerMessage: entity => `No hay una unidad de compra disponible para abrir un nuevo balde de ${entity.nombre}.`,
      duplicateMessage: "Ya hay un balde abierto para este sabor.",
      openMessage: "Balde abierto correctamente.",
      alreadyClosedMessage: "El balde ya estÃ¡ cerrado.",
      closeNotFoundMessage: "Balde no encontrado.",
      invalidYieldMessage: "El rendimiento real del balde debe ser mayor a cero.",
      closeMessage: "Balde cerrado correctamente y costo final aplicado a las ventas asociadas."
    },
    topping: {
      collection: collections.toppingControls,
      controlGetter: getToppingControls,
      entityGetter: getToppings,
      requestIdField: "toppingId",
      controlIdField: "toppingId",
      controlNameField: "toppingNombre",
      responseKey: "control",
      listPath: "/toppings-control",
      openPath: "/toppings-control/abrir",
      closePath: "/toppings-control/:id/cerrar",
      activeControl: getActiveToppingControlForTopping,
      availableStock: getToppingAvailableStock,
      selectMessage: "Selecciona un topping para abrir el control.",
      notFoundMessage: "Topping no encontrado.",
      linkedRawMaterialMessage: "La materia prima vinculada al topping no existe.",
      unavailableMessage: (entity, rawMaterial) => `No puedes abrir ${entity.nombre} porque no hay compra disponible para ese topping en ${rawMaterial.nombre}.`,
      noLayerMessage: entity => `No hay una unidad de compra disponible para abrir ${entity.nombre}.`,
      duplicateMessage: "Ya hay un control abierto para este topping.",
      openMessage: "Control de topping abierto correctamente.",
      alreadyClosedMessage: "El control de topping ya estÃ¡ cerrado.",
      closeNotFoundMessage: "Control de topping no encontrado.",
      invalidYieldMessage: "El rendimiento real del topping debe ser mayor a cero.",
      closeMessage: "Control de topping cerrado correctamente y costo final aplicado a las ventas asociadas."
    },
    sauce: {
      collection: collections.sauceControls,
      controlGetter: getSauceControls,
      entityGetter: getSalsas,
      requestIdField: "sauceId",
      controlIdField: "sauceId",
      controlNameField: "sauceNombre",
      responseKey: "control",
      listPath: "/salsas-control",
      openPath: "/salsas-control/abrir",
      closePath: "/salsas-control/:id/cerrar",
      activeControl: getActiveSauceControlForSauce,
      availableStock: getSauceAvailableStock,
      selectMessage: "Selecciona una salsa/aderezo para abrir el control.",
      notFoundMessage: "Salsa/aderezo no encontrado.",
      linkedRawMaterialMessage: "La materia prima vinculada a la salsa/aderezo no existe.",
      unavailableMessage: (entity, rawMaterial) => `No puedes abrir ${entity.nombre} porque no hay compra disponible para esa salsa/aderezo en ${rawMaterial.nombre}.`,
      noLayerMessage: entity => `No hay una unidad de compra disponible para abrir ${entity.nombre}.`,
      duplicateMessage: "Ya hay un control abierto para esta salsa/aderezo.",
      openMessage: "Control de salsa/aderezo abierto correctamente.",
      alreadyClosedMessage: "El control de salsa/aderezo ya estÃ¡ cerrado.",
      closeNotFoundMessage: "Control de salsa/aderezo no encontrado.",
      invalidYieldMessage: "El rendimiento real de la salsa/aderezo debe ser mayor a cero.",
      closeMessage: "Control de salsa/aderezo cerrado correctamente y costo final aplicado a las ventas asociadas."
    }
  };

  function createControlRecord(kind, config, entity, fechaApertura, observacion) {
    return {
      id: createDocId(config.collection),
      [config.controlIdField]: entity.id,
      [config.controlNameField]: entity.nombre,
      materiaPrimaId: entity.materiaPrimaId,
      materiaPrimaNombre: entity.materiaPrimaNombre,
      fechaApertura: fechaApertura.toISOString(),
      fechaCierre: null,
      estado: "abierto",
      porcionesVendidas: 0,
      ventasAsociadas: 0,
      observacionApertura: observacion || null,
      observacionCierre: null,
      rendimientoReal: null,
      mermaReal: null,
      costoPorcionFinal: null,
      costoEstado: "provisional"
    };
  }

  function registerListRoute(kind, config) {
    app.get(config.listPath, asyncHandler(async (req, res) => {
      await hydrateStore([config.collection], { forceRefresh: true });
      res.json(config.controlGetter().map(control => ensureConsumableControlSnapshot(kind, control)));
    }));
  }

  function registerOpenRoute(kind, config) {
    app.post(config.openPath, asyncHandler(async (req, res) => {
      await hydrateStore();
      const entityId = req.body?.[config.requestIdField] !== undefined && req.body?.[config.requestIdField] !== null
        ? String(req.body[config.requestIdField])
        : "";
      const observacion = String(req.body?.observacion || "").trim();
      const fechaApertura = req.body?.fechaApertura ? new Date(req.body.fechaApertura) : new Date();

      if (!entityId) {
        return res.status(400).json({ error: config.selectMessage });
      }
      if (Number.isNaN(fechaApertura.getTime())) {
        return res.status(400).json({ error: "La fecha de apertura no es vÃ¡lida." });
      }

      const entity = config.entityGetter().find(item => String(item.id) === entityId);
      if (!entity) {
        return res.status(404).json({ error: config.notFoundMessage });
      }
      if (config.activeControl(entityId)) {
        return res.status(400).json({ error: config.duplicateMessage });
      }

      const materiaPrima = getProductos().find(producto => String(producto.id) === String(entity.materiaPrimaId));
      if (!materiaPrima) {
        return res.status(400).json({ error: config.linkedRawMaterialMessage });
      }

      const availableStock = config.availableStock(entity.id);
      if (Number.isNaN(availableStock) || availableStock <= 0) {
        return res.status(400).json({ error: config.unavailableMessage(entity, materiaPrima) });
      }

      const assignedLayer = getNextConsumableLayer(kind, entity.id);
      if (!assignedLayer) {
        return res.status(400).json({ error: config.noLayerMessage(entity) });
      }

      const control = createControlRecord(kind, config, entity, fechaApertura, observacion);
      applyConsumableCostSnapshot(control, assignedLayer);

      config.controlGetter().push(control);
      await saveRecord(config.collection, control);
      res.status(201).json({ message: config.openMessage, [config.responseKey]: control });
    }));
  }

  function registerCloseRoute(kind, config) {
    app.post(config.closePath, asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      const control = config.controlGetter().find(item => String(item.id) === String(id));
      if (!control) {
        return res.status(404).json({ error: config.closeNotFoundMessage });
      }
      if (control.estado !== "abierto") {
        return res.status(400).json({ error: config.alreadyClosedMessage });
      }

      const observacion = String(req.body?.observacion || "").trim();
      const fechaCierre = req.body?.fechaCierre ? new Date(req.body.fechaCierre) : new Date();
      const rendimientoRealRaw = req.body?.rendimientoReal;
      if (Number.isNaN(fechaCierre.getTime())) {
        return res.status(400).json({ error: "La fecha de cierre no es vÃ¡lida." });
      }

      ensureConsumableControlSnapshot(kind, control);
      const rendimientoReal = rendimientoRealRaw === undefined || rendimientoRealRaw === null || rendimientoRealRaw === ""
        ? Math.max(Number(control.rendimientoTeorico || 0), Number(control.porcionesVendidas || 0), 1)
        : Number(rendimientoRealRaw);
      if (Number.isNaN(rendimientoReal) || rendimientoReal <= 0) {
        return res.status(400).json({ error: config.invalidYieldMessage });
      }
      if (rendimientoReal < Number(control.porcionesVendidas || 0)) {
        return res.status(400).json({ error: "El rendimiento real no puede ser menor que las porciones ya vendidas." });
      }

      control.estado = "cerrado";
      control.fechaCierre = fechaCierre.toISOString();
      control.observacionCierre = observacion || null;
      control.rendimientoReal = rendimientoReal;
      control.mermaReal = Math.max(Number(control.rendimientoTeorico || 0) - rendimientoReal, 0);
      control.costoPorcionFinal = rendimientoReal > 0 ? Number(control.costoAperturaTotal || 0) / rendimientoReal : 0;
      control.costoEstado = "final";

      const affectedSales = applyFinalCostToSalesForControl(kind, control);
      const cleanupResult = removeConsumableCloseInventoryMovements(kind, control);

      await commitBatch([
        { type: "set", collection: config.collection, id: control.id, data: control },
        ...(cleanupResult.affectedProduct ? [
          { type: "set", collection: collections.productos, id: cleanupResult.affectedProduct.id, data: cleanupResult.affectedProduct }
        ] : []),
        ...cleanupResult.removedMovements.map(movement => ({ type: "delete", collection: collections.inventoryMovements, id: movement.id })),
        ...affectedSales.map(venta => ({ type: "set", collection: collections.ventas, id: venta.id, data: venta }))
      ]);
      res.json({ message: config.closeMessage, [config.responseKey]: control });
    }));
  }

  function registerRepairRoute() {
    app.post("/controles/reparar-historico", asyncHandler(async (req, res) => {
      await hydrateStore();

      const bucketSummary = repairConsumableControls("bucket");
      const toppingSummary = repairConsumableControls("topping");
      const sauceSummary = repairConsumableControls("sauce");

      await commitBatch([
        ...getBaldesControl().map(bucket => ({ type: "set", collection: collections.baldesControl, id: bucket.id, data: bucket })),
        ...getToppingControls().map(control => ({ type: "set", collection: collections.toppingControls, id: control.id, data: control })),
        ...getSauceControls().map(control => ({ type: "set", collection: collections.sauceControls, id: control.id, data: control })),
        ...getProductos().map(producto => ({ type: "set", collection: collections.productos, id: producto.id, data: producto })),
        ...bucketSummary.removedMovementIds.map(id => ({ type: "delete", collection: collections.inventoryMovements, id })),
        ...toppingSummary.removedMovementIds.map(id => ({ type: "delete", collection: collections.inventoryMovements, id })),
        ...sauceSummary.removedMovementIds.map(id => ({ type: "delete", collection: collections.inventoryMovements, id })),
        ...getInventoryMovements().map(movement => ({ type: "set", collection: collections.inventoryMovements, id: movement.id, data: movement })),
        ...getVentas().map(venta => ({ type: "set", collection: collections.ventas, id: venta.id, data: venta }))
      ]);

      const summary = {
        baldes: bucketSummary,
        toppings: toppingSummary,
        salsas: sauceSummary,
        totals: {
          controles: bucketSummary.repairedControls + toppingSummary.repairedControls + sauceSummary.repairedControls,
          movimientosEliminados: bucketSummary.removedMovements + toppingSummary.removedMovements + sauceSummary.removedMovements,
          ventasActualizadas: bucketSummary.updatedSales + toppingSummary.updatedSales + sauceSummary.updatedSales,
          productosActualizados: bucketSummary.updatedProducts + toppingSummary.updatedProducts + sauceSummary.updatedProducts
        }
      };

      res.json({
        message: "ReparaciÃ³n histÃ³rica completada correctamente.",
        summary
      });
    }));
  }

  function registerControlRoutes() {
    Object.entries(controlConfigs).forEach(([kind, config]) => {
      registerListRoute(kind, config);
      registerOpenRoute(kind, config);
      registerCloseRoute(kind, config);
    });
    registerRepairRoute();
  }

  return { registerControlRoutes };
}

module.exports = { createControlHandlers };
