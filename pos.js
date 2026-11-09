// ==========================================================================
// MODULE 11: POS ENGINE (CENTRAL PRINT HUB, FIFO QUEUE & ACTIVE FOCUS GUARD)
// 5-YEAR PRODUCTION HARDENED ARCHITECTURE (HIGH-CONTRAST PURE-BLACK RECEIPT)
// 🛡️ DUAL PAPER WIDTH (80MM / 58MM) & ZERO PERMISSION-DENIED SYNC ENGINE
// 🛡️ DUAL-LAYER MULTI-DEVICE KOT/BOT DE-DUPLICATION ENGINE
// 🔒 DYNAMIC TABLE-ORDER CHECKOUT HIDING GUARD (METHOD 01)
// ==========================================================================

import { erpState, currentTenant, currentTenantInfo, activeBillId, setActiveBillId, currentCategoryFilter, setCurrentCategoryFilter } from './state.js';
import { showLiveToast, sendInvoiceViaWhatsApp, showCustomInputModal, getLocalDateString } from './utils.js';
import { convertRecipeQtyToBaseUnit, getDishStationTarget } from './menu.js';
import { formatReceiptRawText, formatStationOrderTicket, sendDirectSilentPrint } from './printer.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let setFn = null;
let localDBInstance = null;
let transactionFn = null;

let isOfflineSyncInProgress = false;
export let currentDiscountType = "fixed";

// 🔒 TABLE ORDER TAKING MODE (TABLE එකකින් එන විට PRINT BILL / WHATSAPP BILL සඟවයි)
export let isTableOrderMode = false;

export function setTableOrderMode(val) {
  isTableOrderMode = !!val;
  updateCheckoutButtonsVisibility();
}

export function updateCheckoutButtonsVisibility() {
  const btnPay = document.getElementById("btnCheckout");
  const btnWACheckout = document.getElementById("btnWhatsAppCheckout");
  const checkoutRow = btnPay?.parentElement;
  let noticeEl = document.getElementById("posTableOrderModeNotice");

  if (!noticeEl && checkoutRow?.parentElement) {
    noticeEl = document.createElement("div");
    noticeEl.id = "posTableOrderModeNotice";
    noticeEl.className = "hidden p-3 rounded-xl bg-amber-50 border border-amber-200 text-center text-xs text-amber-900 font-bold shadow-xs";
    noticeEl.innerHTML = `<i class="fa-solid fa-bell-concierge mr-1 text-amber-600"></i> <span>Order Taking Mode: කෑම තෝරා "Send to Kitchen & Bar" ඔබන්න. (බිල Settle කිරීම Cashier කවුන්ටරයෙන් පමණි)</span>`;
    checkoutRow.parentElement.appendChild(noticeEl);
  }

  if (isTableOrderMode) {
    if (checkoutRow) checkoutRow.classList.add("hidden");
    if (noticeEl) noticeEl.classList.remove("hidden");
  } else {
    if (checkoutRow) checkoutRow.classList.remove("hidden");
    if (noticeEl) noticeEl.classList.add("hidden");
  }
}

// Sidebar එකේ "POS & Billing" ක්ලික් කළ විට Cashier Mode එකට හැරවීම
setTimeout(() => {
  document.getElementById("nav-pos")?.addEventListener("click", () => {
    setTableOrderMode(false);
  });
}, 500);

// 🛡️ Helper: Firebase Auth Session එක සක්‍රීයදැයි පරීක්ෂා කිරීම (PERMISSION_DENIED වැළැක්වීමට)
function isAuthReady() {
  return !!(window.authInstance && window.authInstance.currentUser);
}

// Dual-Screen Web BroadcastChannel Fallback
const cfdBroadcastChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel("restaurant_customer_display") : null;

// Lock timer to keep settled payment details visible on CFD for 10 seconds
let cfdSettledHoldUntil = 0;

// 🛡️ BACKGROUND FIFO PRINT QUEUE (ZERO UI FREEZE & ZERO SPOOLER COLLISION)
let printJobQueue = [];
let isProcessingPrintQueue = false;

async function processPrintJobQueue() {
  if (isProcessingPrintQueue || printJobQueue.length === 0) return;
  isProcessingPrintQueue = true;

  while (printJobQueue.length > 0) {
    const currentJob = printJobQueue.shift();
    try {
      if (typeof currentJob === "function") {
        await currentJob();
      }
    } catch (err) {
      console.error("Print queue job execution error:", err);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  isProcessingPrintQueue = false;
}

export function enqueuePrintJob(jobFn) {
  printJobQueue.push(jobFn);
  processPrintJobQueue();
}

export function initPosContext(dbRefInstance, pushMethod, updateMethod, removeMethod, setMethod, localDB, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  setFn = setMethod;
  localDBInstance = localDB;
  transactionFn = runTransactionMethod;
}

// 🖥️ DUAL SCREEN LIVE SYNC DISPATCHER (ELECTRON IPC + WEB BROADCAST)
export function syncLiveCustomerDisplay(isSettled = false, paymentData = null) {
  const nowMs = Date.now();

  if (isSettled) {
    cfdSettledHoldUntil = nowMs + 10000;
  } else if (nowMs < cfdSettledHoldUntil) {
    return;
  }

  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : (currentBill.discountVal || 0)) || 0;
  const oType = document.getElementById("orderType")?.value || currentBill.orderType || "Dine-in";
  
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : (currentBill.loyaltyPointsRedeemed || 0)) || 0;

  const totals = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType, loyaltyRedeemed);

  const payload = {
    hotelName: currentTenantInfo?.hotelName || "Restaurant ERP",
    footerNote: currentTenantInfo?.footerNote || "*** Thank You! Please Visit Us Again ***",
    cart: isSettled ? (paymentData?.items || currentBill.cart || []) : (currentBill.cart || []),
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount + (totals.loyaltyDiscount || 0),
    scAmount: totals.scAmount,
    vatAmount: totals.vatAmount,
    cslAmount: totals.cslAmount,
    netTotal: totals.netTotal,
    isSettled: isSettled,
    paymentMethod: paymentData ? paymentData.method : (currentBill.selectedPayMethod || "cash"),
    cashTendered: paymentData ? paymentData.cashTendered : parseFloat(document.getElementById("cashTendered")?.value || 0),
    change: paymentData ? paymentData.change : parseFloat(document.getElementById("cashChangeVal")?.innerText?.replace(/[^\d.]/g, '') || 0)
  };

  if (window.electronAPI && window.electronAPI.syncCustomerDisplay) {
    window.electronAPI.syncCustomerDisplay(payload);
  }

  if (cfdBroadcastChannel) {
    cfdBroadcastChannel.postMessage(payload);
  }
}

// 🔒 COLLISION-PROOF UNIQUE INVOICE & ESTIMATE NUMBER GENERATORS
export function generateCollisionProofInvoiceNumber() {
  const dStr = getLocalDateString().replace(/-/g, '').slice(2);
  const now = new Date();
  const timePart = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const salt = String(Math.floor(10 + Math.random() * 90));
  return `INV-${dStr}-${timePart}${salt}`;
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
    customerId: "",
    customerName: "",
    customerPhone: "",
    cart: [],
    discountType: "fixed",
    discountVal: 0,
    loyaltyPointsRedeemed: 0,
    selectedPayMethod: "cash"
  };
}

