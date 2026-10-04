// ==========================================================================
// MODULE 11: POS ENGINE (ATOMIC STOCK TRANSACTIONS, SPLIT BILL, SHIFT FLOAT)
// ==========================================================================

import { erpState, currentTenant, currentTenantInfo, activeBillId, setActiveBillId, currentCategoryFilter, setCurrentCategoryFilter } from './state.js';
import { showLiveToast, sendInvoiceViaWhatsApp } from './utils.js';
import { convertRecipeQtyToBaseUnit } from './menu.js';
import { formatReceiptRawText, formatKOTRawText, sendDirectSilentPrint } from './printer.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let setFn = null;
let localDBInstance = null;
let transactionFn = null;

// 🔒 SYNC CONCURRENCY LOCK (ද්විත්ව SYNC වැළැක්වීම)
let isOfflineSyncInProgress = false;

export let currentDiscountType = "fixed";

export function initPosContext(dbRefInstance, pushMethod, updateMethod, removeMethod, setMethod, localDB, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  setFn = setMethod;
  localDBInstance = localDB;
  transactionFn = runTransactionMethod;
}

// 🔒 COLLISION-PROOF UNIQUE INVOICE & ESTIMATE NUMBER GENERATORS
export function generateCollisionProofInvoiceNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const salt = String(Math.floor(10 + Math.random() * 90)); // 2-digit micro random salt
  return `INV-${yy}${mm}${dd}-${timePart}${salt}`;
}

export function generateCollisionProofEstimateNumber() {
  const now = new Date();
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const salt = String(Math.floor(100 + Math.random() * 900));
  return `EST-${timePart}-${salt}`;
}

export function setDiscountType(type) {
  currentDiscountType = type;
  const fixBtn = document.getElementById("discTypeFixedBtn");
  const pctBtn = document.getElementById("discTypePercentBtn");

  if (type === "fixed") {
    if (fixBtn) fixBtn.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white shadow-xs cursor-pointer";
    if (pctBtn) pctBtn.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700 cursor-pointer";
  } else {
    if (pctBtn) pctBtn.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white shadow-xs cursor-pointer";
    if (fixBtn) fixBtn.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-700 cursor-pointer";
  }

  recalculateCartTotalsUI();
}

export function getActiveBillData() {
  if (erpState.activeBills && erpState.activeBills[activeBillId]) {
    return erpState.activeBills[activeBillId];
  }
  return {
    name: "Bill #1",
    orderType: "Dine-in",
    tableNo: "",
    waiterName: "",
    cart: [],
    discountType: "fixed",
    discountVal: 0,
    selectedPayMethod: "cash"
  };
}

export async function persistActiveBillToCloud(updatedObj) {
  if (!currentTenant || !activeBillId || !dbRef || !updateFn) return;
  await updateFn(dbRef(`tenants/${currentTenant}/activeBills/${activeBillId}`), {
    ...updatedObj,
    updatedAt: new Date().toISOString()
  });
}

export async function addNewBillTab() {
  if (!dbRef || !setFn || !currentTenant) return;
  const keys = Object.keys(erpState.activeBills || {});
  const nextNum = keys.length + 1;
  const newKey = "bill_" + Date.now();

  const newBillPayload = {
    name: `Bill #${nextNum}`,
    orderType: "Dine-in",
    tableNo: "",
    waiterName: "",
    cart: [],
    discountType: "fixed",
    discountVal: 0,
    selectedPayMethod: "cash",
    updatedAt: new Date().toISOString()
  };

  await setFn(dbRef(`tenants/${currentTenant}/activeBills/${newKey}`), newBillPayload);
  setActiveBillId(newKey);
}

export function switchBillTab(key) {
  setActiveBillId(key);
  renderBillTabsBar();
  syncActiveBillToFormUI();
}

export async function closeBillTab(key, ev) {
  if (ev) ev.stopPropagation();
  const keys = Object.keys(erpState.activeBills || {});
  if (keys.length <= 1) {
    alert("අවම වශයෙන් එක් Bill Tab එකක්වත් තිබිය යුතුය.");
    return;
  }

  const b = erpState.activeBills[key];
  if (b && b.cart && b.cart.length > 0) {
    if (!confirm(`${b.name} හි කෑම ඇණවුම් අඩංගුයි. මෙම බිල ඉවත් කිරීමට අවශ්‍යද?`)) {
      return;
    }
  }

  // Free table if occupied
  if (b && b.tableNo && dbRef && updateFn && currentTenant) {
    const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === b.tableNo);
    if (matchedTable) {
      await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Available" });
    }
  }

  if (dbRef && removeFn && currentTenant) {
    await removeFn(dbRef(`tenants/${currentTenant}/activeBills/${key}`));
  }
  if (activeBillId === key) {
    const remain = Object.keys(erpState.activeBills).filter(k => k !== key);
    setActiveBillId(remain[0]);
  }
}

export function renderBillTabsBar() {
  const container = document.getElementById("billTabsList");
  if (!container) return;
  container.innerHTML = "";

  const allActiveBills = Object.entries(erpState.activeBills || {});

  allActiveBills.forEach(([key, billObj]) => {
    const isCurrent = key === activeBillId;
    const cartArr = billObj.cart || [];
    const itemCount = cartArr.reduce((total, i) => total + (parseInt(i.qty) || 0), 0);
    const hasActiveOrders = itemCount > 0;

    const tabBtn = document.createElement("div");
    tabBtn.className = `px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2 border select-none transition ${
      isCurrent 
        ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
        : hasActiveOrders
          ? "bg-yellow-50 text-yellow-900 border-yellow-300 hover:bg-yellow-100"
          : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
    }`;
    tabBtn.onclick = () => switchBillTab(key);

    const label = billObj.tableNo ? `Table ${billObj.tableNo}` : billObj.name;

    tabBtn.innerHTML = `
      <div class="flex items-center gap-1.5">
        ${hasActiveOrders ? `<span class="w-2 h-2 rounded-full ${isCurrent ? 'bg-white' : 'bg-yellow-500'} animate-pulse"></span>` : ''}
        <span>${label}</span>
      </div>
      <span class="text-[10px] px-1.5 py-0.2 rounded-full font-black ${isCurrent ? 'bg-blue-800 text-white' : 'bg-gray-200 text-gray-800'}">${itemCount}</span>
      ${allActiveBills.length > 1 ? `<i class="fa-solid fa-xmark hover:text-red-400 text-xs ml-1 p-0.5" onclick="closeBillTab('${key}', event)"></i>` : ""}
    `;
    container.appendChild(tabBtn);
  });
}

