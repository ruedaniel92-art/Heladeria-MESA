const express = require("express");
const db = require("./firebase");
const app = express();

const COLLECTIONS = {
  productos: "productos",
  compras: "compras",
  ventas: "ventas",
  sabores: "sabores",
  toppings: "toppings",
  baldesControl: "baldesControl"
};

app.use((req, res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4);
  }
  next();
});

app.use(express.json());

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "El cuerpo JSON de la solicitud no es válido." });
  }
  return next(err);
});

// Permitir CORS desde el frontend local
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Base de datos temporal (memoria)
let productos = [];
let compras = [];
let ventas = [];
let sabores = [];
let toppings = [];
let baldesControl = [];

function sanitizeFirestoreValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
      if (nestedValue !== undefined) {
        accumulator[key] = sanitizeFirestoreValue(nestedValue);
      }
      return accumulator;
    }, {});
  }

  return value;
}

async function loadCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function hydrateStore() {
  [productos, compras, ventas, sabores, toppings, baldesControl] = await Promise.all([
    loadCollection(COLLECTIONS.productos),
    loadCollection(COLLECTIONS.compras),
    loadCollection(COLLECTIONS.ventas),
    loadCollection(COLLECTIONS.sabores),
    loadCollection(COLLECTIONS.toppings),
    loadCollection(COLLECTIONS.baldesControl)
  ]);
}

function createDocId(collectionName) {
  return db.collection(collectionName).doc().id;
}

async function saveRecord(collectionName, record) {
  const id = String(record.id || createDocId(collectionName));
  const payload = sanitizeFirestoreValue({ ...record, id });
  await db.collection(collectionName).doc(id).set(payload);
  return payload;
}

async function deleteRecord(collectionName, id) {
  await db.collection(collectionName).doc(String(id)).delete();
}

async function commitBatch(operations) {
  const batch = db.batch();

  operations.forEach(operation => {
    if (!operation) return;

    const docRef = db.collection(operation.collection).doc(String(operation.id));
    if (operation.type === 'delete') {
      batch.delete(docRef);
      return;
    }

    batch.set(docRef, sanitizeFirestoreValue({ ...operation.data, id: String(operation.id) }));
  });

  await batch.commit();
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(error => {
      console.error(error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Ocurrió un error al comunicarse con Firestore." });
      }
    });
  };
}

function buildNextDocumentNumber(records, prefix) {
  const maxSequence = records.reduce((maxValue, record) => {
    const documentValue = String(record.documento || record.document || '').trim().toUpperCase();
    if (!documentValue.startsWith(`${prefix}-`)) {
      return maxValue;
    }
    const sequence = Number(documentValue.slice(prefix.length + 1));
    return Number.isNaN(sequence) ? maxValue : Math.max(maxValue, sequence);
  }, 0);

  return `${prefix}-${String(maxSequence + 1).padStart(4, "0")}`;
}

function normalizeFlavorName(value) {
  return String(value || '').trim();
}

function normalizeNonNegativeNumber(value) {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) || parsedValue < 0 ? NaN : parsedValue;
}

function normalizeInventoryMode(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (normalizedValue === 'directo') return 'directo';
  if (normalizedValue === 'receta') return 'receta';
  if (normalizedValue === 'helado-sabores') return 'helado-sabores';
  if (normalizedValue === 'mixto') return 'mixto';
  if (normalizedValue === 'materia-prima') return 'materia-prima';
  return '';
}

function normalizeProductType(rawType) {
  const type = String(rawType || '').trim().toLowerCase();
  if (type.includes('materia') && type.includes('prima')) {
    return 'materia prima';
  }
  if (type.includes('terminado')) {
    return 'producto terminado';
  }
  if (type.includes('producto')) {
    return 'productos';
  }
  return type;
}

function normalizeIngredient(ing) {
  return {
    id: ing?.id !== undefined && ing?.id !== null ? String(ing.id) : '',
    nombre: String(ing?.nombre || '').trim().toLowerCase(),
    cantidad: Number(ing?.cantidad) || 0
  };
}

function ingredientsKey(ingredientes) {
  const normalized = Array.isArray(ingredientes) ? ingredientes.map(normalizeIngredient).filter(ing => ing.nombre && ing.cantidad > 0) : [];
  normalized.sort((a, b) => {
    if (a.id && b.id) return a.id.localeCompare(b.id);
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre);
    return a.cantidad - b.cantidad;
  });
  return normalized.map(ing => `${ing.id}:${ing.nombre}:${ing.cantidad}`).join('|');
}

