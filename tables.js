// ==========================================================================
// MODULE 04: TABLE & FLOOR PLAN MANAGEMENT ENGINE (DYNAMIC REAL-TIME SYNC)
// ==========================================================================

import { erpState, currentTenant, currentAreaFilter, setCurrentAreaFilter, setActiveBillId } from './state.js';
import { showLiveToast } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let setFn = null;
let switchViewFn = null;
let renderBillTabsFn = null;
let syncActiveBillFn = null;

export function initTablesContext(dbRefInst, pushM, updateM, removeM, setM, switchV, renderTabs, syncBill) {
  dbRef = dbRefInst;
  pushFn = pushM;
  updateFn = updateM;
  removeFn = removeM;
  setFn = setM;
  switchViewFn = switchV;
  renderBillTabsFn = renderTabs;
  syncActiveBillFn = syncBill;
}

// 1. FLOOR AREAS
export function openAreaModal() {
  document.getElementById("areaModal")?.classList.remove("hidden");
}

export function closeAreaModal() {
  document.getElementById("areaModal")?.classList.add("hidden");
}

export async function handleAddAreaSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById("newAreaName");
  const areaName = nameInput?.value.trim();
  if (!areaName || !dbRef || !pushFn || !currentTenant) return;
  
  try {
    await pushFn(dbRef(`tenants/${currentTenant}/areas`), { name: areaName });
    if (nameInput) nameInput.value = "";
    showLiveToast("🏢 Area Added", `"${areaName}" කලාපය සාර්ථකව එකතු විය.`, "success", "fa-layer-group");
  } catch (err) {
    alert("Area එකතු කිරීමේදී දෝෂයක්: " + err.message);
  }
}

export function renderAreaListModalUI() {
  const container = document.getElementById("areaListContainer");
  if (!container) return;
  container.innerHTML = "";
  
  const areaEntries = Object.entries(erpState.areas || {});
  if (areaEntries.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-400 py-4 text-xs">Floor Areas කිසිවක් නැත...</p>`;
    return;
  }
  
  areaEntries.forEach(([id, area]) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs";
    row.innerHTML = `
      <span class="font-bold text-gray-800 flex items-center gap-2">
        <i class="fa-solid fa-layer-group text-blue-600"></i> ${area.name}
      </span>
      <button onclick="deleteArea('${id}')" class="text-red-500 hover:text-red-700 p-1 transition"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
  });
}

export async function deleteArea(id) {
  if (confirm("මෙම Floor Area එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/areas/${id}`));
    }
  }
}

export function renderAreaFiltersUI() {
  const container = document.getElementById("tableAreaFilters");
  if (!container) return;
  container.innerHTML = "";
  
  const allBtn = document.createElement("button");
  allBtn.className = `px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition text-xs ${
    currentAreaFilter === "ALL" ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
  }`;
  allBtn.innerText = "All Areas (සියල්ල)";
  allBtn.onclick = () => filterTableByArea("ALL");
  container.appendChild(allBtn);
  
  Object.entries(erpState.areas || {}).forEach(([id, area]) => {
    const btn = document.createElement("button");
    btn.className = `px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition text-xs ${
      currentAreaFilter === area.name ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
    }`;
    btn.innerText = area.name;
    btn.onclick = () => filterTableByArea(area.name);
    container.appendChild(btn);
  });
}

export function filterTableByArea(areaName) {
  setCurrentAreaFilter(areaName);
  renderAreaFiltersUI();
  renderTablesFloorGrid();
}

