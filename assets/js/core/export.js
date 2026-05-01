function hasNumberColumn(headers = []) {
  const firstHeader = String(headers[0] || "").trim().toLowerCase();
  return ["no.", "no", "#", "nÂ°", "nro", "nro."].includes(firstHeader);
}

function addNumberColumnToObjects(rows) {
  if (!rows.length) {
    return rows;
  }
  const firstKeys = Object.keys(rows[0] || {});
  if (hasNumberColumn(firstKeys)) {
    return rows;
  }
  return rows.map((row, index) => ({
    "No.": index + 1,
    ...row
  }));
}

function addNumberColumnToTable(headers, rows) {
  if (hasNumberColumn(headers)) {
    return { headers, rows };
  }
  return {
    headers: ["No.", ...headers],
    rows: rows.map((row, index) => [String(index + 1), ...row])
  };
}

function formatExportDateTime(date = new Date()) {
  return date.toLocaleString("es-NI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function exportRowsToExcel(rows, fileName, sheetName) {
  if (!rows.length) {
    return false;
  }
  const worksheet = XLSX.utils.json_to_sheet(addNumberColumnToObjects(rows));
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
  const generatedAt = formatExportDateTime();
  const numberedData = addNumberColumnToTable(headers, rows);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;

  doc.setProperties({
    title,
    subject: "Exportacion de datos",
    author: "Heladeria MESA",
    creator: "Heladeria MESA"
  });

  doc.autoTable({
    startY: 32,
    margin: { top: 32, right: marginX, bottom: 18, left: marginX },
    head: [numberedData.headers],
    body: numberedData.rows,
    theme: "grid",
    tableLineColor: [214, 221, 235],
    tableLineWidth: 0.1,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      textColor: [30, 41, 59]
    },
    headStyles: {
      fillColor: [31, 41, 71],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center"
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center", fontStyle: "bold" }
    },
    didDrawPage: data => {
      const pageNumber = doc.internal.getNumberOfPages();
      doc.setFillColor(31, 41, 71);
      doc.rect(0, 0, pageWidth, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont(undefined, "bold");
      doc.text(title, marginX, 10);
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text("Heladeria MESA", pageWidth - marginX, 8, { align: "right" });
      doc.text(`Generado: ${generatedAt}`, pageWidth - marginX, 14, { align: "right" });

      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      doc.text(`Registros: ${rows.length}`, marginX, 27);
      doc.text(fileName, pageWidth - marginX, 27, { align: "right" });

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.text(`Pagina ${pageNumber}`, pageWidth - marginX, pageHeight - 8, { align: "right" });
      doc.text("Exportacion generada desde el sistema Heladeria MESA", marginX, pageHeight - 8);
    }
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

  const productTableShell = table.closest(".product-table-shell");
  if (productTableShell) {
    container.insertBefore(toolbar, productTableShell);
    return;
  }

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