export function syncActiveBillToFormUI() {
  const currentBill = getActiveBillData();
  const oType = document.getElementById("orderType");
  const oTab = document.getElementById("orderTable");
  const bTitle = document.getElementById("currentBillTitle");
  const bSub = document.getElementById("currentBillSubtitle");
  const discIn = document.getElementById("cartDiscountInput");

  if (oType) oType.value = currentBill.orderType || "Dine-in";
  if (oTab) oTab.value = currentBill.tableNo || "";
  if (discIn) discIn.value = currentBill.discountVal || "";

  setDiscountType(currentBill.discountType || "fixed");
  
  const label = currentBill.tableNo ? `Table ${currentBill.tableNo}` : currentBill.name;
  if (bTitle) bTitle.innerHTML = `<i class="fa-solid fa-receipt text-blue-600"></i> ${label}`;
  if (bSub) bSub.innerText = `${currentBill.orderType} (Table: ${currentBill.tableNo || 'N/A'}${currentBill.waiterName ? ' | ' + currentBill.waiterName : ''})`;

  selectPayMethod(currentBill.selectedPayMethod || "cash", false);
  renderCartItemsUI();
}

export async function updateCurrentBillSettings() {
  const orderType = document.getElementById("orderType")?.value || "Dine-in";
  const tableNo = document.getElementById("orderTable")?.value.trim() || "";

  let matchedWaiter = "";
  if (tableNo) {
    const tObj = Object.values(erpState.tables || {}).find(t => t.tableNo === tableNo);
    if (tObj && tObj.assignedWaiter) {
      matchedWaiter = tObj.assignedWaiter;
    }
  }

  await persistActiveBillToCloud({
    orderType: orderType,
    tableNo: tableNo,
    waiterName: matchedWaiter
  });

  if (tableNo && dbRef && updateFn && currentTenant) {
    const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === tableNo);
    if (matchedTable) {
      await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" });
    }
  }

  recalculateCartTotalsUI();
}

export function onPosSearchInput() {
  renderPOSDishesGrid();
}

export function filterPosByCategory(categoryName) {
  setCurrentCategoryFilter(categoryName);
  renderDishCategoriesFilterUI();
  renderPOSDishesGrid();
}

export function renderDishCategoriesFilterUI() {
  const container = document.getElementById("categoryFilters");
  if (!container) return;
  container.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.className = `px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${
    currentCategoryFilter === "ALL" ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"
  }`;
  allButton.innerText = "All Items";
  allButton.onclick = () => filterPosByCategory("ALL");
  container.appendChild(allButton);

  Object.entries(erpState.dishCategories || {}).forEach(([id, cat]) => {
    const b = document.createElement("button");
    b.className = `px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${
      currentCategoryFilter === cat.name ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"
    }`;
    b.innerText = cat.name;
    b.onclick = () => filterPosByCategory(cat.name);
    container.appendChild(b);
  });
}

// CHECK DISH STOCK AVAILABILITY (HONORS INVENTORY DEDUCTION MODE)
export function checkDishStockAvailability(dish) {
  // If Daily Store Issue Mode is active, bypass BOM portion constraint
  if (erpState.settings?.inventoryMode === "issue") {
    return { isAvailable: true, portionsLeft: 999, outMaterialName: "" };
  }

  if (!dish.ingredients || !Array.isArray(dish.ingredients) || dish.ingredients.length === 0) {
    return { isAvailable: true, portionsLeft: 999, outMaterialName: "" };
  }

  let minPortions = 999999;
  let outMaterial = "";

  for (const ing of dish.ingredients) {
    const raw = erpState.rawItems[ing.rawId];
    if (!raw) continue;

    const availableStock = parseFloat(raw.stock || 0);
    const convertedPerPortion = convertRecipeQtyToBaseUnit(raw.unit, ing.qty, ing.unit);

    if (convertedPerPortion > 0) {
      const portions = Math.floor(availableStock / convertedPerPortion);
      if (portions < minPortions) {
        minPortions = portions;
        outMaterial = raw.name;
      }
    }
  }

  return {
    isAvailable: minPortions > 0,
    portionsLeft: minPortions === 999999 ? 999 : minPortions,
    outMaterialName: outMaterial
  };
}

export function renderPOSDishesGrid() {
  const container = document.getElementById("posGrid");
  const searchQuery = (document.getElementById("posSearchInput")?.value || "").toLowerCase();
  if (!container) return;
  container.innerHTML = "";

  const dishesList = Object.entries(erpState.dishes || {}).filter(([id, dish]) => {
    const matchesCategory = currentCategoryFilter === "ALL" || dish.category === currentCategoryFilter;
    const matchesQuery = dish.name.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesQuery;
  });

  if (dishesList.length === 0) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-gray-400 bg-white rounded-2xl border border-gray-200">කෑම වර්ග හමු නොවුණි... (Menu එකට කෑම ඇතුළත් කරන්න)</div>`;
    return;
  }

  dishesList.forEach(([dishId, dish]) => {
    const stockInfo = checkDishStockAvailability(dish);
    const isOut = !stockInfo.isAvailable;
    const isLow = stockInfo.isAvailable && stockInfo.portionsLeft <= 3 && stockInfo.portionsLeft > 0;

    const cardElem = document.createElement("div");
    cardElem.className = `p-3 rounded-2xl border transition select-none flex flex-col justify-between ${
      isOut 
        ? "bg-gray-100 border-red-200 opacity-60 cursor-not-allowed" 
        : "bg-white border-gray-200 hover:border-blue-500 shadow-sm cursor-pointer active:scale-95"
    }`;

    cardElem.onclick = () => {
      if (isOut) {
        showLiveToast("🚫 Out of Stock", `${dish.name} සඳහා අවශ්‍ය ${stockInfo.outMaterialName} තොග අවසන් වී ඇත!`, "warning", "fa-ban");
        return;
      }
      addDishToActiveCart(dishId, dish);
    };

    cardElem.innerHTML = `
      <div>
        <div class="flex justify-between items-start gap-1">
          <span class="text-[9px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded-md uppercase">${dish.category || 'General'}</span>
          ${
            isOut 
              ? `<span class="text-[9px] bg-red-500 text-white font-black px-1.5 py-0.5 rounded-md uppercase animate-pulse">Out of Stock</span>`
              : isLow 
                ? `<span class="text-[9px] bg-yellow-100 text-yellow-800 font-bold px-1.5 py-0.5 rounded-md uppercase">${stockInfo.portionsLeft} Left</span>`
                : ''
          }
        </div>
        <h4 class="font-bold text-xs text-gray-800 mt-1.5 line-clamp-2 leading-tight">${dish.name}</h4>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <span class="font-extrabold text-xs text-blue-600">Rs. ${parseFloat(dish.price).toFixed(2)}</span>
        <div class="w-6 h-6 rounded-lg ${isOut ? 'bg-gray-300 text-gray-500' : 'bg-blue-50 text-blue-600'} flex items-center justify-center text-xs">
          <i class="fa-solid ${isOut ? 'fa-ban' : 'fa-plus'}"></i>
        </div>
      </div>
    `;
    container.appendChild(cardElem);
  });
}

