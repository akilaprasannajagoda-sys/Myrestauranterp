// ==========================================================================
// MODULE 08: 2-WAY PETTY CASH BOOK & EXPENSES ENGINE (WITH OPENING B/F BALANCE)
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast, downloadCSVFile } from './utils.js';

let dbRef = null;
let pushFn = null;
let removeFn = null;

export function initPettyCashContext(dbRefInstance, pushMethod, removeMethod) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  removeFn = removeMethod;
}

export function openPettyCashModal(entryType = "in") {
  document.getElementById("pettyCashForm")?.reset();
  selectPettyEntryType(entryType);
  document.getElementById("pettyCashModal")?.classList.remove("hidden");
}

export function closePettyCashModal() {
  document.getElementById("pettyCashModal")?.classList.add("hidden");
}

export function selectPettyEntryType(type) {
  const inBtn = document.getElementById("pettyTabInBtn");
  const outBtn = document.getElementById("pettyTabOutBtn");
  const typeInput = document.getElementById("pettyEntryType");
  const catLabel = document.getElementById("pettyCategoryLabel");
  const catSelect = document.getElementById("pettyCategorySelect");
  const personLabel = document.getElementById("pettyPersonLabel");
  const submitBtn = document.getElementById("savePettyBtn");
  
  if (!typeInput || !catSelect) return;
  typeInput.value = type;
  
  if (type === "in") {
    if (inBtn) inBtn.className = "py-2 rounded-xl border-2 border-green-600 bg-green-50 text-green-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs";
    if (outBtn) outBtn.className = "py-2 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-600 font-bold text-xs flex items-center justify-center gap-1.5";
    if (catLabel) catLabel.innerText = "මුදල් ලැබුණු මූලාශ්‍රය (Source / Reason)";
    if (personLabel) personLabel.innerText = "භාරගත් පුද්ගලයා (Received / Handled By)";
    if (submitBtn) {
      submitBtn.className = "bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition flex items-center gap-1.5";
      submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Cash In (+ ලැබීම්)`;
    }
    
    catSelect.innerHTML = `
      <option value="Main Cash Drawer Top-up">💵 Main Cash Drawer / Register Float</option>
      <option value="Owner Capital / Top-up">💼 Owner Capital Injection</option>
      <option value="Bank Withdrawal">🏦 Bank Cash Withdrawal</option>
      <option value="Customer Refund Return">🔄 Supplier / Customer Refund</option>
      <option value="Other Inflow">📦 Other Cash Inflow</option>
    `;
  } else {
    if (outBtn) outBtn.className = "py-2 rounded-xl border-2 border-red-600 bg-red-50 text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs";
    if (inBtn) inBtn.className = "py-2 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-600 font-bold text-xs flex items-center justify-center gap-1.5";
    if (catLabel) catLabel.innerText = "වියදම් වර්ගය (Expense Category)";
    if (personLabel) personLabel.innerText = "වියදම් කළ පුද්ගලයා (Spent / Paid By)";
    if (submitBtn) {
      submitBtn.className = "bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition flex items-center gap-1.5";
      submitBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Expense (- වියදම)`;
    }
    
    catSelect.innerHTML = `
      <option value="Kitchen Food & Vegetables">🥬 Kitchen Food & Vegetables</option>
      <option value="Gas Cylinder & Fuel">🔥 Gas Cylinder & Energy</option>
      <option value="Ice Cubes & Water">🧊 Ice Cubes & Beverages</option>
      <option value="Staff Meals & Tea">☕ Staff Refreshments & Tea</option>
      <option value="Cleaning & Maintenance">🧼 Cleaning & Supplies</option>
      <option value="Transport & Delivery">🛵 Transport & Courier</option>
      <option value="Repairs & Utilities">🔧 Repairs & Hardware</option>
      <option value="Other Expense">📦 Other General Expense</option>
    `;
  }
}

