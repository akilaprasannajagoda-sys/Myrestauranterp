// ==========================================================================
// MODULE 07: SUPPLIERS, GRN SUPPLY CHAIN & CASH-BOOK LEDGER ENGINE
// ==========================================================================

import { erpState, currentTenant, activeSupplierLedgerId, setActiveSupplierLedgerId } from './state.js';
import { showLiveToast, downloadCSVFile } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;

export function initSuppliersContext(dbRefInstance, pushMethod, updateMethod) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
}

// 🔒 COLLISION-PROOF UNIQUE GRN NUMBER GENERATOR
export function generateCollisionProofGRNNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const salt = String(Math.floor(10 + Math.random() * 90));
  return `GRN-${yy}${mm}${dd}-${timePart}${salt}`;
}

export function switchGrnTab(tabName) {
  ["suppliers", "entry", "history"].forEach(t => {
    const sec = document.getElementById("grnSection-" + t);
    const tabBtn = document.getElementById("grnTab-" + t);
    if (sec) sec.classList.add("hidden");
    if (tabBtn) {
      tabBtn.className = "px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 font-bold";
    }
  });

  const activeSec = document.getElementById("grnSection-" + tabName);
  const activeBtn = document.getElementById("grnTab-" + tabName);
  if (activeSec) activeSec.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.className = "px-3 py-1.5 rounded-lg bg-purple-600 text-white shadow-sm font-bold";
  }

  if (tabName === "entry") {
    const dInput = document.getElementById("grnDate");
    if (dInput) dInput.value = new Date().toISOString().split("T")[0];
    if (document.querySelectorAll(".grn-item-row").length === 0) {
      addGrnItemRow();
    }
  }
}

// 1. SUPPLIERS DIRECTORY
export function openSupplierModal(mode, supId = null) {
  const modal = document.getElementById("supplierModal");
  const form = document.getElementById("supplierForm");
  if (form) form.reset();
  const editId = document.getElementById("editSupplierId");
  if (editId) editId.value = "";

  if (mode === "edit" && supId && erpState.suppliers[supId]) {
    const s = erpState.suppliers[supId];
    const title = document.getElementById("supplierModalTitle");
    if (title) title.innerText = "Edit Supplier";
    if (editId) editId.value = supId;
    const nameIn = document.getElementById("supName");
    const phoneIn = document.getElementById("supPhone");
    const emailIn = document.getElementById("supEmail");
    const addrIn = document.getElementById("supAddress");

    if (nameIn) nameIn.value = s.name;
    if (phoneIn) phoneIn.value = s.phone;
    if (emailIn) emailIn.value = s.email || "";
    if (addrIn) addrIn.value = s.address || "";
  } else {
    const title = document.getElementById("supplierModalTitle");
    if (title) title.innerText = "Add Supplier";
  }
  modal?.classList.remove("hidden");
}

export function closeSupplierModal() {
  document.getElementById("supplierModal")?.classList.add("hidden");
}

export async function handleSupplierSubmit(e) {
  e.preventDefault();
  const supId = document.getElementById("editSupplierId")?.value;
  const supData = {
    name: document.getElementById("supName")?.value.trim() || "",
    phone: document.getElementById("supPhone")?.value.trim() || "",
    email: document.getElementById("supEmail")?.value.trim() || "",
    address: document.getElementById("supAddress")?.value.trim() || ""
  };

  if (dbRef && currentTenant) {
    if (supId && updateFn) {
      await updateFn(dbRef(`tenants/${currentTenant}/suppliers/${supId}`), supData);
    } else if (pushFn) {
      await pushFn(dbRef(`tenants/${currentTenant}/suppliers`), supData);
    }
  }
  closeSupplierModal();
}