function productIdentityKey(product) {
  const tipo = normalizeProductType(product.tipo || product.type);
  const modoControl = normalizeInventoryMode(product.modoControl || product.inventoryMode || (tipo === 'materia prima' ? 'materia-prima' : ''));
  const nombre = String(product.nombre || '').trim().toLowerCase();
  const precio = tipo === 'materia prima' ? 0 : Number(product.precio || 0);
  const stockMin = Number(product.stockMin || product.stockMinimo || 0);
  const medida = (tipo === 'materia prima' ? String(product.medida || '').trim().toLowerCase() : '');
  const ingredientesKeyString = tipo === 'producto terminado' ? ingredientsKey(product.ingredientes) : '';
  const controlSabores = product.controlSabores ? '1' : '0';
  const rendimientoPorCompra = tipo === 'materia prima' ? Number(product.rendimientoPorCompra || 0) : 0;
  const pelotasPorUnidad = tipo === 'productos' ? Number(product.pelotasPorUnidad || 0) : 0;
  return `${nombre}::${tipo}::${modoControl}::${precio}::${stockMin}::${medida}::${ingredientesKeyString}::${controlSabores}::${rendimientoPorCompra}::${pelotasPorUnidad}`;
}

function getMateriaPrimaStockIncrement(producto, cantidadCompra) {
  const rendimientoPorCompra = normalizeNonNegativeNumber(producto?.rendimientoPorCompra);
  if (!Number.isNaN(rendimientoPorCompra) && rendimientoPorCompra > 0) {
    return cantidadCompra * rendimientoPorCompra;
  }
  return cantidadCompra;
}

function getProductInventoryMode(producto) {
  const tipo = normalizeProductType(producto?.tipo || producto?.type);
  const explicitMode = normalizeInventoryMode(producto?.modoControl || producto?.inventoryMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (tipo === 'materia prima') {
    return 'materia-prima';
  }
  if (producto?.controlSabores && Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return 'mixto';
  }
  if (producto?.controlSabores) {
    return 'helado-sabores';
  }
  if (Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return 'receta';
  }
  return 'directo';
}

function isPurchasableProduct(producto) {
  const modoControl = getProductInventoryMode(producto);
  return modoControl === 'materia-prima' || modoControl === 'directo';
}

function getActiveBucketForFlavor(flavorId) {
  return baldesControl.find(bucket => String(bucket.saborId) === String(flavorId) && bucket.estado === 'abierto');
}

function findProductoByIdOrName({ id, nombre }) {
  if (id !== undefined && id !== null) {
    const idString = String(id);
    const productoById = productos.find(p => String(p.id) === idString);
    if (productoById) return productoById;
  }
  if (nombre && typeof nombre === 'string') {
    return productos.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  }
  return undefined;
}

// Ruta prueba
app.get("/", (req, res) => {
  res.send("API Heladería funcionando 🍦");
});

// Crear producto
app.post("/productos", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { nombre, precio, tipo, type, stockMin, medida, ingredientes, stock, originalId, originalName, controlSabores, rendimientoPorCompra, pelotasPorUnidad, modoControl, inventoryMode } = req.body;
  const rawType = (tipo || type || '').trim();
  const normalizedType = normalizeProductType(rawType);
  let normalizedMode = normalizeInventoryMode(modoControl || inventoryMode);
  const computedStockMin = !isNaN(Number(stockMin)) ? Number(stockMin) : (stock !== undefined ? Number(stock) : NaN);
  const computedPrecio = normalizedType === 'materia prima' ? undefined : (!isNaN(Number(precio)) ? Number(precio) : NaN);
  if (normalizedType === 'materia prima') {
    normalizedMode = 'materia-prima';
  }
  const shouldUseRecipe = normalizedMode === 'receta' || normalizedMode === 'mixto';
  const shouldControlFlavors = normalizedMode === 'helado-sabores' || normalizedMode === 'mixto' || Boolean(controlSabores);
  const computedYield = normalizedType === 'materia prima' ? normalizeNonNegativeNumber(rendimientoPorCompra) : 0;
  const computedScoops = shouldControlFlavors ? Number(pelotasPorUnidad) : 0;
  if (!nombre || typeof nombre !== "string" || !normalizedType || isNaN(computedStockMin) || (normalizedType !== 'materia prima' && isNaN(computedPrecio))) {
    return res.status(400).json({ error: "Campos inválidos. nombre, tipo y stockMin son obligatorios. Precio de venta es obligatorio para producto terminado y productos." });
  }

  if (normalizedType !== 'materia prima' && !normalizedMode) {
    return res.status(400).json({ error: "Selecciona el modo de control del producto." });
  }

  if (normalizedMode === 'directo' && normalizedType !== 'productos') {
    return res.status(400).json({ error: "Los productos de control directo deben registrarse como productos." });
  }

  if ((normalizedMode === 'receta' || normalizedMode === 'mixto') && normalizedType !== 'producto terminado') {
    return res.status(400).json({ error: "Los productos con receta o mixtos deben registrarse como producto terminado." });
  }

  if (normalizedMode === 'helado-sabores' && normalizedType !== 'productos') {
    return res.status(400).json({ error: "Los productos de helado por sabores deben registrarse como productos." });
  }

  if (normalizedType === "materia prima" && (!medida || typeof medida !== "string")) {
    return res.status(400).json({ error: "Materia prima necesita una medición." });
  }

  if (normalizedType === "materia prima" && (Number.isNaN(computedYield) || computedYield <= 0)) {
    return res.status(400).json({ error: "La materia prima debe indicar cuántas porciones rinde cada unidad comprada." });
  }

  if (shouldControlFlavors && (!Number.isInteger(computedScoops) || computedScoops <= 0)) {
    return res.status(400).json({ error: "El producto con sabores debe indicar cuántas porciones o pelotas lleva por unidad." });
  }

  if (shouldUseRecipe) {
    if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
      return res.status(400).json({ error: "Producto terminado necesita ingredientes." });
    }
    const invalidIngredient = ingredientes.find(ing => !ing || !ing.nombre || typeof ing.nombre !== "string" || isNaN(Number(ing.cantidad)) || Number(ing.cantidad) <= 0);
    if (invalidIngredient) {
      return res.status(400).json({ error: "Cada ingrediente debe tener nombre y cantidad válidos." });
    }
    const missingMateriaPrima = ingredientes.find(ing => {
      const materia = (ing.id !== undefined && ing.id !== null)
        ? productos.find(p => String(p.id) === String(ing.id))
        : productos.find(p => p.nombre.toLowerCase() === ing.nombre.trim().toLowerCase());
      const materiaTipo = String(materia?.tipo || materia?.type || '').trim().toLowerCase();
      return !materia || materiaTipo !== "materia prima";
    });
    if (missingMateriaPrima) {
      return res.status(400).json({ error: `La materia prima ${missingMateriaPrima.nombre} no está registrada.` });
    }
  }

  const newProductData = {
    id: null,
    nombre: nombre.trim(),
    precio: normalizedType === 'materia prima' ? undefined : computedPrecio,
    tipo: normalizedType,
    modoControl: normalizedMode,
    stockMin: computedStockMin,
    medida: normalizedType === "materia prima" ? medida : undefined,
    ingredientes: shouldUseRecipe ? ingredientes : undefined,
    controlSabores: shouldControlFlavors,
    rendimientoPorCompra: normalizedType === "materia prima" ? computedYield : undefined,
    pelotasPorUnidad: shouldControlFlavors ? computedScoops : undefined,
    stock: 0
  };

  const newProductKey = productIdentityKey(newProductData);
  const exactDuplicate = productos.find(p => productIdentityKey(p) === newProductKey);
  const editingProduct = findProductoByIdOrName({ id: originalId, nombre: originalName });

  if (editingProduct) {
    if (exactDuplicate && String(exactDuplicate.id) !== String(editingProduct.id)) {
      return res.status(400).json({ error: "Ya existe un producto idéntico con las mismas características." });
    }
    editingProduct.nombre = newProductData.nombre;
    editingProduct.precio = newProductData.precio;
    editingProduct.tipo = newProductData.tipo;
    editingProduct.modoControl = newProductData.modoControl;
    editingProduct.stockMin = newProductData.stockMin;
    editingProduct.medida = newProductData.medida;
    editingProduct.ingredientes = newProductData.ingredientes;
    editingProduct.controlSabores = newProductData.controlSabores;
    editingProduct.rendimientoPorCompra = newProductData.rendimientoPorCompra;
    editingProduct.pelotasPorUnidad = newProductData.pelotasPorUnidad;
    await saveRecord(COLLECTIONS.productos, editingProduct);
    return res.status(200).json({ message: "Producto actualizado.", producto: editingProduct });
  }

  if (exactDuplicate) {
    return res.status(400).json({ error: "Ya existe un producto idéntico con las mismas características." });
  }

  const producto = {
    ...newProductData,
    id: createDocId(COLLECTIONS.productos)
  };
  productos.push(producto);
  await saveRecord(COLLECTIONS.productos, producto);
  res.status(201).json({ message: "Producto creado.", producto });
}));