export async function handlePettyCashSubmit(e) {
  e.preventDefault();
  const entryType = document.getElementById("pettyEntryType")?.value || "in";
  const category = document.getElementById("pettyCategorySelect")?.value || "";
  const amount = parseFloat(document.getElementById("pettyAmountInput")?.value || 0);
  const description = document.getElementById("pettyDescInput")?.value.trim() || "";
  const handledBy = document.getElementById("pettySpentByInput")?.value.trim() || "Cashier";
  
  if (amount <= 0) {
    alert("මුදල 0 ට වඩා වැඩි විය යුතුය.");
    return;
  }
  
  const transactionRecord = {
    type: entryType,
    category,
    amount: Math.round(amount * 100) / 100,
    description,
    handledBy,
    timestamp: new Date().toISOString()
  };
  
  try {
    if (dbRef && pushFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/pettyCash`), transactionRecord);
    }
    closePettyCashModal();
    if (entryType === "in") {
      showLiveToast("💰 Cash In Recorded", `පෙට්ටියට Rs. ${amount.toFixed(2)} ක් සාර්ථකව එකතු විය.`, "success", "fa-circle-plus");
    } else {
      showLiveToast("💸 Expense Recorded", `Rs. ${amount.toFixed(2)} (${category}) වියදම සාර්ථකව සටහන් විය.`, "warning", "fa-wallet");
    }
  } catch (err) {
    alert("ගනුදෙනුව සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

export function setPettyPeriodPreset(preset) {
  const fromElem = document.getElementById("pettyFromDate");
  const toElem = document.getElementById("pettyToDate");
  if (!fromElem || !toElem) return;
  const now = new Date();
  
  function formatDateTimeLocal(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  
  if (preset === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "thisWeek") {
    const curDate = new Date();
    const firstDay = new Date(curDate.setDate(curDate.getDate() - curDate.getDay()));
    firstDay.setHours(0, 0, 0, 0);
    const end = new Date();
    fromElem.value = formatDateTimeLocal(firstDay);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "all") {
    fromElem.value = "";
    toElem.value = "";
  }
  
  renderPettyCashTable();
}

// 🔒 ACCURATE LEDGER DATA WITH BALANCE BROUGHT FORWARD (B/F)
export function getFilteredPettyCashData() {
  const fromVal = document.getElementById("pettyFromDate")?.value;
  const toVal = document.getElementById("pettyToDate")?.value;
  const typeFilter = document.getElementById("pettyTypeFilter")?.value || "ALL";
  
  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;
  
  let openingBalanceBF = 0;
  const filteredList = [];

  Object.entries(erpState.pettyCash || {}).forEach(([id, item]) => {
    const t = new Date(item.timestamp || 0).getTime();
    const amt = parseFloat(item.amount || 0);

    // Calculate B/F Balance (Transactions before the filtered start time)
    if (t < fromTime) {
      if (item.type === "in") {
        openingBalanceBF += amt;
      } else {
        openingBalanceBF -= amt;
      }
    } else if (t <= toTime) {
      if (typeFilter === "ALL" || (item.type || 'out') === typeFilter) {
        filteredList.push([id, item]);
      }
    }
  });

  return { filteredList, openingBalanceBF, hasFromFilter: fromTime > 0 };
}

export function renderPettyCashTable() {
  const tbody = document.getElementById("pettyCashTableBody");
  if (!tbody) return;
  
  const allItems = Object.values(erpState.pettyCash || {});
  let grandTotalIn = 0;
  let grandTotalOut = 0;
  
  allItems.forEach(item => {
    const amt = parseFloat(item.amount || 0);
    if (item.type === "in") {
      grandTotalIn += amt;
    } else {
      grandTotalOut += amt;
    }
  });
  
  const netBalance = Math.round((grandTotalIn - grandTotalOut) * 100) / 100;
  
  const inEl = document.getElementById("pettyTotalInflowVal");
  const outEl = document.getElementById("pettyTotalExpenseVal");
  const balElem = document.getElementById("pettyCurrentBalanceVal");
  
  if (inEl) inEl.innerText = `Rs. ${grandTotalIn.toFixed(2)}`;
  if (outEl) outEl.innerText = `Rs. ${grandTotalOut.toFixed(2)}`;
  
  if (balElem) {
    balElem.innerText = `Rs. ${netBalance.toFixed(2)}`;
    balElem.className = netBalance < 0 ? "text-2xl font-black text-red-600 mt-1 block" : "text-2xl font-black text-emerald-700 mt-1 block";
  }
  
  const { filteredList, openingBalanceBF, hasFromFilter } = getFilteredPettyCashData();
  
  if (filteredList.length === 0 && !hasFromFilter) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-gray-400">මුදල් පෙට්ටියේ සටහන් නොමැත...</td></tr>`;
    return;
  }
  
  filteredList.sort((a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime());
  
  tbody.innerHTML = "";
  let runningBal = hasFromFilter ? openingBalanceBF : 0;

  // Render Opening Balance B/F Row if filtered
  if (hasFromFilter) {
    const bfTr = document.createElement("tr");
    bfTr.className = "bg-blue-50/60 font-bold border-b border-blue-100 text-blue-950";
    bfTr.innerHTML = `
      <td class="p-3 font-mono text-gray-500">${document.getElementById("pettyFromDate")?.value.replace("T", " ")}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-extrabold uppercase">⚖️ OPENING (B/F)</span></td>
      <td class="p-3 text-blue-900 font-extrabold">ආරම්භක ශේෂය (Balance B/F)</td>
      <td class="p-3 text-gray-500 italic">පෙර දිනවල ඉතිරි වූ ශේෂය</td>
      <td class="p-3 text-gray-500">System B/F</td>
      <td class="p-3 text-right text-gray-400">-</td>
      <td class="p-3 text-right text-gray-400">-</td>
      <td class="p-3 text-right font-black text-blue-700">Rs. ${openingBalanceBF.toFixed(2)}</td>
      <td class="p-3 text-right text-gray-400">-</td>
    `;
    tbody.appendChild(bfTr);
  }
  
  filteredList.forEach(([id, item]) => {
    const isIn = item.type === "in";
    const amt = parseFloat(item.amount || 0);
    
    if (isIn) {
      runningBal += amt;
    } else {
      runningBal -= amt;
    }
    
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 text-gray-500 font-semibold">${new Date(item.timestamp).toLocaleString()}</td>
      <td class="p-3.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isIn ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
          ${isIn ? '🟢 CASH IN' : '🔴 EXPENSE'}
        </span>
      </td>
      <td class="p-3.5 font-bold text-gray-800">${item.category}</td>
      <td class="p-3.5 text-gray-700">${item.description}</td>
      <td class="p-3.5 font-semibold text-gray-600">${item.handledBy || item.spentBy || 'Cashier'}</td>
      <td class="p-3.5 text-right font-black text-green-600">${isIn ? 'Rs. ' + amt.toFixed(2) : '-'}</td>
      <td class="p-3.5 text-right font-black text-red-600">${!isIn ? 'Rs. ' + amt.toFixed(2) : '-'}</td>
      <td class="p-3.5 text-right font-black ${runningBal >= 0 ? 'text-emerald-700' : 'text-red-600'}">Rs. ${runningBal.toFixed(2)}</td>
      <td class="p-3.5 text-right">
        <button onclick="deletePettyCash('${id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deletePettyCash(id) {
  if (confirm("මෙම සටහන මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/pettyCash/${id}`));
    }
  }
}

// 🔒 CSV EXPORT WITH ACCURATE OPENING B/F BALANCE
export function exportPettyCashToCSV() {
  const { filteredList, openingBalanceBF, hasFromFilter } = getFilteredPettyCashData();
  if (filteredList.length === 0 && !hasFromFilter) {
    alert("Export කිරීමට දත්ත නොමැත.");
    return;
  }
  
  filteredList.sort((a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime());
  
  let csv = `Date Time,Type,Category/Source,Description,Handled By,Cash In (+),Cash Out (-),Running Balance\n`;
  let running = hasFromFilter ? openingBalanceBF : 0;
  
  if (hasFromFilter) {
    csv += `"${document.getElementById("pettyFromDate")?.value}","OPENING (B/F)","Balance B/F","පෙර දිනවල ඉතිරි වූ ශේෂය","System","0.00","0.00","${openingBalanceBF.toFixed(2)}"\n`;
  }

  filteredList.forEach(([id, item]) => {
    const isIn = item.type === "in";
    const amt = parseFloat(item.amount || 0);
    if (isIn) running += amt;
    else running -= amt;
    
    const inVal = isIn ? amt.toFixed(2) : "0.00";
    const outVal = !isIn ? amt.toFixed(2) : "0.00";
    
    csv += `"${item.timestamp}","${isIn ? 'CASH IN' : 'EXPENSE'}","${item.category}","${item.description}","${item.handledBy || 'Cashier'}","${inVal}","${outVal}","${running.toFixed(2)}"\n`;
  });
  
  downloadCSVFile(csv, `Petty_Cash_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
}