function normalizeNonNegativeNumber(value) {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) || parsedValue < 0 ? NaN : parsedValue;
}

function normalizeInventoryMode(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "directo") return "directo";
  if (normalizedValue === "receta") return "receta";
  if (normalizedValue === "helado-sabores") return "helado-sabores";
  if (normalizedValue === "mixto") return "mixto";
  if (normalizedValue === "materia-prima") return "materia-prima";
  return "";
}

function normalizeProductType(rawType) {
  const type = String(rawType || "").trim().toLowerCase();
  if (type.includes("materia") && type.includes("prima")) {
    return "materia prima";
  }
  if (type.includes("terminado")) {
    return "producto terminado";
  }
  if (type.includes("producto")) {
    return "productos";
  }
  return type;
}

function normalizeIngredient(ing) {
  return {
    id: ing?.id !== undefined && ing?.id !== null ? String(ing.id) : "",
    nombre: String(ing?.nombre || "").trim().toLowerCase(),
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
  return normalized.map(ing => `${ing.id}:${ing.nombre}:${ing.cantidad}`).join("|");
}

function productIdentityKey(product) {
  const tipo = normalizeProductType(product.tipo || product.type);
  const modoControl = normalizeInventoryMode(product.modoControl || product.inventoryMode || (tipo === "materia prima" ? "materia-prima" : ""));
  const nombre = String(product.nombre || "").trim().toLowerCase();
  const precio = tipo === "materia prima" ? 0 : Number(product.precio || 0);
  const stockMin = Number(product.stockMin || product.stockMinimo || 0);
  const medida = (tipo === "materia prima" ? String(product.medida || "").trim().toLowerCase() : "");
  const ingredientesKeyString = tipo === "producto terminado" ? ingredientsKey(product.ingredientes) : "";
  const controlSabores = product.controlSabores ? "1" : "0";
  const rendimientoPorCompra = tipo === "materia prima" ? Number(product.rendimientoPorCompra || 0) : 0;
  const pelotasPorUnidad = tipo === "productos" ? Number(product.pelotasPorUnidad || 0) : 0;
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
  if (tipo === "materia prima") {
    return "materia-prima";
  }
  if (producto?.controlSabores && Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return "mixto";
  }
  if (producto?.controlSabores) {
    return "helado-sabores";
  }
  if (Array.isArray(producto?.ingredientes) && producto.ingredientes.length) {
    return "receta";
  }
  return "directo";
}

function isPurchasableProduct(producto) {
  const modoControl = getProductInventoryMode(producto);
  return modoControl === "materia-prima" || modoControl === "directo";
}

module.exports = {
  getMateriaPrimaStockIncrement,
  getProductInventoryMode,
  ingredientsKey,
  isPurchasableProduct,
  normalizeIngredient,
  normalizeInventoryMode,
  normalizeNonNegativeNumber,
  normalizeProductType,
  productIdentityKey
};