app.get("/sabores", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(sabores);
}));

app.get("/toppings", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(toppings);
}));

app.post("/sabores", asyncHandler(async (req, res) => {
  await hydrateStore();
  const normalizedName = normalizeFlavorName(req.body?.nombre);
  const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : '';
  const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : '';

  if (!normalizedName) {
    return res.status(400).json({ error: "El nombre del sabor es obligatorio." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === materiaPrimaId && normalizeProductType(producto.tipo || producto.type) === 'materia prima');
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
    await saveRecord(COLLECTIONS.sabores, editingFlavor);
    return res.status(200).json({ message: "Sabor actualizado.", sabor: editingFlavor });
  }

  if (duplicateFlavor) {
    return res.status(400).json({ error: "Ya existe un sabor con ese nombre." });
  }

  const sabor = {
    id: createDocId(COLLECTIONS.sabores),
    nombre: normalizedName,
    materiaPrimaId: materiaPrima.id,
    materiaPrimaNombre: materiaPrima.nombre
  };

  sabores.push(sabor);
  await saveRecord(COLLECTIONS.sabores, sabor);
  res.status(201).json({ message: "Sabor creado.", sabor });
}));

app.post("/toppings", asyncHandler(async (req, res) => {
  await hydrateStore();
  const normalizedName = normalizeFlavorName(req.body?.nombre);
  const originalId = req.body?.originalId !== undefined && req.body?.originalId !== null ? String(req.body.originalId) : '';
  const materiaPrimaId = req.body?.materiaPrimaId !== undefined && req.body?.materiaPrimaId !== null ? String(req.body.materiaPrimaId) : '';

  if (!normalizedName) {
    return res.status(400).json({ error: "El nombre del topping es obligatorio." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === materiaPrimaId && normalizeProductType(producto.tipo || producto.type) === 'materia prima');
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
    await saveRecord(COLLECTIONS.toppings, editingTopping);
    return res.status(200).json({ message: "Topping actualizado.", topping: editingTopping });
  }

  if (duplicateTopping) {
    return res.status(400).json({ error: "Ya existe un topping con ese nombre." });
  }

  const topping = {
    id: createDocId(COLLECTIONS.toppings),
    nombre: normalizedName,
    materiaPrimaId: materiaPrima.id,
    materiaPrimaNombre: materiaPrima.nombre
  };

  toppings.push(topping);
  await saveRecord(COLLECTIONS.toppings, topping);
  res.status(201).json({ message: "Topping creado.", topping });
}));

app.get("/baldes-control", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(baldesControl);
}));