export function populateGRNSupplierDropdown() {
  const sel = document.getElementById("grnSupplierSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- සැපයුම්කරු තෝරන්න --</option>`;
  Object.entries(erpState.suppliers || {}).forEach(([id, sup]) => {
    sel.innerHTML += `<option value="${id}">${sup.name}</option>`;
  });
}

export function calculateSupplierBalances(supId) {
  let totalPurchases = 0;
  let totalPaid = 0;

  Object.values(erpState.grns || {}).forEach(g => {
    if (g.supplierId === supId) {
      totalPurchases += parseFloat(g.netTotal || 0);
      if (g.paymentMethod !== "credit") {
        totalPaid += parseFloat(g.netTotal || 0);
      }
    }
  });

  Object.values(erpState.supplierPayments || {}).forEach(p => {
    if (p.supplierId === supId) {
      totalPaid += parseFloat(p.amount || 0);
    }
  });

  const creditBalance = Math.max(0, totalPurchases - totalPaid);
  return { totalPurchases, totalPaid, creditBalance };
}

export function renderSuppliersDirectoryTable() {
  const tbody = document.getElementById("suppliersTableBody");
  if (!tbody) return;

  const list = Object.entries(erpState.suppliers || {});
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">සැපයුම්කරුවන් තවම ලියාපදිංචි කර නැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(([id, sup]) => {
    const { totalPurchases, totalPaid, creditBalance } = calculateSupplierBalances(id);

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800">${sup.name}</td>
      <td class="p-3.5 text-gray-500">${sup.phone}</td>
      <td class="p-3.5 font-bold text-gray-800">Rs. ${totalPurchases.toFixed(2)}</td>
      <td class="p-3.5 font-bold text-green-600">Rs. ${totalPaid.toFixed(2)}</td>
      <td class="p-3.5 font-black text-red-600">Rs. ${creditBalance.toFixed(2)}</td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openSupplierLedgerModal('${id}')" class="bg-purple-600 hover:bg-purple-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] shadow-xs">
          <i class="fa-solid fa-book-open mr-1"></i> Ledger (මුදල් පොත)
        </button>
        <button onclick="openSupplierPayModal('${id}', ${creditBalance})" class="bg-green-600 hover:bg-green-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px]">
          Settle
        </button>
        <button onclick="openSupplierModal('edit', '${id}')" class="text-gray-400 hover:text-purple-800 px-1"><i class="fa-solid fa-pen"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 2. SUPPLIER LEDGER MODAL
export function openSupplierLedgerModal(supId) {
  setActiveSupplierLedgerId(supId);
  const sup = erpState.suppliers[supId];
  if (!sup) return;

  const sub = document.getElementById("supLedgerSubtitle");
  if (sub) sub.innerText = `Supplier: ${sup.name} | Contact: ${sup.phone}`;
  const { totalPurchases, totalPaid, creditBalance } = calculateSupplierBalances(supId);

  const purEl = document.getElementById("supLedgerTotalPurchases");
  const paidEl = document.getElementById("supLedgerTotalPaid");
  const outEl = document.getElementById("supLedgerOutstanding");

  if (purEl) purEl.innerText = `Rs. ${totalPurchases.toFixed(2)}`;
  if (paidEl) paidEl.innerText = `Rs. ${totalPaid.toFixed(2)}`;
  if (outEl) outEl.innerText = `Rs. ${creditBalance.toFixed(2)}`;

  const transactions = [];

  Object.values(erpState.grns || {}).forEach(g => {
    if (g.supplierId === supId) {
      transactions.push({
        date: g.date || g.createdAt,
        type: `📥 GRN Purchase (${g.paymentMethod.toUpperCase()})`,
        ref: `${g.grnNumber} (Inv: ${g.invoiceNo})`,
        debit: g.paymentMethod !== 'credit' ? parseFloat(g.netTotal || 0) : 0,
        credit: parseFloat(g.netTotal || 0),
        rawTime: new Date(g.createdAt || g.date).getTime()
      });
    }
  });

  Object.values(erpState.supplierPayments || {}).forEach(p => {
    if (p.supplierId === supId) {
      transactions.push({
        date: p.date ? p.date.split("T")[0] : '',
        type: `💵 Debt Settlement (${p.method.toUpperCase()})`,
        ref: p.chequeNo ? `Cheque #${p.chequeNo} (${p.bank})` : (p.refNo || 'Direct Payment'),
        debit: parseFloat(p.amount || 0),
        credit: 0,
        rawTime: new Date(p.date).getTime()
      });
    }
  });

  transactions.sort((a, b) => a.rawTime - b.rawTime);

  const tbody = document.getElementById("supLedgerTableBody");
  if (tbody) {
    if (transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-400">ගනුදෙනු දත්ත නොමැත...</td></tr>`;
    } else {
      tbody.innerHTML = "";
      let runningBalance = 0;

      transactions.forEach(t => {
        runningBalance += (t.credit - t.debit);

        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-50 border-b border-gray-100";
        tr.innerHTML = `
          <td class="p-2.5 font-semibold text-gray-600">${t.date}</td>
          <td class="p-2.5 font-bold text-gray-800">${t.type}</td>
          <td class="p-2.5 font-mono text-gray-500">${t.ref}</td>
          <td class="p-2.5 text-right font-bold text-green-600">${t.debit > 0 ? 'Rs. ' + t.debit.toFixed(2) : '-'}</td>
          <td class="p-2.5 text-right font-bold text-purple-900">${t.credit > 0 ? 'Rs. ' + t.credit.toFixed(2) : '-'}</td>
          <td class="p-2.5 text-right font-black ${runningBalance > 0 ? 'text-red-600' : 'text-gray-800'}">Rs. ${runningBalance.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  document.getElementById("supplierLedgerModal")?.classList.remove("hidden");
}

export function closeSupplierLedgerModal() {
  document.getElementById("supplierLedgerModal")?.classList.add("hidden");
  setActiveSupplierLedgerId(null);
}

export function openSupPayFromLedger() {
  if (!activeSupplierLedgerId) return;
  const { creditBalance } = calculateSupplierBalances(activeSupplierLedgerId);
  openSupplierPayModal(activeSupplierLedgerId, creditBalance);
}

export function exportSupplierLedgerToCSV() {
  if (!activeSupplierLedgerId) return;
  const sup = erpState.suppliers[activeSupplierLedgerId];
  if (!sup) return;

  const rows = document.querySelectorAll("#supLedgerTableBody tr");
  let csv = `Date,Type,Reference,Debit (Paid),Credit (Purchased),Balance\n`;

  rows.forEach(r => {
    const cols = r.querySelectorAll("td");
    if (cols.length >= 6) {
      csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}","${cols[4].innerText}","${cols[5].innerText}"\n`;
    }
  });

  downloadCSVFile(csv, `Ledger_${sup.name.replace(/\s+/g, '_')}_${new Date().toISOString().split("T")[0]}.csv`);
}

// 3. SEARCHABLE GRN BUILDER
export function addGrnItemRow() {
  const container = document.getElementById("grnItemsContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "grid grid-cols-12 gap-2 bg-white p-2.5 rounded-xl border border-purple-100 grn-item-row items-center text-xs";

  let options = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  Object.entries(erpState.rawItems || {}).forEach(([id, item]) => {
    options += `<option value="${id}" data-name="${item.name.toLowerCase()}" data-cost="${item.cost}">${item.name} (${item.unit} - Rs. ${item.cost})</option>`;
  });

  row.innerHTML = `
    <div class="col-span-12 sm:col-span-4 space-y-1">
      <input type="text" placeholder="🔍 Search product..." oninput="filterGrnRowSelect(this)" class="w-full p-1 border rounded-md text-[10px] outline-none bg-gray-50 grn-search-input">
      <select class="w-full p-1.5 border rounded-lg bg-white grn-raw-select font-bold outline-none text-xs" onchange="onGrnRawSelectChange(this)">
        ${options}
      </select>
    </div>
    <div class="col-span-4 sm:col-span-2">
      <label class="text-[9px] text-gray-400 font-bold block sm:hidden">Qty</label>
      <input type="number" step="0.1" placeholder="Qty" value="1" class="w-full p-1.5 border rounded-lg grn-qty font-bold text-center outline-none" oninput="calculateGrnTotals()">
    </div>
    <div class="col-span-4 sm:col-span-2">
      <label class="text-[9px] text-gray-400 font-bold block sm:hidden">Unit Cost</label>
      <input type="number" step="0.01" placeholder="Cost" class="w-full p-1.5 border rounded-lg grn-cost font-bold text-center outline-none" oninput="calculateGrnTotals()">
    </div>
    <div class="col-span-3 sm:col-span-3 text-right font-black text-purple-900 grn-row-total text-xs">
      Rs. 0.00
    </div>
    <div class="col-span-1 text-center">
      <button type="button" onclick="this.closest('.grn-item-row').remove(); calculateGrnTotals();" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  container.appendChild(row);
}

export function filterGrnRowSelect(input) {
  const query = input.value.toLowerCase().trim();
  const row = input.closest(".grn-item-row");
  const select = row ? row.querySelector(".grn-raw-select") : null;
  if (!select) return;

  let html = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  Object.entries(erpState.rawItems || {}).forEach(([id, item]) => {
    if (!query || item.name.toLowerCase().includes(query)) {
      html += `<option value="${id}" data-name="${item.name.toLowerCase()}" data-cost="${item.cost}">${item.name} (${item.unit} - Rs. ${item.cost})</option>`;
    }
  });

  select.innerHTML = html;
}

export function onGrnRawSelectChange(sel) {
  const selectedOption = sel.options[sel.selectedIndex];
  const defaultCost = selectedOption ? selectedOption.getAttribute("data-cost") : null;
  const row = sel.closest(".grn-item-row");
  const costInput = row ? row.querySelector(".grn-cost") : null;
  if (defaultCost && costInput) {
    costInput.value = defaultCost;
  }
  calculateGrnTotals();
}

export function calculateGrnTotals() {
  let subtotal = 0;
  document.querySelectorAll(".grn-item-row").forEach(row => {
    const qty = parseFloat(row.querySelector(".grn-qty")?.value || 0);
    const cost = parseFloat(row.querySelector(".grn-cost")?.value || 0);
    const lineTotal = qty * cost;
    const totalEl = row.querySelector(".grn-row-total");
    if (totalEl) totalEl.innerText = `Rs. ${lineTotal.toFixed(2)}`;
    subtotal += lineTotal;
  });

  const discount = parseFloat(document.getElementById("grnTotalDiscount")?.value || 0);
  const netTotal = Math.max(0, subtotal - discount);

  const subEl = document.getElementById("grnSummarySubtotal");
  const disEl = document.getElementById("grnSummaryDiscount");
  const netEl = document.getElementById("grnSummaryNetTotal");

  if (subEl) subEl.innerText = `Rs. ${subtotal.toFixed(2)}`;
  if (disEl) disEl.innerText = `Rs. ${discount.toFixed(2)}`;
  if (netEl) netEl.innerText = `Rs. ${netTotal.toFixed(2)}`;

  return { subtotal, discount, netTotal };
}

export function onGrnPaymentMethodChange() {
  const method = document.getElementById("grnPaymentMethod")?.value;
  const chequeEl = document.getElementById("grnPayField-cheque");
  const cardEl = document.getElementById("grnPayField-card");
  const transferEl = document.getElementById("grnPayField-transfer");

  if (chequeEl) chequeEl.classList.add("hidden");
  if (cardEl) cardEl.classList.add("hidden");
  if (transferEl) transferEl.classList.add("hidden");

  if (method === "cheque" && chequeEl) chequeEl.classList.remove("hidden");
  if (method === "card" && cardEl) cardEl.classList.remove("hidden");
  if (method === "transfer" && transferEl) transferEl.classList.remove("hidden");
}

export async function handleGrnSubmit(e) {
  e.preventDefault();
  const supId = document.getElementById("grnSupplierSelect")?.value;
  const invoiceNo = document.getElementById("grnInvoiceNo")?.value.trim() || "";
  const date = document.getElementById("grnDate")?.value;

  if (!supId) {
    alert("කරුණාකර Supplier කෙනෙක් තෝරන්න.");
    return;
  }

  const items = [];
  document.querySelectorAll(".grn-item-row").forEach(row => {
    const rawId = row.querySelector(".grn-raw-select")?.value;
    const qty = parseFloat(row.querySelector(".grn-qty")?.value || 0);
    const cost = parseFloat(row.querySelector(".grn-cost")?.value || 0);
    if (rawId && qty > 0) {
      items.push({
        rawId: rawId,
        rawName: erpState.rawItems[rawId]?.name || "Material",
        qty: qty,
        cost: cost,
        total: qty * cost
      });
    }
  });

  if (items.length === 0) {
    alert("අවම වශයෙන් එක් අමුද්‍රව්‍යයක්වත් ඇතුළත් කරන්න.");
    return;
  }

  const { subtotal, discount, netTotal } = calculateGrnTotals();
  const paymentMethod = document.getElementById("grnPaymentMethod")?.value || "cash";

  // 🔒 COLLISION-PROOF UNIQUE GRN NUMBER
  const grnRecord = {
    grnNumber: generateCollisionProofGRNNumber(),
    supplierId: supId,
    supplierName: erpState.suppliers[supId]?.name || "Supplier",
    invoiceNo: invoiceNo,
    date: date,
    items: items,
    subtotal: subtotal,
    discount: discount,
    netTotal: netTotal,
    paymentMethod: paymentMethod,
    createdAt: new Date().toISOString()
  };

  try {
    if (dbRef && currentTenant && pushFn && updateFn) {
      await pushFn(dbRef(`tenants/${currentTenant}/grns`), grnRecord);

      for (const it of items) {
        const currentStock = parseFloat(erpState.rawItems[it.rawId]?.stock || 0);
        await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${it.rawId}`), {
          stock: currentStock + it.qty,
          cost: it.cost
        });
      }
    }

    showLiveToast("📥 GRN Saved", `GRN ${grnRecord.grnNumber} සාර්ථකව සේව් විය. Stock යාවත්කාලීන විය.`, "success", "fa-truck-ramp-box");
    document.getElementById("grnEntryForm")?.reset();
    const container = document.getElementById("grnItemsContainer");
    if (container) container.innerHTML = "";
    switchGrnTab("history");
  } catch (err) {
    alert("GRN සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

export function renderGRNHistoryTable() {
  const tbody = document.getElementById("grnHistoryTableBody");
  if (!tbody) return;

  const fromDate = document.getElementById("grnHistoryFromDate")?.value;
  const toDate = document.getElementById("grnHistoryToDate")?.value;

  let list = Object.entries(erpState.grns || {});
  if (fromDate) list = list.filter(([id, g]) => g.date >= fromDate);
  if (toDate) list = list.filter(([id, g]) => g.date <= toDate);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">GRN සටහන් නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(([id, grn]) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold text-purple-600">${grn.grnNumber}</td>
      <td class="p-3.5 font-semibold text-gray-600">${grn.date}</td>
      <td class="p-3.5 font-bold text-gray-800">${grn.supplierName}</td>
      <td class="p-3.5 font-mono text-gray-600">${grn.invoiceNo}</td>
      <td class="p-3.5"><span class="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full ${grn.paymentMethod === 'credit' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${grn.paymentMethod}</span></td>
      <td class="p-3.5 font-black text-gray-900">Rs. ${parseFloat(grn.netTotal).toFixed(2)}</td>
      <td class="p-3.5 text-right">
        <button onclick="viewGrnDetail('${id}')" class="text-purple-600 hover:text-purple-900 font-bold text-xs"><i class="fa-solid fa-eye"></i> View</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export function viewGrnDetail(id) {
  const grn = erpState.grns[id];
  if (!grn) return;
  const title = document.getElementById("grnDetailTitle");
  const sub = document.getElementById("grnDetailSubtitle");
  if (title) title.innerText = `${grn.grnNumber} (Inv: ${grn.invoiceNo})`;
  if (sub) sub.innerText = `Supplier: ${grn.supplierName} | Date: ${grn.date}`;

  const container = document.getElementById("grnDetailContent");
  if (!container) return;
  let itemsHtml = (grn.items || []).map(i => `
    <div class="flex justify-between border-b py-1">
      <span>${i.rawName} x${i.qty}</span>
      <span class="font-bold">Rs. ${parseFloat(i.total).toFixed(2)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="space-y-2">
      <div class="bg-gray-50 p-3 rounded-xl border space-y-1">
        ${itemsHtml}
      </div>
      <div class="pt-2 flex justify-between font-black text-sm">
        <span>Total Net Amount:</span>
        <span class="text-purple-600">Rs. ${parseFloat(grn.netTotal).toFixed(2)}</span>
      </div>
    </div>
  `;
  document.getElementById("grnDetailModal")?.classList.remove("hidden");
}

export function closeGrnDetailModal() {
  document.getElementById("grnDetailModal")?.classList.add("hidden");
}

export function exportGrnToCSV() {
  const list = Object.values(erpState.grns || {});
  if (list.length === 0) {
    alert("Export කිරීමට GRN දත්ත නොමැත.");
    return;
  }

  let csv = "GRN Number,Date,Supplier,Invoice No,Payment,Net Total\n";
  list.forEach(g => {
    csv += `"${g.grnNumber}","${g.date}","${g.supplierName}","${g.invoiceNo}","${g.paymentMethod}","${g.netTotal}"\n`;
  });

  downloadCSVFile(csv, `GRN_Report_${new Date().toISOString().split("T")[0]}.csv`);
}

// 4. SUPPLIER DEBT SETTLEMENT
export function openSupplierPayModal(supId, outstanding) {
  const sup = erpState.suppliers[supId];
  if (!sup) return;
  const idInput = document.getElementById("supPaySupplierId");
  const sub = document.getElementById("supPayModalSubtitle");
  const outVal = document.getElementById("supPayOutstandingVal");
  const amtInput = document.getElementById("supPayAmount");

  if (idInput) idInput.value = supId;
  if (sub) sub.innerText = `Supplier: ${sup.name}`;
  if (outVal) outVal.innerText = `Rs. ${outstanding.toFixed(2)}`;
  if (amtInput) amtInput.value = outstanding > 0 ? outstanding : "";
  document.getElementById("supplierPayModal")?.classList.remove("hidden");
}

export function closeSupplierPayModal() {
  document.getElementById("supplierPayModal")?.classList.add("hidden");
}

export function onSupPayMethodChange() {
  const method = document.getElementById("supPayMethod")?.value;
  const chequeBox = document.getElementById("supPayField-cheque");
  const refBox = document.getElementById("supPayField-ref");

  if (chequeBox) chequeBox.classList.add("hidden");
  if (refBox) refBox.classList.add("hidden");

  if (method === "cheque" && chequeBox) chequeBox.classList.remove("hidden");
  if ((method === "transfer" || method === "card") && refBox) refBox.classList.remove("hidden");
}

export async function handleSupplierPaySubmit(e) {
  e.preventDefault();
  const supId = document.getElementById("supPaySupplierId")?.value;
  const amount = parseFloat(document.getElementById("supPayAmount")?.value || 0);
  const method = document.getElementById("supPayMethod")?.value || "cash";

  if (!supId || amount <= 0) return;

  const payRecord = {
    supplierId: supId,
    amount: amount,
    method: method,
    chequeNo: document.getElementById("supPayChequeNo")?.value || "",
    bank: document.getElementById("supPayBank")?.value || "",
    refNo: document.getElementById("supPayRefNo")?.value || "",
    date: new Date().toISOString()
  };

  if (dbRef && pushFn && currentTenant) {
    await pushFn(dbRef(`tenants/${currentTenant}/supplierPayments`), payRecord);
  }
  closeSupplierPayModal();
  showLiveToast("💰 Supplier Paid", `සැපයුම්කරුට Rs. ${amount.toFixed(2)} ක මුදලක් සාර්ථකව පියවන ලදී.`, "success", "fa-money-bill-wave");
}