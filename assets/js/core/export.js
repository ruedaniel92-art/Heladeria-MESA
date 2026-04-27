export function exportRowsToExcel(rows, fileName, sheetName) {
  if (!rows.length) {
    return false;
  }
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
  return true;
}

export function exportRowsToPdf(title, headers, rows, fileName) {
  if (!rows.length) {
    return false;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.autoTable({
    startY: 22,
    head: [headers],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [91, 108, 255] }
  });
  doc.save(fileName);
  return true;
}

export function getExportDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExportableTable(container) {
  if (!container) {
    return null;
  }
  return Array.from(container.querySelectorAll("table"))
    .find(table => table.getAttribute("aria-hidden") !== "true") || null;
}

function normalizeExportCellText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function getExportCellText(cell) {
  if (!cell) {
    return "";
  }
  const input = cell.querySelector("input, select, textarea");
  if (input) {
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      return input.checked ? "Sí" : "No";
    }
    return normalizeExportCellText(input.value || input.textContent || "");
  }
  return normalizeExportCellText(cell.innerText || cell.textContent || "");
}

function extractExportTableData(table) {
  if (!table) {
    return { headers: [], body: [], rows: [] };
  }

  const tableShell = table.closest(".product-table-shell");
  const shellHeaderCells = tableShell
    ? Array.from(tableShell.querySelectorAll(".product-table-head thead tr:first-child th"))
    : [];
  const headerCells = shellHeaderCells.length
    ? shellHeaderCells
    : Array.from(table.querySelectorAll("thead tr:first-child th"));
  const rawHeaders = headerCells.length
    ? headerCells.map(cell => getExportCellText(cell))
    : Array.from(table.querySelectorAll("tr:first-child th, tr:first-child td")).map(cell => getExportCellText(cell));

  const includedIndexes = rawHeaders.reduce((indexes, header, index) => {
    const normalizedHeader = String(header || "").trim().toLowerCase();
    if (normalizedHeader && !["acción", "acciones"].includes(normalizedHeader)) {
      indexes.push(index);
    }
    return indexes;
  }, []);

  const headers = includedIndexes.map(index => rawHeaders[index]);
  const bodyRows = Array.from(table.querySelectorAll("tbody tr")).map(row => {
    const cells = Array.from(row.querySelectorAll("td, th"));
    return includedIndexes.map(index => getExportCellText(cells[index]));
  }).filter(row => row.some(value => String(value || "").trim()));

  const rows = bodyRows.map(row => headers.reduce((accumulator, header, index) => {
    accumulator[header] = row[index] ?? "";
    return accumulator;
  }, {}));

  return { headers, body: bodyRows, rows };
}

export function syncDynamicTableExport(container, { title, fileBase, sheetName } = {}) {
  if (!container) {
    return;
  }

  container.querySelectorAll(".table-export-toolbar").forEach(toolbar => toolbar.remove());
  container.querySelectorAll(".dynamic-table-shell").forEach(shell => {
    const scroll = shell.querySelector(".dynamic-table-scroll");
    if (scroll) {
      Array.from(scroll.children).forEach(child => container.appendChild(child));
    }
    shell.remove();
  });
  const table = getExportableTable(container);
  if (!table) {
    return;
  }

  const exportData = extractExportTableData(table);
  if (!exportData.rows.length) {
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "table-export-toolbar";

  const excelButton = document.createElement("button");
  excelButton.type = "button";
  excelButton.className = "secondary-btn";
  excelButton.textContent = "Exportar Excel";
  excelButton.addEventListener("click", () => {
    const dateStamp = getExportDateStamp();
    exportRowsToExcel(exportData.rows, `${fileBase || "tabla"}-${dateStamp}.xlsx`, sheetName || title || "Tabla");
  });

  const pdfButton = document.createElement("button");
  pdfButton.type = "button";
  pdfButton.className = "secondary-btn";
  pdfButton.textContent = "Exportar PDF";
  pdfButton.addEventListener("click", () => {
    const dateStamp = getExportDateStamp();
    exportRowsToPdf(title || "Tabla", exportData.headers, exportData.body, `${fileBase || "tabla"}-${dateStamp}.pdf`);
  });

  toolbar.append(excelButton, pdfButton);

  if (container.classList.contains("purchase-history")) {
    const anchor = table.closest(".product-table-shell") || table;
    container.insertBefore(toolbar, anchor);
    return;
  }

  const shell = document.createElement("div");
  shell.className = "dynamic-table-shell";
  const scroll = document.createElement("div");
  scroll.className = "dynamic-table-scroll";
  table.parentNode.insertBefore(shell, table);
  shell.appendChild(toolbar);
  shell.appendChild(scroll);
  scroll.appendChild(table);
}