export function populateTableAreaDropdown() {
  const sel = document.getElementById("tableAreaSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">Main Dining Hall</option>`;
  Object.entries(erpState.areas || {}).forEach(([id, area]) => {
    sel.innerHTML += `<option value="${area.name}">${area.name}</option>`;
  });
}

export function populateTableWaiterDropdown() {
  const sel = document.getElementById("tableWaiterSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- වේටර්වරයෙකු තෝරන්න (Select Waiter) --</option>`;
  Object.entries(erpState.employees || {}).forEach(([id, emp]) => {
    if (emp.role === "Waiter") {
      sel.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.empId || 'EMP'})</option>`;
    }
  });
}

// 2. TABLES MANAGEMENT
export function openTableModal(mode, tableId = null) {
  const modal = document.getElementById("tableModal");
  const form = document.getElementById("tableForm");
  if (form) form.reset();
  const editId = document.getElementById("editTableId");
  if (editId) editId.value = "";
  
  populateTableAreaDropdown();
  populateTableWaiterDropdown();
  
  if (mode === "edit" && tableId && erpState.tables[tableId]) {
    const t = erpState.tables[tableId];
    const title = document.getElementById("tableModalTitle");
    if (title) title.innerText = "Edit Table";
    if (editId) editId.value = tableId;
    
    const noIn = document.getElementById("tableNoInput");
    const areaSel = document.getElementById("tableAreaSelect");
    const capIn = document.getElementById("tableCapacity");
    const wSel = document.getElementById("tableWaiterSelect");
    
    if (noIn) noIn.value = t.tableNo || "";
    if (areaSel) areaSel.value = t.area || "";
    if (capIn) capIn.value = t.capacity || 4;
    if (wSel) wSel.value = t.assignedWaiter || "";
  } else {
    const title = document.getElementById("tableModalTitle");
    if (title) title.innerText = "Add New Table";
  }
  
  modal?.classList.remove("hidden");
}

export function closeTableModal() {
  document.getElementById("tableModal")?.classList.add("hidden");
}

export async function handleTableSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById("editTableId")?.value;
  const tableData = {
    tableNo: document.getElementById("tableNoInput")?.value.trim() || "",
    area: document.getElementById("tableAreaSelect")?.value || "Main Dining",
    capacity: parseInt(document.getElementById("tableCapacity")?.value || 4),
    assignedWaiter: document.getElementById("tableWaiterSelect")?.value || "",
    status: editId && erpState.tables[editId] ? erpState.tables[editId].status : "Available",
    updatedAt: new Date().toISOString()
  };
  
  try {
    if (dbRef && currentTenant) {
      if (editId && updateFn) {
        await updateFn(dbRef(`tenants/${currentTenant}/tables/${editId}`), tableData);
      } else if (pushFn) {
        await pushFn(dbRef(`tenants/${currentTenant}/tables`), tableData);
      }
    }
    closeTableModal();
    showLiveToast("🍽️ Table Saved", `Table ${tableData.tableNo} සාර්ථකව සේව් විය.`, "success", "fa-chair");
  } catch (err) {
    alert("මේසය සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 🔥 DYNAMIC AUTO-CALCULATED OCCUPIED STATUS
export function renderTablesFloorGrid() {
  const container = document.getElementById("tablesGrid");
  if (!container) return;
  container.innerHTML = "";
  
  const list = Object.entries(erpState.tables || {}).filter(([id, t]) => {
    return currentAreaFilter === "ALL" || t.area === currentAreaFilter;
  });
  
  if (list.length === 0) {
    container.innerHTML = `<div class="col-span-full py-16 text-center text-xs text-gray-400 bg-white rounded-2xl border border-gray-200">මේස කිසිවක් නැත... (+ Add Table ඔබන්න)</div>`;
    return;
  }
  
  // Realtime Active Bills Map
  const activeBills = erpState.activeBills || {};

  list.forEach(([id, table]) => {
    // Check if any active bill has this table and contains active orders
    const matchedBill = Object.values(activeBills).find(b => b.tableNo === table.tableNo);
    const hasActiveOrders = matchedBill && matchedBill.cart && matchedBill.cart.length > 0;
    const isOccupied = table.status === "Occupied" || hasActiveOrders;

    const card = document.createElement("div");
    card.className = `p-4 rounded-2xl border-2 transition shadow-sm flex flex-col justify-between cursor-pointer active:scale-95 ${
      isOccupied 
        ? "bg-red-50 border-red-300 text-red-900" 
        : "bg-white border-gray-200 hover:border-blue-500 text-gray-800"
    }`;
    
    card.onclick = () => linkTableToPos(table.tableNo);
    
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start">
          <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
            isOccupied ? "bg-red-200 text-red-800 animate-pulse" : "bg-green-100 text-green-800"
          }">${isOccupied ? 'Occupied (පිරිලා)' : 'Available (හිස්)'}</span>
          <div class="space-x-1" onclick="event.stopPropagation()">
            <button onclick="openTableModal('edit', '${id}')" class="text-gray-400 hover:text-blue-600 p-1"><i class="fa-solid fa-pen text-xs"></i></button>
            <button onclick="deleteTable('${id}')" class="text-gray-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
          </div>
        </div>

        <div class="text-center my-3">
          <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-xl font-black mb-1 ${
            isOccupied ? "bg-red-500 text-white shadow-md" : "bg-blue-600 text-white shadow-md"
          }">
            <i class="fa-solid fa-utensils"></i>
          </div>
          <h4 class="font-black text-base">${table.tableNo}</h4>
          <span class="text-[10px] text-gray-500 font-bold block">${table.area || 'Main Hall'} (${table.capacity || 4} Seats)</span>
        </div>
      </div>

      <div class="pt-2 border-t ${isOccupied ? 'border-red-200' : 'border-gray-100'} text-[10px] flex justify-between items-center">
        <span class="truncate font-semibold text-gray-600">
          <i class="fa-solid fa-user-tie text-blue-600 mr-0.5"></i> ${table.assignedWaiter || 'No Waiter'}
        </span>
        <span class="font-bold text-blue-600 hover:underline">Open Bill &rarr;</span>
      </div>
    `;
    container.appendChild(card);
  });
}

