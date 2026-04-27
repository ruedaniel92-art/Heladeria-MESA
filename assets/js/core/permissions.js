export function buildDefaultModulePermissions(role = "user") {
  const isAdmin = String(role || "user") === "admin";
  return {
    dashboard: true,
    ingreso: isAdmin,
    compras: isAdmin,
    ventas: isAdmin,
    pagos: isAdmin,
    efectivo: isAdmin,
    sabores: isAdmin,
    inventario: isAdmin,
    seguridad: isAdmin
  };
}

export function normalizeModulePermissions(permissions, role = "user") {
  const defaults = buildDefaultModulePermissions(role);
  if (!permissions || typeof permissions !== "object") {
    return defaults;
  }

  return Object.keys(defaults).reduce((accumulator, key) => {
    accumulator[key] = String(role || "user") === "admin"
      ? true
      : Boolean(permissions[key] ?? defaults[key]);
    return accumulator;
  }, {});
}
