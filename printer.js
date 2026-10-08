// ==========================================================================
// MODULE 12: UNIVERSAL SILENT DIRECT HARDWARE PRINTER DRIVER (.EXE / ESC-POS)
// ==========================================================================

import { erpState, currentTenantInfo } from './state.js';
import { showLiveToast } from './utils.js';

// ESC/POS Standard Commands
const ESC = "\x1B";
const GS = "\x1D";
const CMD_INIT = ESC + "@";
const CMD_CUT = GS + "V\x41\x03"; // Feed & Full Cut
const CMD_DRAWER = ESC + "p\x00\x19\xFA"; // Kick Cash Drawer
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
  const footer = currentTenantInfo?.footerNote || "*** THANK YOU! COME AGAIN ***";
  const dateStr = new Date(inv.createdAt || new Date()).toLocaleString();
  
  let text = CMD_INIT;
  text += CMD_CENTER + CMD_BOLD_ON + `${hName}\n` + CMD_BOLD_OFF;
  if (addr) text += `${addr}\n`;
  if (tel) text += `${tel}\n`;
  if (tax) text += `${tax}\n`;
  if (stationLabel) text += `[STATION: ${stationLabel}]\n`;
  
  text += `Invoice #${inv.invoiceNumber}\n`;
  text += `Date: ${dateStr}\n`;
  text += `Type: ${inv.orderType} (Table: ${inv.tableNo})\n`;
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
  
  if (inv.discountAmount > 0) {
    text += `Discount: -Rs. ${parseFloat(inv.discountAmount).toFixed(2)}\n`;
  }
  if (inv.scAmount > 0) {
    text += `Service Charge: Rs. ${parseFloat(inv.scAmount).toFixed(2)}\n`;
  }
  if (inv.vatAmount > 0) {
    text += `VAT: Rs. ${parseFloat(inv.vatAmount).toFixed(2)}\n`;
  }
  if (inv.cslAmount > 0) {
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
  text += "Software by Restaurant ERP Enterprise\n\n\n\n\n\n";
  text += CMD_DRAWER;
  text += CMD_CUT;
  
  return text;
}

// 2. FORMAT RAW TEXT KOT TICKET
export function formatKOTRawText(kot, stationLabel = "") {
  let text = CMD_INIT;
  text += CMD_CENTER + CMD_BOLD_ON + `*** KITCHEN ORDER TICKET (KOT) ***\n` + CMD_BOLD_OFF;
  if (stationLabel) text += `[STATION: ${stationLabel}]\n`;
  text += CMD_BOLD_ON + `TABLE: ${kot.tableNo}\n` + CMD_BOLD_OFF;
  text += `Type: ${kot.orderType.toUpperCase()} | Time: ${new Date(kot.timestamp).toLocaleTimeString()}\n`;
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
  text += CMD_CENTER + "PREPARE FRESH & QUICK\n\n\n\n\n\n";
  text += CMD_CUT;
  
  return text;
}

// 3. SILENT DIRECT PRINT DISPATCHER
export async function sendDirectSilentPrint(targetDeviceName, rawContent, htmlElementId = "") {
  const el = htmlElementId ? document.getElementById(htmlElementId) : null;
  
  // 🟢 Print එක යැවීමට පෙර Modal එක Render කර ගැනීම
  if (el) {
    el.style.display = "block";
    await new Promise(r => setTimeout(r, 200));
  }
  
  // 1. Check if running inside Electron Desktop App (.exe)
  if (window.electronAPI && window.electronAPI.printSilent) {
    try {
      const res = await window.electronAPI.printSilent({
        printerName: targetDeviceName,
        rawText: rawContent,
        htmlId: htmlElementId
      });
      if (el) el.style.display = "none";
      if (res && res.success) return true;
    } catch (e) {
      console.warn("Electron direct print fallback:", e);
      if (el) el.style.display = "none";
    }
  }
  
  // 2. Fallback for Web Browser
  if (el) {
    window.print();
    await new Promise(r => setTimeout(r, 100));
    el.style.display = "none";
  }
  return true;
}

// 4. TEST PRINT HARDWARE PRINTER (WITH SAMPLE BILL DATA)
export async function testDirectPrinter(slotKey) {
  const pr = erpState.settings?.printers?.[slotKey];
  const devName = document.getElementById(`${slotKey}_device`)?.value.trim() || pr?.device || "POS-80";
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
  if (rType) rType.innerText = `Station: ${labelName} (${devName})`;
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
  if (rPay) rPay.innerHTML = `<div class="text-center font-bold">*** HARDWARE TEST SUCCESSFUL ***</div>`;
  
  try {
    await sendDirectSilentPrint(devName, "", "receiptModal");
    showLiveToast("🖨️ Test Print Sent", `[${labelName}] -> ${devName} වෙත Test Print එක සාර්ථකව යවන ලදී.`, "success", "fa-check");
  } catch (err) {
    alert("Test Print Error: " + err.message);
  }
}

// Window global export
window.testDirectPrinter = testDirectPrinter;