app.post("/baldes-control/abrir", asyncHandler(async (req, res) => {
  await hydrateStore();
  const saborId = req.body?.saborId !== undefined && req.body?.saborId !== null ? String(req.body.saborId) : '';
  const observacion = String(req.body?.observacion || '').trim();
  const fechaApertura = req.body?.fechaApertura ? new Date(req.body.fechaApertura) : new Date();

  if (!saborId) {
    return res.status(400).json({ error: "Selecciona un sabor para abrir el balde." });
  }

  if (Number.isNaN(fechaApertura.getTime())) {
    return res.status(400).json({ error: "La fecha de apertura no es válida." });
  }

  const sabor = sabores.find(item => String(item.id) === saborId);
  if (!sabor) {
    return res.status(404).json({ error: "Sabor no encontrado." });
  }

  if (getActiveBucketForFlavor(saborId)) {
    return res.status(400).json({ error: "Ya hay un balde abierto para este sabor." });
  }

  const materiaPrima = productos.find(producto => String(producto.id) === String(sabor.materiaPrimaId));
  if (!materiaPrima) {
    return res.status(400).json({ error: "La materia prima vinculada al sabor no existe." });
  }

  const materiaPrimaStock = Number(materiaPrima.stock || 0);
  if (Number.isNaN(materiaPrimaStock) || materiaPrimaStock <= 0) {
    return res.status(400).json({ error: `No puedes abrir el balde de ${sabor.nombre} porque no hay stock comprado disponible en ${materiaPrima.nombre}.` });
  }

  const bucket = {
    id: createDocId(COLLECTIONS.baldesControl),
    saborId: sabor.id,
    saborNombre: sabor.nombre,
    materiaPrimaId: sabor.materiaPrimaId,
    materiaPrimaNombre: sabor.materiaPrimaNombre,
    fechaApertura: fechaApertura.toISOString(),
    fechaCierre: null,
    estado: 'abierto',
    porcionesVendidas: 0,
    ventasAsociadas: 0,
    observacionApertura: observacion || null,
    observacionCierre: null
  };

  baldesControl.push(bucket);
  await saveRecord(COLLECTIONS.baldesControl, bucket);
  res.status(201).json({ message: "Balde abierto correctamente.", balde: bucket });
}));

app.post("/baldes-control/:id/cerrar", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const bucket = baldesControl.find(item => String(item.id) === String(id));
  if (!bucket) {
    return res.status(404).json({ error: "Balde no encontrado." });
  }

  if (bucket.estado !== 'abierto') {
    return res.status(400).json({ error: "El balde ya está cerrado." });
  }

  const observacion = String(req.body?.observacion || '').trim();
  const fechaCierre = req.body?.fechaCierre ? new Date(req.body.fechaCierre) : new Date();
  if (Number.isNaN(fechaCierre.getTime())) {
    return res.status(400).json({ error: "La fecha de cierre no es válida." });
  }

  bucket.estado = 'cerrado';
  bucket.fechaCierre = fechaCierre.toISOString();
  bucket.observacionCierre = observacion || null;

  await saveRecord(COLLECTIONS.baldesControl, bucket);
  res.json({ message: "Balde cerrado correctamente.", balde: bucket });
}));

// Ver productos
app.get("/productos", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(productos);
}));

