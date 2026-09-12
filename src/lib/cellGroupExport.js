import { buildMemberExportRow } from "./cellGroupManagement.js";

export async function exportMembersExcel({ members, fields, groupName }) {
  const XLSX = await import("xlsx");
  const rows = members.map((m) => buildMemberExportRow(m, fields));
  const worksheet = XLSX.utils.json_to_sheet(rows);

  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2
  }));
  worksheet["!cols"] = colWidths;

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft" };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Members");
  const safeName = (groupName || "Cell Group").replace(/[^\w\s-]/g, "").slice(0, 31);
  XLSX.writeFile(workbook, `${safeName} - Membership.xlsx`);
}

export async function exportMembersPdf({ members, fields, groupName, leaderName }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const rows = members.map((m) => buildMemberExportRow(m, fields));
  const headers = Object.keys(rows[0] ?? {});
  const body = rows.map((row) => headers.map((h) => row[h] ?? ""));

  const useLandscape = headers.length > 6;
  const doc = new jsPDF({ orientation: useLandscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedDate = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text("CELL GROUP MEMBERSHIP RECORD", pageWidth / 2, 40, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Cell Group: ${groupName || "Cell Group"}`, 40, 62);
  doc.text(`Leader: ${leaderName || "—"}`, 40, 76);
  doc.text(`Report generated: ${generatedDate}`, 40, 90);
  doc.text(`Total members: ${members.length}`, 40, 104);

  autoTable(doc, {
    startY: 120,
    head: [headers],
    body,
    styles: {
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: [255, 140, 36],
      textColor: [20, 20, 20],
      fontStyle: "bold"
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 40, right: 40 },
    didDrawPage(data) {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 20,
        { align: "center" }
      );
    }
  });

  const safeName = (groupName || "Cell Group").replace(/[^\w\s-]/g, "");
  doc.save(`${safeName} - Membership Report.pdf`);
}