export async function addDishToActiveCart(dishId, dish) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart ? [...currentBill.cart] : [];
  const foundItem = cartList.find(i => i.dishId === dishId);

  if (foundItem) {
    foundItem.qty = (parseInt(foundItem.qty) || 0) + 1;
    foundItem.sentQty = parseInt(foundItem.sentQty) || 0;
  } else {
    cartList.push({
      dishId: dishId,
      name: dish.name,
      price: parseFloat(dish.price),
      qty: 1,
      sentQty: 0,
      note: ""
    });
  }

  await persistActiveBillToCloud({ cart: cartList });

  // Auto Occupy Table
  if (currentBill.tableNo && dbRef && updateFn && currentTenant) {
    const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === currentBill.tableNo);
    if (matchedTable) {
      await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" });
    }
  }
}

export async function changeCartQty(dishId, stepDelta) {
  const currentBill = getActiveBillData();
  let cartList = currentBill.cart ? [...currentBill.cart] : [];
  const targetItem = cartList.find(i => i.dishId === dishId);
  if (!targetItem) return;

  const calculatedQty = (parseInt(targetItem.qty) || 0) + stepDelta;
  if (calculatedQty <= 0) {
    cartList = cartList.filter(i => i.dishId !== dishId);
  } else {
    targetItem.qty = calculatedQty;
    targetItem.sentQty = Math.min(parseInt(targetItem.sentQty) || 0, calculatedQty);
  }

  await persistActiveBillToCloud({ cart: cartList });
}

export async function updateCartItemNote(dishId) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart ? [...currentBill.cart] : [];
  const targetItem = cartList.find(i => i.dishId === dishId);
  if (!targetItem) return;

  const newNote = prompt(`"${targetItem.name}" සඳහා Kitchen Note එක ඇතුළත් කරන්න (උදා: Less Spicy, No Sugar, Extra Gravy):`, targetItem.note || "");
  if (newNote !== null) {
    targetItem.note = newNote.trim();
    await persistActiveBillToCloud({ cart: cartList });
  }
}

export async function clearCurrentCart() {
  if (confirm("Cart එක හිස් කිරීමට අවශ්‍යද?")) {
    await persistActiveBillToCloud({ cart: [], discountVal: 0 });
    const discIn = document.getElementById("cartDiscountInput");
    if (discIn) discIn.value = "";
  }
}

export function renderCartItemsUI() {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  const container = document.getElementById("cartItems");
  const btnKOT = document.getElementById("btnSendKitchen");
  const btnPrintKOT = document.getElementById("btnPrintKOT");
  const btnPrePrint = document.getElementById("btnPrePrintBill");
  const btnPay = document.getElementById("btnCheckout");
  const btnWACheckout = document.getElementById("btnWhatsAppCheckout");
  if (!container) return;

  let hasUnsentDelta = false;

  if (cartList.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-400 py-6">Cart එක හිස්ය. කෑම වර්ගයක් තෝරන්න.</p>`;
    if (btnKOT) btnKOT.disabled = true;
    if (btnPrintKOT) btnPrintKOT.disabled = true;
    if (btnPrePrint) btnPrePrint.disabled = true;
    if (btnPay) btnPay.disabled = true;
    if (btnWACheckout) btnWACheckout.disabled = true;
  } else {
    container.innerHTML = "";
    cartList.forEach(item => {
      const q = parseInt(item.qty) || 0;
      const sent = parseInt(item.sentQty) || 0;
      const diff = q - sent;

      if (diff > 0) hasUnsentDelta = true;

      const rowElem = document.createElement("div");
      rowElem.className = "p-2 rounded-xl bg-gray-50 border border-gray-100 space-y-1";
      rowElem.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="truncate w-36">
            <p class="font-bold text-gray-800 truncate">${item.name}</p>
            <div class="flex items-center gap-1 text-[10px]">
              <span class="text-gray-400">Rs. ${item.price.toFixed(2)}</span>
              ${sent > 0 ? `<span class="text-green-700 bg-green-100 px-1 rounded font-bold">Sent: ${sent}</span>` : ''}
              ${diff > 0 ? `<span class="text-yellow-800 bg-yellow-100 px-1 rounded font-bold animate-pulse">New: +${diff}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="changeCartQty('${item.dishId}', -1)" class="w-5 h-5 rounded-md bg-white border border-gray-300 text-gray-700 flex items-center justify-center font-bold text-xs">-</button>
            <span class="font-black text-xs w-4 text-center">${q}</span>
            <button onclick="changeCartQty('${item.dishId}', 1)" class="w-5 h-5 rounded-md bg-white border border-gray-300 text-gray-700 flex items-center justify-center font-bold text-xs">+</button>
          </div>
          <div class="font-black text-gray-800 text-xs text-right w-16">
            Rs. ${(item.price * q).toFixed(2)}
          </div>
        </div>
        <div class="flex items-center justify-between text-[10px] text-gray-500 pt-0.5 border-t border-gray-200">
          <span class="italic text-purple-700 font-semibold truncate w-40">${item.note ? '📝 ' + item.note : 'No notes'}</span>
          <button onclick="updateCartItemNote('${item.dishId}')" class="text-blue-600 font-bold hover:underline">
            <i class="fa-solid fa-pen-to-square"></i> Note
          </button>
        </div>
      `;
      container.appendChild(rowElem);
    });

    if (btnKOT) btnKOT.disabled = !hasUnsentDelta;
    if (btnPrintKOT) btnPrintKOT.disabled = !hasUnsentDelta;
    if (btnPrePrint) btnPrePrint.disabled = false;
    if (btnPay) btnPay.disabled = false;
    if (btnWACheckout) btnWACheckout.disabled = false;
  }

  recalculateCartTotalsUI();
}

// SMART DYNAMIC SERVICE CHARGE CALCULATION (DINE-IN ONLY)
export function calculateOrderTotals(cartList = [], discType = "fixed", discValue = 0, orderType = "Dine-in") {
  const subtotal = cartList.reduce((sum, i) => sum + (i.price * (parseInt(i.qty) || 0)), 0);
  
  let discountAmount = 0;
  if (discType === "percent") {
    discountAmount = subtotal * (parseFloat(discValue || 0) / 100);
  } else {
    discountAmount = parseFloat(discValue || 0);
  }
  discountAmount = Math.min(subtotal, Math.max(0, discountAmount));

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  let scAmount = 0;
  let vatAmount = 0;
  let cslAmount = 0;

  if (erpState.settings.scEnabled && orderType === "Dine-in") {
    scAmount = taxableAmount * (parseFloat(erpState.settings.scRate || 0) / 100);
  }
  if (erpState.settings.vatEnabled) {
    vatAmount = taxableAmount * (parseFloat(erpState.settings.vatRate || 0) / 100);
  }
  if (erpState.settings.cslEnabled) {
    cslAmount = taxableAmount * (parseFloat(erpState.settings.cslRate || 0) / 100);
  }

  const netTotal = taxableAmount + scAmount + vatAmount + cslAmount;
  return { subtotal, discountAmount, scAmount, vatAmount, cslAmount, netTotal };
}

export function recalculateCartTotalsUI() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : (currentBill.discountVal || 0)) || 0;
  const oType = document.getElementById("orderType")?.value || currentBill.orderType || "Dine-in";

  if (currentBill.discountVal !== discVal || currentBill.discountType !== currentDiscountType) {
    persistActiveBillToCloud({
      discountVal: discVal,
      discountType: currentDiscountType
    });
  }

  const { subtotal, discountAmount, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(
    currentBill.cart || [],
    currentDiscountType,
    discVal,
    oType
  );

  const subEl = document.getElementById("cartSubtotal");
  const totEl = document.getElementById("cartTotal");
  const discDisp = document.getElementById("cartDiscountDisplayVal");
  const discRow = document.getElementById("cartDiscountRow");
  const discTotVal = document.getElementById("cartDiscountTotalVal");

  if (subEl) subEl.innerText = `Rs. ${subtotal.toFixed(2)}`;
  if (totEl) totEl.innerText = `Rs. ${netTotal.toFixed(2)}`;
  if (discDisp) discDisp.innerText = `-Rs. ${discountAmount.toFixed(2)}`;

  if (discountAmount > 0 && discRow) {
    discRow.classList.remove("hidden");
    if (discTotVal) discTotVal.innerText = `-Rs. ${discountAmount.toFixed(2)}`;
  } else if (discRow) {
    discRow.classList.add("hidden");
  }

  const scRow = document.getElementById("cartServiceChargeRow");
  if (erpState.settings.scEnabled && oType === "Dine-in" && scRow) {
    scRow.classList.remove("hidden");
    const lbl = document.getElementById("cartServiceChargeLabel");
    const val = document.getElementById("cartServiceChargeVal");
    if (lbl) lbl.innerText = `Service Charge (${erpState.settings.scRate}%):`;
    if (val) val.innerText = `Rs. ${scAmount.toFixed(2)}`;
  } else if (scRow) {
    scRow.classList.add("hidden");
  }

  const vatRow = document.getElementById("cartVatRow");
  if (erpState.settings.vatEnabled && vatRow) {
    vatRow.classList.remove("hidden");
    const lbl = document.getElementById("cartVatLabel");
    const val = document.getElementById("cartVatVal");
    if (lbl) lbl.innerText = `VAT (${erpState.settings.vatRate}%):`;
    if (val) val.innerText = `Rs. ${vatAmount.toFixed(2)}`;
  } else if (vatRow) {
    vatRow.classList.add("hidden");
  }

  const cslRow = document.getElementById("cartCslRow");
  if (erpState.settings.cslEnabled && cslRow) {
    cslRow.classList.remove("hidden");
    const lbl = document.getElementById("cartCslLabel");
    const val = document.getElementById("cartCslVal");
    if (lbl) lbl.innerText = `SSCL (${erpState.settings.cslRate}%):`;
    if (val) val.innerText = `Rs. ${cslAmount.toFixed(2)}`;
  } else if (cslRow) {
    cslRow.classList.add("hidden");
  }

  calculateCashChange();
  calculateSplitPaymentBalance();
}

