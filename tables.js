// ==========================================================================
// MODULE 04: TABLE & FLOOR PLAN MANAGEMENT ENGINE (100% UNFREEZE & REAL-TIME)
// 🎨 ARCHITECTURAL RESTAURANT FLOOR PLAN ENGINE (EXACT CLIENT PHOTO REPLICA)
// 100% COMPATIBLE WITH EXISTING POS, BILLING & REALTIME FIREBASE LOGIC
// 🔴 100% REAL-TIME OCCUPIED RED HIGHLIGHT + TOUCH SCREEN & MOUSE EDIT ENGINE
// 🔒 DYNAMIC TABLE ORDER MODE ACTIVATION (METHOD 01)
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

// Floor Plan Interaction Mode: 'order' (Default: Opens POS) | 'edit' (Opens Edit Modal)
export let currentFloorPlanMode = "order";

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

// 🛡️ HELPER: EXTRACT PURE NUMBERS (Handles "01", "1", "Table 01", "T-01" etc.)
function extractTableNum(val) {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

// ==========================================================================
// 1. FLOOR AREAS MANAGEMENT
// ==========================================================================

export function openAreaModal() {
  document.getElementById("areaModal")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("newAreaName")?.focus(), 50);
}

export function closeAreaModal() {
  document.getElementById("areaModal")?.classList.add("hidden");
}

export async function handleAddAreaSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById("newAreaName");
  const areaName = nameInput?.value.trim();
  
  if (!areaName) {
    showLiveToast("⚠️ අඩුපාඩුවක්", "කරුණාකර Area නම ඇතුළත් කරන්න.", "warning", "fa-layer-group");
    if (nameInput) nameInput.focus();
    return;
  }
  
  const tempAreaId = "area_" + Date.now();
  if (!erpState.areas) erpState.areas = {};
  erpState.areas[tempAreaId] = { name: areaName };
  
  renderAreaListModalUI();
  renderAreaFiltersUI();
  populateTableAreaDropdown();
  if (nameInput) nameInput.value = "";

  try {
    if (dbRef && pushFn && currentTenant && navigator.onLine) {
      await pushFn(dbRef(`tenants/${currentTenant}/areas`), { name: areaName });
    }
    showLiveToast("🏢 Area Added", `"${areaName}" කලාපය සාර්ථකව එකතු විය.`, "success", "fa-layer-group");
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Area එකතු කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
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
      <button onclick="deleteArea('${id}')" class="text-red-500 hover:text-red-700 p-1 transition cursor-pointer"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
  });
}

export async function deleteArea(id) {
  if (confirm("මෙම Floor Area එක මකා දැමීමට අවශ්‍යද?")) {
    if (erpState.areas) delete erpState.areas[id];
    renderAreaListModalUI();
    renderAreaFiltersUI();
    populateTableAreaDropdown();

    if (dbRef && removeFn && currentTenant && navigator.onLine) {
      try {
        await removeFn(dbRef(`tenants/${currentTenant}/areas/${id}`));
      } catch (e) {}
    }
    showLiveToast("🗑️ Area Removed", "කලාපය සාර්ථකව ඉවත් කරන ලදී.", "warning", "fa-trash");
  }
}

