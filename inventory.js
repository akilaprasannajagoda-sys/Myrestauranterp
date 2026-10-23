// ==========================================================================
// MODULE 05: RAW MATERIALS, PRODUCT INVENTORY, STORE ISSUE (DEPT SAFE) & WASTAGE ENGINE
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast, downloadCSVFile } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let transactionFn = null;
let storeIssueSearchDebounceTimer = null;

export function initInventoryContext(dbRefInstance, pushMethod, updateMethod, removeMethod, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  transactionFn = runTransactionMethod;
}

// 🔒 COLLISION-PROOF UNIQUE STORE ISSUE NUMBER GENERATOR
export function generateCollisionProofIssueNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const salt = String(Math.floor(10 + Math.random() * 90));
  return `ISS-${yy}${mm}${dd}-${timePart}${salt}`;
}

// 🔄 SUB-TAB SWITCHER: STOCK VS STORE ISSUE HISTORY
export function switchInventorySubTab(tabName) {
  const stockSec = document.getElementById("invSection-stock");
  const issueSec = document.getElementById("invSection-issues");
  const stockBtn = document.getElementById("invSubTab-stock");
  const issueBtn = document.getElementById("invSubTab-issues");

  if (tabName === "issues") {
    if (stockSec) stockSec.classList.add("hidden");
    if (issueSec) issueSec.classList.remove("hidden");
    if (stockBtn) {
      stockBtn.className = "px-4 py-2 rounded-xl text-gray-600 hover:text-gray-900 font-bold cursor-pointer transition";
    }
    if (issueBtn) {
      issueBtn.className = "px-4 py-2 rounded-xl bg-indigo-600 text-white shadow-sm font-bold cursor-pointer transition";
    }

    const fromDateInput = document.getElementById("storeIssueFilterFromDate");
    const toDateInput = document.getElementById("storeIssueFilterToDate");
    if (fromDateInput && !fromDateInput.value) {
      const now = new Date();
      fromDateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (toDateInput && !toDateInput.value) {
      toDateInput.value = new Date().toISOString().split("T")[0];
    }
    renderStoreIssueHistoryTable();
  } else {
    if (issueSec) issueSec.classList.add("hidden");
    if (stockSec) stockSec.classList.remove("hidden");
    if (issueBtn) {
      issueBtn.className = "px-4 py-2 rounded-xl text-gray-600 hover:text-gray-900 font-bold cursor-pointer transition";
    }
    if (stockBtn) {
      stockBtn.className = "px-4 py-2 rounded-xl bg-indigo-600 text-white shadow-sm font-bold cursor-pointer transition";
    }
    renderRawStockTable();
  }
}

// 1. RAW MATERIAL CATEGORIES
export function openRawCategoryModal() {
  document.getElementById("rawCategoryModal")?.classList.remove("hidden");
}

export function closeRawCategoryModal() {
  document.getElementById("rawCategoryModal")?.classList.add("hidden");
}

export async function handleAddRawCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById("newRawCategoryName")?.value.trim();
  if (!name || !dbRef || !pushFn || !currentTenant) return;
  await pushFn(dbRef(`tenants/${currentTenant}/rawCategories`), { name });
  const input = document.getElementById("newRawCategoryName");
  if (input) input.value = "";
  showLiveToast("📦 Category Added", `"${name}" Category එක සාර්ථකව එකතු විය.`, "success", "fa-tags");
}

export function renderRawCategoryListUI() {
  const container = document.getElementById("rawCategoryListContainer");
  if (!container) return;
  container.innerHTML = "";
  Object.entries(erpState.rawCategories || {}).forEach(([id, cat]) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center p-2 rounded-xl bg-gray-50 border border-gray-200 text-xs";
    row.innerHTML = `
      <span class="font-bold text-gray-800">${cat.name}</span>
      <button onclick="deleteRawCategory('${id}')" class="text-red-500 hover:text-red-700 p-1 cursor-pointer"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
  });
}

export async function deleteRawCategory(id) {
  if (confirm("මෙම Material Category එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/rawCategories/${id}`));
      showLiveToast("🗑️ Category Removed", "Category එක සාර්ථකව මකා දමන ලදී.", "warning", "fa-trash");
    }
  }
}

