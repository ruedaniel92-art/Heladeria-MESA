function createFlavorCatalogHandlers({
  app,
  asyncHandler,
  collections,
  createDocId,
  deleteRecord,
  getBaldesControl,
  getProductos,
  getSalsas,
  getSauceControls,
  getSabores,
  getToppingControls,
  getToppings,
  getVentas,
  hydrateStore,
  normalizeFlavorName,
  normalizeProductType,
  saveRecord,
  setSalsas,
  setSabores,
  setToppings
}) {
  function findMateriaPrima(materiaPrimaId) {
    return getProductos().find(producto => (
      String(producto.id) === String(materiaPrimaId)
      && normalizeProductType(producto.tipo || producto.type) === "materia prima"
    ));
  }

  function registerFlavorCatalogRoutes() {
    app.get("/sabores", asyncHandler(async (req, res) => {
      await hydrateStore([collections.sabores], { forceRefresh: true });
      res.json(getSabores());
    }));

    app.get("/toppings", asyncHandler(async (req, res) => {
      await hydrateStore([collections.toppings], { forceRefresh: true });
      res.json(getToppings());
    }));

    app.get("/salsas", asyncHandler(async (req, res) => {
      await hydrateStore([collections.salsas], { forceRefresh: true });
      res.json(getSalsas());
    }));

    app.post("/sabores", asyncHandler(async (req, res) => {
      await hydrateStore();
      const sabores = getSabores();
      const normalizedName = normalizeFlavorName(req.body?.nombre);
      const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : "";
      const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : "";

      if (!normalizedName) {
        return res.status(400).json({ error: "El nombre del sabor es obligatorio." });
      }

      const materiaPrima = findMateriaPrima(materiaPrimaId);
      if (!materiaPrima) {
        return res.status(400).json({ error: "Selecciona la materia prima del balde para este sabor." });
      }

      const duplicateFlavor = sabores.find(sabor => sabor.nombre.toLowerCase() === normalizedName.toLowerCase());
      const editingFlavor = sabores.find(sabor => String(sabor.id) === originalId);

      if (editingFlavor) {
        if (duplicateFlavor && String(duplicateFlavor.id) !== String(editingFlavor.id)) {
          return res.status(400).json({ error: "Ya existe un sabor con ese nombre." });
        }
        editingFlavor.nombre = normalizedName;
        editingFlavor.materiaPrimaId = materiaPrima.id;
        editingFlavor.materiaPrimaNombre = materiaPrima.nombre;
        await saveRecord(collections.sabores, editingFlavor);
        return res.status(200).json({ message: "Sabor actualizado.", sabor: editingFlavor });
      }

      if (duplicateFlavor) {
        return res.status(400).json({ error: "Ya existe un sabor con ese nombre." });
      }

      const sabor = {
        id: createDocId(collections.sabores),
        nombre: normalizedName,
        materiaPrimaId: materiaPrima.id,
        materiaPrimaNombre: materiaPrima.nombre
      };

      sabores.push(sabor);
      await saveRecord(collections.sabores, sabor);
      res.status(201).json({ message: "Sabor creado.", sabor });
    }));

    app.post("/toppings", asyncHandler(async (req, res) => {
      await hydrateStore();
      const toppings = getToppings();
      const normalizedName = normalizeFlavorName(req.body?.nombre);
      const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : "";
      const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : "";

      if (!normalizedName) {
        return res.status(400).json({ error: "El nombre del topping es obligatorio." });
      }

      const materiaPrima = findMateriaPrima(materiaPrimaId);
      if (!materiaPrima) {
        return res.status(400).json({ error: "Selecciona la materia prima del topping." });
      }

      const duplicateTopping = toppings.find(topping => topping.nombre.toLowerCase() === normalizedName.toLowerCase());
      const editingTopping = toppings.find(topping => String(topping.id) === originalId);

      if (editingTopping) {
        if (duplicateTopping && String(duplicateTopping.id) !== String(editingTopping.id)) {
          return res.status(400).json({ error: "Ya existe un topping con ese nombre." });
        }
        editingTopping.nombre = normalizedName;
        editingTopping.materiaPrimaId = materiaPrima.id;
        editingTopping.materiaPrimaNombre = materiaPrima.nombre;
        await saveRecord(collections.toppings, editingTopping);
        return res.status(200).json({ message: "Topping actualizado.", topping: editingTopping });
      }

      if (duplicateTopping) {
        return res.status(400).json({ error: "Ya existe un topping con ese nombre." });
      }

      const topping = {
        id: createDocId(collections.toppings),
        nombre: normalizedName,
        materiaPrimaId: materiaPrima.id,
        materiaPrimaNombre: materiaPrima.nombre
      };

      toppings.push(topping);
      await saveRecord(collections.toppings, topping);
      res.status(201).json({ message: "Topping creado.", topping });
    }));

    app.post("/salsas", asyncHandler(async (req, res) => {
      await hydrateStore();
      const salsas = getSalsas();
      const normalizedName = normalizeFlavorName(req.body?.nombre);
      const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : "";
      const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : "";

      if (!normalizedName) {
        return res.status(400).json({ error: "El nombre de la salsa/aderezo es obligatorio." });
      }

      const materiaPrima = findMateriaPrima(materiaPrimaId);
      if (!materiaPrima) {
        return res.status(400).json({ error: "Selecciona la materia prima de la salsa/aderezo." });
      }

      const duplicateSauce = salsas.find(sauce => sauce.nombre.toLowerCase() === normalizedName.toLowerCase());
      const editingSauce = salsas.find(sauce => String(sauce.id) === originalId);

      if (editingSauce) {
        if (duplicateSauce && String(duplicateSauce.id) !== String(editingSauce.id)) {
          return res.status(400).json({ error: "Ya existe una salsa/aderezo con ese nombre." });
        }
        editingSauce.nombre = normalizedName;
        editingSauce.materiaPrimaId = materiaPrima.id;
        editingSauce.materiaPrimaNombre = materiaPrima.nombre;
        await saveRecord(collections.salsas, editingSauce);
        return res.status(200).json({ message: "Salsa/aderezo actualizado.", sauce: editingSauce });
      }

      if (duplicateSauce) {
        return res.status(400).json({ error: "Ya existe una salsa/aderezo con ese nombre." });
      }

      const sauce = {
        id: createDocId(collections.salsas),
        nombre: normalizedName,
        materiaPrimaId: materiaPrima.id,
        materiaPrimaNombre: materiaPrima.nombre
      };

      salsas.push(sauce);
      await saveRecord(collections.salsas, sauce);
      res.status(201).json({ message: "Salsa/aderezo creado.", sauce });
    }));

    app.delete("/sabores/:id", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      const sabores = getSabores();
      const sabor = sabores.find(item => String(item.id) === String(id));
      if (!sabor) {
        return res.status(404).json({ error: "Sabor no encontrado." });
      }

      const hasSales = getVentas().some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.id) === String(id))));
      const hasBucketControl = getBaldesControl().some(bucket => String(bucket.saborId) === String(id));
      if (hasSales || hasBucketControl) {
        return res.status(400).json({ error: "No se puede eliminar un sabor usado en ventas." });
      }

      setSabores(sabores.filter(item => String(item.id) !== String(id)));
      await deleteRecord(collections.sabores, id);
      res.json({ message: "Sabor eliminado con éxito." });
    }));

    app.delete("/toppings/:id", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      const toppings = getToppings();
      const topping = toppings.find(item => String(item.id) === String(id));
      if (!topping) {
        return res.status(404).json({ error: "Topping no encontrado." });
      }

      const hasSales = getVentas().some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.id) === String(id))));
      const hasToppingControl = getToppingControls().some(control => String(control.toppingId) === String(id));
      if (hasSales || hasToppingControl) {
        return res.status(400).json({ error: "No se puede eliminar un topping usado en ventas." });
      }

      setToppings(toppings.filter(item => String(item.id) !== String(id)));
      await deleteRecord(collections.toppings, id);
      res.json({ message: "Topping eliminado con éxito." });
    }));

    app.delete("/salsas/:id", asyncHandler(async (req, res) => {
      await hydrateStore();
      const { id } = req.params;
      const salsas = getSalsas();
      const sauce = salsas.find(item => String(item.id) === String(id));
      if (!sauce) {
        return res.status(404).json({ error: "Salsa/aderezo no encontrado." });
      }

      const hasSales = getVentas().some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.id) === String(id))));
      const hasSauceControl = getSauceControls().some(control => String(control.sauceId) === String(id));
      if (hasSales || hasSauceControl) {
        return res.status(400).json({ error: "No se puede eliminar una salsa/aderezo usado en ventas." });
      }

      setSalsas(salsas.filter(item => String(item.id) !== String(id)));
      await deleteRecord(collections.salsas, id);
      res.json({ message: "Salsa/aderezo eliminado con éxito." });
    }));
  }

  return {
    registerFlavorCatalogRoutes
  };
}

module.exports = {
  createFlavorCatalogHandlers
};
