function createInventoryHandlers({
  app,
  asyncHandler,
  buildInventoryMovement,
  collections,
  commitBatch,
  getInventoryMovements,
  getProductos,
  hydrateStore
}) {
  function registerInventoryRoutes() {
    app.get("/inventario/movimientos", asyncHandler(async (req, res) => {
      await hydrateStore([collections.inventoryMovements], { forceRefresh: true });
      const sortedMovements = getInventoryMovements()
        .slice()
        .sort((a, b) => new Date(a.fecha || a.createdAt || 0) - new Date(b.fecha || b.createdAt || 0));
      res.json(sortedMovements);
    }));

    app.post("/inventario/inicial", asyncHandler(async (req, res) => {
      await hydrateStore();
      const productId = String(req.body?.productId || "").trim();
      const quantity = Number(req.body?.quantity);
      const unitCost = Number(req.body?.unitCost);
      const note = String(req.body?.note || "").trim();
      const movementDate = req.body?.date ? new Date(req.body.date) : new Date();

      if (!productId) {
        return res.status(400).json({ error: "Selecciona un producto válido." });
      }
      if (Number.isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "La cantidad inicial debe ser mayor a cero." });
      }
      if (Number.isNaN(unitCost) || unitCost < 0) {
        return res.status(400).json({ error: "El costo unitario del inventario inicial no es válido." });
      }
      if (Number.isNaN(movementDate.getTime())) {
        return res.status(400).json({ error: "La fecha del inventario inicial no es válida." });
      }

      const productos = getProductos();
      const producto = productos.find(item => String(item.id) === productId);
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }

      const previousStock = Number(producto.stock || 0);
      const nextStock = previousStock + quantity;
      producto.stock = nextStock;

      const movement = buildInventoryMovement({
        producto,
        tipo: "inventario-inicial",
        direccion: "entrada",
        cantidad: quantity,
        fecha: movementDate.toISOString(),
        observacion: note || "Carga de inventario inicial",
        referencia: "Inventario inicial",
        saldoAnterior: previousStock,
        saldoNuevo: nextStock,
        costoUnitario: unitCost,
        costoTotal: quantity * unitCost
      });

      getInventoryMovements().push(movement);
      await commitBatch([
        { type: "set", collection: collections.productos, id: producto.id, data: producto },
        { type: "set", collection: collections.inventoryMovements, id: movement.id, data: movement }
      ]);
      res.status(201).json({ message: "Inventario inicial registrado correctamente.", movement, producto });
    }));

    app.post("/inventario/ajustes", asyncHandler(async (req, res) => {
      await hydrateStore();
      const productId = String(req.body?.productId || "").trim();
      const quantity = Number(req.body?.quantity);
      const adjustmentType = String(req.body?.adjustmentType || "").trim().toLowerCase();
      const unitCostRaw = req.body?.unitCost;
      const unitCost = unitCostRaw === null || unitCostRaw === undefined || unitCostRaw === "" ? null : Number(unitCostRaw);
      const note = String(req.body?.note || "").trim();
      const movementDate = req.body?.date ? new Date(req.body.date) : new Date();

      if (!productId) {
        return res.status(400).json({ error: "Selecciona un producto válido." });
      }
      if (!["entrada", "salida"].includes(adjustmentType)) {
        return res.status(400).json({ error: "El tipo de ajuste debe ser entrada o salida." });
      }
      if (Number.isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "La cantidad del ajuste debe ser mayor a cero." });
      }
      if (adjustmentType === "entrada" && (unitCost === null || Number.isNaN(unitCost) || unitCost < 0)) {
        return res.status(400).json({ error: "El costo unitario es obligatorio para ajustes de entrada." });
      }
      if (Number.isNaN(movementDate.getTime())) {
        return res.status(400).json({ error: "La fecha del ajuste no es válida." });
      }

      const productos = getProductos();
      const producto = productos.find(item => String(item.id) === productId);
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }

      const previousStock = Number(producto.stock || 0);
      const stockDelta = adjustmentType === "entrada" ? quantity : -quantity;
      const nextStock = previousStock + stockDelta;
      if (nextStock < 0) {
        return res.status(400).json({ error: "El ajuste no puede dejar el stock en negativo." });
      }

      producto.stock = nextStock;
      const movement = buildInventoryMovement({
        producto,
        tipo: "ajuste",
        direccion: adjustmentType,
        cantidad: quantity,
        fecha: movementDate.toISOString(),
        observacion: note || null,
        referencia: "Ajuste de inventario",
        saldoAnterior: previousStock,
        saldoNuevo: nextStock,
        costoUnitario: adjustmentType === "entrada" ? unitCost : null,
        costoTotal: adjustmentType === "entrada" ? quantity * unitCost : null
      });

      getInventoryMovements().push(movement);
      await commitBatch([
        { type: "set", collection: collections.productos, id: producto.id, data: producto },
        { type: "set", collection: collections.inventoryMovements, id: movement.id, data: movement }
      ]);
      res.status(201).json({ message: "Ajuste de inventario registrado correctamente.", movement, producto });
    }));

    app.get("/inventario", asyncHandler(async (req, res) => {
      await hydrateStore([collections.productos], { forceRefresh: true });
      const productos = getProductos();
      const totalProductos = productos.length;
      const totalStock = productos.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      const lowStockCount = productos.filter(item => Number(item.stock || 0) <= Number(item.stockMin || 0)).length;
      res.json({ totalProductos, totalStock, lowStockCount, productos });
    }));
  }

  return {
    registerInventoryRoutes
  };
}

module.exports = {
  createInventoryHandlers
};