export async function linkTableToPos(tableNo) {
  const activeBills = erpState.activeBills || {};
  let matchedBillKey = Object.keys(activeBills).find(k => activeBills[k].tableNo === tableNo);
  
  if (!matchedBillKey) {
    matchedBillKey = "bill_" + Date.now();
    if (dbRef && setFn && currentTenant) {
      await setFn(dbRef(`tenants/${currentTenant}/activeBills/${matchedBillKey}`), {
        name: `Table ${tableNo}`,
        orderType: "Dine-in",
        tableNo: tableNo,
        cart: [],
        discountType: "fixed",
        discountVal: 0,
        selectedPayMethod: "cash",
        updatedAt: new Date().toISOString()
      });
    }
  }

  // Auto set Table to Occupied in DB
  const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === tableNo);
  if (matchedTable && dbRef && updateFn && currentTenant) {
    await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" });
  }
  
  if (setActiveBillId) setActiveBillId(matchedBillKey);
  if (switchViewFn) switchViewFn("pos");
  if (renderBillTabsFn) renderBillTabsFn();
  if (syncActiveBillFn) syncActiveBillFn();
}

export async function deleteTable(id) {
  if (confirm("මෙම Table එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/tables/${id}`));
    }
  }
}

// 3. MERGE TABLES ENGINE
export function openMergeTableModal() {
  const srcSel = document.getElementById("mergeSourceTableSelect");
  const tgtSel = document.getElementById("mergeTargetTableSelect");
  if (!srcSel || !tgtSel) return;

  srcSel.innerHTML = `<option value="">-- Source Table (අස්කරන මේසය) --</option>`;
  tgtSel.innerHTML = `<option value="">-- Target Table (එකතු වන මේසය) --</option>`;

  const allTables = Object.values(erpState.tables || {});

  allTables.forEach(t => {
    srcSel.innerHTML += `<option value="${t.tableNo}">Table ${t.tableNo} (${t.status})</option>`;
    tgtSel.innerHTML += `<option value="${t.tableNo}">Table ${t.tableNo} (${t.status})</option>`;
  });

  document.getElementById("mergeTableModal")?.classList.remove("hidden");
}

