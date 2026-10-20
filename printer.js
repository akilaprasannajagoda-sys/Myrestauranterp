// ==========================================================================
// MODULE 12: UNIVERSAL SILENT DIRECT HARDWARE PRINTER DRIVER (.EXE / ESC-POS)
// ==========================================================================

import { erpState, currentTenantInfo } from './state.js';
import { showLiveToast } from './utils.js';

// ESC/POS Standard Thermal Commands
const ESC = "\x1B";
const GS = "\x1D";
const CMD_INIT = ESC + "@";
const CMD_CUT = GS + "V\x41\x03"; // Feed & Full Cut
const CMD_DRAWER = ESC + "p\x00\x19\xFA"; // Kick Cash Drawer Pin
const CMD_BOLD_ON = ESC + "E\x01";
const CMD_BOLD_OFF = ESC + "E\x00";
const CMD_CENTER = ESC + "a\x01";
const CMD_LEFT = ESC + "a\x00";
const CMD_RIGHT = ESC + "a\x02";

// 1. FORMAT RAW TEXT RECEIPT (80MM ESC/POS)
export function formatReceiptRawText(inv, stationLabel = "") {
  const hName = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  const addr = currentTenantInfo?.address || "";
  const tel = currentTenantInfo?.phone ? `Tel: ${currentTenantInfo.phone}` : "";
  const tax = currentTenantInfo?.taxNo ? `TIN/VAT: ${currentTenantInfo.taxNo}` : "";
  const footer = currentTenantInfo?.footerNote || "*** THANK YOU! PLEASE VISIT US AGAIN ***";
  const dateStr = new Date(inv.createdAt || Date.now()).toLocaleString();
  
  let text = CMD_INIT;
  text += CMD_CENTER + CMD_BOLD_ON + `${hName}\n` + CMD_BOLD_OFF;
  if (addr) text += `${addr}\n`;
  if (tel) text += `${tel}\n`;
  if (tax) text += `${tax}\n`;
  if (stationLabel) text += `[STATION: ${stationLabel}]\n`;
  
  text += `Invoice #${inv.invoiceNumber}\n`;
  text += `Date: ${dateStr}\n`;
  text += `Type: ${inv.orderType} (Table: ${inv.tableNo || 'N/A'})\n`;
  text += CMD_LEFT + "------------------------------------------------\n";
  text += "ITEM / QTY                      PRICE      TOTAL\n";
  text += "------------------------------------------------\n";
  
  (inv.items || []).forEach(i => {
    const namePart = (i.name + " x" + i.qty).padEnd(28, " ").substring(0, 28);
    const pricePart = parseFloat(i.price).toFixed(2).padStart(9, " ");
    const totPart = (i.price * i.qty).toFixed(2).padStart(9, " ");
    text += `${namePart} ${pricePart} ${totPart}\n`;
    if (i.note) {
      text += `  * Note: ${i.note}\n`;
    }
  });
  
  text += "------------------------------------------------\n";
  text += CMD_RIGHT;
  text += `Subtotal: Rs. ${parseFloat(inv.subtotal || 0).toFixed(2)}\n`;
  
  if (parseFloat(inv.discountAmount || 0) > 0) {
    text += `Discount: -Rs. ${parseFloat(inv.discountAmount).toFixed(2)}\n`;
  }
  if (parseFloat(inv.scAmount || 0) > 0) {
    text += `Service Charge: Rs. ${parseFloat(inv.scAmount).toFixed(2)}\n`;
  }
  if (parseFloat(inv.vatAmount || 0) > 0) {
    text += `VAT: Rs. ${parseFloat(inv.vatAmount).toFixed(2)}\n`;
  }
  if (parseFloat(inv.cslAmount || 0) > 0) {
    text += `SSCL: Rs. ${parseFloat(inv.cslAmount).toFixed(2)}\n`;
  }
  
  text += CMD_BOLD_ON + `NET TOTAL: Rs. ${parseFloat(inv.netTotal || 0).toFixed(2)}\n` + CMD_BOLD_OFF;
  text += "------------------------------------------------\n";
  
  const p = inv.payment || { method: "cash" };
  if (p.method === "split") {
    text += `Payment: SPLIT (Cash: Rs. ${parseFloat(p.splitCash || 0).toFixed(2)} + Card: Rs. ${parseFloat(p.splitCard || 0).toFixed(2)})\n`;
  } else {
    text += `Payment: ${p.method.toUpperCase()}\n`;
    if (p.method === "cash" && p.cashTendered) {
      text += `Tendered: Rs. ${parseFloat(p.cashTendered).toFixed(2)} | Change: Rs. ${parseFloat(p.change || 0).toFixed(2)}\n`;
    }
  }
  
  text += CMD_CENTER + "\n" + footer + "\n";
  // 🚀 systems.lk BRANDING
  text += "Software by systems.lk | Tel: 0760672029\n\n\n\n";
  text += CMD_DRAWER; // Pop open cash drawer
  text += CMD_CUT; // Cut paper cleanly
  
  return text;
}