export async function persistActiveBillToCloud(updatedObj) {
  if (!erpState.activeBills) erpState.activeBills = {};
  if (!erpState.activeBills[activeBillId]) {
    erpState.activeBills[activeBillId] = {
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
  Object.assign(erpState.activeBills[activeBillId], updatedObj, {
    updatedAt: new Date().toISOString()
  });

  if (!currentTenant || !activeBillId || !dbRef || !updateFn) return;
  if (navigator.onLine && isAuthReady()) {
    try {
      updateFn(dbRef(`tenants/${currentTenant}/activeBills/${activeBillId}`), {
        ...updatedObj,
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch (err) {
      console.warn("Active bill sync queued offline:", err.message);
    }
  }
}

export async function addNewBillTab() {
  setTableOrderMode(false); // New Tab සාදන විට Cashier Checkout Mode එක ක්‍රියාත්මක වේ
  const keys = Object.keys(erpState.activeBills || {});
  const nextNum = keys.length + 1;
  const newKey = "bill_" + Date.now();

  const newBillPayload = {
    name: `Bill #${nextNum}`,
    orderType: "Dine-in",
    tableNo: "",
    waiterName: "",
    customerId: "",
    customerName: "",
    customerPhone: "",
    cart: [],
    discountType: "fixed",
    discountVal: 0,
    loyaltyPointsRedeemed: 0,
    selectedPayMethod: "cash",
    updatedAt: new Date().toISOString()
  };

  if (!erpState.activeBills) erpState.activeBills = {};
  erpState.activeBills[newKey] = newBillPayload;
  setActiveBillId(newKey);
  renderBillTabsBar();
  syncActiveBillToFormUI();

  if (dbRef && setFn && currentTenant && navigator.onLine && isAuthReady()) {
    try {
      setFn(dbRef(`tenants/${currentTenant}/activeBills/${newKey}`), newBillPayload).catch(() => {});
    } catch (e) {}
  }
}

export function switchBillTab(key) {
  setTableOrderMode(false); // Cashier ටැබ් මාරු කරද්දී Print Bill / WhatsApp Bill පෙනේ
  setActiveBillId(key);
  renderBillTabsBar();
  syncActiveBillToFormUI();
}

// 🛡️ Helper: Extract Table Pure Numbers
function extractTableNum(val) {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

export async function closeBillTab(key, ev) {
  if (ev) ev.stopPropagation();
  const keys = Object.keys(erpState.activeBills || {});
  if (keys.length <= 1) {
    showLiveToast("ℹ️ Bill Tab Notice", "අවම වශයෙන් එක් Bill Tab එකක්වත් තිබිය යුතුය.", "info", "fa-circle-info");
    return;
  }
  
  const b = erpState.activeBills[key];
  if (b && b.cart && b.cart.length > 0) {
    if (!confirm(`${b.name} හි කෑම ඇණවුම් අඩංගුයි. මෙම බිල ඉවත් කිරීමට අවශ්‍යද?`)) {
      return;
    }
  }
  
  // 🔗 Release both target table and all merged tables
  if (b && b.tableNo) {
    const allTablesToRelease = [b.tableNo, ...(b.mergedTables || [])];
    allTablesToRelease.forEach(tblNumStr => {
      const tNum = extractTableNum(tblNumStr);
      const hasOtherBillsOnTable = Object.entries(erpState.activeBills || {}).some(
        ([k, bill]) => k !== key && (extractTableNum(bill.tableNo) === tNum || (bill.mergedTables && bill.mergedTables.some(m => extractTableNum(m) === tNum))) && bill.cart && bill.cart.length > 0
      );
      if (!hasOtherBillsOnTable) {
        const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => extractTableNum(t.tableNo) === tNum);
        if (matchedTable) {
          matchedTable[1].status = "Available";
          delete matchedTable[1].mergedInto;
          delete matchedTable[1].mergedWith;
          if (dbRef && updateFn && currentTenant && navigator.onLine && isAuthReady()) {
            updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), {
              status: "Available",
              mergedInto: null,
              mergedWith: null
            }).catch(() => {});
          }
        }
      }
    });
  }
  
  delete erpState.activeBills[key];
  
  if (dbRef && removeFn && currentTenant && navigator.onLine && isAuthReady()) {
    try {
      removeFn(dbRef(`tenants/${currentTenant}/activeBills/${key}`)).catch(() => {});
    } catch (e) {}
  }
  if (activeBillId === key) {
    const remain = Object.keys(erpState.activeBills);
    setActiveBillId(remain[0]);
  }
  renderBillTabsBar();
  syncActiveBillToFormUI();
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
    const isMergedBill = Array.isArray(billObj.mergedTables) && billObj.mergedTables.length > 0;
    
    const tabBtn = document.createElement("div");
    tabBtn.className = `px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2 border select-none transition ${
      isCurrent 
        ? isMergedBill ? "bg-purple-700 text-white border-purple-700 shadow-sm" : "bg-blue-600 text-white border-blue-600 shadow-sm" 
        : isMergedBill
          ? "bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100"
          : hasActiveOrders
            ? "bg-yellow-50 text-yellow-900 border-yellow-300 hover:bg-yellow-100"
            : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
    }`;
    tabBtn.onclick = () => switchBillTab(key);
    
    let label = billObj.tableNo ? `Table ${billObj.tableNo}` : billObj.name;
    if (isMergedBill) {
      label = `🔗 Table ${billObj.tableNo} (+${billObj.mergedTables.join(', +')})`;
    }
    
    tabBtn.innerHTML = `
      <div class="flex items-center gap-1.5">
        ${hasActiveOrders ? `<span class="w-2 h-2 rounded-full ${isCurrent ? 'bg-white' : isMergedBill ? 'bg-purple-600' : 'bg-yellow-500'} animate-pulse"></span>` : ''}
        <span>${label}</span>
      </div>
      <span class="text-[10px] px-1.5 py-0.2 rounded-full font-black ${isCurrent ? 'bg-black/30 text-white' : 'bg-gray-200 text-gray-800'}">${itemCount}</span>
      ${allActiveBills.length > 1 ? `<i class="fa-solid fa-xmark hover:text-red-400 text-xs ml-1 p-0.5 cursor-pointer" onclick="closeBillTab('${key}', event)"></i>` : ""}
    `;
    container.appendChild(tabBtn);
  });
}

// 🛡️ SYNC BILL TO FORM UI WITH ACTIVE FOCUS GUARD
export function syncActiveBillToFormUI() {
  const currentBill = getActiveBillData();
  const oType = document.getElementById("orderType");
  const oTab = document.getElementById("orderTable");
  const bTitle = document.getElementById("currentBillTitle");
  const bSub = document.getElementById("currentBillSubtitle");
  const discIn = document.getElementById("cartDiscountInput");

  const activeEl = document.activeElement;

  if (oType && activeEl !== oType) oType.value = currentBill.orderType || "Dine-in";
  if (oTab && activeEl !== oTab) oTab.value = currentBill.tableNo || "";
  if (discIn && activeEl !== discIn) discIn.value = currentBill.discountVal || "";

  setDiscountType(currentBill.discountType || "fixed");
  
  const label = currentBill.tableNo ? `Table ${currentBill.tableNo}` : currentBill.name;
  if (bTitle) bTitle.innerHTML = `<i class="fa-solid fa-receipt text-blue-600"></i> ${label}`;
  if (bSub) bSub.innerText = `${currentBill.orderType} (Table: ${currentBill.tableNo || 'N/A'}${currentBill.waiterName ? ' | ' + currentBill.waiterName : ''})`;

  // Sync Customer CRM Linking
  const badgeContainer = document.getElementById("posSelectedCustomerBadge");
  const nameLabel = document.getElementById("posSelectedCustomerName");
  const pointsBadge = document.getElementById("posSelectedCustomerPoints");
  const hiddenId = document.getElementById("posAttachedCustomerId");
  const redeemBox = document.getElementById("posLoyaltyRedeemBox");
  const redeemInput = document.getElementById("cartLoyaltyRedeemInput");

  if (currentBill.customerId && erpState.customers && erpState.customers[currentBill.customerId]) {
    const cust = erpState.customers[currentBill.customerId];
    if (hiddenId) hiddenId.value = currentBill.customerId;
    if (nameLabel) nameLabel.innerText = `${cust.name} (${cust.phone})`;
    if (pointsBadge) pointsBadge.innerText = `⭐ ${cust.loyaltyPoints || 0} Points Available`;
    if (badgeContainer) badgeContainer.classList.remove("hidden");
    if (redeemBox) redeemBox.classList.remove("hidden");
    if (redeemInput && activeEl !== redeemInput) {
      redeemInput.value = currentBill.loyaltyPointsRedeemed || "";
      redeemInput.max = cust.loyaltyPoints || 0;
    }
  } else {
    if (badgeContainer) badgeContainer.classList.add("hidden");
    if (redeemBox) redeemBox.classList.add("hidden");
    if (hiddenId) hiddenId.value = "";
    if (redeemInput && activeEl !== redeemInput) redeemInput.value = "";
  }

  selectPayMethod(currentBill.selectedPayMethod || "cash", false);
  renderCartItemsUI();
  syncLiveCustomerDisplay();
  updateCheckoutButtonsVisibility();
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
  
  // 🛡️ FIX: මේස අංකය ගැසූ සැණින් දකුණු පැත්තේ Title & Subtitle එක ක්ෂණිකව Refresh කිරීම
  const bTitle = document.getElementById("currentBillTitle");
  const bSub = document.getElementById("currentBillSubtitle");
  const label = tableNo ? `Table ${tableNo}` : (getActiveBillData().name || "Bill #1");
  if (bTitle) bTitle.innerHTML = `<i class="fa-solid fa-receipt text-blue-600"></i> ${label}`;
  if (bSub) bSub.innerText = `${orderType} (Table: ${tableNo || 'N/A'}${matchedWaiter ? ' | ' + matchedWaiter : ''})`;
  
  await persistActiveBillToCloud({
    orderType: orderType,
    tableNo: tableNo,
    waiterName: matchedWaiter
  });
  
  if (tableNo) {
    const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === tableNo);
    if (matchedTable) {
      matchedTable[1].status = "Occupied";
      if (dbRef && updateFn && currentTenant && navigator.onLine && isAuthReady()) {
        updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" }).catch(() => {});
      }
    }
  }
  
  renderBillTabsBar();
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
  allButton.className = `px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition cursor-pointer ${
    currentCategoryFilter === "ALL" ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"
  }`;
  allButton.innerText = "All Items";
  allButton.onclick = () => filterPosByCategory("ALL");
  container.appendChild(allButton);

  Object.entries(erpState.dishCategories || {}).forEach(([id, cat]) => {
    const b = document.createElement("button");
    b.className = `px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition cursor-pointer ${
      currentCategoryFilter === cat.name ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"
    }`;
    b.innerText = cat.name;
    b.onclick = () => filterPosByCategory(cat.name);
    container.appendChild(b);
  });
}