export function populateRawCategoryDropdown() {
  const sel = document.getElementById("rawCategorySelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">General Materials</option>`;
  Object.entries(erpState.rawCategories || {}).forEach(([id, cat]) => {
    sel.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
  });
}

// 2. RAW MATERIAL PRODUCTS (WITH REORDER LEVEL)
export function openRawItemModal(mode, rawId = null) {
  const modal = document.getElementById("rawItemModal");
  const form = document.getElementById("rawItemForm");
  if (form) form.reset();
  const editIdInput = document.getElementById("editRawId");
  if (editIdInput) editIdInput.value = "";
  
  populateRawCategoryDropdown();

  if (mode === "edit" && rawId && erpState.rawItems[rawId]) {
    const r = erpState.rawItems[rawId];
    const title = document.getElementById("rawItemModalTitle");
    if (title) title.innerText = "Edit Material Product";
    if (editIdInput) editIdInput.value = rawId;
    
    const nameIn = document.getElementById("rawNameInput");
    const catSel = document.getElementById("rawCategorySelect");
    const unitSel = document.getElementById("rawUnitSelect");
    const costIn = document.getElementById("rawCostInput");
    const stockIn = document.getElementById("rawStockInput");
    
    if (nameIn) nameIn.value = r.name;
    if (catSel) catSel.value = r.category || "";
    if (unitSel) unitSel.value = r.unit || "kg";
    if (costIn) costIn.value = r.cost;
    if (stockIn) stockIn.value = r.stock;
  } else {
    const title = document.getElementById("rawItemModalTitle");
    if (title) title.innerText = "Add Material Product";
  }
  modal?.classList.remove("hidden");
}

export function closeRawItemModal() {
  document.getElementById("rawItemModal")?.classList.add("hidden");
}

export async function handleRawItemSubmit(e) {
  e.preventDefault();
  const rawId = document.getElementById("editRawId")?.value;
  const rawData = {
    name: document.getElementById("rawNameInput")?.value.trim() || "",
    category: document.getElementById("rawCategorySelect")?.value || "",
    unit: document.getElementById("rawUnitSelect")?.value || "kg",
    cost: parseFloat(document.getElementById("rawCostInput")?.value || 0),
    stock: parseFloat(document.getElementById("rawStockInput")?.value || 0),
    reorderLevel: 3.0
  };
  
  if (dbRef && currentTenant) {
    if (rawId && updateFn) {
      await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${rawId}`), rawData);
      showLiveToast("📦 Product Updated", `${rawData.name} සාර්ථකව යාවත්කාලීන විය.`, "success", "fa-boxes-stacked");
    } else if (pushFn) {
      await pushFn(dbRef(`tenants/${currentTenant}/rawItems`), rawData);
      showLiveToast("📦 Product Saved", `${rawData.name} සාර්ථකව සේව් විය.`, "success", "fa-boxes-stacked");
    }
  }
  closeRawItemModal();
}

// 🔍 SEARCHABLE RAW STOCK TABLE ENGINE
export function onRawSearchInput() {
  renderRawStockTable();
}

export function renderRawStockTable() {
  const tbody = document.getElementById("rawTableBody");
  const badge = document.getElementById("rawItemCountBadge");
  const searchInput = document.getElementById("rawSearchInput");
  const query = (searchInput?.value || "").toLowerCase().trim();
  if (!tbody) return;
  
  let list = Object.entries(erpState.rawItems || {});
  
  if (query) {
    list = list.filter(([id, raw]) => {
      const name = (raw.name || "").toLowerCase();
      const cat = (raw.category || "").toLowerCase();
      return name.includes(query) || cat.includes(query);
    });
  }

  if (badge) badge.innerText = `${list.length} Items`;
  
  if (list.length === 0) {
    if (query) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">"${query}" නමින් අමුද්‍රව්‍ය හමු නොවීය...</td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">අමුද්‍රව්‍ය තවම ඇතුළත් කර නැත...</td></tr>`;
    }
    return;
  }
  
  tbody.innerHTML = "";
  list.forEach(([id, raw]) => {
    const stock = parseFloat(raw.stock || 0);
    const reorder = parseFloat(raw.reorderLevel || 3.0);
    const isLowStock = stock <= reorder;

    const tr = document.createElement("tr");
    tr.className = `border-b border-gray-100 ${isLowStock ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-gray-50'}`;
    tr.innerHTML = `
      <td class="p-3.5">
        <span class="font-bold text-gray-800 block">${raw.name}</span>
        ${isLowStock ? `<span class="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.2 rounded uppercase animate-pulse">Low Stock Alert</span>` : ''}
      </td>
      <td class="p-3.5"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-[10px] font-bold">${raw.category || 'General'}</span></td>
      <td class="p-3.5 font-bold uppercase text-gray-600">${raw.unit}</td>
      <td class="p-3.5 font-bold text-gray-800">Rs. ${parseFloat(raw.cost).toFixed(2)}</td>
      <td class="p-3.5">
        <span class="px-2.5 py-1 rounded-full text-xs font-black ${
          isLowStock ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-indigo-50 text-indigo-700'
        }">${stock} ${raw.unit}</span>
      </td>
      <td class="p-3.5 text-right space-x-2">
        <button onclick="openRawItemModal('edit', '${id}')" class="text-indigo-600 hover:text-indigo-800 cursor-pointer"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteRawItem('${id}')" class="text-red-500 hover:text-red-700 cursor-pointer"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deleteRawItem(id) {
  if (confirm("මෙම Material Product එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/rawItems/${id}`));
      showLiveToast("🗑️ Product Deleted", "අමුද්‍රව්‍යය සාර්ථකව ඉවත් කරන ලදී.", "warning", "fa-trash");
    }
  }
}