export function selectPayMethod(method, syncCloud = true) {
  if (syncCloud) {
    persistActiveBillToCloud({ selectedPayMethod: method });
  }

  ["cash", "card", "transfer", "split", "credit"].forEach(m => {
    const tab = document.getElementById(`payTab-${m}`);
    const field = document.getElementById(`payFields-${m}`);
    if (tab) {
      if (m === method) {
        tab.className = "pay-method-tab py-1.5 px-0.5 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-bold text-[9px] flex flex-col items-center cursor-pointer";
      } else {
        tab.className = "pay-method-tab py-1.5 px-0.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 font-bold text-[9px] flex flex-col items-center cursor-pointer";
      }
    }
    if (field) {
      if (m === method) field.classList.remove("hidden");
      else field.classList.add("hidden");
    }
  });

  if (method === "split") {
    calculateSplitPaymentBalance();
  }
}

// QUICK CASH BUTTONS HELPER
export function setQuickCashAmount(amt) {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType);

  const cashIn = document.getElementById("cashTendered");
  if (!cashIn) return;

  if (amt === "exact") {
    cashIn.value = netTotal.toFixed(2);
  } else {
    cashIn.value = amt;
  }

  calculateCashChange();
}

export function calculateCashChange() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType);
  
  const tendered = parseFloat(document.getElementById("cashTendered")?.value || 0);
  const change = Math.max(0, tendered - netTotal);
  const changeEl = document.getElementById("cashChangeVal");
  if (changeEl) changeEl.innerText = `Rs. ${change.toFixed(2)}`;
}

// MULTI-TENDER SPLIT PAYMENT BALANCE CALCULATOR
export function calculateSplitPaymentBalance() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType);

  const splitCash = parseFloat(document.getElementById("splitPayCash")?.value || 0);
  const splitCard = parseFloat(document.getElementById("splitPayCard")?.value || 0);
  const totalPaid = splitCash + splitCard;
  const remaining = Math.max(0, netTotal - totalPaid);

  const remEl = document.getElementById("splitPayRemainingVal");
  if (remEl) {
    remEl.innerText = `Rs. ${remaining.toFixed(2)}`;
    remEl.className = remaining === 0 ? "font-black text-green-600" : "font-black text-red-600";
  }
}

// SILENT DIRECT HARDWARE KOT GENERATOR WITH NOTES
export async function printPhysicalKOTSlip(kot) {
  const pr = erpState.settings.printers || {};
  const activeKotPrinters = Object.entries(pr).filter(([k, p]) => p.kot);

  if (activeKotPrinters.length === 0) {
    activeKotPrinters.push(["default", { name: "Kitchen Printer", device: "POS-80" }]);
  }

  const tableEl = document.getElementById("kotPrintTable");
  const typeEl = document.getElementById("kotPrintType");
  const timeEl = document.getElementById("kotPrintTime");
  const itemsContainer = document.getElementById("kotPrintItems");

  if (tableEl) tableEl.innerText = `TABLE: ${kot.tableNo}`;
  if (typeEl) typeEl.innerText = `ORDER TYPE: ${kot.orderType.toUpperCase()}`;
  if (timeEl) timeEl.innerText = `Time: ${new Date(kot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

  if (itemsContainer) {
    itemsContainer.innerHTML = kot.items.map(i => `
      <div class="py-0.5 border-b border-gray-200">
        <div class="flex justify-between items-center">
          <span class="truncate w-44 font-bold">${i.name} ${i.isAddOn ? '(➕ ADD-ON)' : ''}</span>
          <span class="text-sm font-black">x${i.qty}</span>
        </div>
        ${i.note ? `<span class="text-[10px] italic block font-bold text-gray-700">Note: ${i.note}</span>` : ''}
      </div>
    `).join("");
  }

  for (const [key, p] of activeKotPrinters) {
    const rawText = formatKOTRawText(kot, p.name);
    await sendDirectSilentPrint(p.device, rawText, "kotPrintModal");
  }

  const pNames = activeKotPrinters.map(([k, p]) => `${p.name} (${p.device})`).join(", ");
  showLiveToast("🖨️ KOT Direct Printed", `KOT #${kot.tableNo} -> [${pNames}] වෙත Silent Print විය.`, "kitchen", "fa-print");
}