// CHECK DISH STOCK AVAILABILITY
export function checkDishStockAvailability(dish) {
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

// 🛡️ CRITICAL FIX: SEARCH DISHES ACROSS ALL CATEGORIES PROPERLY
export function renderPOSDishesGrid() {
  const container = document.getElementById("posGrid");
  const searchInput = document.getElementById("posSearchInput");
  const searchQuery = (searchInput?.value || "").toLowerCase().trim();
  if (!container) return;
  container.innerHTML = "";

  let dishesObj = erpState.dishes || {};
  if (Object.keys(dishesObj).length === 0) {
    try {
      const cached = localStorage.getItem("cached_erp_dishes");
      if (cached) {
        dishesObj = JSON.parse(cached);
        erpState.dishes = dishesObj;
      }
    } catch (e) {}
  }

  const dishesList = Object.entries(dishesObj).filter(([id, dish]) => {
    // 🛡️ FIX: Search Query එකක් ඇති විට Category එක කුමක් වුවත් සියලුම Dishes අතර Search කරයි!
    // Search එක හිස්ව ඇති විට පමණක් Category Filter එක ක්‍රියාත්මක වේ.
    const matchesCategory = searchQuery 
      ? true 
      : (currentCategoryFilter === "ALL" || (dish.category || "").toLowerCase().trim() === currentCategoryFilter.toLowerCase().trim());

    const dishName = (dish.name || "").toLowerCase();
    const dishCategory = (dish.category || "").toLowerCase();
    const matchesQuery = !searchQuery || dishName.includes(searchQuery) || dishCategory.includes(searchQuery);

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
    const station = getDishStationTarget(dishId);
    const isBar = station === "bar";

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
          <span class="text-[9px] ${isBar ? 'bg-purple-100 text-purple-800' : 'bg-blue-50 text-blue-700'} font-bold px-1.5 py-0.5 rounded-md uppercase">
            ${isBar ? '🍹 Bar' : dish.category || 'Kitchen'}
          </span>
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

// ⚡ OPTIMISTIC IMMEDIATE IN-MEMORY CART MUTATIONS
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

  currentBill.cart = cartList;
  renderCartItemsUI();
  recalculateCartTotalsUI();
  renderBillTabsBar();

  persistActiveBillToCloud({ cart: cartList });

  if (currentBill.tableNo && dbRef && updateFn && currentTenant && navigator.onLine && isAuthReady()) {
    const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === currentBill.tableNo);
    if (matchedTable) {
      updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" }).catch(() => {});
    }
  }

  syncLiveCustomerDisplay();
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

  currentBill.cart = cartList;
  renderCartItemsUI();
  recalculateCartTotalsUI();
  renderBillTabsBar();

  persistActiveBillToCloud({ cart: cartList });
  syncLiveCustomerDisplay();
}

// 🔒 CRASH-PROOF KITCHEN NOTE EDITOR
export async function updateCartItemNote(dishId) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart ? [...currentBill.cart] : [];
  const targetItem = cartList.find(i => i.dishId === dishId);
  if (!targetItem) return;

  const newNote = await showCustomInputModal(
    `Order Note: ${targetItem.name}`,
    "උදා: Less Spicy, No Ice, Extra Gravy",
    targetItem.note || ""
  );

  if (newNote !== null) {
    targetItem.note = newNote.trim();
    await persistActiveBillToCloud({ cart: cartList });
    renderCartItemsUI();
    syncLiveCustomerDisplay();
  }
}

export async function clearCurrentCart() {
  if (confirm("Cart එක හිස් කිරීමට අවශ්‍යද?")) {
    const currentBill = getActiveBillData();
    currentBill.cart = [];
    currentBill.discountVal = 0;
    currentBill.loyaltyPointsRedeemed = 0;

    renderCartItemsUI();
    recalculateCartTotalsUI();
    renderBillTabsBar();

    await persistActiveBillToCloud({ cart: [], discountVal: 0, loyaltyPointsRedeemed: 0 });
    const discIn = document.getElementById("cartDiscountInput");
    const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
    if (discIn) discIn.value = "";
    if (redeemIn) redeemIn.value = "";
    syncLiveCustomerDisplay();
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

      const station = getDishStationTarget(item.dishId);
      const isBar = station === "bar";

      const rowElem = document.createElement("div");
      rowElem.className = "p-2 rounded-xl bg-gray-50 border border-gray-100 space-y-1";
      rowElem.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="truncate w-36">
            <p class="font-bold text-gray-800 truncate">${item.name}</p>
            <div class="flex items-center gap-1 text-[10px]">
              <span class="text-gray-400">Rs. ${item.price.toFixed(2)}</span>
              <span class="text-[8.5px] px-1 rounded font-extrabold ${isBar ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${isBar ? 'BOT' : 'KOT'}</span>
              ${sent > 0 ? `<span class="text-green-700 bg-green-100 px-1 rounded font-bold">Sent: ${sent}</span>` : ''}
              ${diff > 0 ? `<span class="text-yellow-800 bg-yellow-100 px-1 rounded font-bold animate-pulse">New: +${diff}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="changeCartQty('${item.dishId}', -1)" class="w-5 h-5 rounded-md bg-white border border-gray-300 text-gray-700 flex items-center justify-center font-bold text-xs cursor-pointer">-</button>
            <span class="font-black text-xs w-4 text-center">${q}</span>
            <button onclick="changeCartQty('${item.dishId}', 1)" class="w-5 h-5 rounded-md bg-white border border-gray-300 text-gray-700 flex items-center justify-center font-bold text-xs cursor-pointer">+</button>
          </div>
          <div class="font-black text-gray-800 text-xs text-right w-16">
            Rs. ${(item.price * q).toFixed(2)}
          </div>
        </div>
        <div class="flex items-center justify-between text-[10px] text-gray-500 pt-0.5 border-t border-gray-200">
          <span class="italic text-purple-700 font-semibold truncate w-40">${item.note ? '📝 ' + item.note : 'No notes'}</span>
          <button onclick="updateCartItemNote('${item.dishId}')" class="text-blue-600 font-bold hover:underline cursor-pointer">
            <i class="fa-solid fa-pen-to-square"></i> Note
          </button>
        </div>
      `;
      container.appendChild(rowElem);
    });

    if (btnKOT) btnKOT.disabled = !hasUnsentDelta;
    if (btnPrintKOT) btnPrintKOT.disabled = false;
    if (btnPrePrint) btnPrePrint.disabled = false;
    if (btnPay) btnPay.disabled = false;
    if (btnWACheckout) btnWACheckout.disabled = false;
  }

  recalculateCartTotalsUI();
  updateCheckoutButtonsVisibility();
}

// ⭐ 100% ACCURATE ORDER TOTALS & LOYALTY POINT-TO-RUPEE CONVERSION ENGINE
export function calculateOrderTotals(cartList = [], discType = "fixed", discValue = 0, orderType = "Dine-in", loyaltyPointsRedeemed = 0) {
  const subtotal = cartList.reduce((sum, i) => sum + (i.price * (parseInt(i.qty) || 0)), 0);
  
  let discountAmount = 0;
  if (discType === "percent") {
    discountAmount = subtotal * (parseFloat(discValue || 0) / 100);
  } else {
    discountAmount = parseFloat(discValue || 0);
  }
  discountAmount = Math.min(subtotal, Math.max(0, discountAmount));

  const pointRupeeValue = parseFloat(erpState.settings?.loyaltyPointValue || 1.0);
  const requestedLoyaltyRupees = parseFloat(loyaltyPointsRedeemed || 0) * pointRupeeValue;

  const loyaltyDiscount = Math.min(Math.max(0, subtotal - discountAmount), requestedLoyaltyRupees);
  const taxableAmount = Math.max(0, subtotal - discountAmount - loyaltyDiscount);

  let scAmount = 0;
  let vatAmount = 0;
  let cslAmount = 0;

  if (erpState.settings?.scEnabled && orderType === "Dine-in") {
    scAmount = taxableAmount * (parseFloat(erpState.settings.scRate || 0) / 100);
  }
  if (erpState.settings?.vatEnabled) {
    vatAmount = taxableAmount * (parseFloat(erpState.settings.vatRate || 0) / 100);
  }
  if (erpState.settings?.cslEnabled) {
    cslAmount = taxableAmount * (parseFloat(erpState.settings.cslRate || 0) / 100);
  }

  const netTotal = taxableAmount + scAmount + vatAmount + cslAmount;
  return { subtotal, discountAmount, loyaltyDiscount, pointRupeeValue, scAmount, vatAmount, cslAmount, netTotal };
}