// Registrar compra
app.post("/compras", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { documento, proveedor, fecha, items, id, nombre, cantidad, costo, paymentType, paymentMethod, dueDate, cashOut, cashReceived, paymentReference } = req.body;
  const invoiceItems = Array.isArray(items)
    ? items
    : (id || nombre || cantidad !== undefined || costo !== undefined)
      ? [{ id, nombre, cantidad, costo }]
      : [];

  if (!documento || !proveedor || !fecha || !invoiceItems.length) {
    return res.status(400).json({ error: "Campos inválidos. Documento, proveedor, fecha e items son obligatorios." });
  }

  const parsedDate = new Date(fecha);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "La fecha de la compra no es válida." });
  }

  const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || "").trim();

  if (!normalizedPaymentType || !normalizedPaymentMethod) {
    return res.status(400).json({ error: "Tipo de pago y método de pago son obligatorios." });
  }

  if (!["credito", "contado"].includes(normalizedPaymentType)) {
    return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
  }

  if (normalizedPaymentType === 'credito' && !dueDate) {
    return res.status(400).json({ error: "Fecha de vencimiento obligatoria para compras a crédito." });
  }

  const normalizedCashOut = cashOut === null || cashOut === undefined || cashOut === ""
    ? (cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived))
    : Number(cashOut);
  const normalizedPaymentReference = String(paymentReference || "").trim();

  if (normalizedPaymentType === 'contado' && (normalizedCashOut === null || Number.isNaN(normalizedCashOut) || normalizedCashOut <= 0)) {
    return res.status(400).json({ error: "Monto de salida inválido para compras de contado." });
  }

  if (normalizedPaymentType === 'contado' && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }

  const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === ""
    ? null
    : Number(cashReceived);

  const validatedItems = invoiceItems.map(item => {
    const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
    const itemNombre = String(item.nombre || '').trim();
    const itemCantidad = Number(item.cantidad);
    const itemCosto = Number(item.costo);

    if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemCosto) || itemCosto < 0) {
      return null;
    }

    const producto = itemId
      ? productos.find(p => String(p.id) === itemId)
      : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

    if (!producto || !isPurchasableProduct(producto)) {
      return null;
    }

    return {
      id: producto.id,
      nombre: producto.nombre,
      cantidad: itemCantidad,
      costo: itemCosto
    };
  });

  if (validatedItems.some(item => item === null)) {
    return res.status(400).json({ error: "Cada item debe tener producto válido, cantidad y precio." });
  }

  validatedItems.forEach(item => {
    const producto = productos.find(p => String(p.id) === String(item.id));
    if (producto) {
      producto.stock += getMateriaPrimaStockIncrement(producto, item.cantidad);
    }
  });

  const compra = {
    id: createDocId(COLLECTIONS.compras),
    documento: String(documento).trim(),
    proveedor: String(proveedor).trim(),
    fecha: parsedDate.toISOString(),
    paymentType: normalizedPaymentType,
    paymentMethod: normalizedPaymentMethod,
    paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
    dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
    cashOut: normalizedPaymentType === "contado" ? normalizedCashOut : null,
    cashReceived: normalizedPaymentType === "contado" ? (normalizedCashReceived ?? normalizedCashOut) : null,
    cashChange: null,
    items: validatedItems
  };
  compras.push(compra);
  await commitBatch([
    ...validatedItems.map(item => {
      const producto = productos.find(p => String(p.id) === String(item.id));
      return producto ? { type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto } : null;
    }),
    { type: 'set', collection: COLLECTIONS.compras, id: compra.id, data: compra }
  ]);
  res.status(201).json({ message: "Compra registrada.", compra });
}));