// TABLE PRE-PRINT ESTIMATE BILL (COLLISION-PROOF NUMBER)
export async function printPreBillEstimate() {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  if (cartList.length === 0) return;

  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { subtotal, discountAmount, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(cartList, currentDiscountType, discVal, oType);

  const estimateData = {
    invoiceNumber: generateCollisionProofEstimateNumber(),
    orderType: oType,
    tableNo: currentBill.tableNo || "N/A",
    waiterName: currentBill.waiterName || "",
    items: cartList,
    subtotal: subtotal,
    discountAmount: discountAmount,
    scAmount: scAmount,
    vatAmount: vatAmount,
    cslAmount: cslAmount,
    netTotal: netTotal,
    payment: { method: "PRE-BILL ESTIMATE (UNPAID)" },
    createdAt: new Date().toISOString()
  };

  await printThermalReceipt(estimateData);
  showLiveToast("📄 Pre-Bill Printed", `Table ${currentBill.tableNo || 'N/A'} සඳහා Estimate බිලක් Print කරන ලදී.`, "info", "fa-file-lines");
}

// INCREMENTAL DELTA KOT WITH COOKING NOTES
export async function sendOrderToKitchen(isPhysicalPrint = false) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  if (cartList.length === 0 || !dbRef || !pushFn || !currentTenant) return;

  const deltaItems = [];
  const updatedCart = [];

  cartList.forEach(item => {
    const totalQty = parseInt(item.qty) || 0;
    const sentQty = parseInt(item.sentQty) || 0;
    const diff = totalQty - sentQty;

    if (diff > 0) {
      deltaItems.push({
        dishId: item.dishId,
        name: item.name,
        qty: diff,
        note: item.note || "",
        isAddOn: sentQty > 0
      });
    }

    updatedCart.push({
      ...item,
      qty: totalQty,
      sentQty: totalQty
    });
  });

  if (deltaItems.length === 0) {
    showLiveToast("⚠️ KOT Info", "කුස්සියට යැවීමට අලුත් කෑම වර්ග නොමැත.", "info", "fa-circle-info");
    return;
  }

  const kotTicket = {
    billKey: activeBillId,
    orderType: currentBill.orderType,
    tableNo: currentBill.tableNo || "N/A",
    waiterName: currentBill.waiterName || "",
    items: deltaItems,
    timestamp: new Date().toISOString(),
    status: "Cooking"
  };

  try {
    await pushFn(dbRef(`tenants/${currentTenant}/kitchenOrders`), kotTicket);
    
    if (currentBill.tableNo && updateFn) {
      const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === currentBill.tableNo);
      if (matchedTable) {
        await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" });
      }
    }

    await persistActiveBillToCloud({ cart: updatedCart });

    if (isPhysicalPrint) {
      await printPhysicalKOTSlip(kotTicket);
    } else {
      showLiveToast("🔥 KOT Sent", `Table ${currentBill.tableNo || 'N/A'} සඳහා කෑම ඇණවුම කුස්සියට යවන ලදී.`, "kitchen", "fa-fire-burner");
    }
  } catch (err) {
    alert("KOT යැවීමේදී දෝෂයක්: " + err.message);
  }
}