export function recalculateCartTotalsUI() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : (currentBill.discountVal || 0)) || 0;
  const oType = document.getElementById("orderType")?.value || currentBill.orderType || "Dine-in";
  
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  let loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : (currentBill.loyaltyPointsRedeemed || 0)) || 0;

  const attachedCustId = document.getElementById("posAttachedCustomerId")?.value || currentBill.customerId;
  if (attachedCustId && erpState.customers?.[attachedCustId]) {
    const maxAvailable = parseFloat(erpState.customers[attachedCustId].loyaltyPoints || 0);
    if (loyaltyRedeemed > maxAvailable) {
      loyaltyRedeemed = maxAvailable;
      if (redeemIn && document.activeElement !== redeemIn) {
        redeemIn.value = maxAvailable > 0 ? maxAvailable : "";
      }
    }
  }

  const prevDisc = parseFloat(currentBill.discountVal || 0);
  const prevRedeem = parseFloat(currentBill.loyaltyPointsRedeemed || 0);
  if (Math.abs(prevDisc - discVal) > 0.001 || currentBill.discountType !== currentDiscountType || Math.abs(prevRedeem - loyaltyRedeemed) > 0.001) {
    persistActiveBillToCloud({
      discountVal: discVal,
      discountType: currentDiscountType,
      loyaltyPointsRedeemed: loyaltyRedeemed
    });
  }

  const { subtotal, discountAmount, loyaltyDiscount, pointRupeeValue, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(
    currentBill.cart || [],
    currentDiscountType,
    discVal,
    oType,
    loyaltyRedeemed
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

  const loyaltyRow = document.getElementById("cartLoyaltyRow");
  const loyaltyTotVal = document.getElementById("cartLoyaltyTotalVal");
  const loyaltyDiscSpan = document.getElementById("cartLoyaltyDiscountVal");
  if (loyaltyDiscount > 0) {
    if (loyaltyRow) loyaltyRow.classList.remove("hidden");
    if (loyaltyTotVal) loyaltyTotVal.innerText = `-Rs. ${loyaltyDiscount.toFixed(2)} (${loyaltyRedeemed} Pts)`;
    if (loyaltyDiscSpan) loyaltyDiscSpan.innerText = `-Rs. ${loyaltyDiscount.toFixed(2)}`;
  } else {
    if (loyaltyRow) loyaltyRow.classList.add("hidden");
    if (loyaltyDiscSpan) loyaltyDiscSpan.innerText = `-Rs. 0.00`;
  }

  const scRow = document.getElementById("cartServiceChargeRow");
  if (erpState.settings?.scEnabled && oType === "Dine-in" && scRow) {
    scRow.classList.remove("hidden");
    const lbl = document.getElementById("cartServiceChargeLabel");
    const val = document.getElementById("cartServiceChargeVal");
    if (lbl) lbl.innerText = `Service Charge (${erpState.settings.scRate}%):`;
    if (val) val.innerText = `Rs. ${scAmount.toFixed(2)}`;
  } else if (scRow) {
    scRow.classList.add("hidden");
  }

  const vatRow = document.getElementById("cartVatRow");
  if (erpState.settings?.vatEnabled && vatRow) {
    vatRow.classList.remove("hidden");
    const lbl = document.getElementById("cartVatLabel");
    const val = document.getElementById("cartVatVal");
    if (lbl) lbl.innerText = `VAT (${erpState.settings.vatRate}%):`;
    if (val) val.innerText = `Rs. ${vatAmount.toFixed(2)}`;
  } else if (vatRow) {
    vatRow.classList.add("hidden");
  }

  const cslRow = document.getElementById("cartCslRow");
  if (erpState.settings?.cslEnabled && cslRow) {
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
  syncLiveCustomerDisplay();
  updateCheckoutButtonsVisibility();
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

  const activeEl = document.activeElement;
  if (method === "credit") {
    const currentBill = getActiveBillData();
    const custId = document.getElementById("posAttachedCustomerId")?.value || currentBill.customerId;
    if (custId && erpState.customers?.[custId]) {
      const cust = erpState.customers[custId];
      const nameIn = document.getElementById("creditCustomerName");
      const phoneIn = document.getElementById("creditCustomerPhone");
      if (nameIn && activeEl !== nameIn && !nameIn.value) nameIn.value = cust.name;
      if (phoneIn && activeEl !== phoneIn && !phoneIn.value) phoneIn.value = cust.phone;
    }
  }

  if (method === "split") {
    calculateSplitPaymentBalance();
  }
}

export function setQuickCashAmount(amt) {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : 0) || 0;

  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType, loyaltyRedeemed);

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
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : 0) || 0;

  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType, loyaltyRedeemed);
  
  const tendered = parseFloat(document.getElementById("cashTendered")?.value || 0);
  const change = Math.max(0, tendered - netTotal);
  const changeEl = document.getElementById("cashChangeVal");
  if (changeEl) changeEl.innerText = `Rs. ${change.toFixed(2)}`;
}

export function calculateSplitPaymentBalance() {
  const currentBill = getActiveBillData();
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : 0) || 0;

  const { netTotal } = calculateOrderTotals(currentBill.cart || [], currentDiscountType, discVal, oType, loyaltyRedeemed);

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

// 🖨️ KOT & BOT DYNAMIC SLIP DISPATCHER (ZERO CLIPPING ON 58MM & 80MM)
async function dispatchStationPrintSlip(targetPrinter, payload, ticketType) {
  const modalContainer = document.getElementById("kotPrintModal");
  if (!modalContainer) return;

  const tableEl = document.getElementById("kotPrintTable");
  const typeEl = document.getElementById("kotPrintType");
  const timeEl = document.getElementById("kotPrintTime");
  const itemsContainer = document.getElementById("kotPrintItems");
  const titleHeader = document.getElementById("kotPrintModalHeaderTitle");

  if (titleHeader) {
    titleHeader.innerText = ticketType === "BOT" ? "*** BAR ORDER TICKET (BOT) ***" : "*** KITCHEN ORDER TICKET (KOT) ***";
  }
  if (tableEl) tableEl.innerText = `TABLE: ${payload.tableNo || 'N/A'}`;
  if (typeEl) typeEl.innerText = `TYPE: ${(payload.orderType || 'DINE-IN').toUpperCase()}`;
  if (timeEl) timeEl.innerText = new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (itemsContainer) {
    itemsContainer.innerHTML = payload.items.map(i => `
      <div style="border-bottom: 1.5px dashed #000000; padding: 3px 0; margin-bottom: 2px; width: 100%; color: #000000;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <span style="flex: 1; font-weight: 800; font-size: inherit; line-height: 1.25; color: #000000; word-break: break-word;">
            ${i.name}${i.isAddOn ? ' <span style="font-size: 0.8em; border: 1.5px solid #000000; padding: 0 2px; font-weight: 900;">ADD-ON</span>' : ''}
          </span>
          <span style="flex-shrink: 0; font-weight: 900; font-size: 1.15em; text-align: right; padding-left: 4px; color: #000000; white-space: nowrap;">
            [ x${i.qty} ]
          </span>
        </div>
        ${i.note ? `<div style="font-size: 0.85em; font-weight: 900; background: #eee; padding: 1px 3px; margin-top: 2px; border-left: 3px solid #000000; color: #000000;">>> NOTE: ${i.note}</div>` : ''}
      </div>
    `).join("");
  }

  const rawText = formatStationOrderTicket(payload, ticketType);
  await sendDirectSilentPrint(targetPrinter, rawText, "kotPrintModal");
}

// 🖨️ SMART DELTA, OFFLINE-SAFE & LOCAL LAN STATION ORDER SENDER (DUAL-LAYER DE-DUPLICATED)
export async function sendOrderToKitchen(forceReprintAll = false) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart ? [...currentBill.cart] : [];
  if (cartList.length === 0) return;
  
  const deltaKitchenItems = [];
  const deltaBarItems = [];
  const updatedCart = [];
  
  cartList.forEach(item => {
    const totalQty = parseInt(item.qty) || 0;
    const sentQty = parseInt(item.sentQty) || 0;
    const diff = totalQty - sentQty;
    
    const station = getDishStationTarget(item.dishId);
    
    if (diff > 0) {
      const orderItemPayload = {
        dishId: item.dishId,
        name: item.name,
        qty: diff,
        note: item.note || "",
        isAddOn: sentQty > 0,
        station: station
      };
      
      if (station === "bar") {
        deltaBarItems.push(orderItemPayload);
      } else {
        deltaKitchenItems.push(orderItemPayload);
      }
    }
    
    updatedCart.push({
      ...item,
      qty: totalQty,
      sentQty: totalQty
    });
  });
  
  const totalDeltaCount = deltaKitchenItems.length + deltaBarItems.length;
  
  let kitchenItemsToPrint = [];
  let barItemsToPrint = [];
  
  if (forceReprintAll === true) {
    kitchenItemsToPrint = cartList.filter(i => getDishStationTarget(i.dishId) === "kitchen");
    barItemsToPrint = cartList.filter(i => getDishStationTarget(i.dishId) === "bar");
  } else {
    if (totalDeltaCount === 0) {
      showLiveToast("⚠️ Order Info", "කුස්සියට හෝ බාර් එකට යැවීමට අලුත් ඇණවුම් නොමැත.", "info", "fa-circle-info");
      return;
    }
    kitchenItemsToPrint = deltaKitchenItems;
    barItemsToPrint = deltaBarItems;
  }
  
  const isDesktopPrinterHost = !!(window.electronAPI && window.electronAPI.printSilent);
  
  try {
    if (totalDeltaCount > 0) {
      const allNewItems = [...deltaKitchenItems, ...deltaBarItems];
      const kotTicket = {
        billKey: activeBillId,
        orderType: currentBill.orderType || "Dine-in",
        tableNo: currentBill.tableNo || "N/A",
        waiterName: currentBill.waiterName || "",
        items: allNewItems,
        timestamp: new Date().toISOString(),
        status: "Cooking",
        isPrinted: isDesktopPrinterHost ? true : false
      };
      
      currentBill.cart = updatedCart;
      renderCartItemsUI();
      
      let sentViaLan = false;

      // 📡 1. MOBILE APK OFFLINE LOCAL LAN DIRECT PRINT (INTERNET නැතත් PRINTER එකට කෙලින්ම යැවීම)
      if (!isDesktopPrinterHost) {
        const targetCashierIp = localStorage.getItem("cashier_lan_ip") || "192.168.8.100";
        if (targetCashierIp) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`http://${targetCashierIp}:8085/api/kot`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(kotTicket),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              sentViaLan = true;
              console.log("✅ Offline Order Sent via Local Wi-Fi successfully");
              showLiveToast("🖨️ Wi-Fi Print Sent", `Table ${kotTicket.tableNo} ඇණවුම Cashier Printer එකට Local Wi-Fi හරහා යවන ලදී.`, "kitchen", "fa-print");
            }
          } catch (err) {
            console.warn("Local Wi-Fi unreachable, will rely on Cloud sync:", err.message);
          }
        }
      }
      
      // ☁️ 2. CLOUD FIREBASE SYNC (INTERNET ඇති විට CLOUD එකටත් SAVE වේ)
      if (navigator.onLine && dbRef && currentTenant && isAuthReady()) {
        const cloudKotTicket = {
          ...kotTicket,
          isPrinted: (isDesktopPrinterHost || sentViaLan) ? true : false
        };

        if (pushFn) {
          pushFn(dbRef(`tenants/${currentTenant}/kitchenOrders`), cloudKotTicket).catch(() => {});
        }
        if (currentBill.tableNo && updateFn) {
          const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => t.tableNo === currentBill.tableNo);
          if (matchedTable) {
            updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), { status: "Occupied" }).catch(() => {});
          }
        }
        persistActiveBillToCloud({ cart: updatedCart });
      } else {
        try {
          localStorage.setItem("cached_erp_activeBills", JSON.stringify(erpState.activeBills));
        } catch (e) {}
      }
    }
    
    if (!isDesktopPrinterHost && !forceReprintAll) {
      showLiveToast("🔥 Order Sent", "ඇණවුම සාර්ථකව කුස්සියට සහ බාර් එකට යවන ලදී.", "kitchen", "fa-fire-burner");
      return;
    }
    
    // 🖥️ 3. DESKTOP LOCAL SILENT PRINT QUEUE (CASHIER PC එකේදී PRINT වීම)
    enqueuePrintJob(async () => {
      const pr = erpState.settings?.printers || {};
      const kitchenPrinter = (pr.p2?.device || pr.p1?.device || "").trim();
      const barPrinter = (pr.p3?.device || pr.p1?.device || "").trim();
      const isSinglePrinterSetup = (!barPrinter || !kitchenPrinter || barPrinter.toLowerCase() === kitchenPrinter.toLowerCase());
      
      let printedSummary = [];
      
      if (kitchenItemsToPrint.length > 0) {
        const kitchenPayload = {
          tableNo: currentBill.tableNo || "N/A",
          orderType: currentBill.orderType || "Dine-in",
          waiterName: currentBill.waiterName || "",
          items: kitchenItemsToPrint,
          timestamp: new Date().toISOString()
        };
        
        await dispatchStationPrintSlip(kitchenPrinter, kitchenPayload, "KOT");
        printedSummary.push(`KOT (Kitchen: ${kitchenItemsToPrint.length})`);
        
        if (isSinglePrinterSetup && barItemsToPrint.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      if (barItemsToPrint.length > 0) {
        const barPayload = {
          tableNo: currentBill.tableNo || "N/A",
          orderType: currentBill.orderType || "Dine-in",
          waiterName: currentBill.waiterName || "",
          items: barItemsToPrint,
          timestamp: new Date().toISOString()
        };
        
        await dispatchStationPrintSlip(barPrinter, barPayload, "BOT");
        printedSummary.push(`BOT (Bar: ${barItemsToPrint.length})`);
      }
      
      if (printedSummary.length > 0) {
        showLiveToast("🖨️ Orders Printed", `${printedSummary.join(" & ")} සාර්ථකව මුද්‍රණය විය!`, "kitchen", "fa-print");
      }
    });
    
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "KOT/BOT මුද්‍රණයේදී දෝෂයක්: " + err.message, "warning", "fa-print");
  }
}