export function renderAreaFiltersUI() {
  const container = document.getElementById("tableAreaFilters");
  if (!container) return;
  container.innerHTML = "";
  
  const allBtn = document.createElement("button");
  allBtn.className = `px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition text-xs cursor-pointer ${
    currentAreaFilter === "ALL" ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
  }`;
  allBtn.innerText = "All Areas (සියල්ල)";
  allBtn.onclick = () => filterTableByArea("ALL");
  container.appendChild(allBtn);
  
  Object.entries(erpState.areas || {}).forEach(([id, area]) => {
    const btn = document.createElement("button");
    btn.className = `px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition text-xs cursor-pointer ${
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

// ==========================================================================
// 2. TABLES MANAGEMENT & EDIT MODALS
// ==========================================================================

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
  setTimeout(() => document.getElementById("tableNoInput")?.focus(), 50);
}

// ⚙️ FAST EDIT TABLE DIRECTLY FROM FLOOR PLAN (BY NUMBER)
export function editTableByNumber(numStr) {
  const cleanNum = extractTableNum(numStr);
  const foundEntry = Object.entries(erpState.tables || {}).find(([id, t]) => {
    return extractTableNum(t.tableNo) === cleanNum;
  });

  if (foundEntry) {
    openTableModal('edit', foundEntry[0]);
  } else {
    // If not registered in database yet, open Add Table modal with pre-filled number
    openTableModal('add');
    const noIn = document.getElementById("tableNoInput");
    if (noIn) noIn.value = numStr;
  }
}

export function closeTableModal() {
  document.getElementById("tableModal")?.classList.add("hidden");
}

export async function handleTableSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById("editTableId")?.value;
  const noIn = document.getElementById("tableNoInput");
  const tableData = {
    tableNo: noIn?.value.trim() || "",
    area: document.getElementById("tableAreaSelect")?.value || "Main Dining",
    capacity: parseInt(document.getElementById("tableCapacity")?.value || 4),
    assignedWaiter: document.getElementById("tableWaiterSelect")?.value || "",
    status: editId && erpState.tables[editId] ? erpState.tables[editId].status : "Available",
    updatedAt: new Date().toISOString()
  };
  
  if (!tableData.tableNo) {
    showLiveToast("⚠️ අඩුපාඩුවක්", "කරුණාකර Table Number එක ඇතුළත් කරන්න.", "warning", "fa-chair");
    if (noIn) noIn.focus();
    return;
  }
  
  const targetId = editId || ("tbl_" + Date.now());
  if (!erpState.tables) erpState.tables = {};
  erpState.tables[targetId] = tableData;

  closeTableModal();
  renderTablesFloorGrid();

  try {
    if (dbRef && currentTenant && navigator.onLine) {
      if (editId && updateFn) {
        await updateFn(dbRef(`tenants/${currentTenant}/tables/${editId}`), tableData);
      } else if (pushFn) {
        await pushFn(dbRef(`tenants/${currentTenant}/tables`), tableData);
      }
    }
    showLiveToast("🍽️ Table Saved", `Table ${tableData.tableNo} සාර්ථකව සේව් විය.`, "success", "fa-chair");
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "මේසය සේව් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// ==========================================================================
// 3. ARCHITECTURAL FLOOR PLAN GRID (REAL-TIME OCCUPIED RED & EDIT TOGGLE)
// ==========================================================================

export function setFloorPlanMode(mode) {
  currentFloorPlanMode = mode;
  const orderBtn = document.getElementById("fpModeOrderBtn");
  const editBtn = document.getElementById("fpModeEditBtn");
  const banner = document.getElementById("fpModeBanner");

  if (mode === "edit") {
    if (editBtn) editBtn.className = "px-3 py-1.5 rounded-xl font-black bg-amber-500 text-white shadow-xs cursor-pointer";
    if (orderBtn) orderBtn.className = "px-3 py-1.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 cursor-pointer";
    if (banner) banner.classList.remove("hidden");
    showLiveToast("⚙️ Table Edit Mode Active", "වෙනස් කිරීමට අවශ්‍ය මේසය මත Touch කරන්න.", "info", "fa-pen-to-square");
  } else {
    if (orderBtn) orderBtn.className = "px-3 py-1.5 rounded-xl font-black bg-blue-600 text-white shadow-xs cursor-pointer";
    if (editBtn) editBtn.className = "px-3 py-1.5 rounded-xl font-bold text-slate-600 hover:text-slate-900 cursor-pointer";
    if (banner) banner.classList.add("hidden");
  }
}

export function handleTableClick(no) {
  if (currentFloorPlanMode === "edit") {
    editTableByNumber(no);
  } else {
    linkTableToPos(no);
  }
}

export function renderTablesFloorGrid() {
  const container = document.getElementById("tablesGrid");
  if (!container) return;
  container.innerHTML = "";

  const activeBills = erpState.activeBills || {};
  const tablesObj = erpState.tables || {};
  const kitchenOrders = erpState.kitchenOrders || {};

  // 🛡️ Helper: Matches '01' with '1', 'Table 01', 'T-01' etc.
  function getTableData(numStr) {
    const cleanNum = extractTableNum(numStr);
    const foundEntry = Object.entries(tablesObj).find(([id, t]) => {
      const tNo = extractTableNum(t.tableNo);
      return tNo === cleanNum;
    });

    if (foundEntry) {
      return { id: foundEntry[0], ...foundEntry[1], tableNo: numStr };
    }
    return {
      id: null,
      tableNo: numStr,
      status: "Available",
      assignedWaiter: "",
      capacity: 4,
      area: "Main Hall"
    };
  }

  // 🔗 MERGE STATUS DETECTOR
  function getTableMergeInfo(tableData) {
    const targetNum = extractTableNum(tableData.tableNo);
    if (targetNum === null) return { isMergedSource: false, isMergedTarget: false, mergedInto: "", mergedWith: [] };

    // 1. Check if this table was merged INTO another table (Source)
    if (tableData.status === "Merged" && tableData.mergedInto) {
      return { isMergedSource: true, isMergedTarget: false, mergedInto: tableData.mergedInto, mergedWith: [] };
    }
    for (const b of Object.values(activeBills)) {
      if (b.mergedTables && Array.isArray(b.mergedTables) && b.mergedTables.some(m => extractTableNum(m) === targetNum)) {
        return { isMergedSource: true, isMergedTarget: false, mergedInto: b.tableNo, mergedWith: [] };
      }
    }
    for (const t of Object.values(tablesObj)) {
      if (t.mergedWith && Array.isArray(t.mergedWith) && t.mergedWith.some(m => extractTableNum(m) === targetNum)) {
        return { isMergedSource: true, isMergedTarget: false, mergedInto: t.tableNo, mergedWith: [] };
      }
    }

    // 2. Check if this table HAS other tables merged into it (Target / Host)
    if (tableData.mergedWith && Array.isArray(tableData.mergedWith) && tableData.mergedWith.length > 0) {
      return { isMergedSource: false, isMergedTarget: true, mergedInto: "", mergedWith: tableData.mergedWith };
    }
    for (const b of Object.values(activeBills)) {
      const bNum = extractTableNum(b.tableNo);
      if (bNum === targetNum && b.mergedTables && Array.isArray(b.mergedTables) && b.mergedTables.length > 0) {
        return { isMergedSource: false, isMergedTarget: true, mergedInto: "", mergedWith: b.mergedTables };
      }
    }

    return { isMergedSource: false, isMergedTarget: false, mergedInto: "", mergedWith: [] };
  }

  // 🔴 100% BULLETPROOF REAL-TIME OCCUPANCY CHECK
  function isTableOccupied(tableData) {
    const targetNum = extractTableNum(tableData.tableNo);
    if (targetNum === null) return false;

    // 1. Status marked Occupied in Database
    if (tableData.status === "Occupied") return true;

    // 2. Active Bills check (if cart has items for this table)
    for (const b of Object.values(activeBills)) {
      const bNum = extractTableNum(b.tableNo);
      if (bNum === targetNum && b.cart && b.cart.length > 0) {
        return true;
      }
    }

    // 3. Kitchen Orders check (if any order is currently Cooking for this table)
    for (const k of Object.values(kitchenOrders)) {
      const kNum = extractTableNum(k.tableNo);
      if (kNum === targetNum && k.status === "Cooking") {
        return true;
      }
    }

    return false;
  }

  // 📐 36 TABLES EXACT BLUEPRINT COORDINATES (viewBox="0 0 940 480")
  const tableLayoutConfig = [
    // Top-Left Booths (01-03 over 04-06)
    { no: "01", type: "booth", x: 42,  y: 45 },
    { no: "02", type: "booth", x: 92,  y: 45 },
    { no: "03", type: "booth", x: 142, y: 45 },
    { no: "04", type: "booth", x: 42,  y: 145 },
    { no: "05", type: "booth", x: 92,  y: 145 },
    { no: "06", type: "booth", x: 142, y: 145 },

    // Center-Left Top Booths (17, 18 over 19, 20)
    { no: "17", type: "booth", x: 215, y: 45 },
    { no: "18", type: "booth", x: 265, y: 45 },
    { no: "19", type: "booth", x: 215, y: 145 },
    { no: "20", type: "booth", x: 265, y: 145 },

    // Bottom-Left Booths (07-09 over 10-12)
    { no: "07", type: "booth", x: 42,  y: 295 },
    { no: "08", type: "booth", x: 92,  y: 295 },
    { no: "09", type: "booth", x: 142, y: 295 },
    { no: "10", type: "booth", x: 42,  y: 395 },
    { no: "11", type: "booth", x: 92,  y: 395 },
    { no: "12", type: "booth", x: 142, y: 395 },

    // Special Tables: 13 (Horizontal), 14 (Family 4-Seater), 16 (Round 6-Seater)
    { no: "13", type: "horiz-2", x: 205, y: 300 },
    { no: "14", type: "family-4", x: 205, y: 375 },
    { no: "16", type: "round-6", x: 310, y: 410 },

    // Center Dining Hall (4x3 Grid)
    // Row 1: 25, 26, 27, 28
    { no: "25", type: "cross-4", x: 405, y: 65 },
    { no: "26", type: "cross-4", x: 495, y: 65 },
    { no: "27", type: "cross-4", x: 585, y: 65 },
    { no: "28", type: "cross-4", x: 675, y: 65 },

    // Row 2: 21, 22, 23, 24
    { no: "21", type: "cross-4", x: 405, y: 185 },
    { no: "22", type: "cross-4", x: 495, y: 185 },
    { no: "23", type: "cross-4", x: 585, y: 185 },
    { no: "24", type: "cross-4", x: 675, y: 185 },

    // Row 3: 29, 30 (Vertical Rect), 31, 32
    { no: "29", type: "cross-4", x: 405, y: 395 },
    { no: "30", type: "rect-4",  x: 495, y: 395 },
    { no: "31", type: "cross-4", x: 585, y: 395 },
    { no: "32", type: "cross-4", x: 675, y: 395 },

    // Far Right Terrace Column (33, 34, 35, 36)
    { no: "33", type: "cross-4", x: 805, y: 65 },
    { no: "34", type: "cross-4", x: 805, y: 185 },
    { no: "35", type: "cross-4", x: 805, y: 295 },
    { no: "36", type: "cross-4", x: 805, y: 395 }
  ];

  // 🪑 GENERATE SVG SHAPE (HIGHLIGHTS MERGED PURPLE & OCCUPIED RED)
  function generateTableSvg(tCfg, tData, occupied, matchesArea, mergeInfo) {
    const { no, type, x, y } = tCfg;
    const { isMergedSource, isMergedTarget, mergedInto, mergedWith } = mergeInfo;

    const tableBg = isMergedSource 
      ? "#8b5cf6" 
      : occupied 
        ? "#ef4444" 
        : "#ffffff";

    const tableStroke = isMergedSource 
      ? "#6d28d9" 
      : isMergedTarget 
        ? "#7c3aed" 
        : occupied 
          ? "#b91c1c" 
          : "#1e3a8a";

    const chairFill = isMergedSource 
      ? "#ddd6fe" 
      : occupied 
        ? "#fca5a5" 
        : "#e2e8f0";

    const chairStroke = isMergedSource 
      ? "#8b5cf6" 
      : occupied 
        ? "#ef4444" 
        : "#3b82f6";

    const textColor = (isMergedSource || occupied) ? "#ffffff" : "#0f172a";
    const opacityAttr = matchesArea ? "1" : "0.3";

    // 🔗 Visual Merge Indicator Badge
    const mergeBadgeText = isMergedSource 
      ? `🔗 T-${mergedInto}` 
      : isMergedTarget 
        ? `🔗 +${mergedWith.join(',')}` 
        : "";

    let shapes = "";

    // 1. BOOTH (VERTICAL 2-SEATER)
    if (type === "booth") {
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <path d="M ${x + 6} ${y} C ${x + 6} ${y - 12}, ${x + 26} ${y - 12}, ${x + 26} ${y} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <rect x="${x}" y="${y}" width="32" height="38" rx="4" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <path d="M ${x + 6} ${y + 38} C ${x + 6} ${y + 50}, ${x + 26} ${y + 50}, ${x + 26} ${y + 38} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <text x="${x + 16}" y="${y + 24}" font-size="13" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${x + 30}" cy="${y + 2}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${x + 16}" y="${y - 14}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${x + 16}" y="${y + 58}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }
    // 2. HORIZONTAL 2-SEATER (TABLE 13)
    else if (type === "horiz-2") {
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <path d="M ${x} ${y + 5} C ${x - 11} ${y + 5}, ${x - 11} ${y + 23}, ${x} ${y + 23} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <rect x="${x}" y="${y}" width="38" height="28" rx="4" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <path d="M ${x + 38} ${y + 5} C ${x + 49} ${y + 5}, ${x + 49} ${y + 23}, ${x + 38} ${y + 23} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <text x="${x + 19}" y="${y + 19}" font-size="13" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${x + 36}" cy="${y + 2}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${x + 19}" y="${y - 3}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${x + 19}" y="${y + 39}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }
    // 3. FAMILY TABLE (TABLE 14)
    else if (type === "family-4") {
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <path d="M ${x} ${y + 10} C ${x - 12} ${y + 10}, ${x - 12} ${y + 28}, ${x} ${y + 28} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x} ${y + 44} C ${x - 12} ${y + 44}, ${x - 12} ${y + 62}, ${x} ${y + 62} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <rect x="${x}" y="${y}" width="38" height="72" rx="4" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <path d="M ${x + 38} ${y + 10} C ${x + 50} ${y + 10}, ${x + 50} ${y + 28}, ${x + 38} ${y + 28} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x + 38} ${y + 44} C ${x + 50} ${y + 44}, ${x + 50} ${y + 62}, ${x + 38} ${y + 62} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <text x="${x + 19}" y="${y + 41}" font-size="15" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${x + 36}" cy="${y + 2}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${x + 19}" y="${y - 3}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${x + 19}" y="${y + 83}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }
    // 4. ROUND 6-SEATER TABLE (TABLE 16)
    else if (type === "round-6") {
      const cx = x;
      const cy = y;
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <circle cx="${cx}" cy="${cy - 28}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx + 25}" cy="${cy - 14}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx + 25}" cy="${cy + 14}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx}" cy="${cy + 28}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx - 25}" cy="${cy + 14}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx - 25}" cy="${cy - 14}" r="6.5" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <circle cx="${cx}" cy="${cy}" r="21" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <text x="${cx}" y="${cy + 5}" font-size="14" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${cx + 17}" cy="${cy - 16}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${cx}" y="${cy - 36}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${cx}" y="${cy + 43}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }
    // 5. VERTICAL RECTANGLE CROSS 4-SEATER (TABLE 30)
    else if (type === "rect-4") {
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <path d="M ${x + 6} ${y} C ${x + 6} ${y - 12}, ${x + 24} ${y - 12}, ${x + 24} ${y} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x + 6} ${y + 44} C ${x + 6} ${y + 56}, ${x + 24} ${y + 56}, ${x + 24} ${y + 44} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x} ${y + 13} C ${x - 12} ${y + 13}, ${x - 12} ${y + 31}, ${x} ${y + 31} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x + 30} ${y + 13} C ${x + 42} ${y + 13}, ${x + 42} ${y + 31}, ${x + 30} ${y + 31} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <rect x="${x}" y="${y}" width="30" height="44" rx="4" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <text x="${x + 15}" y="${y + 27}" font-size="13" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${x + 28}" cy="${y + 2}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${x + 15}" y="${y - 14}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${x + 15}" y="${y + 67}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }
    // 6. SQUARE CROSS 4-SEATER
    else {
      shapes = `
        <g class="cursor-pointer transition-transform duration-100 hover:opacity-85" opacity="${opacityAttr}" onclick="handleTableClick('${no}')" oncontextmenu="event.preventDefault(); editTableByNumber('${no}')">
          <path d="M ${x + 8} ${y} C ${x + 8} ${y - 12}, ${x + 28} ${y - 12}, ${x + 28} ${y} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x + 8} ${y + 36} C ${x + 8} ${y + 48}, ${x + 28} ${y + 48}, ${x + 28} ${y + 36} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x} ${y + 8} C ${x - 12} ${y + 8}, ${x - 12} ${y + 28}, ${x} ${y + 28} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <path d="M ${x + 36} ${y + 8} C ${x + 48} ${y + 8}, ${x + 48} ${y + 28}, ${x + 36} ${y + 28} Z" fill="${chairFill}" stroke="${chairStroke}" stroke-width="1.8" />
          <rect x="${x}" y="${y}" width="36" height="36" rx="4" fill="${tableBg}" stroke="${tableStroke}" stroke-width="${isMergedTarget ? '2.8' : '2'}" />
          <text x="${x + 18}" y="${y + 23}" font-size="13" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${no}</text>
          ${occupied || isMergedSource ? `<circle cx="${x + 34}" cy="${y + 2}" r="5" fill="${isMergedSource ? '#8b5cf6' : '#ef4444'}" stroke="#ffffff" stroke-width="1.5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
          ${mergeBadgeText ? `<text x="${x + 18}" y="${y - 14}" font-size="8.5" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#7c3aed">${mergeBadgeText}</text>` : ''}
          ${tData.assignedWaiter ? `<text x="${x + 18}" y="${y + 57}" font-size="8.5" font-weight="800" font-family="-apple-system, sans-serif" text-anchor="middle" fill="#475569">${tData.assignedWaiter.split(' ')[0]}</text>` : ''}
        </g>
      `;
    }

    return shapes;
  }

  // 🖼️ RENDER ALL 36 TABLES DIRECTLY INTO THE UNIFIED VECTOR CANVAS
  let allSvgElements = "";
  tableLayoutConfig.forEach(cfg => {
    const tData = getTableData(cfg.no);
    const occupied = isTableOccupied(tData);
    const mergeInfo = getTableMergeInfo(tData);
    const matchesArea = (currentAreaFilter === "ALL" || (tData.area && tData.area === currentAreaFilter));
    allSvgElements += generateTableSvg(cfg, tData, occupied, matchesArea, mergeInfo);
  });

  const floorPlanWrapper = document.createElement("div");
  floorPlanWrapper.className = "w-full bg-slate-50 border-2 border-slate-300 rounded-3xl p-4 sm:p-6 shadow-inner flex flex-col justify-between";

  floorPlanWrapper.innerHTML = `
    <!-- EDIT MODE ACTIVE ALERT BANNER -->
    <div id="fpModeBanner" class="${currentFloorPlanMode === 'edit' ? '' : 'hidden'} mb-3 p-2 bg-amber-500 text-white rounded-xl text-center font-bold text-xs shadow-xs flex items-center justify-center gap-2 animate-pulse">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>Edit Mode Active: වෙනස් කිරීමට අවශ්‍ය මේසය මත Touch / Click කරන්න.</span>
      <button type="button" onclick="setFloorPlanMode('order')" class="ml-2 px-2 py-0.5 bg-black/30 hover:bg-black/50 text-white rounded-md text-[10px]">Close Edit</button>
    </div>

    <!-- UNIFIED RESPONSIVE BLUEPRINT SVG (NEVER OVERFLOWS & GUARANTEES FIT) -->
    <div class="w-full flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 940 480" class="w-full h-auto max-h-[72vh] select-none">
        ${allSvgElements}
      </svg>
    </div>

    <!-- BOTTOM CONTROLS & MODE TOGGLE (BILLING VS EDIT) -->
    <div class="mt-4 pt-3 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs font-bold text-slate-500 gap-3">
      
      <!-- OCCUPANCY & MERGE LEGEND -->
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="w-3.5 h-3.5 bg-white border-2 border-blue-900 rounded-sm"></span>
          <span>Available (හිස් මේස)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3.5 h-3.5 bg-red-500 border-2 border-red-700 rounded-sm animate-pulse"></span>
          <span class="text-red-700 font-black">Occupied (කෑම ඇණවුම් සහිත)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3.5 h-3.5 bg-purple-600 border-2 border-purple-800 rounded-sm animate-pulse"></span>
          <span class="text-purple-700 font-black">Merged (🔗 එකතු කළ මේස)</span>
        </div>
      </div>

      <!-- TOUCH POS MODE SELECTOR & ACTIONS -->
      <div class="flex items-center gap-2.5">
        <!-- MODE TOGGLE (ORDER VS EDIT) -->
        <div class="flex bg-slate-200 p-1 rounded-2xl text-[11px] font-bold">
          <button type="button" onclick="setFloorPlanMode('order')" id="fpModeOrderBtn" class="px-3 py-1 rounded-xl transition ${currentFloorPlanMode === 'order' ? 'bg-blue-600 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'} cursor-pointer">
            🍽️ Order Mode
          </button>
          <button type="button" onclick="setFloorPlanMode('edit')" id="fpModeEditBtn" class="px-3 py-1 rounded-xl transition ${currentFloorPlanMode === 'edit' ? 'bg-amber-500 text-white shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'} cursor-pointer">
            ⚙️ Edit Mode
          </button>
        </div>

        <button type="button" onclick="openMergeTableModal()" class="px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-700 rounded-xl transition shadow-xs cursor-pointer font-bold text-xs">
          <i class="fa-solid fa-object-group text-purple-600 mr-1"></i> Merge
        </button>
        <span class="font-bold text-slate-600 hidden sm:inline">Total: 36 Tables</span>
      </div>

    </div>
  `;

  container.appendChild(floorPlanWrapper);
}

// 🔄 AUTO-REFRESH FLOOR PLAN ON SIDEBAR NAVIGATION
if (typeof document !== "undefined") {
  document.getElementById("nav-tables")?.addEventListener("click", () => {
    setTimeout(renderTablesFloorGrid, 60);
  });
}

// ==========================================================================
// 4. INSTANT TABLE-TO-POS LINK & ACTIONS ENGINE (AUTO-MERGE ROUTING)
// ==========================================================================

export function linkTableToPos(tableNo) {
  // 🛡️ Table එකෙන් POS එකට යනවිට Print Bill / WhatsApp Bill සඟවයි (Method 01)
  if (window.setTableOrderMode) {
    window.setTableOrderMode(true);
  }

  if (!erpState.activeBills) erpState.activeBills = {};
  const targetNum = extractTableNum(tableNo);
  
  // 🛡️ Auto-redirect to parent table if this table was merged
  let actualTableNo = tableNo;
  const matchedTbl = Object.values(erpState.tables || {}).find(t => extractTableNum(t.tableNo) === targetNum);
  if (matchedTbl && matchedTbl.status === "Merged" && matchedTbl.mergedInto) {
    actualTableNo = matchedTbl.mergedInto;
    showLiveToast("🔗 Merged Table", `Table ${tableNo} එක Table ${actualTableNo} සමඟ Merge කර ඇත.`, "info", "fa-object-group");
  } else {
    const parentBill = Object.values(erpState.activeBills).find(b => 
      b.mergedTables && Array.isArray(b.mergedTables) && b.mergedTables.some(m => extractTableNum(m) === targetNum)
    );
    if (parentBill && parentBill.tableNo) {
      actualTableNo = parentBill.tableNo;
      showLiveToast("🔗 Merged Table", `Table ${tableNo} එක Table ${actualTableNo} සමඟ Merge කර ඇත.`, "info", "fa-object-group");
    }
  }

  const finalTargetNum = extractTableNum(actualTableNo);
  
  let matchedBillKey = Object.keys(erpState.activeBills).find(k => {
    const bNo = extractTableNum(erpState.activeBills[k].tableNo);
    return bNo === finalTargetNum;
  });
  
  if (!matchedBillKey) {
    matchedBillKey = "bill_" + Date.now();
    const newBillPayload = {
      name: `Table ${actualTableNo}`,
      orderType: "Dine-in",
      tableNo: actualTableNo,
      waiterName: "",
      cart: [],
      discountType: "fixed",
      discountVal: 0,
      loyaltyPointsRedeemed: 0,
      selectedPayMethod: "cash",
      updatedAt: new Date().toISOString()
    };

    const tObj = Object.values(erpState.tables || {}).find(t => {
      const tNo = extractTableNum(t.tableNo);
      return tNo === finalTargetNum;
    });

    if (tObj && tObj.assignedWaiter) {
      newBillPayload.waiterName = tObj.assignedWaiter;
    }

    erpState.activeBills[matchedBillKey] = newBillPayload;

    if (navigator.onLine && dbRef && setFn && currentTenant) {
      setFn(dbRef(`tenants/${currentTenant}/activeBills/${matchedBillKey}`), newBillPayload).catch(() => {});
    }
  }

  const matchedTableEntry = Object.entries(erpState.tables || {}).find(([id, t]) => {
    const tNo = extractTableNum(t.tableNo);
    return tNo === finalTargetNum;
  });

  if (matchedTableEntry && matchedTableEntry[1].status !== "Occupied") {
    matchedTableEntry[1].status = "Occupied";
    if (navigator.onLine && dbRef && updateFn && currentTenant) {
      updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTableEntry[0]}`), { status: "Occupied" }).catch(() => {});
    }
  }

  if (setActiveBillId) setActiveBillId(matchedBillKey);
  if (switchViewFn) switchViewFn("pos");
  if (renderBillTabsFn) renderBillTabsFn();
  if (syncActiveBillFn) syncActiveBillFn();
}