// 2. FORMAT RAW TEXT KOT TICKET WITH COOKING NOTES
export function formatKOTRawText(kot, stationLabel = "") {
  let text = CMD_INIT;
  text += CMD_CENTER + CMD_BOLD_ON + `*** KITCHEN ORDER TICKET (KOT) ***\n` + CMD_BOLD_OFF;
  if (stationLabel) text += `[STATION: ${stationLabel}]\n`;
  text += CMD_BOLD_ON + `TABLE: ${kot.tableNo}\n` + CMD_BOLD_OFF;
  text += `Type: ${(kot.orderType || 'Dine-in').toUpperCase()} | Time: ${new Date(kot.timestamp || Date.now()).toLocaleTimeString()}\n`;
  text += CMD_LEFT + "================================================\n";
  text += CMD_BOLD_ON + "ITEM NAME                                    QTY\n" + CMD_BOLD_OFF;
  text += "================================================\n";
  
  (kot.items || []).forEach(i => {
    const tag = i.isAddOn ? " (➕ ADD-ON)" : "";
    const nameStr = (i.name + tag).padEnd(38, " ").substring(0, 38);
    const qtyStr = ("x" + i.qty).padStart(8, " ");
    text += CMD_BOLD_ON + `${nameStr} ${qtyStr}\n` + CMD_BOLD_OFF;
    if (i.note) {
      text += `  >> SPECIAL NOTE: ${i.note}\n`;
    }
  });
  
  text += "================================================\n";
  text += CMD_CENTER + "PREPARE FRESH & QUICK\n";
  text += "systems.lk | Tel: 0760672029\n\n\n\n";
  text += CMD_CUT;
  
  return text;
}

// 3. 80MM DEDICATED THERMAL PAYSLIP FORMATTER
export function formatPayslipRawText(p) {
  const hName = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  
  let text = CMD_INIT;
  text += CMD_CENTER + CMD_BOLD_ON + `${hName}\n` + CMD_BOLD_OFF;
  text += `*** EMPLOYEE SALARY PAYSLIP ***\n`;
  text += `Month: ${p.monthStr || 'N/A'}\n`;
  text += CMD_LEFT + "------------------------------------------------\n";
  text += CMD_BOLD_ON + `Emp ID : ${p.empId || 'EMP'}\n` + CMD_BOLD_OFF;
  text += `Name   : ${p.empName || 'Staff'}\n`;
  text += `Role   : ${p.empRole || 'Staff'}\n`;
  text += `Days Worked : ${p.daysWorked || 0} Days\n`;
  text += "------------------------------------------------\n";
  text += CMD_RIGHT;
  text += `Basic Salary: Rs. ${parseFloat(p.basic || 0).toFixed(2)}\n`;
  text += `OT (${p.otHours || 0}h @ Rs.${p.otRate || 0}): +Rs. ${parseFloat(p.otAmount || 0).toFixed(2)}\n`;
  text += `Gross Earnings: Rs. ${(parseFloat(p.basic || 0) + parseFloat(p.otAmount || 0)).toFixed(2)}\n`;
  text += `Advances Deducted: -Rs. ${parseFloat(p.advances || 0).toFixed(2)}\n`;
  text += "------------------------------------------------\n";
  text += CMD_BOLD_ON + `NET SALARY: Rs. ${parseFloat(p.netSalary || 0).toFixed(2)}\n` + CMD_BOLD_OFF;
  text += "------------------------------------------------\n\n";
  text += CMD_CENTER;
  text += `....................        ....................\n`;
  text += ` Employer Signature          Employee Signature\n\n`;
  // 🚀 systems.lk BRANDING
  text += "Software by systems.lk | Tel: 0760672029\n\n\n\n";
  text += CMD_CUT;
  
  return text;
}

// 4. SILENT DIRECT PRINT DISPATCHER
export async function sendDirectSilentPrint(targetDeviceName, rawContent, htmlElementId = "") {
  const el = htmlElementId ? document.getElementById(htmlElementId) : null;
  const contentToPrint = el ? el.innerHTML : rawContent;
  
  // 1. Electron Desktop App (.exe) Environment
  if (window.electronAPI && window.electronAPI.printSilent) {
    try {
      const res = await window.electronAPI.printSilent({
        printerName: targetDeviceName,
        htmlContent: contentToPrint
      });
      if (res && res.success) {
        return true;
      } else if (res && !res.success) {
        console.error("Print Error from Driver:", res.error);
        showLiveToast("⚠️ Printer Warning", res.error || "Printer එක සම්බන්ධ කර නැත හෝ Offline ඇත.", "warning", "fa-print");
      }
    } catch (e) {
      console.warn("Electron direct print fallback:", e);
      showLiveToast("⚠️ Print Error", e.message, "warning", "fa-triangle-exclamation");
    }
  }
  
  // 2. Web Browser Fallback with Controlled Window Display
  if (el) {
    el.style.display = "block";
    await new Promise(resolve => setTimeout(resolve, 150));
    window.print();
    await new Promise(resolve => setTimeout(resolve, 200));
    el.style.display = "none";
  }
  return true;
}