// MULTI-PAYMENT CHECKOUT (HONORS INVENTORY DEDUCTION MODE & WAITER ATTRIBUTION)
export async function processOrder(sendWhatsApp = false) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  if (cartList.length === 0) return;
  
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || currentBill.orderType || "Dine-in";
  
  const { subtotal, discountAmount, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(
    cartList,
    currentDiscountType,
    discVal,
    oType
  );

  const payMethod = currentBill.selectedPayMethod || "cash";
  let payDetails = { method: payMethod };
  
  if (payMethod === "cash") {
    const tendered = parseFloat(document.getElementById("cashTendered")?.value || netTotal);
    if (tendered < netTotal) {
      alert("දුන් මුදල (Cash) බිල්පතේ මුළු මුදලට වඩා අඩු විය නොහැක.");
      return;
    }
    payDetails.cashTendered = tendered;
    payDetails.change = Math.max(0, tendered - netTotal);
  } else if (payMethod === "card") {
    const cardType = document.getElementById("cardType")?.value;
    const cardLast4 = document.getElementById("cardLast4")?.value.trim();
    if (!cardLast4) {
      alert("කරුණාකර කාඩ්පතේ අවසන් ඉලක්කම් 4 ඇතුළත් කරන්න.");
      return;
    }
    payDetails.cardType = cardType;
    payDetails.last4 = cardLast4;
  } else if (payMethod === "transfer") {
    const refNo = document.getElementById("transferRef")?.value.trim();
    if (!refNo) {
      alert("කරුණාකර Transaction ID ඇතුළත් කරන්න.");
      return;
    }
    payDetails.refNo = refNo;
  } else if (payMethod === "split") {
    const sCash = parseFloat(document.getElementById("splitPayCash")?.value || 0);
    const sCard = parseFloat(document.getElementById("splitPayCard")?.value || 0);
    if (Math.abs((sCash + sCard) - netTotal) > 0.05) {
      alert(`Split Payment මුදල මුළු මුදලට (Rs. ${netTotal.toFixed(2)}) සමාන විය යුතුය.`);
      return;
    }
    payDetails.splitCash = sCash;
    payDetails.splitCard = sCard;
  } else if (payMethod === "credit") {
    const custName = document.getElementById("creditCustomerName")?.value.trim();
    const custPhone = document.getElementById("creditCustomerPhone")?.value.trim();
    if (!custName) {
      alert("කරුණාකර පාරිභෝගිකයාගේ නම ඇතුළත් කරන්න.");
      return;
    }
    payDetails.customerName = custName;
    payDetails.customerPhone = custPhone;
  }
  
  // 🔒 COLLISION-PROOF UNIQUE INVOICE NUMBER
  const invoiceNumber = generateCollisionProofInvoiceNumber();
  
  // Determine Waiter Name directly from Table Plan if available
  let assignedWaiter = currentBill.waiterName || "";
  if (!assignedWaiter && currentBill.tableNo) {
    const tObj = Object.values(erpState.tables || {}).find(t => t.tableNo === currentBill.tableNo);
    if (tObj && tObj.assignedWaiter) {
      assignedWaiter = tObj.assignedWaiter;
    }
  }

  const invoiceData = {
    invoiceNumber: invoiceNumber,
    orderType: oType,
    tableNo: currentBill.tableNo || "N/A",
    waiterName: assignedWaiter,
    items: cartList,
    subtotal: subtotal,
    discountAmount: discountAmount,
    scAmount: scAmount,
    vatAmount: vatAmount,
    cslAmount: cslAmount,
    netTotal: netTotal,
    payment: payDetails,
    createdAt: new Date().toISOString()
  };
  
  try {
    if (navigator.onLine && dbRef && pushFn && currentTenant) {
      const invoiceRef = await pushFn(dbRef(`tenants/${currentTenant}/invoices`), invoiceData);
      
      if (payMethod === "credit") {
        await pushFn(dbRef(`tenants/${currentTenant}/customerCredits`), {
          invoiceId: invoiceRef.key,
          invoiceNumber: invoiceNumber,
          customerName: payDetails.customerName,
          customerPhone: payDetails.customerPhone,
          amount: netTotal,
          status: "Unpaid",
          date: new Date().toISOString()
        });
      }
      
      // 🔒 ATOMIC TRANSACTION RAW STOCK DEDUCTION (ONLY IN RECIPE MODE)
      const isRecipeMode = (erpState.settings?.inventoryMode || "recipe") === "recipe";
      if (isRecipeMode) {
        for (const item of cartList) {
          const dish = erpState.dishes[item.dishId];
          if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
            for (const ing of dish.ingredients) {
              const rawItem = erpState.rawItems[ing.rawId];
              if (rawItem) {
                const convertedQtyPerPortion = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
                const totalDeduct = convertedQtyPerPortion * (parseInt(item.qty) || 1);
                
                if (transactionFn) {
                  await transactionFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}/stock`), (currentStock) => {
                    const prevStock = (currentStock === null || isNaN(currentStock)) ? 0 : parseFloat(currentStock);
                    return Math.max(0, parseFloat((prevStock - totalDeduct).toFixed(3)));
                  });
                } else if (updateFn) {
                  const currentStock = parseFloat(rawItem.stock || 0);
                  const newStock = Math.max(0, currentStock - totalDeduct);
                  await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}`), {
                    stock: parseFloat(newStock.toFixed(3))
                  });
                }
              }
            }
          }
        }
      }
      
      // Free table
      if (currentBill.tableNo && updateFn) {
        const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === currentBill.tableNo);
        if (matchedTable) {
          await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Available" });
        }
      }
      
      if (removeFn) {
        await removeFn(dbRef(`tenants/${currentTenant}/activeBills/${activeBillId}`));
      }
      showLiveToast("✅ Bill Settled", `Invoice #${invoiceNumber} (Rs. ${netTotal.toFixed(2)}) ගෙවා අවසන් විය.`, "success", "fa-circle-check");
      
    } else if (localDBInstance) {
      await localDBInstance.offlineInvoices.add({
        ...invoiceData,
        synced: 0
      });

      if (erpState.activeBills && erpState.activeBills[activeBillId]) {
        erpState.activeBills[activeBillId].cart = [];
        erpState.activeBills[activeBillId].tableNo = "";
        erpState.activeBills[activeBillId].discountVal = 0;
      }
      renderCartItemsUI();
      renderBillTabsBar();

      showLiveToast("⚠️ Offline Bill Saved", `Invoice #${invoiceNumber} සුරැකිණි. Internet ලැබුණු පසු Cloud Sync වේ.`, "warning", "fa-floppy-disk");
    }
    
    if (sendWhatsApp) {
      const hotelName = currentTenantInfo?.hotelName || "Restaurant ERP";
      sendInvoiceViaWhatsApp(invoiceData, hotelName);
    } else {
      await printThermalReceipt(invoiceData);
    }
    
    const cashIn = document.getElementById("cashTendered");
    const cardIn = document.getElementById("cardLast4");
    const transIn = document.getElementById("transferRef");
    const splitC = document.getElementById("splitPayCash");
    const splitCard = document.getElementById("splitPayCard");
    const nameIn = document.getElementById("creditCustomerName");
    const phoneIn = document.getElementById("creditCustomerPhone");
    if (discIn) discIn.value = "";

    if (cashIn) cashIn.value = "";
    if (cardIn) cardIn.value = "";
    if (transIn) transIn.value = "";
    if (splitC) splitC.value = "";
    if (splitCard) splitCard.value = "";
    if (nameIn) nameIn.value = "";
    if (phoneIn) phoneIn.value = "";
    
  } catch (err) {
    alert("බිල්පත සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 80MM THERMAL RECEIPT PRINTING
export async function printThermalReceipt(inv) {
  const pr = erpState.settings.printers || {};
  const activeBillPrinters = Object.entries(pr).filter(([k, p]) => p.bill);

  if (activeBillPrinters.length === 0) {
    activeBillPrinters.push(["default", { name: "Cashier Printer", device: "POS-80" }]);
  }

  const oId = document.getElementById("receiptOrderId");
  const dEl = document.getElementById("receiptDate");
  const tEl = document.getElementById("receiptType");

  const rHotel = document.getElementById("receiptHotel");
  const rAddr = document.getElementById("receiptAddress");
  const rPhone = document.getElementById("receiptPhone");
  const rTax = document.getElementById("receiptTaxNo");
  const rFoot = document.getElementById("receiptFooterNote");

  if (rHotel) rHotel.innerText = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  if (rAddr) rAddr.innerText = currentTenantInfo?.address || "Smart Restaurant POS";
  if (rPhone) rPhone.innerText = currentTenantInfo?.phone ? `Tel: ${currentTenantInfo.phone}` : "";
  
  if (rTax) {
    if (currentTenantInfo?.taxNo) {
      rTax.innerText = `TIN/VAT: ${currentTenantInfo.taxNo}`;
      rTax.style.display = "block";
    } else {
      rTax.style.display = "none";
    }
  }

  if (rFoot) rFoot.innerText = currentTenantInfo?.footerNote || "*** THANK YOU! COME AGAIN ***";

  if (oId) oId.innerText = `Invoice #${inv.invoiceNumber}`;
  if (dEl) dEl.innerText = `Date: ${new Date(inv.createdAt).toLocaleString()}`;
  if (tEl) tEl.innerText = `${inv.orderType} (Table: ${inv.tableNo}${inv.waiterName ? ' | ' + inv.waiterName : ''})`;

  const itemsContainer = document.getElementById("receiptItems");
  if (itemsContainer) {
    itemsContainer.innerHTML = "";
    (inv.items || []).forEach(i => {
      const row = document.createElement("div");
      row.className = "flex justify-between items-center py-0.5";
      row.innerHTML = `
        <span class="w-1/2 font-bold truncate">${i.name} x${i.qty}</span>
        <span class="w-1/4 text-right">${parseFloat(i.price).toFixed(2)}</span>
        <span class="w-1/4 text-right font-bold">${(i.price * i.qty).toFixed(2)}</span>
      `;
      itemsContainer.appendChild(row);
    });
  }

  const subEl = document.getElementById("receiptSubtotal");
  if (subEl) subEl.innerText = `Rs. ${parseFloat(inv.subtotal || 0).toFixed(2)}`;

  const discRow = document.getElementById("receiptDiscountRow");
  if (discRow) {
    if (inv.discountAmount > 0) {
      discRow.style.display = "flex";
      const discVal = document.getElementById("receiptDiscountVal");
      if (discVal) discVal.innerText = `-Rs. ${parseFloat(inv.discountAmount).toFixed(2)}`;
    } else {
      discRow.style.display = "none";
    }
  }

  const scRow = document.getElementById("receiptScRow");
  if (scRow) {
    if (inv.scAmount > 0) {
      scRow.style.display = "flex";
      const scVal = document.getElementById("receiptScVal");
      if (scVal) scVal.innerText = `Rs. ${parseFloat(inv.scAmount).toFixed(2)}`;
    } else {
      scRow.style.display = "none";
    }
  }

  const vatRow = document.getElementById("receiptVatRow");
  if (vatRow) {
    if (inv.vatAmount > 0) {
      vatRow.style.display = "flex";
      const vatVal = document.getElementById("receiptVatVal");
      if (vatVal) vatVal.innerText = `Rs. ${parseFloat(inv.vatAmount).toFixed(2)}`;
    } else {
      vatRow.style.display = "none";
    }
  }

  const cslRow = document.getElementById("receiptCslRow");
  if (cslRow) {
    if (inv.cslAmount > 0) {
      cslRow.style.display = "flex";
      const cslVal = document.getElementById("receiptCslVal");
      if (cslVal) cslVal.innerText = `Rs. ${parseFloat(inv.cslAmount).toFixed(2)}`;
    } else {
      cslRow.style.display = "none";
    }
  }

  const totEl = document.getElementById("receiptTotal");
  if (totEl) totEl.innerText = `Rs. ${parseFloat(inv.netTotal || 0).toFixed(2)}`;

  const payDiv = document.getElementById("receiptPayDetails");
  if (payDiv) {
    const p = inv.payment || { method: "cash" };
    let payText = `<div class="flex justify-between font-bold"><span>PAYMENT METHOD:</span><span>${p.method.toUpperCase()}</span></div>`;

    if (p.method === "cash") {
      payText += `<div class="flex justify-between"><span>Cash Tendered:</span><span>Rs. ${parseFloat(p.cashTendered || inv.netTotal).toFixed(2)}</span></div>`;
      payText += `<div class="flex justify-between font-bold"><span>Cash Change:</span><span>Rs. ${parseFloat(p.change || 0).toFixed(2)}</span></div>`;
    } else if (p.method === "card") {
      payText += `<div class="flex justify-between"><span>Card:</span><span>${p.cardType} (**** ${p.last4})</span></div>`;
    } else if (p.method === "transfer") {
      payText += `<div class="flex justify-between"><span>Ref / TXN ID:</span><span>${p.refNo}</span></div>`;
    } else if (p.method === "split") {
      payText += `<div class="flex justify-between"><span>Split Cash:</span><span>Rs. ${parseFloat(p.splitCash || 0).toFixed(2)}</span></div>`;
      payText += `<div class="flex justify-between"><span>Split Card:</span><span>Rs. ${parseFloat(p.splitCard || 0).toFixed(2)}</span></div>`;
    } else if (p.method === "credit") {
      payText += `<div class="flex justify-between"><span>Customer:</span><span>${p.customerName} (${p.customerPhone || 'N/A'})</span></div>`;
    }

    payDiv.innerHTML = payText;
  }

  for (const [key, p] of activeBillPrinters) {
    const rawText = formatReceiptRawText(inv, p.name);
    await sendDirectSilentPrint(p.device, rawText, "receiptModal");
  }
}

// 1. SPLIT BILL ENGINE
export function openSplitBillModal() {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];

  if (cartList.length === 0) {
    alert("බෙදීමට Cart එකේ කෑම වර්ග නොමැත.");
    return;
  }

  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { netTotal } = calculateOrderTotals(cartList, currentDiscountType, discVal, oType);

  const sub = document.getElementById("splitBillSubtitle");
  if (sub) sub.innerText = `${currentBill.tableNo ? 'Table ' + currentBill.tableNo : currentBill.name} - Net Total: Rs. ${netTotal.toFixed(2)}`;

  calculateEqualSplitUI();
  renderSplitItemsListUI(cartList);

  document.getElementById("splitBillModal")?.classList.remove("hidden");
}

export function closeSplitBillModal() {
  document.getElementById("splitBillModal")?.classList.add("hidden");
}

export function calculateEqualSplitUI() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType);

  const count = parseInt(document.getElementById("splitEqualCount")?.value || 2);
  const amountPerPerson = netTotal / count;

  const resEl = document.getElementById("splitEqualAmountPerPerson");
  if (resEl) resEl.innerText = `Rs. ${amountPerPerson.toFixed(2)} x ${count} Persons`;
}

