// ==========================================================================
// MODULE 05: RAW MATERIALS, PRODUCT INVENTORY, STORE ISSUE & WASTAGE ENGINE
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let transactionFn = null;

export function initInventoryContext(dbRefInstance, pushMethod, updateMethod, removeMethod, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  transactionFn = runTransactionMethod;
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
      <button onclick="deleteRawCategory('${id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
  });
}

export async function deleteRawCategory(id) {
  if (confirm("මෙම Material Category එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/rawCategories/${id}`));
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
    reorderLevel: 3.0 // Default Reorder Level
  };
  
  if (dbRef && currentTenant) {
    if (rawId && updateFn) {
      await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${rawId}`), rawData);
    } else if (pushFn) {
      await pushFn(dbRef(`tenants/${currentTenant}/rawItems`), rawData);
    }
  }
  closeRawItemModal();
  showLiveToast("📦 Product Saved", `${rawData.name} සාර්ථකව සේව් විය.`, "success", "fa-boxes-stacked");
}

export function renderRawStockTable() {
  const tbody = document.getElementById("rawTableBody");
  const badge = document.getElementById("rawItemCountBadge");
  if (!tbody) return;
  
  const list = Object.entries(erpState.rawItems || {});
  if (badge) badge.innerText = `${list.length} Items`;
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">අමුද්‍රව්‍ය තවම ඇතුළත් කර නැත...</td></tr>`;
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
        <button onclick="openRawItemModal('edit', '${id}')" class="text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteRawItem('${id}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deleteRawItem(id) {
  if (confirm("මෙම Material Product එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/rawItems/${id}`));
    }
  }
}

// ==========================================================================
// 3. 🔥 DAILY KITCHEN STORE ISSUE ENGINE (දෛනික කුස්සියට බඩු ISSUE කිරීම)
// ==========================================================================
export function openStoreIssueModal() {
  document.getElementById("storeIssueForm")?.reset();
  const dIn = document.getElementById("issueDate");
  const hIn = document.getElementById("issueHandledBy");
  if (dIn) dIn.value = new Date().toISOString().split("T")[0];
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
  row.className = "grid grid-cols-12 gap-2 bg-white p-2.5 rounded-xl border border-emerald-100 items-center text-xs store-issue-item-row";

  let options = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  Object.entries(erpState.rawItems || {}).forEach(([id, item]) => {
    options += `<option value="${id}">${item.name} (${item.unit} - Avail: ${item.stock})</option>`;
  });

  row.innerHTML = `
    <div class="col-span-12 sm:col-span-6">
      <select class="w-full p-1.5 border rounded-lg bg-white font-bold outline-none store-issue-raw-id">
        ${options}
      </select>
    </div>
    <div class="col-span-6 sm:col-span-4">
      <input type="number" step="0.1" placeholder="Issued Qty" value="1" class="w-full p-1.5 border rounded-lg font-bold text-center outline-none store-issue-qty">
    </div>
    <div class="col-span-6 sm:col-span-2 text-right">
      <button type="button" onclick="this.closest('.store-issue-item-row').remove()" class="text-red-500 hover:text-red-700 p-1.5"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
  container.appendChild(row);
}

export async function handleStoreIssueSubmit(e) {
  if (e) e.preventDefault();
  const date = document.getElementById("issueDate")?.value;
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

  const issuePayload = {
    date,
    handledBy,
    note,
    items,
    totalIssuedCost: items.reduce((sum, i) => sum + i.totalCost, 0),
    timestamp: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && updateFn && currentTenant) {
      // 1. Save Store Issue Record
      await pushFn(dbRef(`tenants/${currentTenant}/storeIssues`), issuePayload);

      // 2. Deduct Issued Quantities from Raw Stock
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

    closeStoreIssueModal();
    showLiveToast("📦 Kitchen Issue Saved", `කුස්සියට බඩු සාර්ථකව Issue කර Stock අඩු කරන ලදී. (Rs. ${issuePayload.totalIssuedCost.toFixed(2)})`, "success", "fa-dolly");
  } catch (err) {
    alert("Store Issue සටහන් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// ==========================================================================
// 4. MULTI-ITEM KITCHEN WASTAGE / SPOILAGE ENGINE
// ==========================================================================
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
      <button type="button" onclick="this.closest('.wastage-item-row').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
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
      // 1. Save Wastage Log
      await pushFn(dbRef(`tenants/${currentTenant}/wastageLogs`), wastagePayload);

      // 2. Deduct quantities from rawItems Stock
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
window.openRawCategoryModal = openRawCategoryModal;
window.closeRawCategoryModal = closeRawCategoryModal;
window.deleteRawCategory = deleteRawCategory;
window.openRawItemModal = openRawItemModal;
window.closeRawItemModal = closeRawItemModal;
window.deleteRawItem = deleteRawItem;
window.openStoreIssueModal = openStoreIssueModal;
window.closeStoreIssueModal = closeStoreIssueModal;
window.addStoreIssueItemRow = addStoreIssueItemRow;
window.handleStoreIssueSubmit = handleStoreIssueSubmit;
window.openWastageModal = openWastageModal;
window.closeWastageModal = closeWastageModal;
window.addWastageItemRow = addWastageItemRow;
window.handleWastageSubmit = handleWastageSubmit;