// 3. MULTI-DEPARTMENT STORE ISSUE ENGINE (WITH INSTANT SEARCH)
export function openStoreIssueModal() {
  document.getElementById("storeIssueForm")?.reset();
  const dIn = document.getElementById("issueDate");
  const deptIn = document.getElementById("issueDepartment");
  const hIn = document.getElementById("issueHandledBy");
  if (dIn) dIn.value = new Date().toISOString().split("T")[0];
  if (deptIn) deptIn.value = "Kitchen";
  if (hIn) hIn.value = "Head Cook / Store Keeper";

  const container = document.getElementById("storeIssueItemsContainer");
  if (container) {
    container.innerHTML = "";
    addStoreIssueItemRow();
  }

  document.getElementById("storeIssueModal")?.classList.remove("hidden");
}

export function closeStoreIssueModal() {
  document.getElementById("storeIssueModal")?.classList.add("hidden");
}

export function addStoreIssueItemRow() {
  const container = document.getElementById("storeIssueItemsContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "grid grid-cols-12 gap-2 bg-white p-2.5 rounded-xl border border-green-200 items-center text-xs store-issue-item-row shadow-2xs";

  let options = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  Object.entries(erpState.rawItems || {}).forEach(([id, item]) => {
    options += `<option value="${id}" data-cost="${item.cost || 0}">${item.name} (${item.unit} - Avail: ${item.stock})</option>`;
  });

  row.innerHTML = `
    <div class="col-span-12 sm:col-span-6 space-y-1">
      <input type="text" placeholder="🔍 Instant search material..." oninput="filterStoreIssueRowSelect(this)" class="w-full p-1.5 border border-gray-200 rounded-md text-xs outline-none bg-gray-50 font-bold text-green-900 store-issue-search-input">
      <select class="w-full p-1.5 border border-gray-300 rounded-lg bg-white font-bold outline-none store-issue-raw-id text-xs">
        ${options}
      </select>
    </div>
    <div class="col-span-8 sm:col-span-4">
      <label class="text-[9px] text-gray-400 font-bold block sm:hidden">Issued Qty</label>
      <input type="number" step="0.001" placeholder="Issued Qty" value="1" class="w-full p-1.5 border rounded-lg font-bold text-center outline-none store-issue-qty text-xs">
    </div>
    <div class="col-span-4 sm:col-span-2 text-right">
      <button type="button" onclick="this.closest('.store-issue-item-row').remove()" class="text-red-500 hover:text-red-700 p-1.5 cursor-pointer" title="Remove Item"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  container.appendChild(row);
}

// 🔥 DEBOUNCED ZERO-FREEZE SEARCH FOR STORE ISSUE
export function filterStoreIssueRowSelect(input) {
  if (storeIssueSearchDebounceTimer) clearTimeout(storeIssueSearchDebounceTimer);

  storeIssueSearchDebounceTimer = setTimeout(() => {
    const query = (input.value || "").toLowerCase().trim();
    const row = input.closest(".store-issue-item-row");
    const select = row ? row.querySelector(".store-issue-raw-id") : null;
    if (!select) return;

    let html = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
    let matchCount = 0;
    let singleMatchId = null;

    const rawList = Object.entries(erpState.rawItems || {});

    for (let i = 0; i < rawList.length; i++) {
      const [id, item] = rawList[i];
      const itemName = (item.name || "").toLowerCase();
      
      if (!query || itemName.includes(query)) {
        html += `<option value="${id}" data-cost="${item.cost || 0}">${item.name} (${item.unit} - Avail: ${item.stock})</option>`;
        matchCount++;
        singleMatchId = id;
        if (matchCount >= 60) break;
      }
    }

    if (matchCount === 0 && query) {
      html = `<option value="">(අමුද්‍රව්‍ය හමු නොවීය - No Match)</option>`;
    }

    select.innerHTML = html;

    if (matchCount === 1 && singleMatchId && query.length >= 2) {
      select.value = singleMatchId;
    }
  }, 180);
}

export async function handleStoreIssueSubmit(e) {
  if (e) e.preventDefault();
  const date = document.getElementById("issueDate")?.value || new Date().toISOString().split("T")[0];
  const department = document.getElementById("issueDepartment")?.value || "Kitchen";
  const handledBy = document.getElementById("issueHandledBy")?.value.trim() || "Store Keeper";
  const note = document.getElementById("issueNote")?.value.trim() || "";

  const items = [];
  document.querySelectorAll(".store-issue-item-row").forEach(r => {
    const rawId = r.querySelector(".store-issue-raw-id")?.value;
    const qty = parseFloat(r.querySelector(".store-issue-qty")?.value || 0);

    if (rawId && qty > 0 && erpState.rawItems[rawId]) {
      const rawObj = erpState.rawItems[rawId];
      const unitCost = parseFloat(rawObj.cost || 0);
      items.push({
        rawId,
        rawName: rawObj.name,
        unit: rawObj.unit,
        qty,
        cost: unitCost,
        totalCost: qty * unitCost
      });
    }
  });

  if (items.length === 0) {
    alert("කරුණාකර අවම වශයෙන් එක් අමුද්‍රව්‍යයක්වත් තෝරන්න.");
    return;
  }

  const issueNumber = generateCollisionProofIssueNumber();
  const totalIssuedCost = items.reduce((sum, i) => sum + i.totalCost, 0);

  const issuePayload = {
    issueNumber,
    date,
    department,
    handledBy,
    note,
    items,
    totalIssuedCost: Math.round(totalIssuedCost * 100) / 100,
    timestamp: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && updateFn && currentTenant) {
      const issueRef = await pushFn(dbRef(`tenants/${currentTenant}/storeIssues`), issuePayload);

      for (const it of items) {
        if (transactionFn) {
          await transactionFn(dbRef(`tenants/${currentTenant}/rawItems/${it.rawId}/stock`), (currentStock) => {
            const prev = (currentStock === null || isNaN(currentStock)) ? 0 : parseFloat(currentStock);
            return Math.max(0, parseFloat((prev - it.qty).toFixed(3)));
          });
        } else {
          const currentStock = parseFloat(erpState.rawItems[it.rawId]?.stock || 0);
          const newStock = Math.max(0, currentStock - it.qty);
          await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${it.rawId}`), {
            stock: parseFloat(newStock.toFixed(3))
          });
        }
      }

      if (!erpState.storeIssues) erpState.storeIssues = {};
      erpState.storeIssues[issueRef.key] = issuePayload;
    }

    closeStoreIssueModal();
    showLiveToast("📦 Store Issue Saved", `${department} වෙත බඩු සාර්ථකව Issue කර Stock අඩු කරන ලදී. (Rs. ${issuePayload.totalIssuedCost.toFixed(2)})`, "success", "fa-dolly");
    
    switchInventorySubTab("issues");
  } catch (err) {
    alert("Store Issue සටහන් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 4. STORE ISSUE HISTORY TABLE & FILTER ENGINE
export function renderStoreIssueHistoryTable() {
  const tbody = document.getElementById("storeIssueHistoryTableBody");
  const countBadge = document.getElementById("storeIssueCountBadge");
  const totalCostVal = document.getElementById("storeIssueTotalCostVal");
  if (!tbody) return;

  const fromDate = document.getElementById("storeIssueFilterFromDate")?.value;
  const toDate = document.getElementById("storeIssueFilterToDate")?.value;
  const deptFilter = document.getElementById("storeIssueFilterDept")?.value || "ALL";

  let list = Object.entries(erpState.storeIssues || {});

  if (fromDate) list = list.filter(([id, iss]) => (iss.date || iss.timestamp?.split("T")[0]) >= fromDate);
  if (toDate) list = list.filter(([id, iss]) => (iss.date || iss.timestamp?.split("T")[0]) <= toDate);
  if (deptFilter !== "ALL") list = list.filter(([id, iss]) => (iss.department || "Kitchen") === deptFilter);

  let grandTotalCost = 0;
  list.forEach(([id, iss]) => {
    grandTotalCost += parseFloat(iss.totalIssuedCost || 0);
  });

  if (countBadge) countBadge.innerText = `${list.length} Notes`;
  if (totalCostVal) totalCostVal.innerText = `Rs. ${grandTotalCost.toFixed(2)}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">තෝරාගත් කාලසීමාවේ නිකුත් කිරීමේ සටහන් (Store Issues) නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.sort((a, b) => new Date(b[1].timestamp || b[1].date).getTime() - new Date(a[1].timestamp || a[1].date).getTime());

  const deptBadgeStyles = {
    Kitchen: "bg-yellow-100 text-yellow-800 border-yellow-200",
    "F&B": "bg-blue-100 text-blue-800 border-blue-200",
    Bar: "bg-purple-100 text-purple-800 border-purple-200",
    Bakery: "bg-orange-100 text-orange-800 border-orange-200",
    Housekeeping: "bg-cyan-100 text-cyan-800 border-cyan-200",
    StaffMeals: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Other: "bg-gray-100 text-gray-800 border-gray-200"
  };

  list.forEach(([id, iss]) => {
    const dept = iss.department || "Kitchen";
    const badgeClass = deptBadgeStyles[dept] || "bg-gray-100 text-gray-800";
    const itemsSummary = (iss.items || []).map(i => `${i.rawName} (${i.qty} ${i.unit})`).join(", ");

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold text-green-700">${iss.issueNumber || 'ISS-NOTE'}</td>
      <td class="p-3.5 font-semibold text-gray-600">${iss.date || iss.timestamp?.split("T")[0]}</td>
      <td class="p-3.5">
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase ${badgeClass}">
          ${dept}
        </span>
      </td>
      <td class="p-3.5 font-bold text-gray-800">${iss.handledBy || 'Store Keeper'}</td>
      <td class="p-3.5 text-gray-600 truncate max-w-xs" title="${itemsSummary}">${itemsSummary || '-'}</td>
      <td class="p-3.5 text-right font-black text-green-800">Rs. ${parseFloat(iss.totalIssuedCost || 0).toFixed(2)}</td>
      <td class="p-3.5 text-right">
        <button onclick="viewStoreIssueDetail('${id}')" class="bg-green-50 text-green-700 hover:bg-green-700 hover:text-white border border-green-200 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer">
          <i class="fa-solid fa-eye mr-1"></i> View
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 5. VIEW STORE ISSUE DETAIL MODAL
export function viewStoreIssueDetail(id) {
  const iss = erpState.storeIssues?.[id];
  if (!iss) return;

  const title = document.getElementById("storeIssueDetailTitle");
  const sub = document.getElementById("storeIssueDetailSubtitle");
  if (title) title.innerText = `Issue #${iss.issueNumber || 'ISS-NOTE'}`;
  if (sub) sub.innerText = `Department: ${iss.department || 'Kitchen'} | Date: ${iss.date || ''} | Issued to: ${iss.handledBy || ''}`;

  const container = document.getElementById("storeIssueDetailContent");
  if (!container) return;

  let itemsHtml = (iss.items || []).map(i => `
    <div class="flex justify-between items-center py-1.5 border-b border-gray-100">
      <div>
        <span class="font-bold text-gray-800">${i.rawName}</span>
        <span class="text-[10px] text-gray-400 block">${i.qty} ${i.unit} @ Rs. ${parseFloat(i.cost || 0).toFixed(2)}</span>
      </div>
      <span class="font-black text-gray-900">Rs. ${parseFloat(i.totalCost || (i.qty * i.cost) || 0).toFixed(2)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="space-y-3">
      ${iss.note ? `<div class="p-2 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 font-semibold text-xs"><i class="fa-solid fa-note-sticky mr-1"></i> Note: ${iss.note}</div>` : ''}
      <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 max-h-60 overflow-y-auto space-y-1">
        ${itemsHtml}
      </div>
      <div class="pt-2 flex justify-between items-center font-black text-sm border-t border-gray-200">
        <span>Total Issued Cost:</span>
        <span class="text-green-700 text-base">Rs. ${parseFloat(iss.totalIssuedCost || 0).toFixed(2)}</span>
      </div>
    </div>
  `;
  document.getElementById("storeIssueDetailModal")?.classList.remove("hidden");
}

export function closeStoreIssueDetailModal() {
  document.getElementById("storeIssueDetailModal")?.classList.add("hidden");
}

// 6. EXPORT STORE ISSUES TO CSV
export function exportStoreIssuesToCSV() {
  const fromDate = document.getElementById("storeIssueFilterFromDate")?.value;
  const toDate = document.getElementById("storeIssueFilterToDate")?.value;
  const deptFilter = document.getElementById("storeIssueFilterDept")?.value || "ALL";

  let list = Object.entries(erpState.storeIssues || {});

  if (fromDate) list = list.filter(([id, iss]) => (iss.date || iss.timestamp?.split("T")[0]) >= fromDate);
  if (toDate) list = list.filter(([id, iss]) => (iss.date || iss.timestamp?.split("T")[0]) <= toDate);
  if (deptFilter !== "ALL") list = list.filter(([id, iss]) => (iss.department || "Kitchen") === deptFilter);

  if (list.length === 0) {
    alert("Export කිරීමට Store Issue දත්ත නොමැත.");
    return;
  }

  let csv = "Issue Number,Date,Department,Handled By,Items Breakdown,Total Cost (Rs.),Note\n";
  list.forEach(([id, iss]) => {
    const itemsStr = (iss.items || []).map(i => `${i.rawName} (${i.qty} ${i.unit})`).join("; ");
    csv += `"${iss.issueNumber || ''}","${iss.date || ''}","${iss.department || 'Kitchen'}","${iss.handledBy || ''}","${itemsStr}","${parseFloat(iss.totalIssuedCost || 0).toFixed(2)}","${iss.note || ''}"\n`;
  });

  downloadCSVFile(csv, `Store_Issues_${deptFilter}_${new Date().toISOString().split("T")[0]}.csv`);
}

// 7. MULTI-ITEM KITCHEN WASTAGE ENGINE
export function openWastageModal() {
  document.getElementById("wastageForm")?.reset();
  const dIn = document.getElementById("wastageDate");
  const rIn = document.getElementById("wastageReportedBy");
  if (dIn) dIn.value = new Date().toISOString().split("T")[0];
  if (rIn) rIn.value = "Head Cook";
  
  const container = document.getElementById("wastageItemsContainer");
  if (container) {
    container.innerHTML = "";
    addWastageItemRow();
  }

  document.getElementById("wastageModal")?.classList.remove("hidden");
}

export function closeWastageModal() {
  document.getElementById("wastageModal")?.classList.add("hidden");
}

export function addWastageItemRow() {
  const container = document.getElementById("wastageItemsContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "grid grid-cols-12 gap-2 bg-white p-2 rounded-xl border border-red-100 items-center text-xs wastage-item-row";

  let options = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  Object.entries(erpState.rawItems || {}).forEach(([id, item]) => {
    options += `<option value="${id}">${item.name} (${item.unit})</option>`;
  });

  row.innerHTML = `
    <div class="col-span-12 sm:col-span-5">
      <select class="w-full p-1.5 border rounded-lg bg-white font-bold outline-none wastage-raw-id">
        ${options}
      </select>
    </div>
    <div class="col-span-5 sm:col-span-3">
      <input type="number" step="0.01" placeholder="Wasted Qty" value="1" class="w-full p-1.5 border rounded-lg font-bold text-center outline-none wastage-qty">
    </div>
    <div class="col-span-6 sm:col-span-3">
      <select class="w-full p-1.5 border rounded-lg font-bold outline-none wastage-reason">
        <option value="Expired">කල් ඉකුත් විය (Expired)</option>
        <option value="Damaged/Spoiled">නරක් විය (Damaged)</option>
        <option value="Cooking Waste/Burned">පිච්චුණි (Burned)</option>
        <option value="Spill/Drop">හැලුණි (Spill)</option>
      </select>
    </div>
    <div class="col-span-1 text-center">
      <button type="button" onclick="this.closest('.wastage-item-row').remove()" class="text-red-500 hover:text-red-700 p-1 cursor-pointer"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  container.appendChild(row);
}

export async function handleWastageSubmit(e) {
  if (e) e.preventDefault();
  const date = document.getElementById("wastageDate")?.value;
  const reportedBy = document.getElementById("wastageReportedBy")?.value.trim() || "Staff";
  const generalNote = document.getElementById("wastageGeneralNote")?.value.trim() || "";

  const items = [];
  document.querySelectorAll(".wastage-item-row").forEach(r => {
    const rawId = r.querySelector(".wastage-raw-id")?.value;
    const qty = parseFloat(r.querySelector(".wastage-qty")?.value || 0);
    const reason = r.querySelector(".wastage-reason")?.value || "Damaged";

    if (rawId && qty > 0 && erpState.rawItems[rawId]) {
      items.push({
        rawId,
        rawName: erpState.rawItems[rawId].name,
        unit: erpState.rawItems[rawId].unit,
        qty,
        cost: erpState.rawItems[rawId].cost,
        lossAmount: qty * (parseFloat(erpState.rawItems[rawId].cost) || 0),
        reason
      });
    }
  });

  if (items.length === 0) {
    alert("කරුණාකර අවම වශයෙන් එක් අමුද්‍රව්‍යයක්වත් තෝරන්න.");
    return;
  }

  const wastagePayload = {
    date,
    reportedBy,
    generalNote,
    items,
    totalLossAmount: items.reduce((sum, i) => sum + i.lossAmount, 0),
    timestamp: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && updateFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/wastageLogs`), wastagePayload);

      for (const it of items) {
        if (transactionFn) {
          await transactionFn(dbRef(`tenants/${currentTenant}/rawItems/${it.rawId}/stock`), (currentStock) => {
            const prev = (currentStock === null || isNaN(currentStock)) ? 0 : parseFloat(currentStock);
            return Math.max(0, parseFloat((prev - it.qty).toFixed(3)));
          });
        } else {
          const currentStock = parseFloat(erpState.rawItems[it.rawId]?.stock || 0);
          const newStock = Math.max(0, currentStock - it.qty);
          await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${it.rawId}`), {
            stock: parseFloat(newStock.toFixed(3))
          });
        }
      }
    }

    closeWastageModal();
    showLiveToast("🗑️ Wastage Deducted", "නරක් වූ අමුද්‍රව්‍ය තොගයෙන් සාර්ථකව අඩු කරන ලදී.", "warning", "fa-trash-can");
  } catch (err) {
    alert("Wastage සටහන් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// Global Window Exports
window.switchInventorySubTab = switchInventorySubTab;
window.openRawCategoryModal = openRawCategoryModal;
window.closeRawCategoryModal = closeRawCategoryModal;
window.handleAddRawCategorySubmit = handleAddRawCategorySubmit;
window.deleteRawCategory = deleteRawCategory;
window.openRawItemModal = openRawItemModal;
window.closeRawItemModal = closeRawItemModal;
window.handleRawItemSubmit = handleRawItemSubmit;
window.deleteRawItem = deleteRawItem;
window.onRawSearchInput = onRawSearchInput;
window.openStoreIssueModal = openStoreIssueModal;
window.closeStoreIssueModal = closeStoreIssueModal;
window.addStoreIssueItemRow = addStoreIssueItemRow;
window.filterStoreIssueRowSelect = filterStoreIssueRowSelect;
window.handleStoreIssueSubmit = handleStoreIssueSubmit;
window.renderStoreIssueHistoryTable = renderStoreIssueHistoryTable;
window.viewStoreIssueDetail = viewStoreIssueDetail;
window.closeStoreIssueDetailModal = closeStoreIssueDetailModal;
window.exportStoreIssuesToCSV = exportStoreIssuesToCSV;
window.openWastageModal = openWastageModal;
window.closeWastageModal = closeWastageModal;
window.addWastageItemRow = addWastageItemRow;
window.handleWastageSubmit = handleWastageSubmit;