// Registrar venta
app.post("/ventas", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { documento, cliente, fecha, items, id, nombre, cantidad, precio, paymentType, paymentMethod, dueDate, cashReceived, cashChange, paymentReference } = req.body;
  const invoiceItems = Array.isArray(items)
    ? items
    : (id || nombre || cantidad !== undefined || precio !== undefined)
      ? [{ id, nombre, cantidad, precio }]
      : [];

  if (!cliente || !fecha || !invoiceItems.length) {
    return res.status(400).json({ error: "Campos inválidos. Cliente, fecha e items son obligatorios." });
  }

  const normalizedDocument = String(documento || '').trim() || buildNextDocumentNumber(ventas, 'FV');

  const parsedDate = new Date(fecha);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: "La fecha de la venta no es válida." });
  }

  const normalizedPaymentType = String(paymentType || "").trim().toLowerCase();
  const normalizedPaymentMethod = String(paymentMethod || "").trim();
  const normalizedPaymentReference = String(paymentReference || "").trim();

  if (!normalizedPaymentType || !normalizedPaymentMethod) {
    return res.status(400).json({ error: "Tipo de pago y método de pago son obligatorios." });
  }

  if (!["credito", "contado"].includes(normalizedPaymentType)) {
    return res.status(400).json({ error: "El tipo de pago debe ser credito o contado." });
  }

  if (normalizedPaymentType === "credito" && !dueDate) {
    return res.status(400).json({ error: "Fecha de vencimiento obligatoria para ventas a crédito." });
  }

  if (normalizedPaymentType === "contado" && ["transferencia", "tarjeta"].includes(normalizedPaymentMethod) && !normalizedPaymentReference) {
    return res.status(400).json({ error: "La referencia es obligatoria para tarjeta o transferencia." });
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (dueDate && Number.isNaN(parsedDueDate.getTime())) {
    return res.status(400).json({ error: "La fecha de vencimiento no es válida." });
  }

  const normalizedCashReceived = cashReceived === null || cashReceived === undefined || cashReceived === "" ? null : Number(cashReceived);
  const normalizedCashChange = cashChange === null || cashChange === undefined || cashChange === "" ? null : Number(cashChange);

  if (normalizedPaymentType === "contado" && (normalizedCashReceived === null || Number.isNaN(normalizedCashReceived) || normalizedCashReceived < 0)) {
    return res.status(400).json({ error: "Monto recibido inválido para ventas de contado." });
  }

  const validatedItems = invoiceItems.map(item => {
    const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
    const itemNombre = String(item.nombre || '').trim();
    const itemCantidad = Number(item.cantidad);
    const itemPrecio = Number(item.precio);
    const itemSabores = Array.isArray(item.sabores) ? item.sabores : [];
    const itemAdicionales = Array.isArray(item.adicionales) ? item.adicionales : [];

    if ((!itemId && !itemNombre) || Number.isNaN(itemCantidad) || itemCantidad <= 0 || Number.isNaN(itemPrecio) || itemPrecio < 0) {
      return null;
    }

    const producto = itemId
      ? productos.find(p => String(p.id) === itemId)
      : productos.find(p => p.nombre.toLowerCase() === itemNombre.toLowerCase());

    if (!producto) {
      return null;
    }

    const inventoryMode = getProductInventoryMode(producto);
    const requiresFlavorControl = inventoryMode === 'helado-sabores' || inventoryMode === 'mixto';
    const requiresRecipeControl = inventoryMode === 'receta' || inventoryMode === 'mixto';
    const pelotasPorUnidad = requiresFlavorControl ? Number(producto.pelotasPorUnidad || 0) : 0;
    const totalPelotasRequeridas = requiresFlavorControl ? itemCantidad * pelotasPorUnidad : 0;

    const normalizedSabores = itemSabores.map(sabor => {
      const saborId = sabor?.id !== undefined && sabor?.id !== null ? String(sabor.id) : '';
      const saborNombre = normalizeFlavorName(sabor?.nombre);
      const porciones = Number(sabor?.porciones);
      const registeredFlavor = saborId
        ? sabores.find(entry => String(entry.id) === saborId)
        : sabores.find(entry => entry.nombre.toLowerCase() === saborNombre.toLowerCase());

      if (!registeredFlavor || !Number.isInteger(porciones) || porciones <= 0) {
        return null;
      }

      return {
        id: registeredFlavor.id,
        nombre: registeredFlavor.nombre,
        porciones,
        materiaPrimaId: registeredFlavor.materiaPrimaId,
        materiaPrimaNombre: registeredFlavor.materiaPrimaNombre
      };
    }).filter(Boolean);

    const groupedSabores = normalizedSabores.reduce((accumulator, flavor) => {
      const existingFlavor = accumulator.find(entry => String(entry.id) === String(flavor.id));
      if (existingFlavor) {
        existingFlavor.porciones += flavor.porciones;
      } else {
        accumulator.push({ ...flavor });
      }
      return accumulator;
    }, []);

    if (requiresFlavorControl && !groupedSabores.length) {
      return null;
    }

    if (requiresFlavorControl && (!Number.isInteger(pelotasPorUnidad) || pelotasPorUnidad <= 0)) {
      return null;
    }

    const totalPorcionesAsignadas = groupedSabores.reduce((sum, flavor) => sum + Number(flavor.porciones || 0), 0);
    if (requiresFlavorControl && totalPorcionesAsignadas !== totalPelotasRequeridas) {
      return null;
    }

    if (inventoryMode === 'directo' && Number(producto.stock || 0) < itemCantidad) {
      return null;
    }

    let normalizedIngredientes = [];
    if (requiresRecipeControl) {
      const ingredientesProducto = Array.isArray(producto.ingredientes) ? producto.ingredientes : [];
      if (!ingredientesProducto.length) {
        return null;
      }
      normalizedIngredientes = ingredientesProducto.map(ingredient => {
        const materiaPrima = ingredient.id
          ? productos.find(entry => String(entry.id) === String(ingredient.id))
          : productos.find(entry => entry.nombre.toLowerCase() === String(ingredient.nombre || '').trim().toLowerCase());
        const consumoUnitario = Number(ingredient.cantidad || 0);
        if (!materiaPrima || Number.isNaN(consumoUnitario) || consumoUnitario <= 0) {
          return null;
        }
        return {
          id: materiaPrima.id,
          nombre: materiaPrima.nombre,
          cantidad: consumoUnitario * itemCantidad
        };
      });

      if (normalizedIngredientes.some(ingredient => ingredient === null)) {
        return null;
      }

      const insufficientIngredient = normalizedIngredientes.find(ingredient => {
        const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
        return !materiaPrima || Number(materiaPrima.stock || 0) < Number(ingredient.cantidad || 0);
      });
      if (insufficientIngredient) {
        return null;
      }
    }

    if (requiresFlavorControl) {
      const missingActiveBucket = groupedSabores.find(flavor => !getActiveBucketForFlavor(flavor.id));
      if (missingActiveBucket) {
        return null;
      }

      const insufficientFlavorStock = groupedSabores.find(flavor => {
        const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
        return !materiaPrimaFlavor || Number(materiaPrimaFlavor.stock || 0) < Number(flavor.porciones || 0);
      });

      if (insufficientFlavorStock) {
        return null;
      }
    }

    const normalizedAdicionales = itemAdicionales.map(adicional => {
      const tipoRaw = String(adicional?.tipo || '').trim().toLowerCase();
      const tipo = tipoRaw === 'topping-incluido' ? 'topping-incluido' : tipoRaw === 'topping' ? 'topping' : tipoRaw === 'extra' ? 'extra' : '';
      const adicionalId = adicional?.id !== undefined && adicional?.id !== null ? String(adicional.id) : '';
      const toppingRegistrado = tipo === 'topping' || tipo === 'topping-incluido'
        ? (adicionalId
          ? toppings.find(entry => String(entry.id) === adicionalId)
          : toppings.find(entry => entry.nombre.toLowerCase() === String(adicional?.nombre || '').trim().toLowerCase()))
        : null;
      const nombre = toppingRegistrado ? toppingRegistrado.nombre : String(adicional?.nombre || '').trim();
      const cantidad = Number(adicional?.cantidad);
      const precio = tipo === 'topping-incluido' ? 0 : Number(adicional?.precio);

      if (!tipo || !nombre || !Number.isInteger(cantidad) || cantidad <= 0 || Number.isNaN(precio) || precio < 0) {
        return null;
      }

      if ((tipo === 'topping' || tipo === 'topping-incluido') && !toppingRegistrado) {
        return null;
      }

      if (toppingRegistrado) {
        const materiaPrimaTopping = productos.find(entry => String(entry.id) === String(toppingRegistrado.materiaPrimaId));
        if (!materiaPrimaTopping || Number(materiaPrimaTopping.stock || 0) < cantidad) {
          return null;
        }
      }

      return {
        id: toppingRegistrado ? toppingRegistrado.id : null,
        tipo,
        nombre,
        cantidad,
        precio,
        materiaPrimaId: toppingRegistrado ? toppingRegistrado.materiaPrimaId : null,
        materiaPrimaNombre: toppingRegistrado ? toppingRegistrado.materiaPrimaNombre : null
      };
    });

    if (normalizedAdicionales.some(adicional => adicional === null)) {
      return null;
    }

    return {
      id: producto.id,
      nombre: producto.nombre,
      modoControl: inventoryMode,
      cantidad: itemCantidad,
      precio: itemPrecio,
      ingredientes: normalizedIngredientes,
      pelotasPorUnidad: requiresFlavorControl ? pelotasPorUnidad : null,
      adicionales: normalizedAdicionales,
      sabores: groupedSabores.map(flavor => {
        const activeBucket = getActiveBucketForFlavor(flavor.id);
        return {
          ...flavor,
          baldeControlId: activeBucket ? activeBucket.id : null
        };
      })
    };
  });

  if (validatedItems.some(item => item === null)) {
    return res.status(400).json({ error: "Cada item debe tener producto válido, stock suficiente, cantidad y precio." });
  }

  const totalFactura = validatedItems.reduce((sum, item) => sum + item.cantidad * item.precio + (Array.isArray(item.adicionales) ? item.adicionales.reduce((addonsSum, adicional) => addonsSum + Number(adicional.cantidad || 0) * Number(adicional.precio || 0), 0) : 0), 0);
  if (normalizedPaymentType === "contado" && normalizedCashReceived < totalFactura) {
    return res.status(400).json({ error: "El monto recibido debe cubrir el total de la factura." });
  }

  validatedItems.forEach(item => {
    const producto = productos.find(p => String(p.id) === String(item.id));
    const inventoryMode = item.modoControl || getProductInventoryMode(producto);
    if (producto && inventoryMode === 'directo') {
      producto.stock -= item.cantidad;
    }

    if (inventoryMode === 'receta' || inventoryMode === 'mixto') {
      (item.ingredientes || []).forEach(ingredient => {
        const materiaPrima = productos.find(entry => String(entry.id) === String(ingredient.id));
        if (materiaPrima) {
          materiaPrima.stock -= Number(ingredient.cantidad || 0);
        }
      });
    }

    if (inventoryMode === 'helado-sabores' || inventoryMode === 'mixto') {
      item.sabores.forEach(flavor => {
        const materiaPrimaFlavor = productos.find(entry => String(entry.id) === String(flavor.materiaPrimaId));
        if (materiaPrimaFlavor) {
          materiaPrimaFlavor.stock -= Number(flavor.porciones || 0);
        }
        const activeBucket = flavor.baldeControlId
          ? baldesControl.find(bucket => String(bucket.id) === String(flavor.baldeControlId) && bucket.estado === 'abierto')
          : getActiveBucketForFlavor(flavor.id);
        if (activeBucket) {
          activeBucket.porcionesVendidas += Number(flavor.porciones || 0);
        }
      });

      const bucketIds = [...new Set(item.sabores.map(flavor => String(flavor.baldeControlId || '')).filter(Boolean))];
      bucketIds.forEach(bucketId => {
        const activeBucket = baldesControl.find(bucket => String(bucket.id) === bucketId && bucket.estado === 'abierto');
        if (activeBucket) {
          activeBucket.ventasAsociadas += 1;
        }
      });
    }

    (item.adicionales || []).forEach(adicional => {
      if (adicional.materiaPrimaId) {
        const materiaPrimaAdicional = productos.find(entry => String(entry.id) === String(adicional.materiaPrimaId));
        if (materiaPrimaAdicional) {
          materiaPrimaAdicional.stock -= Number(adicional.cantidad || 0);
        }
      }
    });
  });

  const venta = {
    id: createDocId(COLLECTIONS.ventas),
    documento: normalizedDocument,
    cliente: String(cliente).trim(),
    fecha: parsedDate.toISOString(),
    paymentType: normalizedPaymentType,
    paymentMethod: normalizedPaymentMethod,
    paymentReference: normalizedPaymentType === "contado" ? (normalizedPaymentReference || null) : null,
    dueDate: normalizedPaymentType === "credito" && parsedDueDate ? parsedDueDate.toISOString() : null,
    cashReceived: normalizedPaymentType === "contado" ? normalizedCashReceived : null,
    cashChange: normalizedPaymentType === "contado" ? (normalizedCashChange ?? (normalizedCashReceived - totalFactura)) : null,
    items: validatedItems
  };
  ventas.push(venta);
  await commitBatch([
    ...productos.map(producto => ({ type: 'set', collection: COLLECTIONS.productos, id: producto.id, data: producto })),
    ...baldesControl.map(bucket => ({ type: 'set', collection: COLLECTIONS.baldesControl, id: bucket.id, data: bucket })),
    { type: 'set', collection: COLLECTIONS.ventas, id: venta.id, data: venta }
  ]);
  res.status(201).json({ message: "Venta registrada.", venta });
}));