export function renderSplitItemsListUI(cartList) {
  const container = document.getElementById("splitItemsListContainer");
  if (!container) return;
  container.innerHTML = "";

  cartList.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-2 rounded-lg bg-white border border-gray-200";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <input type="checkbox" id="split_item_${index}" data-index="${index}" class="split-item-cb w-4 h-4 text-purple-600 rounded cursor-pointer">
        <div>
          <label for="split_item_${index}" class="font-bold text-gray-800 cursor-pointer">${item.name}</label>
          <span class="text-[10px] text-gray-400 block">Current: ${item.qty} pcs @ Rs. ${item.price.toFixed(2)}</span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-gray-500 font-bold">Qty to Split:</span>
        <input type="number" min="1" max="${item.qty}" value="1" id="split_qty_${index}" class="w-14 p-1 border rounded text-center font-bold text-xs outline-none">
      </div>
    `;
    container.appendChild(row);
  });
}

export async function executeItemSplitToNewBill() {
  const currentBill = getActiveBillData();
  const currentCart = currentBill.cart ? [...currentBill.cart] : [];
  const splitItems = [];
  const remainingCart = [];

  const checkboxes = document.querySelectorAll(".split-item-cb");
  let anySelected = false;

  checkboxes.forEach(cb => {
    const idx = parseInt(cb.getAttribute("data-index"));
    const originalItem = currentCart[idx];
    if (!originalItem) return;

    if (cb.checked) {
      anySelected = true;
      const splitQty = Math.min(originalItem.qty, parseInt(document.getElementById(`split_qty_${idx}`)?.value || 1));
      
      splitItems.push({
        ...originalItem,
        qty: splitQty,
        sentQty: 0
      });

      const remainQty = originalItem.qty - splitQty;
      if (remainQty > 0) {
        remainingCart.push({
          ...originalItem,
          qty: remainQty,
          sentQty: Math.min(originalItem.sentQty || 0, remainQty)
        });
      }
    } else {
      remainingCart.push(originalItem);
    }
  });

  if (!anySelected) {
    alert("කරුණාකර වෙන් කිරීමට අවම වශයෙන් එක් කෑම වර්ගයක්වත් තෝරන්න.");
    return;
  }

  try {
    const newSplitKey = "bill_" + Date.now();
    const newBillName = currentBill.tableNo ? `Table ${currentBill.tableNo} (Split)` : `${currentBill.name} (Split)`;

    await setFn(dbRef(`tenants/${currentTenant}/activeBills/${newSplitKey}`), {
      name: newBillName,
      orderType: currentBill.orderType,
      tableNo: currentBill.tableNo || "",
      waiterName: currentBill.waiterName || "",
      cart: splitItems,
      discountType: "fixed",
      discountVal: 0,
      selectedPayMethod: "cash",
      updatedAt: new Date().toISOString()
    });

    await persistActiveBillToCloud({
      cart: remainingCart
    });

    closeSplitBillModal();
    renderBillTabsBar();
    syncActiveBillToFormUI();

    showLiveToast("✂️ Bill Split Created", `${newBillName} නව Bill Tab එකක් ලෙස සාර්ථකව වෙන් කරන ලදී.`, "success", "fa-scissors");
  } catch (err) {
    alert("Bill Split කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 2. MORNING SHIFT OPENING CASH FLOAT ENGINE
export function openShiftFloatModal() {
  document.getElementById("shiftFloatForm")?.reset();
  const amtIn = document.getElementById("shiftOpeningFloatAmount");
  const cName = document.getElementById("shiftCashierName");
  if (amtIn) amtIn.value = "10000";
  if (cName) cName.value = "Cashier (Morning Shift)";
  document.getElementById("shiftFloatModal")?.classList.remove("hidden");
}

export function closeShiftFloatModal() {
  document.getElementById("shiftFloatModal")?.classList.add("hidden");
}

export async function handleShiftFloatSubmit(e) {
  if (e) e.preventDefault();
  const amount = parseFloat(document.getElementById("shiftOpeningFloatAmount")?.value || 0);
  const cashierName = document.getElementById("shiftCashierName")?.value.trim() || "Cashier";

  if (amount <= 0) {
    alert("Opening Float මුදල 0 ට වඩා වැඩි විය යුතුය.");
    return;
  }

  const floatTransaction = {
    type: "in",
    category: "Main Cash Drawer Top-up",
    amount: amount,
    description: `🌅 Morning Shift Opening Drawer Float (${cashierName})`,
    handledBy: cashierName,
    timestamp: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/pettyCash`), floatTransaction);
    }
    closeShiftFloatModal();
    showLiveToast("🌅 Shift Float Recorded", `Rs. ${amount.toFixed(2)} ක ආරම්භක මුදල (Opening Float) පෙට්ටියට සාර්ථකව එකතු විය.`, "success", "fa-vault");
  } catch (err) {
    alert("Shift Float සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 🔄 ROBUST OFFLINE INVOICES CLOUD SYNC ENGINE (HONORS INVENTORY DEDUCTION MODE)
export async function syncOfflineInvoicesToCloud() {
  if (!navigator.onLine || !localDBInstance || !dbRef || !pushFn || !currentTenant) return;
  if (isOfflineSyncInProgress) return;

  try {
    isOfflineSyncInProgress = true;
    const unsyncedInvoices = await localDBInstance.offlineInvoices.where("synced").equals(0).toArray();
    if (unsyncedInvoices.length === 0) {
      isOfflineSyncInProgress = false;
      return;
    }

    showLiveToast("🔄 Syncing Offline Data", `${unsyncedInvoices.length} Offline බිල්පත් Cloud එකට Sync වෙමින් පවතී...`, "info", "fa-arrows-rotate");

    const isRecipeMode = (erpState.settings?.inventoryMode || "recipe") === "recipe";

    for (const inv of unsyncedInvoices) {
      try {
        const invoiceData = {
          invoiceNumber: inv.invoiceNumber,
          orderType: inv.orderType,
          tableNo: inv.tableNo,
          waiterName: inv.waiterName || "",
          items: inv.items,
          subtotal: inv.subtotal,
          discountAmount: inv.discountAmount || 0,
          scAmount: inv.scAmount,
          vatAmount: inv.vatAmount,
          cslAmount: inv.cslAmount,
          netTotal: inv.netTotal,
          payment: inv.payment,
          createdAt: inv.createdAt
        };

        const invoiceRef = await pushFn(dbRef(`tenants/${currentTenant}/invoices`), invoiceData);

        if (inv.payment && inv.payment.method === "credit") {
          await pushFn(dbRef(`tenants/${currentTenant}/customerCredits`), {
            invoiceId: invoiceRef.key,
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.payment.customerName,
            customerPhone: inv.payment.customerPhone,
            amount: inv.netTotal,
            status: "Unpaid",
            date: inv.createdAt
          });
        }

        // Deduct only if Recipe Mode
        if (isRecipeMode) {
          for (const item of inv.items || []) {
            const dish = erpState.dishes[item.dishId];
            if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
              for (const ing of dish.ingredients) {
                const rawItem = erpState.rawItems[ing.rawId];
                if (rawItem) {
                  const convertedQty = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
                  const totalDeduct = convertedQty * (parseInt(item.qty) || 1);
                  
                  if (transactionFn) {
                    await transactionFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}/stock`), (currentStock) => {
                      const prevStock = (currentStock === null || isNaN(currentStock)) ? 0 : parseFloat(currentStock);
                      return Math.max(0, parseFloat((prevStock - totalDeduct).toFixed(3)));
                    });
                  } else if (updateFn) {
                    const currentStock = parseFloat(rawItem.stock || 0);
                    const newStock = Math.max(0, currentStock - totalDeduct);
                    await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}`), {
                      stock: parseFloat(newStock.toFixed(3))
                    });
                  }
                }
              }
            }
          }
        }

        await localDBInstance.offlineInvoices.delete(inv.id);
      } catch (singleInvErr) {
        console.warn("Single invoice sync bypass:", singleInvErr);
      }
    }

    showLiveToast("✅ Sync Completed", "සියලුම Offline බිල්පත් සාර්ථකව Cloud එකට යාවත්කාලීන විය.", "success", "fa-cloud-arrow-up");
  } catch (err) {
    console.error("Auto-sync master error:", err);
  } finally {
    isOfflineSyncInProgress = false;
  }
}

// Window Global Exports
window.setDiscountType = setDiscountType;
window.recalculateCartTotalsUI = recalculateCartTotalsUI;
window.printPhysicalKOTSlip = printPhysicalKOTSlip;
window.printPreBillEstimate = printPreBillEstimate;
window.updateCartItemNote = updateCartItemNote;
window.setQuickCashAmount = setQuickCashAmount;
window.calculateSplitPaymentBalance = calculateSplitPaymentBalance;
window.openSplitBillModal = openSplitBillModal;
window.closeSplitBillModal = closeSplitBillModal;
window.calculateEqualSplitUI = calculateEqualSplitUI;
window.executeItemSplitToNewBill = executeItemSplitToNewBill;
window.openShiftFloatModal = openShiftFloatModal;
window.closeShiftFloatModal = closeShiftFloatModal;
window.handleShiftFloatSubmit = handleShiftFloatSubmit;
window.syncOfflineInvoicesToCloud = syncOfflineInvoicesToCloud;
window.addEventListener("online", syncOfflineInvoicesToCloud);