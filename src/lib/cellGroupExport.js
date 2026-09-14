import {
  buildMemberExportRow,
  getDiscipleshipLabel,
  getMembershipStatusMeta,
  MONTHS
} from "./cellGroupManagement.js";

const groupLogo = `${import.meta.env.BASE_URL}icons/icon-512.png`;

function reportDate() {
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

function reportDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function reportFileName(filtered = false, extension) {
  return `Glory-Carriers-Membership-Report${filtered ? "-Filtered" : ""}-${reportDateStamp()}.${extension}`;
}

function reportRows(members, fields) {
  return members.map((member, index) => ({ "#": index + 1, ...buildMemberExportRow(member, fields) }));
}

function isFilteredReport(filters) {
  return Boolean(filters && Object.values(filters).some((value) => value && value !== "all" && value !== "name_asc"));
}

const excelHeaderStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
  fill: { fgColor: { rgb: "F97316" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "EA580C" } },
    bottom: { style: "thin", color: { rgb: "EA580C" } },
    left: { style: "thin", color: { rgb: "EA580C" } },
    right: { style: "thin", color: { rgb: "EA580C" } }
  }
};

export async function exportMembersExcel({ members, fields, groupName, filters }) {
  const XLSX = await import("xlsx");
  const rows = reportRows(members, fields);
  const headers = Object.keys(rows[0] ?? { "#": "" });
  const worksheet = XLSX.utils.aoa_to_sheet([]);
  const filtered = isFilteredReport(filters);
  const title = filtered ? "FILTERED MEMBERSHIP REPORT" : "MEMBERSHIP REPORT";

  XLSX.utils.sheet_add_aoa(worksheet, [
    [(groupName || "Glory Carriers").toUpperCase()],
    [title],
    [`Generated: ${reportDate()}`],
    [`Total Members: ${members.length}`],
    []
  ], { origin: "A1" });
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: "A7" });
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: "A8", skipHeader: true });

  const titleStyle = { font: { bold: true, sz: 16, color: { rgb: "0F1117" } }, alignment: { vertical: "center" } };
  const subtitleStyle = { font: { bold: true, sz: 11, color: { rgb: "EA580C" } }, alignment: { vertical: "center" } };
  const metaStyle = { font: { sz: 10, color: { rgb: "64748B" } }, alignment: { vertical: "center" } };
  worksheet.A1.s = titleStyle;
  worksheet.A2.s = subtitleStyle;
  worksheet.A3.s = metaStyle;
  worksheet.A4.s = metaStyle;
  headers.forEach((_, index) => {
    const cell = XLSX.utils.encode_cell({ r: 6, c: index });
    worksheet[cell].s = excelHeaderStyle;
  });
  rows.forEach((_, rowIndex) => {
    headers.forEach((_, colIndex) => {
      const cell = XLSX.utils.encode_cell({ r: rowIndex + 7, c: colIndex });
      if (!worksheet[cell]) return;
      worksheet[cell].s = {
        font: { sz: 10, color: { rgb: "0F172A" } },
        fill: { fgColor: { rgb: rowIndex % 2 ? "F8FAFC" : "FFFFFF" } },
        alignment: { vertical: "top", wrapText: true },
        border: { bottom: { style: "hair", color: { rgb: "E2E8F0" } } }
      };
    });
  });

  worksheet["!cols"] = headers.map((header) => ({
    wch: Math.min(34, Math.max(12, header.length + 3, ...rows.map((row) => String(row[header] ?? "").length + 2)))
  }));
  worksheet["!rows"] = [{ hpt: 25 }, { hpt: 18 }, { hpt: 16 }, { hpt: 16 }, { hpt: 8 }, { hpt: 8 }, { hpt: 30 }];
  worksheet["!merge"] = ["A1", "A2", "A3", "A4"].map((cell) => {
    const row = XLSX.utils.decode_cell(cell).r;
    return { s: { r: row, c: 0 }, e: { r: row, c: Math.max(0, headers.length - 1) } };
  });
  worksheet["!autofilter"] = { ref: `A7:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(7, rows.length + 7)}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 7, topLeftCell: "A8", activePane: "bottomLeft" };
  worksheet["!margins"] = { left: 0.3, right: 0.3, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 };
  worksheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalCentered: true };
  worksheet["!printTitles"] = "7:7";
  worksheet["!printArea"] = `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(7, rows.length + 7)}`;

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: `${groupName || "Glory Carriers"} Membership Report`, Author: "Glory Carriers", CreatedDate: new Date() };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Membership Report");
  XLSX.writeFile(workbook, reportFileName(filtered, "xlsx"));
}

export async function exportMembersPdf({ members, fields, groupName, filters }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const rows = reportRows(members, fields);
  const headers = Object.keys(rows[0] ?? { "#": "" });
  const body = rows.map((row) => headers.map((header) => row[header] ?? ""));
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const logo = await imageAsDataUrl(groupLogo);
  const filtered = isFilteredReport(filters);
  const title = filtered ? "FILTERED MEMBERSHIP REPORT" : "MEMBERSHIP REPORT";
  const drawReportChrome = (pageNumber, pageCount = null) => {
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, pageWidth, 74, "F");
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 70, pageWidth, 4, "F");
    if (logo) {
      try { doc.addImage(logo, "PNG", margin, 16, 38, 38); } catch { /* logo is optional in the document */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text((groupName || "Glory Carriers").toUpperCase(), logo ? 88 : margin, 33);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(253, 186, 116);
    doc.text(title, logo ? 88 : margin, 48);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("GLORY CARRIERS", margin, pageHeight - 22);
    doc.text(`Page ${pageNumber}${pageCount ? ` of ${pageCount}` : ""}`, pageWidth - margin, pageHeight - 22, { align: "right" });
  };

  drawReportChrome(1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${reportDate()}`, margin, 96);
  doc.text(`Total Members: ${members.length}`, margin, 110);
  doc.text(filtered ? "Scope: Filtered membership report" : "Scope: All current members", pageWidth - margin, 96, { align: "right" });

  autoTable(doc, {
    startY: 126,
    head: [headers],
    body,
    styles: {
      fontSize: 7.3,
      cellPadding: { top: 6, right: 5, bottom: 6, left: 5 },
      overflow: "linebreak",
      valign: "middle",
      lineColor: [226, 232, 240],
      lineWidth: 0.35
    },
    headStyles: {
      fillColor: [249, 115, 22],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left"
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { top: 92, left: margin, right: margin, bottom: 40 },
    rowPageBreak: "avoid",
    didDrawPage(data) {
      if (data.pageNumber > 1) drawReportChrome(data.pageNumber);
    }
  });
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("GLORY CARRIERS", margin, pageHeight - 22);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 22, { align: "right" });
  }
  doc.save(reportFileName(filtered, "pdf"));
}