// Historial de compras
app.get("/compras", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(compras);
}));

// Historial de ventas
app.get("/ventas", asyncHandler(async (req, res) => {
  await hydrateStore();
  res.json(ventas);
}));

// Eliminar producto si no tiene movimientos vinculados
app.delete("/productos/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const producto = productos.find(p => String(p.id) === String(id));
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const hasPurchase = compras.some(compra => Array.isArray(compra.items) && compra.items.some(item => String(item.id) === String(id)));
  const hasSale = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => String(item.id) === String(id) || (Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.materiaPrimaId) === String(id))) || (Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.materiaPrimaId) === String(id)))));
  const linkedFlavor = sabores.some(flavor => String(flavor.materiaPrimaId) === String(id));
  const linkedTopping = toppings.some(topping => String(topping.materiaPrimaId) === String(id));
  if (hasPurchase || hasSale || linkedFlavor || linkedTopping) {
    return res.status(400).json({ error: "No se puede eliminar un producto con movimientos vinculados." });
  }

  productos = productos.filter(p => String(p.id) !== String(id));
  await deleteRecord(COLLECTIONS.productos, id);
  res.json({ message: "Producto eliminado con éxito." });
}));

app.delete("/sabores/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const sabor = sabores.find(item => String(item.id) === String(id));
  if (!sabor) {
    return res.status(404).json({ error: "Sabor no encontrado." });
  }

  const hasSales = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.sabores) && item.sabores.some(flavor => String(flavor.id) === String(id))));
  const hasBucketControl = baldesControl.some(bucket => String(bucket.saborId) === String(id));
  if (hasSales || hasBucketControl) {
    return res.status(400).json({ error: "No se puede eliminar un sabor usado en ventas." });
  }

  sabores = sabores.filter(item => String(item.id) !== String(id));
  await deleteRecord(COLLECTIONS.sabores, id);
  res.json({ message: "Sabor eliminado con éxito." });
}));

