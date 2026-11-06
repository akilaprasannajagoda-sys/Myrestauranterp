// ==========================================================================
// MODULE 04: TABLE & FLOOR PLAN MANAGEMENT ENGINE (100% UNFREEZE & REAL-TIME)
// 🎨 ARCHITECTURAL RESTAURANT FLOOR PLAN ENGINE (EXACT CLIENT PHOTO REPLICA)
// 100% COMPATIBLE WITH EXISTING POS, BILLING & REALTIME FIREBASE LOGIC
// 📐 BALANCED PROPORTIONS - ZERO OVERLAPPING & PERFECT SCREEN FIT
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
// 2. TABLES MANAGEMENT & MODALS
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
// 3. ARCHITECTURAL FLOOR PLAN GRID (BALANCED PROPORTIONS - ZERO OVERLAP)
// ==========================================================================

export function renderTablesFloorGrid() {
  const container = document.getElementById("tablesGrid");
  if (!container) return;
  container.innerHTML = "";

  const activeBills = erpState.activeBills || {};
  const tablesObj = erpState.tables || {};

  function getTableData(numStr) {
    const cleanNum = parseInt(numStr, 10);
    const foundEntry = Object.entries(tablesObj).find(([id, t]) => {
      const tNo = String(t.tableNo || '').trim();
      return tNo === numStr || parseInt(tNo, 10) === cleanNum || tNo === `T-${numStr}`;
    });

    if (foundEntry) {
      return { id: foundEntry[0], ...foundEntry[1] };
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

  function isTableOccupied(tableData) {
    const matchedBill = Object.values(activeBills).find(b => {
      const bNo = String(b.tableNo || '').trim();
      return bNo === tableData.tableNo || parseInt(bNo, 10) === parseInt(tableData.tableNo, 10);
    });
    const hasActiveOrders = matchedBill && matchedBill.cart && matchedBill.cart.length > 0;
    return tableData.status === "Occupied" || hasActiveOrders;
  }

  // 🪑 PERFECTLY PROPORTIONED TABLES (SHARP VECTOR SVGs)
  function renderTableElement(numStr, type = "cross-4") {
    const tData = getTableData(numStr);
    const occupied = isTableOccupied(tData);
    const matchesArea = (currentAreaFilter === "ALL" || (tData.area && tData.area === currentAreaFilter));

    const wrap = document.createElement("div");
    wrap.className = `relative flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-150 transform hover:scale-105 active:scale-95 ${
      !matchesArea ? 'opacity-30 grayscale' : 'opacity-100'
    }`;
    wrap.onclick = () => linkTableToPos(tData.tableNo);

    const tableBg = occupied ? "#ef4444" : "#ffffff";
    const tableBorder = occupied ? "#b91c1c" : "#1e293b";
    const chairFill = occupied ? "#fca5a5" : "#e2e8f0";
    const chairBorder = occupied ? "#ef4444" : "#475569";
    const textColor = occupied ? "#ffffff" : "#0f172a";

    let svgContent = "";

    // 1. Vertical 2-Seater Booth (54x74)
    if (type === "vertical-2") {
      svgContent = `
        <svg width="54" height="74" viewBox="0 0 48 66" class="drop-shadow-xs">
          <path d="M12,12 C12,4 36,4 36,12 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <rect x="6" y="14" width="36" height="38" rx="5" fill="${tableBg}" stroke="${tableBorder}" stroke-width="2.2" />
          <path d="M12,54 C12,62 36,62 36,54 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <text x="24" y="38" font-size="14" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${numStr}</text>
        </svg>
      `;
    }
    // 2. Horizontal 2-Seater (Table 13: 74x50)
    else if (type === "horizontal-2") {
      svgContent = `
        <svg width="74" height="50" viewBox="0 0 68 46" class="drop-shadow-xs">
          <path d="M14,11 C6,11 6,35 14,35 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <rect x="16" y="7" width="36" height="32" rx="5" fill="${tableBg}" stroke="${tableBorder}" stroke-width="2.2" />
          <path d="M54,11 C62,11 62,35 54,35 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <text x="34" y="28" font-size="14" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${numStr}</text>
        </svg>
      `;
    }
    // 3. Large Vertical Family Table (Table 14: 74x98)
    else if (type === "rect-large") {
      svgContent = `
        <svg width="74" height="98" viewBox="0 0 66 88" class="drop-shadow-xs">
          <path d="M14,16 C6,16 6,34 14,34 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <path d="M14,54 C6,54 6,72 14,72 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <rect x="16" y="8" width="34" height="72" rx="5" fill="${tableBg}" stroke="${tableBorder}" stroke-width="2.2" />
          <path d="M52,16 C60,16 60,34 52,34 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <path d="M52,54 C60,54 60,72 52,72 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <text x="33" y="49" font-size="16" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${numStr}</text>
        </svg>
      `;
    }
    // 4. Round 6-Seater Table (Table 16: 84x84)
    else if (type === "round-6") {
      svgContent = `
        <svg width="84" height="84" viewBox="0 0 76 76" class="drop-shadow-xs">
          <circle cx="38" cy="8" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="64" cy="23" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="64" cy="53" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="38" cy="68" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="12" cy="53" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="12" cy="23" r="7" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <circle cx="38" cy="38" r="22" fill="${tableBg}" stroke="${tableBorder}" stroke-width="2.2" />
          <text x="38" y="44" font-size="15" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${numStr}</text>
        </svg>
      `;
    }
    // 5. Cross 4-Seater Square Tables (74x74 - ZERO OVERLAP)
    else {
      svgContent = `
        <svg width="74" height="74" viewBox="0 0 68 68" class="drop-shadow-xs">
          <path d="M22,14 C22,5 46,5 46,14 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <path d="M22,54 C22,63 46,63 46,54 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <path d="M14,22 C5,22 5,46 14,46 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <path d="M54,22 C63,22 63,46 54,46 Z" fill="${chairFill}" stroke="${chairBorder}" stroke-width="2" />
          <rect x="16" y="16" width="36" height="36" rx="5" fill="${tableBg}" stroke="${tableBorder}" stroke-width="2.2" />
          <text x="34" y="40" font-size="14" font-weight="900" font-family="-apple-system, sans-serif" text-anchor="middle" fill="${textColor}">${numStr}</text>
        </svg>
      `;
    }

    wrap.innerHTML = `
      ${svgContent}
      ${
        occupied
          ? `<span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
               <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
               <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
             </span>`
          : ''
      }
      <div class="h-4 flex items-center justify-center">
        ${
          tData.assignedWaiter
            ? `<span class="text-[9.5px] font-bold text-gray-600 truncate max-w-[68px] block bg-white/90 px-1 rounded border border-gray-200" title="${tData.assignedWaiter}">${tData.assignedWaiter}</span>`
            : ''
        }
      </div>
    `;

    return wrap;
  }

  // 🏗️ BALANCED FLOOR PLAN CONTAINER (NON-COLLAPSING SECTIONS)
  const floorPlanWrapper = document.createElement("div");
  floorPlanWrapper.className = "w-full bg-slate-50 border-2 border-slate-300 rounded-3xl p-5 sm:p-6 shadow-inner overflow-x-auto";

  floorPlanWrapper.innerHTML = `
    <!-- MAIN BLUEPRINT GRID: 3 DISTINCT NON-COLLAPSING COLUMNS -->
    <div class="flex items-start justify-between gap-4 lg:gap-8 min-w-fit">

      <!-- ================= SECTION 1: LEFT BOOTHS & SPECIAL TABLES ================= -->
      <div class="flex-shrink-0 flex flex-col gap-5">
        
        <!-- TOP: 01-06 (3 Cols) and 17-20 (2 Cols) -->
        <div class="flex items-start gap-4">
          <!-- Columns 01, 02, 03 & 04, 05, 06 -->
          <div class="grid grid-cols-3 gap-x-2.5 gap-y-4">
            <div id="tp-01"></div>
            <div id="tp-02"></div>
            <div id="tp-03"></div>
            <div id="tp-04"></div>
            <div id="tp-05"></div>
            <div id="tp-06"></div>
          </div>

          <!-- Columns 17, 18 & 19, 20 -->
          <div class="grid grid-cols-2 gap-x-2.5 gap-y-4 pl-1">
            <div id="tp-17"></div>
            <div id="tp-18"></div>
            <div id="tp-19"></div>
            <div id="tp-20"></div>
          </div>
        </div>

        <!-- BOTTOM: 07-12 (3 Cols), 13/14, and 16 (Round) -->
        <div class="flex items-end gap-4 pt-4 border-t-2 border-dashed border-slate-200">
          <!-- Columns 07, 08, 09 & 10, 11, 12 -->
          <div class="grid grid-cols-3 gap-x-2.5 gap-y-4">
            <div id="tp-07"></div>
            <div id="tp-08"></div>
            <div id="tp-09"></div>
            <div id="tp-10"></div>
            <div id="tp-11"></div>
            <div id="tp-12"></div>
          </div>

          <!-- Tables 13 (Horizontal) & 14 (Family Rect) -->
          <div class="flex flex-col items-center justify-end gap-3 pl-1">
            <div id="tp-13"></div>
            <div id="tp-14"></div>
          </div>

          <!-- Table 16 (Large Round Table) -->
          <div class="flex items-center justify-center pl-1 pb-1">
            <div id="tp-16"></div>
          </div>
        </div>

      </div>

      <!-- ================= SECTION 2: CENTER DINING HALL (NON-COLLAPSING 4x3 GRID) ================= -->
      <div class="flex-shrink-0 flex flex-col items-center justify-center px-4 lg:px-8 border-l-2 border-r-2 border-dashed border-slate-200">
        <div class="grid grid-cols-4 gap-x-3 sm:gap-x-4 lg:gap-x-6 gap-y-5 lg:gap-y-6">
          <!-- Row 1: 25, 26, 27, 28 -->
          <div id="tp-25"></div>
          <div id="tp-26"></div>
          <div id="tp-27"></div>
          <div id="tp-28"></div>

          <!-- Row 2: 21, 22, 23, 24 -->
          <div id="tp-21"></div>
          <div id="tp-22"></div>
          <div id="tp-23"></div>
          <div id="tp-24"></div>

          <!-- Row 3: 29, 30, 31, 32 -->
          <div id="tp-29"></div>
          <div id="tp-30"></div>
          <div id="tp-31"></div>
          <div id="tp-32"></div>
        </div>
      </div>

      <!-- ================= SECTION 3: RIGHT WALL / TERRACE (COLUMN) ================= -->
      <div class="flex-shrink-0 flex flex-col items-center justify-between gap-5 pl-1">
        <div id="tp-33"></div>
        <div id="tp-34"></div>
        <div id="tp-35"></div>
        <div id="tp-36"></div>
      </div>

    </div>

    <!-- BOTTOM LEGEND & FLOOR SUMMARY -->
    <div class="mt-6 pt-3.5 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs font-bold text-slate-500">
      <div class="flex items-center gap-5">
        <div class="flex items-center gap-1.5">
          <span class="w-3.5 h-3.5 bg-white border-2 border-slate-700 rounded-sm"></span>
          <span>Available (හිස් මේස)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3.5 h-3.5 bg-red-500 border-2 border-red-700 rounded-sm animate-pulse"></span>
          <span class="text-red-700 font-black">Occupied (කෑම ඇණවුම් සහිත)</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button type="button" onclick="openMergeTableModal()" class="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl transition shadow-xs cursor-pointer font-bold text-xs">
          <i class="fa-solid fa-object-group text-blue-600 mr-1"></i> Merge Tables
        </button>
        <span class="font-bold text-slate-600">Total: 36 Blueprint Tables</span>
      </div>
    </div>
  `;

  container.appendChild(floorPlanWrapper);

  const mountMap = {
    "01": "vertical-2", "02": "vertical-2", "03": "vertical-2",
    "04": "vertical-2", "05": "vertical-2", "06": "vertical-2",
    "17": "vertical-2", "18": "vertical-2",
    "19": "vertical-2", "20": "vertical-2",

    "07": "vertical-2", "08": "vertical-2", "09": "vertical-2",
    "10": "vertical-2", "11": "vertical-2", "12": "vertical-2",
    "13": "horizontal-2",
    "14": "rect-large",
    "16": "round-6",

    "25": "cross-4", "26": "cross-4", "27": "cross-4", "28": "cross-4",
    "21": "cross-4", "22": "cross-4", "23": "cross-4", "24": "cross-4",
    "29": "cross-4", "30": "cross-4", "31": "cross-4", "32": "cross-4",

    "33": "cross-4", "34": "cross-4", "35": "cross-4", "36": "cross-4"
  };

  Object.entries(mountMap).forEach(([numStr, type]) => {
    const slot = document.getElementById(`tp-${numStr}`);
    if (slot) {
      slot.appendChild(renderTableElement(numStr, type));
    }
  });
}

// ==========================================================================
// 4. INSTANT TABLE-TO-POS LINK & ACTIONS ENGINE
// ==========================================================================

export function linkTableToPos(tableNo) {
  if (!erpState.activeBills) erpState.activeBills = {};
  
  let matchedBillKey = Object.keys(erpState.activeBills).find(k => {
    const bNo = String(erpState.activeBills[k].tableNo || '').trim();
    return bNo === tableNo || parseInt(bNo, 10) === parseInt(tableNo, 10);
  });
  
  if (!matchedBillKey) {
    matchedBillKey = "bill_" + Date.now();
    const newBillPayload = {
      name: `Table ${tableNo}`,
      orderType: "Dine-in",
      tableNo: tableNo,
      waiterName: "",
      cart: [],
      discountType: "fixed",
      discountVal: 0,
      loyaltyPointsRedeemed: 0,
      selectedPayMethod: "cash",
      updatedAt: new Date().toISOString()
    };

    const tObj = Object.values(erpState.tables || {}).find(t => {
      const tNo = String(t.tableNo || '').trim();
      return tNo === tableNo || parseInt(tNo, 10) === parseInt(tableNo, 10);
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
    const tNo = String(t.tableNo || '').trim();
    return tNo === tableNo || parseInt(tNo, 10) === parseInt(tableNo, 10);
  });

  if (matchedTableEntry) {
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
// 5. MERGE TABLES ENGINE
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
    const tData = erpState.tables?.[`tbl_${tNo}`] || Object.values(erpState.tables || {}).find(t => String(t.tableNo) === tNo) || { tableNo: tNo };
    const bill = Object.values(erpState.activeBills || {}).find(b => String(b.tableNo) === tNo);
    const hasOrder = bill && bill.cart && bill.cart.length > 0;
    const label = `Table ${tNo} ${hasOrder ? '(Active Orders)' : ''}`;

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

  if (srcTableNo === tgtTableNo) {
    showLiveToast("⚠️ නොගැලපීමක්", "එකම මේසය තෝරාගත නොහැක. වෙනස් මේස දෙකක් තෝරන්න.", "warning", "fa-triangle-exclamation");
    return;
  }

  const activeBills = erpState.activeBills || {};
  const srcBillKey = Object.keys(activeBills).find(k => String(activeBills[k].tableNo) === srcTableNo);
  let tgtBillKey = Object.keys(activeBills).find(k => String(activeBills[k].tableNo) === tgtTableNo);

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

    if (srcBillKey) {
      delete erpState.activeBills[srcBillKey];
    }

    const srcTableObj = Object.entries(erpState.tables || {}).find(([id, t]) => String(t.tableNo) === srcTableNo);
    const tgtTableObj = Object.entries(erpState.tables || {}).find(([id, t]) => String(t.tableNo) === tgtTableNo);

    if (srcTableObj) srcTableObj[1].status = "Available";
    if (tgtTableObj) tgtTableObj[1].status = "Occupied";

    closeMergeTableModal();
    if (setActiveBillId) setActiveBillId(tgtBillKey);
    if (switchViewFn) switchViewFn("pos");
    if (renderBillTabsFn) renderBillTabsFn();
    if (syncActiveBillFn) syncActiveBillFn();

    if (navigator.onLine && dbRef && currentTenant) {
      if (updateFn) updateFn(dbRef(`tenants/${currentTenant}/activeBills/${tgtBillKey}`), { cart: mergedCart }).catch(() => {});
      if (removeFn && srcBillKey) removeFn(dbRef(`tenants/${currentTenant}/activeBills/${srcBillKey}`)).catch(() => {});
      if (updateFn && srcTableObj) updateFn(dbRef(`tenants/${currentTenant}/tables/${srcTableObj[0]}`), { status: "Available" }).catch(() => {});
      if (updateFn && tgtTableObj) updateFn(dbRef(`tenants/${currentTenant}/tables/${tgtTableObj[0]}`), { status: "Occupied" }).catch(() => {});
    }

    showLiveToast("🍽️ Tables Merged", `Table ${srcTableNo} හි ඇණවුම් සාර්ථකව Table ${tgtTableNo} වෙත එකතු විය.`, "success", "fa-object-group");

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