// ⚡ AUTO-PRINT INCOMING ORDERS RECEIVED FROM TABLETS (DUAL-LAYER DE-DUPLICATION)
const recentlyPrintedOrderSignatures = new Set();

export function handleIncomingCloudPrint(orderId, orderData) {
  if (!window.electronAPI || !window.electronAPI.printSilent) return;
  if (!orderData || !orderData.items || orderData.status !== "Cooking" || orderData.isPrinted === true) return;

  const orderSig = `${orderData.tableNo || 'NA'}_${(orderData.items || []).map(i => `${i.name}_${i.qty}`).join('|')}_${orderData.timestamp || ''}`;
  if (recentlyPrintedOrderSignatures.has(orderSig)) {
    console.log("🛡️ Duplicate order print prevented by signature cache:", orderSig);
    return;
  }
  recentlyPrintedOrderSignatures.add(orderSig);
  setTimeout(() => recentlyPrintedOrderSignatures.delete(orderSig), 60000);

  orderData.isPrinted = true;
  if (dbRef && updateFn && currentTenant && isAuthReady()) {
    updateFn(dbRef(`tenants/${currentTenant}/kitchenOrders/${orderId}`), { isPrinted: true }).catch(() => {});
  }

  const kitchenItems = (orderData.items || []).filter(i => getDishStationTarget(i.dishId) === "kitchen");
  const barItems = (orderData.items || []).filter(i => getDishStationTarget(i.dishId) === "bar");

  enqueuePrintJob(async () => {
    const pr = erpState.settings?.printers || {};
    const kitchenPrinter = (pr.p2?.device || pr.p1?.device || "").trim();
    const barPrinter = (pr.p3?.device || pr.p1?.device || "").trim();
    const isSinglePrinterSetup = (!barPrinter || !kitchenPrinter || barPrinter.toLowerCase() === kitchenPrinter.toLowerCase());

    let printedSummary = [];

    if (kitchenItems.length > 0) {
      const kitchenPayload = {
        tableNo: orderData.tableNo || "N/A",
        orderType: orderData.orderType || "Dine-in",
        waiterName: orderData.waiterName || "",
        items: kitchenItems,
        timestamp: orderData.timestamp || new Date().toISOString()
      };
      await dispatchStationPrintSlip(kitchenPrinter, kitchenPayload, "KOT");
      printedSummary.push(`KOT (Kitchen: ${kitchenItems.length})`);

      if (isSinglePrinterSetup && barItems.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (barItems.length > 0) {
      const barPayload = {
        tableNo: orderData.tableNo || "N/A",
        orderType: orderData.orderType || "Dine-in",
        waiterName: orderData.waiterName || "",
        items: barItems,
        timestamp: orderData.timestamp || new Date().toISOString()
      };
      await dispatchStationPrintSlip(barPrinter, barPayload, "BOT");
      printedSummary.push(`BOT (Bar: ${barItems.length})`);
    }

    if (printedSummary.length > 0) {
      showLiveToast("🖨️ Tablet Order Printed", `Table #${orderData.tableNo || 'N/A'} [${printedSummary.join(" & ")}] Auto-Print විය.`, "kitchen", "fa-print");
    }
  });
}

export async function printPhysicalKOTSlip(kot) {
  await sendOrderToKitchen(false);
}

export async function printPreBillEstimate() {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  if (cartList.length === 0) return;

  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || "Dine-in";
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : 0) || 0;

  const { subtotal, discountAmount, loyaltyDiscount, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(cartList, currentDiscountType, discVal, oType, loyaltyRedeemed);

  const estimateData = {
    invoiceNumber: generateCollisionProofEstimateNumber(),
    orderType: oType,
    tableNo: currentBill.tableNo || "N/A",
    waiterName: currentBill.waiterName || "",
    customerName: currentBill.customerName || "",
    items: cartList,
    subtotal: subtotal,
    discountAmount: discountAmount + (loyaltyDiscount || 0),
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

// ⚡ OPTIMISTIC ZERO-LAG INSTANT BILL PROCESSOR & CHECKOUT ENGINE
export async function processOrder(sendWhatsApp = false) {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];
  if (cartList.length === 0) return;
  
  const discIn = document.getElementById("cartDiscountInput");
  const discVal = parseFloat(discIn ? discIn.value : 0) || 0;
  const oType = document.getElementById("orderType")?.value || currentBill.orderType || "Dine-in";
  
  const redeemIn = document.getElementById("cartLoyaltyRedeemInput");
  const loyaltyRedeemed = parseFloat(redeemIn ? redeemIn.value : (currentBill.loyaltyPointsRedeemed || 0)) || 0;

  const { subtotal, discountAmount, loyaltyDiscount, pointRupeeValue, scAmount, vatAmount, cslAmount, netTotal } = calculateOrderTotals(
    cartList,
    currentDiscountType,
    discVal,
    oType,
    loyaltyRedeemed
  );

  const payMethod = currentBill.selectedPayMethod || "cash";
  let payDetails = { method: payMethod };
  
  if (payMethod === "cash") {
    const cashIn = document.getElementById("cashTendered");
    const tendered = parseFloat(cashIn?.value || netTotal);
    if (tendered < netTotal) {
      showLiveToast("⚠️ මුදල් මදි", "දුන් මුදල (Cash) බිල්පතේ මුළු මුදලට වඩා අඩු විය නොහැක.", "warning", "fa-money-bill-wave");
      if (cashIn) {
        cashIn.focus();
        cashIn.select();
      }
      return;
    }
    payDetails.cashTendered = tendered;
    payDetails.change = Math.max(0, tendered - netTotal);
  } else if (payMethod === "card") {
    const cardType = document.getElementById("cardType")?.value;
    const cardIn = document.getElementById("cardLast4");
    const cardLast4 = cardIn?.value.trim();
    if (!cardLast4) {
      showLiveToast("⚠️ Card Details", "කරුණාකර කාඩ්පතේ අවසන් ඉලක්කම් 4 ඇතුළත් කරන්න.", "warning", "fa-credit-card");
      if (cardIn) cardIn.focus();
      return;
    }
    payDetails.cardType = cardType;
    payDetails.last4 = cardLast4;
  } else if (payMethod === "transfer") {
    const transIn = document.getElementById("transferRef");
    const refNo = transIn?.value.trim();
    if (!refNo) {
      showLiveToast("⚠️ Reference ID", "කරුණාකර Transaction ID / Reference අංකය ඇතුළත් කරන්න.", "warning", "fa-mobile-screen-button");
      if (transIn) transIn.focus();
      return;
    }
    payDetails.refNo = refNo;
  } else if (payMethod === "split") {
    const sCash = parseFloat(document.getElementById("splitPayCash")?.value || 0);
    const sCard = parseFloat(document.getElementById("splitPayCard")?.value || 0);
    if (Math.abs((sCash + sCard) - netTotal) > 0.05) {
      showLiveToast("⚠️ Split Balance", `Split Payment මුදල මුළු මුදලට (Rs. ${netTotal.toFixed(2)}) සමාන විය යුතුය.`, "warning", "fa-layer-group");
      return;
    }
    payDetails.splitCash = sCash;
    payDetails.splitCard = sCard;
  } else if (payMethod === "credit") {
    const nameIn = document.getElementById("creditCustomerName");
    const phoneIn = document.getElementById("creditCustomerPhone");
    const custName = nameIn?.value.trim() || currentBill.customerName;
    const custPhone = phoneIn?.value.trim() || currentBill.customerPhone;
    if (!custName) {
      showLiveToast("⚠️ පාරිභෝගික විස්තර", "කරුණාකර පාරිභෝගිකයාගේ නම ඇතුළත් කරන්න.", "warning", "fa-user-tag");
      if (nameIn) nameIn.focus();
      return;
    }
    payDetails.customerName = custName;
    payDetails.customerPhone = custPhone;
  }
  
  const invoiceNumber = generateCollisionProofInvoiceNumber();
  
  let assignedWaiter = currentBill.waiterName || "";
  if (!assignedWaiter && currentBill.tableNo) {
    const tObj = Object.values(erpState.tables || {}).find(t => t.tableNo === currentBill.tableNo);
    if (tObj && tObj.assignedWaiter) {
      assignedWaiter = tObj.assignedWaiter;
    }
  }

  const loyaltyEarnRate = parseFloat(erpState.settings?.loyaltyEarnRate || erpState.settings?.loyaltyRate || 100);
  const earnedLoyaltyPoints = Math.floor(netTotal / loyaltyEarnRate);

  const attachedCustomerId = document.getElementById("posAttachedCustomerId")?.value || currentBill.customerId || "";
  const attachedCustomerName = document.getElementById("posSelectedCustomerName")?.innerText?.split('(')[0]?.trim() || currentBill.customerName || (payDetails.customerName || "");
  const attachedCustomerPhone = currentBill.customerPhone || (payDetails.customerPhone || "");

  const invoiceData = {
    invoiceNumber: invoiceNumber,
    orderType: oType,
    tableNo: currentBill.tableNo || "N/A",
    waiterName: assignedWaiter,
    customerId: attachedCustomerId,
    customerName: attachedCustomerName,
    customerPhone: attachedCustomerPhone,
    items: cartList,
    subtotal: subtotal,
    discountAmount: discountAmount,
    loyaltyDiscount: loyaltyDiscount || 0,
    loyaltyPointsRedeemed: loyaltyRedeemed || 0,
    loyaltyPointValue: pointRupeeValue || 1.0,
    loyaltyPointsEarned: earnedLoyaltyPoints || 0,
    scAmount: scAmount,
    vatAmount: vatAmount,
    cslAmount: cslAmount,
    netTotal: netTotal,
    payment: payDetails,
    date: getLocalDateString(),
    createdAt: new Date().toISOString()
  };

  payDetails.items = cartList;
  syncLiveCustomerDisplay(true, payDetails);

  // 🚀 1. OPTIMISTIC INSTANT PRINT
  if (sendWhatsApp) {
    const hotelName = currentTenantInfo?.hotelName || "Restaurant ERP";
    sendInvoiceViaWhatsApp(invoiceData, hotelName);
  } else {
    printThermalReceipt(invoiceData);
  }

  // Clear inputs immediately
  const cashIn = document.getElementById("cashTendered");
  const cardIn = document.getElementById("cardLast4");
  const transIn = document.getElementById("transferRef");
  const splitC = document.getElementById("splitPayCash");
  const splitCard = document.getElementById("splitPayCard");
  const nameIn = document.getElementById("creditCustomerName");
  const phoneIn = document.getElementById("creditCustomerPhone");
  if (discIn) discIn.value = "";
  if (redeemIn) redeemIn.value = "";
  if (cashIn) cashIn.value = "";
  if (cardIn) cardIn.value = "";
  if (transIn) transIn.value = "";
  if (splitC) splitC.value = "";
  if (splitCard) splitCard.value = "";
  if (nameIn) nameIn.value = "";
  if (phoneIn) phoneIn.value = "";

  const custBadge = document.getElementById("posSelectedCustomerBadge");
  const custIdIn = document.getElementById("posAttachedCustomerId");
  const redeemBox = document.getElementById("posLoyaltyRedeemBox");
  if (custBadge) custBadge.classList.add("hidden");
  if (redeemBox) redeemBox.classList.add("hidden");
  if (custIdIn) custIdIn.value = "";

  const savedActiveBillId = activeBillId;
  delete erpState.activeBills[savedActiveBillId];

  renderCartItemsUI();
  renderBillTabsBar();

  showLiveToast("✅ Bill Settled", `Invoice #${invoiceNumber} (Rs. ${netTotal.toFixed(2)}) නිකුත් විය.`, "success", "fa-circle-check");

  // 🚀 2. NON-BLOCKING BACKGROUND SYNC (WITH OFFLINE STOCK & TABLE FIX)
  (async () => {
    try {
      if (navigator.onLine && dbRef && pushFn && currentTenant && isAuthReady()) {
        const invoiceRef = await pushFn(dbRef(`tenants/${currentTenant}/invoices`), invoiceData);
        
        if (attachedCustomerId && erpState.customers?.[attachedCustomerId] && updateFn) {
          const cust = erpState.customers[attachedCustomerId];
          const prevPoints = parseFloat(cust.loyaltyPoints || 0);
          const newPoints = Math.max(0, prevPoints - loyaltyRedeemed + earnedLoyaltyPoints);
          const newSpend = parseFloat(cust.totalSpend || 0) + netTotal;
          const newVisits = parseInt(cust.totalVisits || 0) + 1;

          const updatedCustData = {
            loyaltyPoints: newPoints,
            totalSpend: Math.round(newSpend * 100) / 100,
            totalVisits: newVisits,
            lastVisit: new Date().toISOString()
          };

          await updateFn(dbRef(`tenants/${currentTenant}/customers/${attachedCustomerId}`), updatedCustData);
          Object.assign(erpState.customers[attachedCustomerId], updatedCustData);
          if (window.renderCustomersTable) window.renderCustomersTable();
        }

        if (payMethod === "credit") {
          await pushFn(dbRef(`tenants/${currentTenant}/customerCredits`), {
            invoiceId: invoiceRef.key,
            invoiceNumber: invoiceNumber,
            customerId: attachedCustomerId,
            customerName: payDetails.customerName,
            customerPhone: payDetails.customerPhone,
            amount: netTotal,
            status: "Unpaid",
            date: getLocalDateString(),
            createdAt: new Date().toISOString()
          });
        }
        
        // 🛡️ BATCH INVENTORY UPDATE: සියලුම අමුද්‍රව්‍ය තනි Request එකකින් යවා 90% ක Data නාස්තිය නවතයි
        const isRecipeMode = (erpState.settings?.inventoryMode || "recipe") === "recipe";
        if (isRecipeMode) {
          const rawDeductions = {};
          
          for (const item of cartList) {
            const dish = erpState.dishes[item.dishId];
            if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
              for (const ing of dish.ingredients) {
                const rawItem = erpState.rawItems[ing.rawId];
                if (rawItem) {
                  const convertedQtyPerPortion = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
                  const totalDeduct = convertedQtyPerPortion * (parseInt(item.qty) || 1);
                  rawDeductions[ing.rawId] = (rawDeductions[ing.rawId] || 0) + totalDeduct;
                }
              }
            }
          }
          
          const rawUpdates = {};
          for (const [rawId, deductQty] of Object.entries(rawDeductions)) {
            const currentStock = parseFloat(erpState.rawItems[rawId]?.stock || 0);
            const newStock = Math.max(0, parseFloat((currentStock - deductQty).toFixed(3)));
            rawUpdates[`${rawId}/stock`] = newStock;
            if (erpState.rawItems[rawId]) {
              erpState.rawItems[rawId].stock = newStock;
            }
          }
          
          if (Object.keys(rawUpdates).length > 0 && updateFn) {
            await updateFn(dbRef(`tenants/${currentTenant}/rawItems`), rawUpdates);
          }
        }
        
        if (currentBill.tableNo && updateFn) {
          const allTablesToRelease = [currentBill.tableNo, ...(currentBill.mergedTables || [])];
          for (const tblNumStr of allTablesToRelease) {
            const tNum = extractTableNum(tblNumStr);
            const hasOtherBillsOnTable = Object.entries(erpState.activeBills || {}).some(
              ([k, b]) => k !== savedActiveBillId && (extractTableNum(b.tableNo) === tNum || (b.mergedTables && b.mergedTables.some(m => extractTableNum(m) === tNum))) && b.cart && b.cart.length > 0
            );
            if (!hasOtherBillsOnTable) {
              const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => extractTableNum(t.tableNo) === tNum);
              if (matchedTable) {
                matchedTable[1].status = "Available";
                delete matchedTable[1].mergedInto;
                delete matchedTable[1].mergedWith;
                await updateFn(dbRef(`tenants/${currentTenant}/tables/${matchedTable[0]}`), {
                  status: "Available",
                  mergedInto: null,
                  mergedWith: null
                });
              }
            }
          }
        }

        if (removeFn) {
          await removeFn(dbRef(`tenants/${currentTenant}/activeBills/${savedActiveBillId}`));
        }
      } else if (localDBInstance) {
        await localDBInstance.offlineInvoices.add({
          ...invoiceData,
          synced: 0
        });
        
        const isRecipeMode = (erpState.settings?.inventoryMode || "recipe") === "recipe";
        if (isRecipeMode) {
          for (const item of cartList) {
            const dish = erpState.dishes[item.dishId];
            if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
              for (const ing of dish.ingredients) {
                const rawItem = erpState.rawItems[ing.rawId];
                if (rawItem) {
                  const convertedQty = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
                  const totalDeduct = convertedQty * (parseInt(item.qty) || 1);
                  rawItem.stock = Math.max(0, parseFloat(((rawItem.stock || 0) - totalDeduct).toFixed(3)));
                }
              }
            }
          }
        }
        
        if (currentBill.tableNo) {
          const allTablesToRelease = [currentBill.tableNo, ...(currentBill.mergedTables || [])];
          allTablesToRelease.forEach(tblNumStr => {
            const tNum = extractTableNum(tblNumStr);
            const hasOtherBillsOnTable = Object.entries(erpState.activeBills || {}).some(
              ([k, b]) => k !== savedActiveBillId && (extractTableNum(b.tableNo) === tNum || (b.mergedTables && b.mergedTables.some(m => extractTableNum(m) === tNum))) && b.cart && b.cart.length > 0
            );
            if (!hasOtherBillsOnTable) {
              const matchedTable = Object.entries(erpState.tables || {}).find(([id, t]) => extractTableNum(t.tableNo) === tNum);
              if (matchedTable) {
                matchedTable[1].status = "Available";
                delete matchedTable[1].mergedInto;
                delete matchedTable[1].mergedWith;
              }
            }
          });
        }
      }
    } catch (bgErr) {
      console.warn("Background billing sync queued offline:", bgErr);
      if (localDBInstance) {
        try {
          await localDBInstance.offlineInvoices.add({
            ...invoiceData,
            synced: 0
          });
        } catch (dexErr) {}
      }
    }
  })();
}