app.delete("/toppings/:id", asyncHandler(async (req, res) => {
  await hydrateStore();
  const { id } = req.params;
  const topping = toppings.find(item => String(item.id) === String(id));
  if (!topping) {
    return res.status(404).json({ error: "Topping no encontrado." });
  }

  const hasSales = ventas.some(venta => Array.isArray(venta.items) && venta.items.some(item => Array.isArray(item.adicionales) && item.adicionales.some(adicional => String(adicional.id) === String(id))));
  if (hasSales) {
    return res.status(400).json({ error: "No se puede eliminar un topping usado en ventas." });
  }

  toppings = toppings.filter(item => String(item.id) !== String(id));
  await deleteRecord(COLLECTIONS.toppings, id);
  res.json({ message: "Topping eliminado con éxito." });
}));

// Resumen de inventario
app.get("/inventario", asyncHandler(async (req, res) => {
  await hydrateStore();
  const totalProductos = productos.length;
  const totalStock = productos.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const lowStockCount = productos.filter(item => Number(item.stock || 0) <= Number(item.stockMin || 0)).length;
  res.json({ totalProductos, totalStock, lowStockCount, productos });
}));

module.exports = app;

// Iniciar servidor local
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Servidor en http://localhost:${port}`);
  });
}

app.get("/crear", asyncHandler(async (req, res) => {
  const producto = {
    id: createDocId(COLLECTIONS.productos),
    nombre: "Helado de fresa",
    precio: 3,
    stock: 15,
    tipo: 'producto terminado',
    stockMin: 0
  };

  productos.push(producto);
  await saveRecord(COLLECTIONS.productos, producto);
  res.send("Producto creado desde navegador 🍦");
}));