export async function deleteTable(id) {
  if (confirm("මෙම Table එක මකා දැමීමට අවශ්‍යද?")) {
    if (erpState.tables) delete erpState.tables[id];
    renderTablesFloorGrid();

    if (dbRef && removeFn && currentTenant && navigator.onLine) {
      try {
        await removeFn(dbRef(`tenants/${currentTenant}/tables/${id}`));
      } catch (e) {}
    }
    showLiveToast("🗑️ Table Removed", "මේසය සාර්ථකව මකා දමන ලදී.", "warning", "fa-trash");
  }
}

// ==========================================================================
// 5. MERGE TABLES ENGINE (SPECIFIC MERGE TRACKING & PERSISTENCE)
// ==========================================================================

export function openMergeTableModal() {
  const srcSel = document.getElementById("mergeSourceTableSelect");
  const tgtSel = document.getElementById("mergeTargetTableSelect");
  if (!srcSel || !tgtSel) return;
  
  srcSel.innerHTML = `<option value="">-- Source Table (අස්කරන මේසය) --</option>`;
  tgtSel.innerHTML = `<option value="">-- Target Table (එකතු වන මේසය) --</option>`;
  
  const allTablesList = [];
  for (let i = 1; i <= 36; i++) {
    const num = i < 10 ? `0${i}` : `${i}`;
    allTablesList.push(num);
  }
  
  allTablesList.forEach(tNo => {
    const tNum = extractTableNum(tNo);
    const tData = Object.values(erpState.tables || {}).find(t => extractTableNum(t.tableNo) === tNum) || { tableNo: tNo };
    const bill = Object.values(erpState.activeBills || {}).find(b => extractTableNum(b.tableNo) === tNum);
    const hasOrder = bill && bill.cart && bill.cart.length > 0;
    const isMerged = tData.status === "Merged" && tData.mergedInto;
    
    let label = `Table ${tNo}`;
    if (isMerged) {
      label += ` (🔗 Merged into T-${tData.mergedInto})`;
    } else if (tData.mergedWith && Array.isArray(tData.mergedWith) && tData.mergedWith.length > 0) {
      label += ` (🔗 Host: +${tData.mergedWith.join(', +')})`;
    } else if (hasOrder) {
      label += ` (Active Orders)`;
    }
    
    srcSel.innerHTML += `<option value="${tNo}">${label}</option>`;
    tgtSel.innerHTML += `<option value="${tNo}">${label}</option>`;
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
    showLiveToast("⚠️ අඩුපාඩුවක්", "කරුණාකර මේස දෙකම තෝරන්න.", "warning", "fa-object-group");
    return;
  }
  
  const srcNum = extractTableNum(srcTableNo);
  const tgtNum = extractTableNum(tgtTableNo);
  
  if (srcNum === tgtNum) {
    showLiveToast("⚠️ නොගැලපීමක්", "එකම මේසය තෝරාගත නොහැක. වෙනස් මේස දෙකක් තෝරන්න.", "warning", "fa-triangle-exclamation");
    return;
  }
  
  const activeBills = erpState.activeBills || {};
  const srcBillKey = Object.keys(activeBills).find(k => extractTableNum(activeBills[k].tableNo) === srcNum);
  let tgtBillKey = Object.keys(activeBills).find(k => extractTableNum(activeBills[k].tableNo) === tgtNum);
  
  const srcCart = (srcBillKey && activeBills[srcBillKey].cart) ? [...activeBills[srcBillKey].cart] : [];
  
  if (srcCart.length === 0) {
    showLiveToast("⚠️ ඇණවුම් නැත", `Table ${srcTableNo} හි එකතු කිරීමට කෑම ඇණවුම් කිසිවක් නොමැත.`, "warning", "fa-circle-exclamation");
    return;
  }
  
  try {
    if (!tgtBillKey) {
      tgtBillKey = "bill_" + Date.now();
      const newTgtPayload = {
        name: `Table ${tgtTableNo}`,
        orderType: "Dine-in",
        tableNo: tgtTableNo,
        cart: [],
        discountType: "fixed",
        discountVal: 0,
        selectedPayMethod: "cash",
        updatedAt: new Date().toISOString()
      };
      erpState.activeBills[tgtBillKey] = newTgtPayload;
      if (navigator.onLine && dbRef && setFn && currentTenant) {
        setFn(dbRef(`tenants/${currentTenant}/activeBills/${tgtBillKey}`), newTgtPayload).catch(() => {});
      }
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
    
    tgtBill.cart = mergedCart;
    
    // 🔗 Track merged tables in active bill
    const existingMerged = Array.isArray(tgtBill.mergedTables) ? tgtBill.mergedTables : [];
    const updatedMerged = Array.from(new Set([...existingMerged, srcTableNo]));
    tgtBill.mergedTables = updatedMerged;
    tgtBill.name = `Table ${tgtTableNo} (+${updatedMerged.join(', +')})`;
    
    if (srcBillKey) {
      delete erpState.activeBills[srcBillKey];
    }
    
    let srcTableEntry = Object.entries(erpState.tables || {}).find(([id, t]) => extractTableNum(t.tableNo) === srcNum);
    let tgtTableEntry = Object.entries(erpState.tables || {}).find(([id, t]) => extractTableNum(t.tableNo) === tgtNum);
    
    if (srcTableEntry) {
      srcTableEntry[1].status = "Merged";
      srcTableEntry[1].mergedInto = tgtTableNo;
      delete srcTableEntry[1].mergedWith;
    } else {
      const newSrcId = "tbl_" + Date.now();
      erpState.tables[newSrcId] = { tableNo: srcTableNo, status: "Merged", mergedInto: tgtTableNo };
      srcTableEntry = [newSrcId, erpState.tables[newSrcId]];
    }
    
    if (tgtTableEntry) {
      tgtTableEntry[1].status = "Occupied";
      tgtTableEntry[1].mergedWith = updatedMerged;
    } else {
      const newTgtId = "tbl_" + (Date.now() + 1);
      erpState.tables[newTgtId] = { tableNo: tgtTableNo, status: "Occupied", mergedWith: updatedMerged };
      tgtTableEntry = [newTgtId, erpState.tables[newTgtId]];
    }
    
    closeMergeTableModal();
    renderTablesFloorGrid();
    if (setActiveBillId) setActiveBillId(tgtBillKey);
    if (switchViewFn) switchViewFn("pos");
    if (renderBillTabsFn) renderBillTabsFn();
    if (syncActiveBillFn) syncActiveBillFn();
    
    if (navigator.onLine && dbRef && currentTenant) {
      if (updateFn) updateFn(dbRef(`tenants/${currentTenant}/activeBills/${tgtBillKey}`), {
        cart: mergedCart,
        mergedTables: updatedMerged,
        name: tgtBill.name
      }).catch(() => {});
      if (removeFn && srcBillKey) removeFn(dbRef(`tenants/${currentTenant}/activeBills/${srcBillKey}`)).catch(() => {});
      if (updateFn && srcTableEntry) updateFn(dbRef(`tenants/${currentTenant}/tables/${srcTableEntry[0]}`), {
        status: "Merged",
        mergedInto: tgtTableNo
      }).catch(() => {});
      if (updateFn && tgtTableEntry) updateFn(dbRef(`tenants/${currentTenant}/tables/${tgtTableEntry[0]}`), {
        status: "Occupied",
        mergedWith: updatedMerged
      }).catch(() => {});
    }
    
    showLiveToast("🍽️ Tables Merged", `Table ${srcTableNo} සාර්ථකව Table ${tgtTableNo} සමඟ Merge කරන ලදී.`, "success", "fa-object-group");
    
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Merge කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// ==========================================================================
// 6. GLOBAL WINDOW EXPORTS
// ==========================================================================
window.openAreaModal = openAreaModal;
window.closeAreaModal = closeAreaModal;
window.handleAddAreaSubmit = handleAddAreaSubmit;
window.deleteArea = deleteArea;
window.filterTableByArea = filterTableByArea;
window.openTableModal = openTableModal;
window.closeTableModal = closeTableModal;
window.handleTableSubmit = handleTableSubmit;
window.deleteTable = deleteTable;
window.linkTableToPos = linkTableToPos;
window.openMergeTableModal = openMergeTableModal;
window.closeMergeTableModal = closeMergeTableModal;
window.handleMergeTables = handleMergeTables;
window.renderTablesFloorGrid = renderTablesFloorGrid;
window.handleTableClick = handleTableClick;
window.editTableByNumber = editTableByNumber;
window.setFloorPlanMode = setFloorPlanMode;