export function closeMergeTableModal() {
  document.getElementById("mergeTableModal")?.classList.add("hidden");
}

export async function handleMergeTables(e) {
  if (e) e.preventDefault();
  const srcTableNo = document.getElementById("mergeSourceTableSelect")?.value;
  const tgtTableNo = document.getElementById("mergeTargetTableSelect")?.value;

  if (!srcTableNo || !tgtTableNo) {
    alert("කරුණාකර මේස දෙකම තෝරන්න.");
    return;
  }

  if (srcTableNo === tgtTableNo) {
    alert("එකම මේසය තෝරාගත නොහැක. වෙනස් මේස දෙකක් තෝරන්න.");
    return;
  }

  const activeBills = erpState.activeBills || {};
  const srcBillKey = Object.keys(activeBills).find(k => activeBills[k].tableNo === srcTableNo);
  let tgtBillKey = Object.keys(activeBills).find(k => activeBills[k].tableNo === tgtTableNo);

  const srcCart = (srcBillKey && activeBills[srcBillKey].cart) ? [...activeBills[srcBillKey].cart] : [];

  if (srcCart.length === 0) {
    alert(`Table ${srcTableNo} හි එකතු කිරීමට කෑම ඇණවුම් කිසිවක් නොමැත.`);
    return;
  }

  try {
    if (!tgtBillKey) {
      tgtBillKey = "bill_" + Date.now();
      await setFn(dbRef(`tenants/${currentTenant}/activeBills/${tgtBillKey}`), {
        name: `Table ${tgtTableNo}`,
        orderType: "Dine-in",
        tableNo: tgtTableNo,
        cart: [],
        discountType: "fixed",
        discountVal: 0,
        selectedPayMethod: "cash",
        updatedAt: new Date().toISOString()
      });
    }

    const tgtBill = activeBills[tgtBillKey] || { cart: [] };
    const mergedCart = tgtBill.cart ? [...tgtBill.cart] : [];

    srcCart.forEach(srcItem => {
      const existing = mergedCart.find(i => i.dishId === srcItem.dishId);
      if (existing) {
        existing.qty = (parseInt(existing.qty) || 0) + (parseInt(srcItem.qty) || 0);
        existing.sentQty = (parseInt(existing.sentQty) || 0) + (parseInt(srcItem.sentQty) || 0);
      } else {
        mergedCart.push(srcItem);
      }
    });

    // Update Target Bill
    await updateFn(dbRef(`tenants/${currentTenant}/activeBills/${tgtBillKey}`), {
      cart: mergedCart,
      updatedAt: new Date().toISOString()
    });

    // Remove Source Bill
    if (srcBillKey) {
      await removeFn(dbRef(`tenants/${currentTenant}/activeBills/${srcBillKey}`));
    }

    // Update Table Statuses
    const srcTableObj = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === srcTableNo);
    const tgtTableObj = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === tgtTableNo);

    if (srcTableObj) {
      await updateFn(dbRef(`tenants/${currentTenant}/tables/${srcTableObj[0]}`), { status: "Available" });
    }
    if (tgtTableObj) {
      await updateFn(dbRef(`tenants/${currentTenant}/tables/${tgtTableObj[0]}`), { status: "Occupied" });
    }

    closeMergeTableModal();
    if (setActiveBillId) setActiveBillId(tgtBillKey);
    if (switchViewFn) switchViewFn("pos");
    if (renderBillTabsFn) renderBillTabsFn();
    if (syncActiveBillFn) syncActiveBillFn();

    showLiveToast("🍽️ Tables Merged", `Table ${srcTableNo} හි ඇණවුම් සාර්ථකව Table ${tgtTableNo} වෙත එකතු විය.`, "success", "fa-object-group");

  } catch (err) {
    alert("Merge කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// Global Window Exports
window.openMergeTableModal = openMergeTableModal;
window.closeMergeTableModal = closeMergeTableModal;
window.handleMergeTables = handleMergeTables;