// 5. PRINT THERMAL 80MM PAYSLIP DISPATCHER
export async function printThermalPayslip(payslipData) {
  const hName = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  const pHotel = document.getElementById("payslipThermalHotel");
  const pMonth = document.getElementById("payslipThermalMonth");
  const pId = document.getElementById("ptEmpId");
  const pName = document.getElementById("ptEmpName");
  const pRole = document.getElementById("ptEmpRole");
  const pDays = document.getElementById("ptDaysWorked");
  const pBasic = document.getElementById("ptBasic");
  const pOtH = document.getElementById("ptOtHrs");
  const pOtR = document.getElementById("ptOtRate");
  const pOtPay = document.getElementById("ptOtPay");
  const pGross = document.getElementById("ptGross");
  const pAdv = document.getElementById("ptAdvances");
  const pNet = document.getElementById("ptNet");
  
  if (pHotel) pHotel.innerText = hName;
  if (pMonth) pMonth.innerText = `Month: ${payslipData.monthStr || ''}`;
  if (pId) pId.innerText = payslipData.empId || 'EMP';
  if (pName) pName.innerText = payslipData.empName || '';
  if (pRole) pRole.innerText = payslipData.empRole || '';
  if (pDays) pDays.innerText = `${payslipData.daysWorked || 0} Days`;
  if (pBasic) pBasic.innerText = `Rs. ${parseFloat(payslipData.basic || 0).toFixed(2)}`;
  if (pOtH) pOtH.innerText = payslipData.otHours || 0;
  if (pOtR) pOtR.innerText = payslipData.otRate || 0;
  if (pOtPay) pOtPay.innerText = `+Rs. ${parseFloat(payslipData.otAmount || 0).toFixed(2)}`;
  
  const gross = parseFloat(payslipData.basic || 0) + parseFloat(payslipData.otAmount || 0);
  if (pGross) pGross.innerText = `Rs. ${gross.toFixed(2)}`;
  if (pAdv) pAdv.innerText = `-Rs. ${parseFloat(payslipData.advances || 0).toFixed(2)}`;
  if (pNet) pNet.innerText = `Rs. ${parseFloat(payslipData.netSalary || 0).toFixed(2)}`;
  
  const pr = erpState.settings?.printers || {};
  let targetDevice = pr.p4?.device || pr.p1?.device || "";
  
  const rawText = formatPayslipRawText(payslipData);
  await sendDirectSilentPrint(targetDevice, rawText, "payslipThermalModal");
  showLiveToast("🖨️ Payslip Printed", `${payslipData.empName} ගේ Payslip එක සාර්ථකව Print විය.`, "success", "fa-receipt");
}

// 6. TEST PRINT HARDWARE PRINTER (WITH SAMPLE BILL DATA)
export async function testDirectPrinter(slotKey) {
  const pr = erpState.settings?.printers?.[slotKey];
  const devName = document.getElementById(`${slotKey}_device`)?.value.trim() || pr?.device || "";
  const labelName = document.getElementById(`${slotKey}_name`)?.value.trim() || pr?.name || slotKey;
  
  const rHotel = document.getElementById("receiptHotel");
  const rOrderId = document.getElementById("receiptOrderId");
  const rDate = document.getElementById("receiptDate");
  const rType = document.getElementById("receiptType");
  const rItems = document.getElementById("receiptItems");
  const rSub = document.getElementById("receiptSubtotal");
  const rTotal = document.getElementById("receiptTotal");
  const rPay = document.getElementById("receiptPayDetails");
  
  if (rHotel) rHotel.innerText = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  if (rOrderId) rOrderId.innerText = `HARDWARE TEST PRINT`;
  if (rDate) rDate.innerText = `Date: ${new Date().toLocaleString()}`;
  if (rType) rType.innerText = `Station: ${labelName} (${devName || 'Default'})`;
  if (rItems) {
    rItems.innerHTML = `
      <div class="flex justify-between py-1 border-b border-black">
        <span class="w-1/2 font-bold">1. Printer Connection</span>
        <span class="w-1/4 text-right">OK</span>
        <span class="w-1/4 text-right font-bold">100%</span>
      </div>
      <div class="flex justify-between py-1 border-b border-black">
        <span class="w-1/2 font-bold">2. Thermal Head Test</span>
        <span class="w-1/4 text-right">OK</span>
        <span class="w-1/4 text-right font-bold">PASS</span>
      </div>
    `;
  }
  if (rSub) rSub.innerText = `Rs. 0.00`;
  if (rTotal) rTotal.innerText = `TEST PASSED`;
  if (rPay) rPay.innerHTML = `<div class="text-center font-bold">*** Software by systems.lk (0760672029) ***</div>`;
  
  try {
    await sendDirectSilentPrint(devName, "", "receiptModal");
    showLiveToast("🖨️ Test Print Command Sent", `[${labelName}] වෙත Print Request එක යවන ලදී.`, "success", "fa-check");
  } catch (err) {
    alert("Test Print Error: " + err.message);
  }
}

// Window global exports
window.testDirectPrinter = testDirectPrinter;
window.printThermalPayslip = printThermalPayslip;