function safeFilePart(value) {
  return String(value || "Member")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "Member";
}

async function imageAsDataUrl(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(2, 600 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function humanJoinedMonth(member) {
  if (!member.joined_month || !member.joined_year) return "";
  return `${MONTHS.find((month) => month.value === member.joined_month)?.label || ""} ${member.joined_year}`.trim();
}

function profileDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function profileDepartments(member) {
  const departments = (member.departments || []).filter((department) => department !== "Other" && department !== "None");
  return departments.join(", ") || ((member.departments || []).includes("Other") ? "Other" : "");
}

/** Generates an official single-member profile; it intentionally never uses list export rows. */
export async function exportMemberProfilePdf({ member, groupName = "Glory Carriers" }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const orange = [249, 115, 22];
  const charcoal = [15, 17, 23];
  const muted = [100, 116, 139];
  const name = member.profile?.full_name?.trim() || "Member";
  const logo = await imageAsDataUrl(groupLogo);
  const photo = await imageAsDataUrl(member.profile?.avatar_url);

  // Header — uses the existing Glory Carriers orange/charcoal palette and logo asset.
  doc.setFillColor(...charcoal);
  doc.rect(0, 0, pageWidth, 150, "F");
  doc.setFillColor(...orange);
  doc.rect(0, 146, pageWidth, 4, "F");
  if (logo) doc.addImage(logo, "PNG", margin, 32, 54, 54);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text((groupName || "Glory Carriers").toUpperCase(), logo ? 114 : margin, 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(253, 186, 116);
  doc.text("MEMBER PROFILE", logo ? 114 : margin, 78);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(25);
  doc.setTextColor(255, 255, 255);
  const nameLines = doc.splitTextToSize(name, pageWidth - margin * 2 - (photo ? 104 : 0));
  doc.text(nameLines, margin, 115);
  if (photo) {
    try { doc.addImage(photo, "PNG", pageWidth - margin - 76, 45, 76, 76); } catch { /* photo is optional */ }
  }

  let y = 184;
  const cardGap = 12;
  const cardWidth = (pageWidth - margin * 2 - cardGap) / 2;
  const drawSection = (title, entries) => {
    const visible = entries.filter((entry) => entry.value);
    if (!visible.length) return;
    const lineHeights = visible.map((entry) => Math.max(44, doc.splitTextToSize(entry.value, cardWidth - 28).length * 14 + 29));
    const height = 38 + lineHeights.reduce((sum, item) => sum + item, 0);
    if (y + height > pageHeight - 54) {
      doc.addPage();
      y = 48;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - margin * 2, height, 8, 8, "FD");
    doc.setFillColor(...orange);
    doc.roundedRect(margin, y, 4, height, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...charcoal);
    doc.text(title.toUpperCase(), margin + 18, y + 23);
    let rowY = y + 38;
    visible.forEach((entry, index) => {
      if (index) {
        doc.setDrawColor(226, 232, 240);
        doc.line(margin + 18, rowY, pageWidth - margin - 18, rowY);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(entry.label.toUpperCase(), margin + 18, rowY + 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...charcoal);
      const lines = doc.splitTextToSize(entry.value, pageWidth - margin * 2 - 36);
      doc.text(lines, margin + 18, rowY + 31);
      rowY += lineHeights[index];
    });
    y += height + 14;
  };

  drawSection("Personal information", [
    { label: "Full name", value: name },
    { label: "Date of birth", value: profileDate(member.date_of_birth) },
    { label: "Favorite food", value: member.favorite_food?.trim() || "" }
  ]);
  drawSection("Membership information", [
    { label: "Membership status", value: getMembershipStatusMeta(member.membership_status).label },
    { label: "Joined month & year", value: humanJoinedMonth(member) },
    { label: "Exact joined date", value: profileDate(member.joined_date) }
  ]);
  drawSection("Serving information", [
    { label: "Department(s)", value: profileDepartments(member) || "No department assigned" },
    { label: "Custom department", value: member.custom_department?.trim() || "" }
  ]);
  drawSection("Discipleship", [
    { label: "Completed Discipleship Class?", value: getDiscipleshipLabel(member.discipleship_status) }
  ]);

  const total = doc.internal.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text((groupName || "Glory Carriers").toUpperCase(), margin, pageHeight - 20);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${page} of ${total}`, pageWidth - margin, pageHeight - 20, { align: "right" });
  }
  doc.save(`Glory-Carriers-${safeFilePart(name)}-Profile.pdf`);
}