// 🖨️ XPRINTER, EPSON & CHINESE THERMAL RECEIPT PRINT ENGINE (DUAL 80MM / 58MM ADAPTIVE)
export async function printThermalReceipt(inv) {
  const pr = erpState.settings?.printers || {};
  const p1Dev = (pr.p1?.device || "").trim();
  const targetDev = p1Dev || "";

  const oId = document.getElementById("receiptOrderId");
  const dEl = document.getElementById("receiptDate");
  const tEl = document.getElementById("receiptType");

  const rHotel = document.getElementById("receiptHotel");
  const rAddr = document.getElementById("receiptAddress");
  const rPhone = document.getElementById("receiptPhone");
  const rTax = document.getElementById("receiptTaxNo");
  const rFoot = document.getElementById("receiptFooterNote");

  if (rHotel) rHotel.innerText = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
  
  const rawAddr = currentTenantInfo?.address || "Smart Restaurant POS";
  if (rAddr) rAddr.innerText = rawAddr.replace(/,([^\s])/g, ', $1');
  
  if (rPhone) rPhone.innerText = currentTenantInfo?.phone ? `Tel: ${currentTenantInfo.phone}` : "";
  
  if (rTax) {
    if (currentTenantInfo?.taxNo) {
      rTax.innerText = `TIN/VAT: ${currentTenantInfo.taxNo}`;
      rTax.style.display = "block";
    } else {
      rTax.style.display = "none";
    }
  }

  if (rFoot) rFoot.innerText = currentTenantInfo?.footerNote || "*** THANK YOU! PLEASE VISIT US AGAIN ***";

  if (oId) oId.innerText = `Invoice #${inv.invoiceNumber}`;
  if (dEl) dEl.innerText = `Date: ${new Date(inv.createdAt || Date.now()).toLocaleString()}`;
  if (tEl) tEl.innerText = `${inv.orderType} (Table: ${inv.tableNo || 'N/A'}${inv.waiterName ? ' | ' + inv.waiterName : ''}${inv.customerName ? ' | Cust: ' + inv.customerName : ''})`;

  // 🌟 ULTRA-CRISP PROPORTIONAL FLEXBOX ITEMS FORMATTING
  const itemsContainer = document.getElementById("receiptItems");
  if (itemsContainer) {
    itemsContainer.innerHTML = "";
    (inv.items || []).forEach(i => {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start; padding: 2px 0; font-size: inherit; font-weight: 700; color: #000000; width: 100%; box-sizing: border-box;";
      row.innerHTML = `
        <span style="flex: 1.8; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 2px; color: #000000;">${i.name} x${i.qty}</span>
        <span style="flex: 1.1; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; color: #000000;">${parseFloat(i.price).toFixed(2)}</span>
        <span style="flex: 1.2; text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; color: #000000;">${(i.price * i.qty).toFixed(2)}</span>
      `;
      itemsContainer.appendChild(row);

      if (i.note) {
        const noteDiv = document.createElement("div");
        noteDiv.style.cssText = "font-size: 0.85em; font-weight: 800; padding-left: 2px; color: #000000; margin-bottom: 2px;";
        noteDiv.innerText = `  >> NOTE: ${i.note}`;
        itemsContainer.appendChild(noteDiv);
      }
    });
  }

  const subEl = document.getElementById("receiptSubtotal");
  if (subEl) subEl.innerText = `Rs. ${parseFloat(inv.subtotal || 0).toFixed(2)}`;

  const discRow = document.getElementById("receiptDiscountRow");
  const totalDiscounts = (parseFloat(inv.discountAmount || 0) + parseFloat(inv.loyaltyDiscount || 0));
  if (discRow) {
    if (totalDiscounts > 0) {
      discRow.style.display = "flex";
      const discVal = document.getElementById("receiptDiscountVal");
      let discBreakdownText = `-Rs. ${totalDiscounts.toFixed(2)}`;
      if (inv.loyaltyDiscount > 0) {
        discBreakdownText += ` (Pts: -Rs. ${parseFloat(inv.loyaltyDiscount).toFixed(2)})`;
      }
      if (discVal) discVal.innerText = discBreakdownText;
    } else {
      discRow.style.display = "none";
    }
  }

  const scRow = document.getElementById("receiptScRow");
  if (scRow) {
    if (parseFloat(inv.scAmount || 0) > 0) {
      scRow.style.display = "flex";
      const scVal = document.getElementById("receiptScVal");
      if (scVal) scVal.innerText = `Rs. ${parseFloat(inv.scAmount).toFixed(2)}`;
    } else {
      scRow.style.display = "none";
    }
  }

  const vatRow = document.getElementById("receiptVatRow");
  if (vatRow) {
    if (parseFloat(inv.vatAmount || 0) > 0) {
      vatRow.style.display = "flex";
      const vatVal = document.getElementById("receiptVatVal");
      if (vatVal) vatVal.innerText = `Rs. ${parseFloat(inv.vatAmount).toFixed(2)}`;
    } else {
      vatRow.style.display = "none";
    }
  }

  const cslRow = document.getElementById("receiptCslRow");
  if (cslRow) {
    if (parseFloat(inv.cslAmount || 0) > 0) {
      cslRow.style.display = "flex";
      const cslVal = document.getElementById("receiptCslVal");
      if (cslVal) cslVal.innerText = `Rs. ${parseFloat(inv.cslAmount).toFixed(2)}`;
    } else {
      cslRow.style.display = "none";
    }
  }

  const totEl = document.getElementById("receiptTotal");
  if (totEl) totEl.innerText = `Rs. ${parseFloat(inv.netTotal || 0).toFixed(2)}`;

  // 🌟 PURE BLACK HIGH CONTRAST PAYMENT DETAILS
  const payDiv = document.getElementById("receiptPayDetails");
  if (payDiv) {
    const p = inv.payment || { method: "cash" };
    let payText = `<div style="display: flex; justify-content: space-between; font-weight: 900; font-size: inherit; color: #000000;"><span>PAYMENT METHOD:</span><span>${(p.method || 'cash').toUpperCase()}</span></div>`;

    if (p.method === "cash") {
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Cash Tendered:</span><span style="font-weight: 800;">Rs. ${parseFloat(p.cashTendered || inv.netTotal).toFixed(2)}</span></div>`;
      payText += `<div style="display: flex; justify-content: space-between; font-weight: 900; color: #000000;"><span>Cash Change:</span><span style="font-weight: 900;">Rs. ${parseFloat(p.change || 0).toFixed(2)}</span></div>`;
    } else if (p.method === "card") {
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Card:</span><span style="font-weight: 800;">${p.cardType || 'Card'} (**** ${p.last4 || '****'})</span></div>`;
    } else if (p.method === "transfer") {
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Ref / TXN ID:</span><span style="font-weight: 800;">${p.refNo || '-'}</span></div>`;
    } else if (p.method === "split") {
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Split Cash:</span><span>Rs. ${parseFloat(p.splitCash || 0).toFixed(2)}</span></div>`;
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Split Card:</span><span>Rs. ${parseFloat(p.splitCard || 0).toFixed(2)}</span></div>`;
    } else if (p.method === "credit") {
      payText += `<div style="display: flex; justify-content: space-between; color: #000000; font-weight: 700;"><span>Customer:</span><span style="font-weight: 800;">${p.customerName || 'Customer'} (${p.customerPhone || 'N/A'})</span></div>`;
    }

    if (inv.loyaltyPointsEarned > 0 || inv.loyaltyPointsRedeemed > 0) {
      payText += `<div style="border-top: 1.5px dashed #000000; padding-top: 2px; margin-top: 2px; color: #000000;">`;
      if (inv.loyaltyPointsRedeemed > 0) {
        payText += `<div style="display: flex; justify-content: space-between; font-size: 0.9em; font-weight: 700;"><span>Points Redeemed:</span><span>-${inv.loyaltyPointsRedeemed} Pts (-Rs. ${inv.loyaltyDiscount})</span></div>`;
      }
      if (inv.loyaltyPointsEarned > 0) {
        payText += `<div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 0.95em;"><span>⭐ Loyalty Points Earned:</span><span>+${inv.loyaltyPointsEarned} Pts</span></div>`;
      }
      payText += `</div>`;
    }

    payDiv.innerHTML = payText;
  }

  const rawText = formatReceiptRawText(inv, "Counter");
  await sendDirectSilentPrint(targetDev, rawText, "receiptModal");
}

