function createInventoryHandlers({
  app,
  asyncHandler,
  buildInventoryMovement,
  collections,
  commitBatch,
  getBaldesControl,
  getCompras,
  getInventoryMovements,
  getProductos,
  getSalsas,
  getSauceControls,
  getSabores,
  getToppingControls,
  getToppings,
  getVentas,
  hydrateStore
}) {
  function isCancelled(record) {
    return String(record?.status || "").trim().toLowerCase() === "anulada";
  }

  function getInitialMovementLink(movement) {
    if (movement?.flavorId) {
      return { type: "flavor", field: "flavorId", id: String(movement.flavorId), controlField: "saborId", controls: getBaldesControl() };
    }
    if (movement?.toppingId) {
      return { type: "topping", field: "toppingId", id: String(movement.toppingId), controlField: "toppingId", controls: getToppingControls() };
    }
    if (movement?.sauceId) {
      return { type: "sauce", field: "sauceId", id: String(movement.sauceId), controlField: "sauceId", controls: getSauceControls() };
    }
    return null;
  }

  function saleTouchesInitialMovement(venta, movement, link) {
    const items = Array.isArray(venta?.items) ? venta.items : [];
    if (!link) {
      return items.some(item => String(item.id || "") === String(movement.productoId)
        || (Array.isArray(item.ingredientes) && item.ingredientes.some(ingredient => String(ingredient.id || "") === String(movement.productoId)))
        || (Array.isArray(item.componentes) && item.componentes.some(component => String(component.id || "") === String(movement.productoId)))
        || (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.materiaPrimaId || "") === String(movement.productoId)))
        || (Array.isArray(item.adicionales) && item.adicionales.some(addon => String(addon.materiaPrimaId || "") === String(movement.productoId))));
    }

    return items.some(item => {
      if (link.type === "flavor") {
        return (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.id || "") === link.id))
          || (Array.isArray(item.componentes) && item.componentes.some(component => String(component.sourceCategory || "") === "sabor" && String(component.sourceId || "") === link.id));
      }
      if (link.type === "topping") {
        return (Array.isArray(item.adicionales) && item.adicionales.some(addon => String(addon.id || "") === link.id || String(addon.toppingControlId || "") === link.id))
          || (Array.isArray(item.componentes) && item.componentes.some(component => String(component.sourceCategory || "") === "topping" && String(component.sourceId || "") === link.id));
      }
      return (Array.isArray(item.adicionales) && item.adicionales.some(addon => String(addon.id || "") === link.id || String(addon.sauceControlId || "") === link.id))
        || (Array.isArray(item.componentes) && item.componentes.some(component => String(component.sourceCategory || "") === "salsa" && String(component.sourceId || "") === link.id));
    });
  }

  function purchaseTouchesInitialMovement(compra, movement, link) {
    const items = Array.isArray(compra?.items) ? compra.items : [];
    return items.some(item => {
      if (String(item.id || "") !== String(movement.productoId)) {
        return false;
      }
      return link ? String(item[link.field] || "") === link.id : true;
    });
  }

  function hasBlockingActivity(movement) {
    const link = getInitialMovementLink(movement);
    const hasInventoryActivity = getInventoryMovements().some(item => {
      if (String(item.id || "") === String(movement.id || "")) {
        return false;
      }
      if (String(item.productoId || "") !== String(movement.productoId || "")) {
        return false;
      }
      return String(item.tipo || "").trim().toLowerCase() !== "inventario-inicial";
    });
    if (hasInventoryActivity) {
      return true;
    }

    if (getVentas().filter(venta => !isCancelled(venta)).some(venta => saleTouchesInitialMovement(venta, movement, link))) {
      return true;
    }
    if (getCompras().filter(compra => !isCancelled(compra)).some(compra => purchaseTouchesInitialMovement(compra, movement, link))) {
      return true;
    }
    if (link && link.controls.some(control => String(control[link.controlField] || "") === link.id)) {
      return true;
    }
    return false;
  }

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
      const flavorId = req.body?.flavorId !== undefined && req.body?.flavorId !== null ? String(req.body.flavorId).trim() : "";
      const toppingId = req.body?.toppingId !== undefined && req.body?.toppingId !== null ? String(req.body.toppingId).trim() : "";
      const sauceId = req.body?.sauceId !== undefined && req.body?.sauceId !== null ? String(req.body.sauceId).trim() : "";

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

      const linkedFlavors = getSabores().filter(flavor => String(flavor.materiaPrimaId || "") === productId);
      const linkedToppings = getToppings().filter(topping => String(topping.materiaPrimaId || "") === productId);
      const linkedSauces = getSalsas().filter(sauce => String(sauce.materiaPrimaId || "") === productId);
      let selectedFlavor = null;
      let selectedTopping = null;
      let selectedSauce = null;

      if (linkedFlavors.length || linkedToppings.length || linkedSauces.length) {
        const selectedLinksCount = [flavorId, toppingId, sauceId].filter(Boolean).length;
        if (selectedLinksCount !== 1) {
          return res.status(400).json({ error: "Selecciona el sabor, topping o salsa/aderezo al que pertenece este inventario inicial." });
        }

        if (flavorId) {
          selectedFlavor = linkedFlavors.find(flavor => String(flavor.id) === flavorId) || null;
          if (!selectedFlavor) {
            return res.status(400).json({ error: "Selecciona un sabor valido para esta materia prima." });
          }
        }

        if (toppingId) {
          selectedTopping = linkedToppings.find(topping => String(topping.id) === toppingId) || null;
          if (!selectedTopping) {
            return res.status(400).json({ error: "Selecciona un topping valido para esta materia prima." });
          }
        }

        if (sauceId) {
          selectedSauce = linkedSauces.find(sauce => String(sauce.id) === sauceId) || null;
          if (!selectedSauce) {
            return res.status(400).json({ error: "Selecciona una salsa/aderezo valido para esta materia prima." });
          }
        }
      }

      const previousStock = Number(producto.stock || 0);
      const nextStock = previousStock + quantity;
      producto.stock = nextStock;
      const linkedName = selectedFlavor?.nombre || selectedTopping?.nombre || selectedSauce?.nombre || "";
      const linkedDetail = selectedFlavor
        ? `Sabor ${selectedFlavor.nombre}`
        : selectedTopping
          ? `Topping ${selectedTopping.nombre}`
          : selectedSauce
            ? `Salsa/aderezo ${selectedSauce.nombre}`
            : "";

      const movement = buildInventoryMovement({
        producto,
        tipo: "inventario-inicial",
        direccion: "entrada",
        cantidad: quantity,
        fecha: movementDate.toISOString(),
        observacion: note || (linkedDetail ? `Carga de inventario inicial para ${linkedDetail}` : "Carga de inventario inicial"),
        referencia: "Inventario inicial",
        saldoAnterior: previousStock,
        saldoNuevo: nextStock,
        costoUnitario: unitCost,
        costoTotal: quantity * unitCost,
        extraFields: {
          flavorId: selectedFlavor ? selectedFlavor.id : null,
          flavorName: selectedFlavor ? selectedFlavor.nombre : null,
          toppingId: selectedTopping ? selectedTopping.id : null,
          toppingName: selectedTopping ? selectedTopping.nombre : null,
          sauceId: selectedSauce ? selectedSauce.id : null,
          sauceName: selectedSauce ? selectedSauce.nombre : null,
          linkedName: linkedName || null
        }
      });

      getInventoryMovements().push(movement);
      await commitBatch([
        { type: "set", collection: collections.productos, id: producto.id, data: producto },
        { type: "set", collection: collections.inventoryMovements, id: movement.id, data: movement }
      ]);
      res.status(201).json({ message: "Inventario inicial registrado correctamente.", movement, producto });
    }));

    app.delete("/inventario/inicial/:id", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      if (!id || typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "ID invÃ¡lido" });
      }

      const movement = getInventoryMovements().find(item => String(item.id) === String(id));
      if (!movement || String(movement.tipo || "").trim().toLowerCase() !== "inventario-inicial") {
        return res.status(404).json({ error: "Inventario inicial no encontrado." });
      }
      if (hasBlockingActivity(movement)) {
        return res.status(400).json({ error: "No se puede eliminar este inventario inicial porque ya tiene movimientos relacionados." });
      }

      const producto = getProductos().find(item => String(item.id) === String(movement.productoId));
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado." });
      }

      const quantity = Number(movement.cantidad || 0);
      const currentStock = Number(producto.stock || 0);
      if (currentStock - quantity < -0.0001) {
        return res.status(400).json({ error: "No se puede eliminar porque el stock actual no alcanza para revertir este inventario inicial." });
      }

      producto.stock = currentStock - quantity;
      const inventoryMovements = getInventoryMovements();
      const movementIndex = inventoryMovements.findIndex(item => String(item.id) === String(id));
      if (movementIndex >= 0) {
        inventoryMovements.splice(movementIndex, 1);
      }

      await commitBatch([
        { type: "set", collection: collections.productos, id: producto.id, data: producto },
        { type: "delete", collection: collections.inventoryMovements, id }
      ]);
      res.json({ message: "Inventario inicial eliminado correctamente.", producto });
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