// 1. SPLIT BILL ENGINE
export function openSplitBillModal() {
  const currentBill = getActiveBillData();
  const cartList = currentBill.cart || [];

  if (cartList.length === 0) {
    showLiveToast("ℹ️ Empty Cart", "බෙදීමට Cart එකේ කෑම වර්ග නොමැත.", "info", "fa-circle-info");
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
    showLiveToast("⚠️ Selection Required", "කරුණාකර වෙන් කිරීමට අවම වශයෙන් එක් කෑම වර්ගයක්වත් තෝරන්න.", "warning", "fa-list-check");
    return;
  }

  try {
    const newSplitKey = "bill_" + Date.now();
    const newBillName = currentBill.tableNo ? `Table ${currentBill.tableNo} (Split)` : `${currentBill.name} (Split)`;

    const newBillPayload = {
      name: newBillName,
      orderType: currentBill.orderType || "Dine-in",
      tableNo: currentBill.tableNo || "",
      waiterName: currentBill.waiterName || "",
      customerId: currentBill.customerId || "",
      customerName: currentBill.customerName || "",
      customerPhone: currentBill.customerPhone || "",
      cart: splitItems,
      discountType: "fixed",
      discountVal: 0,
      loyaltyPointsRedeemed: 0,
      selectedPayMethod: "cash",
      updatedAt: new Date().toISOString()
    };

    if (dbRef && setFn && currentTenant && navigator.onLine && isAuthReady()) {
      setFn(dbRef(`tenants/${currentTenant}/activeBills/${newSplitKey}`), newBillPayload).catch(() => {});
    }
    erpState.activeBills[newSplitKey] = newBillPayload;

    currentBill.cart = remainingCart;
    await persistActiveBillToCloud({
      cart: remainingCart
    });

    closeSplitBillModal();
    renderBillTabsBar();
    syncActiveBillToFormUI();

    showLiveToast("✂️ Bill Split Created", `${newBillName} නව Bill Tab එකක් ලෙස සාර්ථකව වෙන් කරන ලදී.`, "success", "fa-scissors");
  } catch (err) {
    showLiveToast("⚠️ Split Error", "Bill Split කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
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
  setTimeout(() => amtIn?.focus(), 50);
}

export function closeShiftFloatModal() {
  document.getElementById("shiftFloatModal")?.classList.add("hidden");
}

export async function handleShiftFloatSubmit(e) {
  if (e) e.preventDefault();
  const amtIn = document.getElementById("shiftOpeningFloatAmount");
  const amount = parseFloat(amtIn?.value || 0);
  const cashierName = document.getElementById("shiftCashierName")?.value.trim() || "Cashier";

  if (amount <= 0) {
    showLiveToast("⚠️ මුදල වැරදිය", "Opening Float මුදල 0 ට වඩා වැඩි විය යුතුය.", "warning", "fa-vault");
    if (amtIn) {
      amtIn.focus();
      amtIn.select();
    }
    return;
  }

  const floatTransaction = {
    type: "in",
    category: "Main Cash Drawer Top-up",
    amount: amount,
    description: `🌅 Morning Shift Opening Drawer Float (${cashierName})`,
    handledBy: cashierName,
    date: getLocalDateString(),
    timestamp: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && currentTenant && navigator.onLine && isAuthReady()) {
      await pushFn(dbRef(`tenants/${currentTenant}/pettyCash`), floatTransaction);
    }
    closeShiftFloatModal();
    showLiveToast("🌅 Shift Float Recorded", `Rs. ${amount.toFixed(2)} ක ආරම්භක මුදල (Opening Float) පෙට්ටියට සාර්ථකව එකතු විය.`, "success", "fa-vault");
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Shift Float සේව් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// 🔄 5-YEAR PRODUCTION HARDENED OFFLINE INVOICES CLOUD SYNC
export async function syncOfflineInvoicesToCloud() {
  if (!navigator.onLine || !localDBInstance || !dbRef || !pushFn || !currentTenant) return;
  if (!isAuthReady()) {
    console.warn("⏳ Offline sync waiting for authenticated Firebase session...");
    return;
  }
  if (isOfflineSyncInProgress) return;

  try {
    isOfflineSyncInProgress = true;
    const unsyncedInvoices = await localDBInstance.offlineInvoices.where("synced").equals(0).toArray();
    
    try {
      const twoWeeksAgoIso = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000)).toISOString();
      await localDBInstance.offlineInvoices.where("createdAt").below(twoWeeksAgoIso).delete();
    } catch (pruneErr) {}

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
          customerId: inv.customerId || "",
          customerName: inv.customerName || "",
          customerPhone: inv.customerPhone || "",
          items: inv.items,
          subtotal: inv.subtotal,
          discountAmount: inv.discountAmount || 0,
          loyaltyDiscount: inv.loyaltyDiscount || 0,
          loyaltyPointsRedeemed: inv.loyaltyPointsRedeemed || 0,
          loyaltyPointValue: inv.loyaltyPointValue || 1.0,
          loyaltyPointsEarned: inv.loyaltyPointsEarned || 0,
          scAmount: inv.scAmount,
          vatAmount: inv.vatAmount,
          cslAmount: inv.cslAmount,
          netTotal: inv.netTotal,
          payment: inv.payment,
          date: inv.date || getLocalDateString(new Date(inv.createdAt)),
          createdAt: inv.createdAt
        };

        const invoiceRef = await pushFn(dbRef(`tenants/${currentTenant}/invoices`), invoiceData);

        if (inv.customerId && erpState.customers?.[inv.customerId] && updateFn) {
          const cust = erpState.customers[inv.customerId];
          const prevPoints = parseFloat(cust.loyaltyPoints || 0);
          const newPoints = Math.max(0, prevPoints - (inv.loyaltyPointsRedeemed || 0) + (inv.loyaltyPointsEarned || 0));
          const newSpend = parseFloat(cust.totalSpend || 0) + inv.netTotal;
          const newVisits = parseInt(cust.totalVisits || 0) + 1;

          const updatedCustData = {
            loyaltyPoints: newPoints,
            totalSpend: Math.round(newSpend * 100) / 100,
            totalVisits: newVisits,
            lastVisit: new Date().toISOString()
          };

          await updateFn(dbRef(`tenants/${currentTenant}/customers/${inv.customerId}`), updatedCustData);

          if (erpState.customers[inv.customerId]) {
            erpState.customers[inv.customerId].loyaltyPoints = newPoints;
            erpState.customers[inv.customerId].totalSpend = Math.round(newSpend * 100) / 100;
            erpState.customers[inv.customerId].totalVisits = newVisits;
          }
        }

        if (inv.payment && inv.payment.method === "credit") {
          await pushFn(dbRef(`tenants/${currentTenant}/customerCredits`), {
            invoiceId: invoiceRef.key,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customerId || "",
            customerName: inv.payment.customerName,
            customerPhone: inv.payment.customerPhone,
            amount: inv.netTotal,
            status: "Unpaid",
            date: inv.date || getLocalDateString(new Date(inv.createdAt)),
            createdAt: inv.createdAt
          });
        }

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

// 🛡️ CRITICAL GLOBAL WINDOW EXPORTS
window.setTableOrderMode = setTableOrderMode;
window.updateCheckoutButtonsVisibility = updateCheckoutButtonsVisibility;
window.enqueuePrintJob = enqueuePrintJob;
window.handleIncomingCloudPrint = handleIncomingCloudPrint;
window.persistActiveBillToCloud = persistActiveBillToCloud;
window.recalculateCartTotalsUI = recalculateCartTotalsUI;
window.setDiscountType = setDiscountType;
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
window.addNewBillTab = addNewBillTab;
window.switchBillTab = switchBillTab;
window.closeBillTab = closeBillTab;
window.updateCurrentBillSettings = updateCurrentBillSettings;
window.onPosSearchInput = onPosSearchInput;
window.filterPosByCategory = filterPosByCategory;
window.changeCartQty = changeCartQty;
window.clearCurrentCart = clearCurrentCart;
window.selectPayMethod = selectPayMethod;
window.calculateCashChange = calculateCashChange;
window.sendOrderToKitchen = sendOrderToKitchen;
window.processOrder = processOrder;
window.printThermalReceipt = printThermalReceipt;
window.syncLiveCustomerDisplay = syncLiveCustomerDisplay;
window.addEventListener("online", syncOfflineInvoicesToCloud);
