

// ==========================================================================
// MODULE 10: REPORTS, FINANCIAL ANALYTICS, ADVANCED Z-REPORT, VOID AUDIT & WHATSAPP
// ==========================================================================

import { erpState, currentTenant, currentTenantInfo } from './state.js';
import { showLiveToast, downloadCSVFile, sendInvoiceViaWhatsApp } from './utils.js';
import { convertRecipeQtyToBaseUnit } from './menu.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let printThermalReceiptCallback = null;
let fbQuery = null;

let pendingVoidInvoiceId = null;

export function initReportsContext(dbRefInstance, pushMethod, updateMethod, printReceiptFn, fbQueryTools = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  printThermalReceiptCallback = printReceiptFn;
  fbQuery = fbQueryTools;
}

export let activeReportTabName = "invoices";

function getLocalDateString(d = new Date()) {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
}

export function switchReportTab(tabName) {
  activeReportTabName = tabName;
  ["invoices", "pnl", "hourly", "waiters", "items", "credits"].forEach(t => {
    const sec = document.getElementById("reportSection-" + t);
    const tabBtn = document.getElementById("repTab-" + t);
    if (sec) sec.classList.add("hidden");
    if (tabBtn) {
      tabBtn.className = "px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 font-bold cursor-pointer";
    }
  });

  const activeSec = document.getElementById("reportSection-" + tabName);
  const activeBtn = document.getElementById("repTab-" + tabName);
  if (activeSec) activeSec.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.className = "px-3 py-1.5 rounded-lg bg-green-600 text-white shadow-sm font-bold cursor-pointer";
  }

  if (tabName === "pnl") {
    renderPnLStatement();
  } else if (tabName === "hourly") {
    renderHourlyVelocityReport();
  } else if (tabName === "waiters") {
    renderWaiterSalesReport();
  } else if (tabName === "items") {
    renderItemWiseSalesSummary();
  } else if (tabName === "credits") {
    renderCustomerCreditsLedger();
  } else {
    renderInvoiceReportsList();
  }
}

export function setReportPeriodPreset(preset) {
  const fromElem = document.getElementById("repFromDate");
  const toElem = document.getElementById("repToDate");
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

  applyReportDateFilter();
}

export async function applyReportDateFilter() {
  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  if (fbQuery && fbQuery.query && dbRef && currentTenant) {
    try {
      let q;
      const baseInvoicesRef = dbRef(`tenants/${currentTenant}/invoices`);

      if (fromVal && toVal) {
        const fromIso = new Date(fromVal).toISOString();
        const toIso = new Date(toVal).toISOString();
        q = fbQuery.query(baseInvoicesRef, fbQuery.orderByChild("createdAt"), fbQuery.startAt(fromIso), fbQuery.endAt(toIso));
      } else if (fromVal) {
        const fromIso = new Date(fromVal).toISOString();
        q = fbQuery.query(baseInvoicesRef, fbQuery.orderByChild("createdAt"), fbQuery.startAt(fromIso));
      } else {
        q = fbQuery.query(baseInvoicesRef, fbQuery.limitToLast(200));
      }

      const snap = await fbQuery.get(q);
      if (snap.exists()) {
        erpState.invoices = snap.val();
      } else {
        erpState.invoices = {};
      }
    } catch (err) {
      console.warn("Server query fallback to cache:", err.message);
    }
  }

  if (activeReportTabName === "pnl") {
    renderPnLStatement();
  } else if (activeReportTabName === "hourly") {
    renderHourlyVelocityReport();
  } else if (activeReportTabName === "waiters") {
    renderWaiterSalesReport();
  } else if (activeReportTabName === "items") {
    renderItemWiseSalesSummary();
  } else if (activeReportTabName === "credits") {
    renderCustomerCreditsLedger();
  } else {
    renderInvoiceReportsList();
  }
}

export function getFilteredInvoicesList() {
  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;
  const payFilter = document.getElementById("repPayMethodFilter")?.value || "ALL";

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  return Object.entries(erpState.invoices || {}).filter(([id, inv]) => {
    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime < fromTime || invTime > toTime) return false;
    if (payFilter !== "ALL" && inv.payment && inv.payment.method !== payFilter) return false;
    return true;
  });
}

// ==========================================================================
// 1. INVOICES & INCOME REPORT
// ==========================================================================
export function renderInvoiceReportsList() {
  const tbody = document.getElementById("repInvoicesTableBody");
  const countBadge = document.getElementById("repInvoiceCount");
  if (!tbody) return;

  const list = getFilteredInvoicesList();

  let totalCash = 0;
  let totalCard = 0;
  let totalTransfer = 0;
  let totalCredit = 0;
  let activeInvoicesCount = 0;

  list.forEach(([id, inv]) => {
    if (inv.status === "Voided") return;
    activeInvoicesCount++;
    const amt = parseFloat(inv.netTotal || 0);
    const m = inv.payment ? inv.payment.method : "cash";
    if (m === "cash") totalCash += amt;
    else if (m === "card") totalCard += amt;
    else if (m === "transfer") totalTransfer += amt;
    else if (m === "credit") totalCredit += amt;
    else if (m === "split") {
      totalCash += parseFloat(inv.payment.splitCash || 0);
      totalCard += parseFloat(inv.payment.splitCard || 0);
    }
  });

  const cIn = document.getElementById("repTotalCashIncome");
  const crIn = document.getElementById("repTotalCardIncome");
  const trIn = document.getElementById("repTotalTransferIncome");
  const cdIn = document.getElementById("repTotalCreditGiven");

  if (cIn) cIn.innerText = `Rs. ${totalCash.toFixed(2)}`;
  if (crIn) crIn.innerText = `Rs. ${totalCard.toFixed(2)}`;
  if (trIn) trIn.innerText = `Rs. ${totalTransfer.toFixed(2)}`;
  if (cdIn) cdIn.innerText = `Rs. ${totalCredit.toFixed(2)}`;

  if (countBadge) countBadge.innerText = `${activeInvoicesCount} Active (${list.length} Total)`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">බිල්පත් තොරතුරු නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.sort((a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime());

  list.forEach(([id, inv]) => {
    const isVoided = inv.status === "Voided";
    const p = inv.payment || { method: "cash" };
    
    let payDetailHtml = `<span class="uppercase font-bold text-[10px] px-2 py-0.5 rounded-md ${
      isVoided ? 'bg-gray-200 text-gray-500 line-through' :
      p.method === 'cash' ? 'bg-green-100 text-green-800' :
      p.method === 'card' ? 'bg-blue-100 text-blue-800' :
      p.method === 'transfer' ? 'bg-purple-100 text-purple-800' : 
      p.method === 'split' ? 'bg-indigo-100 text-indigo-800' : 'bg-yellow-100 text-yellow-800'
    }">${p.method}</span>`;

    if (!isVoided) {
      if (p.method === "cash") {
        payDetailHtml += ` <span class="text-[10px] text-gray-400 block font-semibold">Tendered: ${p.cashTendered || inv.netTotal} | Chg: ${p.change || 0}</span>`;
      } else if (p.method === "card") {
        payDetailHtml += ` <span class="text-[10px] text-gray-500 block font-bold">${p.cardType} (**** ${p.last4})</span>`;
      } else if (p.method === "transfer") {
        payDetailHtml += ` <span class="text-[10px] text-gray-500 block font-mono">Ref: ${p.refNo}</span>`;
      } else if (p.method === "split") {
        payDetailHtml += ` <span class="text-[10px] text-indigo-700 block font-bold">Cash: ${p.splitCash} | Card: ${p.splitCard}</span>`;
      } else if (p.method === "credit") {
        payDetailHtml += ` <span class="text-[10px] text-yellow-800 block font-bold">${p.customerName} (${p.customerPhone || ''})</span>`;
      }
    } else {
      payDetailHtml += `<span class="text-[10px] text-red-600 font-bold block mt-0.5">Reason: ${inv.voidReason || 'Cancelled'}</span>`;
    }

    const tr = document.createElement("tr");
    tr.className = `border-b border-gray-100 ${isVoided ? 'bg-red-50/50 opacity-70' : 'hover:bg-gray-50'}`;
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold ${isVoided ? 'text-gray-400 line-through' : 'text-blue-600'}">
        ${inv.invoiceNumber}
        ${isVoided ? `<span class="ml-1 text-[9px] bg-red-600 text-white font-black px-1.5 py-0.2 rounded">VOIDED</span>` : ''}
      </td>
      <td class="p-3.5 text-gray-500">${new Date(inv.createdAt).toLocaleString()}</td>
      <td class="p-3.5 font-bold">${inv.orderType} (Table: ${inv.tableNo}${inv.waiterName ? ' | ' + inv.waiterName : ''})</td>
      <td class="p-3.5">${payDetailHtml}</td>
      <td class="p-3.5 font-black ${isVoided ? 'text-gray-400 line-through' : 'text-gray-900'}">Rs. ${parseFloat(inv.netTotal).toFixed(2)}</td>
      <td class="p-3.5 text-right space-x-1 whitespace-nowrap">
        ${
          !isVoided 
            ? `
              <button onclick="shareWhatsAppInvoice('${id}')" title="Send WhatsApp Bill" class="bg-green-50 text-green-700 hover:bg-green-600 hover:text-white border border-green-200 px-2 py-1 rounded-lg font-bold text-xs transition cursor-pointer">
                <i class="fa-brands fa-whatsapp"></i>
              </button>
              <button onclick="reprintInvoice('${id}')" title="Reprint Bill" class="text-blue-600 hover:text-blue-800 font-bold text-xs px-1.5 py-1 cursor-pointer">
                <i class="fa-solid fa-print"></i>
              </button>
              <button onclick="requestManagerVoidOverride('${id}')" title="Void / Cancel Bill with Manager Authorization" class="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-2 py-1 rounded-lg font-bold text-xs transition cursor-pointer">
                <i class="fa-solid fa-ban mr-0.5"></i> Void
              </button>
            `
            : `<span class="text-[10px] font-black text-red-600 uppercase bg-red-100 px-2 py-0.5 rounded-md">Cancelled</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================================================
// 2. 🔥 NEW: ESTIMATED PROFIT & LOSS (P&L) STATEMENT REPORT
// ==========================================================================
export function renderPnLStatement() {
  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  let grossMenuSales = 0;
  let totalDiscounts = 0;
  let totalFoodCostCOGS = 0;

  // 1. Calculate Gross Revenue, Discounts and BOM Recipe Food Cost
  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime < fromTime || invTime > toTime) return;

    const sub = parseFloat(inv.subtotal || 0);
    const disc = parseFloat(inv.discountAmount || 0);

    grossMenuSales += sub;
    totalDiscounts += disc;

    (inv.items || []).forEach(item => {
      const q = parseInt(item.qty) || 0;
      const dish = erpState.dishes[item.dishId];
      if (dish && dish.foodCost) {
        totalFoodCostCOGS += (parseFloat(dish.foodCost) * q);
      } else if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
        let singleDishCost = 0;
        dish.ingredients.forEach(ing => {
          const raw = erpState.rawItems[ing.rawId];
          if (raw) {
            const convertedQty = convertRecipeQtyToBaseUnit(raw.unit, ing.qty, ing.unit);
            singleDishCost += (parseFloat(raw.cost || 0) * convertedQty);
          }
        });
        totalFoodCostCOGS += (singleDishCost * q);
      }
    });
  });

  // 2. Calculate Operating Petty Cash Expenses within filter window
  let totalPettyExpenses = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    const pTime = new Date(p.timestamp || 0).getTime();
    if (pTime >= fromTime && pTime <= toTime) {
      if (p.type === "out") {
        totalPettyExpenses += parseFloat(p.amount || 0);
      }
    }
  });

  const netSalesRevenue = Math.max(0, grossMenuSales - totalDiscounts);
  const grossProfit = Math.max(0, netSalesRevenue - totalFoodCostCOGS);
  const estimatedNetProfit = netSalesRevenue - totalFoodCostCOGS - totalPettyExpenses;
  
  const netProfitMarginPct = netSalesRevenue > 0 ? ((estimatedNetProfit / netSalesRevenue) * 100).toFixed(1) : "0.0";
  const foodCostPct = netSalesRevenue > 0 ? ((totalFoodCostCOGS / netSalesRevenue) * 100).toFixed(1) : "0.0";

  // Update Visual Summary Cards
  const revEl = document.getElementById("pnlNetRevenueVal");
  const cogsEl = document.getElementById("pnlFoodCostVal");
  const cogsPctEl = document.getElementById("pnlFoodCostPctVal");
  const expEl = document.getElementById("pnlPettyExpensesVal");
  const netProfEl = document.getElementById("pnlNetProfitVal");
  const netMargEl = document.getElementById("pnlProfitMarginPctVal");

  if (revEl) revEl.innerText = `Rs. ${netSalesRevenue.toFixed(2)}`;
  if (cogsEl) cogsEl.innerText = `Rs. ${totalFoodCostCOGS.toFixed(2)}`;
  if (cogsPctEl) cogsPctEl.innerText = `${foodCostPct}% of Revenue`;
  if (expEl) expEl.innerText = `Rs. ${totalPettyExpenses.toFixed(2)}`;
  if (netProfEl) {
    netProfEl.innerText = `Rs. ${estimatedNetProfit.toFixed(2)}`;
    netProfEl.className = estimatedNetProfit >= 0 ? "text-2xl font-black text-emerald-700 mt-1 block" : "text-2xl font-black text-red-600 mt-1 block";
  }
  if (netMargEl) netMargEl.innerText = `Net Margin: ${netProfitMarginPct}%`;

  // Update P&L Table Rows
  const rGross = document.getElementById("pnlRowGrossSales");
  const rDisc = document.getElementById("pnlRowDiscounts");
  const rNet = document.getElementById("pnlRowNetSales");
  const rCogs = document.getElementById("pnlRowCOGS");
  const rGrossProf = document.getElementById("pnlRowGrossProfit");
  const rPetty = document.getElementById("pnlRowPettyExp");
  const rFinalNet = document.getElementById("pnlRowFinalNetProfit");

  if (rGross) rGross.innerText = `Rs. ${grossMenuSales.toFixed(2)}`;
  if (rDisc) rDisc.innerText = `-Rs. ${totalDiscounts.toFixed(2)}`;
  if (rNet) rNet.innerText = `Rs. ${netSalesRevenue.toFixed(2)}`;
  if (rCogs) rCogs.innerText = `-Rs. ${totalFoodCostCOGS.toFixed(2)}`;
  if (rGrossProf) rGrossProf.innerText = `Rs. ${grossProfit.toFixed(2)}`;
  if (rPetty) rPetty.innerText = `-Rs. ${totalPettyExpenses.toFixed(2)}`;
  if (rFinalNet) {
    rFinalNet.innerText = `Rs. ${estimatedNetProfit.toFixed(2)}`;
    rFinalNet.className = estimatedNetProfit >= 0 ? "text-base text-emerald-700 font-black" : "text-base text-red-600 font-black";
  }
}

// ==========================================================================
// 3. 🔥 NEW: HOURLY SALES VELOCITY & PEAK TIMES REPORT
// ==========================================================================
export function renderHourlyVelocityReport() {
  const tbody = document.getElementById("repHourlyTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  // Initialize 24-hour slots
  const hourlyBuckets = [];
  for (let h = 0; h < 24; h++) {
    const formattedHour = `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`;
    hourlyBuckets.push({
      hour: h,
      label: formattedHour,
      ordersCount: 0,
      totalRevenue: 0
    });
  }

  let grandFilteredRevenue = 0;
  let grandFilteredOrders = 0;

  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invDate = new Date(inv.createdAt || 0);
    const invTime = invDate.getTime();
    if (invTime < fromTime || invTime > toTime) return;

    const hourIdx = invDate.getHours();
    const net = parseFloat(inv.netTotal || 0);

    hourlyBuckets[hourIdx].ordersCount += 1;
    hourlyBuckets[hourIdx].totalRevenue += net;
    grandFilteredRevenue += net;
    grandFilteredOrders += 1;
  });

  // Find Peak Hour
  let peakBucket = { label: "N/A", totalRevenue: 0, ordersCount: 0 };
  hourlyBuckets.forEach(b => {
    if (b.totalRevenue > peakBucket.totalRevenue) {
      peakBucket = b;
    }
  });

  const avgTicketSize = grandFilteredOrders > 0 ? (grandFilteredRevenue / grandFilteredOrders) : 0;

  const peakEl = document.getElementById("hourlyPeakTimeVal");
  const peakSalesEl = document.getElementById("hourlyPeakTimeSalesVal");
  const peakOrdersEl = document.getElementById("hourlyPeakOrdersVal");
  const avgTicketEl = document.getElementById("hourlyAvgTicketVal");

  if (peakEl) peakEl.innerText = peakBucket.totalRevenue > 0 ? peakBucket.label : "N/A";
  if (peakSalesEl) peakSalesEl.innerText = `Rs. ${peakBucket.totalRevenue.toFixed(2)} in Peak`;
  if (peakOrdersEl) peakOrdersEl.innerText = `${peakBucket.ordersCount} Orders / Hour`;
  if (avgTicketEl) avgTicketEl.innerText = `Rs. ${avgTicketSize.toFixed(2)}`;

  if (grandFilteredOrders === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-400">පැයෙන් පැය විකුණුම් දත්ත නැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  const maxHourRevenue = Math.max(...hourlyBuckets.map(b => b.totalRevenue), 1);

  hourlyBuckets.forEach(b => {
    if (b.ordersCount === 0 && b.totalRevenue === 0) return; // Skip inactive zero-traffic hours

    const pctBarWidth = Math.min(100, Math.round((b.totalRevenue / maxHourRevenue) * 100));
    const isPeak = b.hour === peakBucket.hour;

    const tr = document.createElement("tr");
    tr.className = `border-b border-gray-100 ${isPeak ? 'bg-yellow-50/70 font-bold' : 'hover:bg-gray-50'}`;
    tr.innerHTML = `
      <td class="p-3.5 font-mono">
        ${b.label}
        ${isPeak ? `<span class="ml-1.5 text-[9px] bg-yellow-500 text-white font-black px-1.5 py-0.2 rounded uppercase animate-pulse">🔥 Peak Time</span>` : ''}
      </td>
      <td class="p-3.5 font-bold text-center">${b.ordersCount} Orders</td>
      <td class="p-3.5">
        <div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
          <div class="${isPeak ? 'bg-yellow-500' : 'bg-blue-600'} h-2.5 rounded-full" style="width: ${pctBarWidth}%"></div>
        </div>
      </td>
      <td class="p-3.5 text-right font-black ${isPeak ? 'text-yellow-800' : 'text-gray-900'}">Rs. ${b.totalRevenue.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================================================
// 4. 🔥 NEW: WAITER-WISE SALES & SERVICE CHARGE DISTRIBUTION REPORT
// ==========================================================================
export function renderWaiterSalesReport() {
  const tbody = document.getElementById("repWaitersTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  const waiterMap = {};

  // Initialize registered waiters from employees directory
  Object.values(erpState.employees || {}).forEach(emp => {
    if (emp.role === "Waiter") {
      waiterMap[emp.name] = {
        empId: emp.empId || "EMP",
        name: emp.name,
        ordersServed: 0,
        totalSales: 0,
        generatedSC: 0
      };
    }
  });

  let totalScPool = 0;
  let totalDineInTablesServed = 0;

  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime < fromTime || invTime > toTime) return;

    const waiter = inv.waiterName || "Unassigned Waiter";
    const net = parseFloat(inv.netTotal || 0);
    const sc = parseFloat(inv.scAmount || 0);

    if (!waiterMap[waiter]) {
      waiterMap[waiter] = {
        empId: "STAFF",
        name: waiter,
        ordersServed: 0,
        totalSales: 0,
        generatedSC: 0
      };
    }

    waiterMap[waiter].ordersServed += 1;
    waiterMap[waiter].totalSales += net;
    waiterMap[waiter].generatedSC += sc;

    totalScPool += sc;
    if (inv.orderType === "Dine-in") {
      totalDineInTablesServed += 1;
    }
  });

  const waiterList = Object.values(waiterMap);
  waiterList.sort((a, b) => b.totalSales - a.totalSales);

  const topWaiter = waiterList.length > 0 && waiterList[0].totalSales > 0 ? waiterList[0] : null;

  const topNameEl = document.getElementById("waiterTopPerformerVal");
  const topSalesEl = document.getElementById("waiterTopSalesVal");
  const scPoolEl = document.getElementById("waiterTotalScPoolVal");
  const tablesServedEl = document.getElementById("waiterTotalTablesServedVal");

  if (topNameEl) topNameEl.innerText = topWaiter ? topWaiter.name : "N/A";
  if (topSalesEl) topSalesEl.innerText = topWaiter ? `Rs. ${topWaiter.totalSales.toFixed(2)} Sales` : "Rs. 0.00 Sales";
  if (scPoolEl) scPoolEl.innerText = `Rs. ${totalScPool.toFixed(2)}`;
  if (tablesServedEl) tablesServedEl.innerText = `${totalDineInTablesServed} Tables`;

  if (waiterList.length === 0 || waiterList.every(w => w.ordersServed === 0)) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-gray-400">වේටර්වරුන්ගේ විකුණුම් දත්ත නැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  waiterList.forEach(w => {
    if (w.ordersServed === 0 && w.totalSales === 0) return;

    const avgPerTable = w.ordersServed > 0 ? (w.totalSales / w.ordersServed) : 0;
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold text-blue-600">${w.empId}</td>
      <td class="p-3.5 font-bold text-gray-800">${w.name}</td>
      <td class="p-3.5 font-bold text-center">${w.ordersServed} Orders</td>
      <td class="p-3.5 text-right font-black text-blue-600">Rs. ${w.totalSales.toFixed(2)}</td>
      <td class="p-3.5 text-right font-bold text-purple-700">Rs. ${w.generatedSC.toFixed(2)}</td>
      <td class="p-3.5 text-right font-black text-emerald-800">Rs. ${avgPerTable.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 🔒 MANAGER OVERRIDE VERIFICATION FOR VOID BILLS (STRICT DB CHECK ONLY)
export function requestManagerVoidOverride(invoiceId) {
  pendingVoidInvoiceId = invoiceId;
  const inv = erpState.invoices[invoiceId];
  if (!inv) return;

  const desc = document.getElementById("managerOverrideDesc");
  if (desc) desc.innerText = `Invoice #${inv.invoiceNumber} (Rs. ${inv.netTotal}) අවලංගු කිරීමට Manager PIN එක ගසන්න:`;

  const pinIn = document.getElementById("managerOverridePinInput");
  if (pinIn) pinIn.value = "";

  document.getElementById("managerOverrideModal")?.classList.remove("hidden");
}

export function closeManagerOverrideModal() {
  document.getElementById("managerOverrideModal")?.classList.add("hidden");
  pendingVoidInvoiceId = null;
}

export async function submitManagerOverrideAction() {
  const enteredPin = document.getElementById("managerOverridePinInput")?.value.trim();
  if (!enteredPin || !pendingVoidInvoiceId) return;

  // Validate strictly against database registered active Manager / Admin / Owner PINs only
  const isValidManager = Object.values(erpState.employees || {}).some(e => {
    const role = (e.role || "").toLowerCase();
    const isAuthorizedRole = role === "manager" || role === "admin" || role === "owner";
    return isAuthorizedRole && String(e.password || "").trim() === enteredPin;
  });

  if (!isValidManager) {
    alert("❌ වැරදි Manager PIN අංකයකි! Authorization Failed.");
    const pinIn = document.getElementById("managerOverridePinInput");
    if (pinIn) pinIn.value = "";
    return;
  }

  const idToVoid = pendingVoidInvoiceId;
  closeManagerOverrideModal();
  await executeVoidInvoiceProcess(idToVoid);
}

// 🔒 EXECUTE VOID INVOICE ENGINE
export async function executeVoidInvoiceProcess(invoiceId) {
  const inv = erpState.invoices[invoiceId];
  if (!inv) return;

  const reason = prompt(`⚠️ ${inv.invoiceNumber} බිල්පත අවලංගු කිරීමට (Void) හේතුව ඇතුළත් කරන්න:`);
  if (!reason || !reason.trim()) {
    alert("අවලංගු කිරීම සඳහා හේතුවක් ඇතුළත් කිරීම අනිවාර්ය වේ.");
    return;
  }

  try {
    if (dbRef && updateFn && currentTenant) {
      await updateFn(dbRef(`tenants/${currentTenant}/invoices/${invoiceId}`), {
        status: "Voided",
        voidReason: reason.trim(),
        voidedAt: new Date().toISOString()
      });

      // Restock ingredients
      for (const item of (inv.items || [])) {
        const dish = erpState.dishes[item.dishId];
        if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
          for (const ing of dish.ingredients) {
            const rawItem = erpState.rawItems[ing.rawId];
            if (rawItem) {
              const convertedQty = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
              const totalRestock = convertedQty * (parseInt(item.qty) || 1);
              const currentStock = parseFloat(rawItem.stock || 0);
              const newStock = currentStock + totalRestock;

              await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}`), {
                stock: parseFloat(newStock.toFixed(3))
              });
            }
          }
        }
      }

      // If credit, void debt
      const matchedCreditEntry = Object.entries(erpState.customerCredits || {}).find(([id, c]) => c.invoiceId === invoiceId || c.invoiceNumber === inv.invoiceNumber);
      if (matchedCreditEntry) {
        await updateFn(dbRef(`tenants/${currentTenant}/customerCredits/${matchedCreditEntry[0]}`), {
          status: "Voided",
          voidReason: reason.trim()
        });
      }

      showLiveToast("🚫 Bill Voided", `Invoice #${inv.invoiceNumber} Manager විසින් අවලංගු කරන ලදී.`, "warning", "fa-ban");
    }
  } catch (err) {
    alert("බිල්පත Void කිරීමේදී දෝෂයක්: " + err.message);
  }
}

export function reprintInvoice(id) {
  const inv = erpState.invoices[id];
  if (inv && printThermalReceiptCallback) {
    printThermalReceiptCallback(inv);
  }
}

export function shareWhatsAppInvoice(id) {
  const inv = erpState.invoices[id];
  const hotelName = currentTenantInfo?.hotelName || "Restaurant ERP";
  if (inv) {
    sendInvoiceViaWhatsApp(inv, hotelName);
  }
}

export function renderItemWiseSalesSummary() {
  const tbody = document.getElementById("repItemSalesTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  const itemMap = {};
  let totalSoldQty = 0;
  let totalSoldRevenue = 0;

  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime < fromTime || invTime > toTime) return;

    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach(i => {
        const key = i.name;
        if (!itemMap[key]) {
          itemMap[key] = {
            name: i.name,
            category: erpState.dishes[i.dishId]?.category || "General",
            qty: 0,
            revenue: 0
          };
        }
        const q = parseInt(i.qty) || 0;
        itemMap[key].qty += q;
        itemMap[key].revenue += (i.price * q);
        totalSoldQty += q;
        totalSoldRevenue += (i.price * q);
      });
    }
  });

  const totQ = document.getElementById("repTotalQtySold");
  const totR = document.getElementById("repTotalItemRevenue");

  if (totQ) totQ.innerText = `${totalSoldQty} Pcs`;
  if (totR) totR.innerText = `Rs. ${totalSoldRevenue.toFixed(2)}`;

  const list = Object.values(itemMap);
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-400">විකුණුම් දත්ත නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.sort((a, b) => b.revenue - a.revenue);

  list.forEach(item => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800">${item.name}</td>
      <td class="p-3.5"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-[10px] font-bold">${item.category}</span></td>
      <td class="p-3.5 font-black text-gray-900">${item.qty} Pcs</td>
      <td class="p-3.5 text-right font-black text-green-600">Rs. ${item.revenue.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

export function renderCustomerCreditsLedger() {
  const tbody = document.getElementById("repCreditsTableBody");
  const countBadge = document.getElementById("repCreditCount");
  const totalOutstandingEl = document.getElementById("repTotalCreditOutstanding");
  if (!tbody) return;

  const list = Object.entries(erpState.customerCredits || {});
  let totalOutstanding = 0;

  list.forEach(([id, c]) => {
    if (c.status === "Unpaid") totalOutstanding += parseFloat(c.amount || 0);
  });

  if (countBadge) countBadge.innerText = `${list.length} Debtors`;
  if (totalOutstandingEl) totalOutstandingEl.innerText = `Rs. ${totalOutstanding.toFixed(2)}`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">ණයට ලබාදුන් බිල්පත් නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(([id, c]) => {
    const isUnpaid = c.status === "Unpaid";
    const isVoid = c.status === "Voided";
    const tr = document.createElement("tr");
    tr.className = `border-b border-gray-100 ${isVoid ? 'bg-red-50/40 opacity-60' : 'hover:bg-gray-50'}`;
    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800">${c.customerName}</td>
      <td class="p-3.5 text-gray-500">${c.customerPhone || 'N/A'}</td>
      <td class="p-3.5 text-gray-500">${new Date(c.date).toLocaleDateString()}</td>
      <td class="p-3.5 font-mono text-blue-600">${c.invoiceNumber}</td>
      <td class="p-3.5 font-black ${isVoid ? 'text-gray-400 line-through' : 'text-red-600'}">Rs. ${parseFloat(c.amount).toFixed(2)}</td>
      <td class="p-3.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
          isVoid ? 'bg-gray-200 text-gray-600' : isUnpaid ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }">${c.status}</span>
      </td>
      <td class="p-3.5 text-right space-x-1">
        ${isUnpaid ? `<button onclick="settleCustomerCredit('${id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-sm cursor-pointer">Settle Credit</button>` : `<span class="text-gray-400 font-bold text-xs">${isVoid ? 'Voided' : 'Settled'}</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function settleCustomerCredit(id) {
  if (confirm("මෙම පාරිභෝගික ණය මුදල පියවූ බව සටහන් කිරීමට අවශ්‍යද?")) {
    if (dbRef && updateFn && currentTenant) {
      await updateFn(dbRef(`tenants/${currentTenant}/customerCredits/${id}`), {
        status: "Settled",
        settledAt: new Date().toISOString()
      });
    }
    showLiveToast("💳 Credit Settled", "පාරිභෝගික ණය සාර්ථකව පියවන ලදී.", "success", "fa-circle-check");
  }
}

// 🔒 UTF-8 BOM CSV EXPORT ENGINE FOR ALL 6 TABS
export function exportCurrentReportToCSV() {
  const dateStr = getLocalDateString();

  if (activeReportTabName === "invoices") {
    const list = getFilteredInvoicesList();
    if (list.length === 0) {
      alert("Export කිරීමට බිල්පත් දත්ත නොමැත.");
      return;
    }
    let csv = `Invoice Number,Date Time,Order Type,Table No,Waiter,Payment Method,Subtotal,Discount,SC,VAT,SSCL,Net Total,Status\n`;
    list.forEach(([id, inv]) => {
      csv += `"${inv.invoiceNumber}","${inv.createdAt}","${inv.orderType}","${inv.tableNo}","${inv.waiterName || 'N/A'}","${inv.payment ? inv.payment.method : 'cash'}","${inv.subtotal}","${inv.discountAmount || 0}","${inv.scAmount}","${inv.vatAmount}","${inv.cslAmount}","${inv.netTotal}","${inv.status || 'Paid'}"\n`;
    });
    downloadCSVFile(csv, `Invoices_Report_${dateStr}.csv`);

  } else if (activeReportTabName === "pnl") {
    const rGross = document.getElementById("pnlRowGrossSales")?.innerText || "0.00";
    const rDisc = document.getElementById("pnlRowDiscounts")?.innerText || "0.00";
    const rNet = document.getElementById("pnlRowNetSales")?.innerText || "0.00";
    const rCogs = document.getElementById("pnlRowCOGS")?.innerText || "0.00";
    const rGrossProf = document.getElementById("pnlRowGrossProfit")?.innerText || "0.00";
    const rPetty = document.getElementById("pnlRowPettyExp")?.innerText || "0.00";
    const rFinalNet = document.getElementById("pnlRowFinalNetProfit")?.innerText || "0.00";

    let csv = `P&L Statement Breakdown,Amount (Rs.)\n`;
    csv += `"1. Gross Menu Sales","${rGross}"\n`;
    csv += `"2. (-) Bill Discounts","${rDisc}"\n`;
    csv += `"3. Net Food Revenue","${rNet}"\n`;
    csv += `"4. (-) Cost of Goods Sold (COGS)","${rCogs}"\n`;
    csv += `"5. Gross Kitchen Profit","${rGrossProf}"\n`;
    csv += `"6. (-) Operating Petty Expenses","${rPetty}"\n`;
    csv += `"7. ESTIMATED NET PROFIT","${rFinalNet}"\n`;

    downloadCSVFile(csv, `Profit_And_Loss_Statement_${dateStr}.csv`);

  } else if (activeReportTabName === "hourly") {
    const rows = document.querySelectorAll("#repHourlyTableBody tr");
    if (rows.length === 0) {
      alert("Export කිරීමට පැයෙන් පැය විකුණුම් දත්ත නොමැත.");
      return;
    }
    let csv = `Time Interval,Orders Count,Hourly Revenue (Rs.)\n`;
    rows.forEach(r => {
      const cols = r.querySelectorAll("td");
      if (cols.length >= 4) {
        csv += `"${cols[0].innerText.replace('🔥 Peak Time', '').trim()}","${cols[1].innerText}","${cols[3].innerText}"\n`;
      }
    });
    downloadCSVFile(csv, `Hourly_Sales_Velocity_${dateStr}.csv`);

  } else if (activeReportTabName === "waiters") {
    const rows = document.querySelectorAll("#repWaitersTableBody tr");
    if (rows.length === 0) {
      alert("Export කිරීමට වේටර්වරුන්ගේ දත්ත නොමැත.");
      return;
    }
    let csv = `Emp ID,Waiter Name,Orders Served,Total Sales (Rs.),Generated SC (Rs.),Avg per Table (Rs.)\n`;
    rows.forEach(r => {
      const cols = r.querySelectorAll("td");
      if (cols.length >= 6) {
        csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}","${cols[4].innerText}","${cols[5].innerText}"\n`;
      }
    });
    downloadCSVFile(csv, `Waiter_Sales_Performance_${dateStr}.csv`);

  } else if (activeReportTabName === "items") {
    const rows = document.querySelectorAll("#repItemSalesTableBody tr");
    if (rows.length === 0) {
      alert("Export කිරීමට දත්ත නොමැත.");
      return;
    }
    let csv = `Dish Name,Category,Quantity Sold,Total Revenue\n`;
    rows.forEach(r => {
      const cols = r.querySelectorAll("td");
      if (cols.length >= 4) {
        csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}"\n`;
      }
    });
    downloadCSVFile(csv, `Item_Sales_Report_${dateStr}.csv`);

  } else if (activeReportTabName === "credits") {
    const list = Object.values(erpState.customerCredits || {});
    if (list.length === 0) {
      alert("Export කිරීමට ණය දත්ත නොමැත.");
      return;
    }
    let csv = `Customer Name,Phone,Date,Invoice Number,Amount,Status\n`;
    list.forEach(c => {
      csv += `"${c.customerName}","${c.customerPhone}","${c.date}","${c.invoiceNumber}","${c.amount}","${c.status}"\n`;
    });
    downloadCSVFile(csv, `Customer_Credits_${dateStr}.csv`);
  }
}

// ==========================================================================
// 5. 🔥 SMART SHIFT-BASED DAY-END Z-REPORT (MIDNIGHT CROSSOVER SAFE)
// ==========================================================================
export let currentZReportCalculatedData = null;

export async function openDayEndModal() {
  const now = new Date();
  const todayLocalStr = getLocalDateString(now);

  // Detect Most Recent Shift Start Time (Last Z-Report or Last Opening Float or 00:00:00 Today)
  let shiftStartTimeMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
  
  const pastReports = Object.values(erpState.dayEndReports || {});
  if (pastReports.length > 0) {
    const lastReportTime = Math.max(...pastReports.map(r => new Date(r.timestamp || r.date).getTime()));
    if (lastReportTime && !isNaN(lastReportTime)) {
      shiftStartTimeMs = Math.max(shiftStartTimeMs, lastReportTime);
    }
  }

  Object.values(erpState.pettyCash || {}).forEach(p => {
    if (p.category === "Main Cash Drawer Top-up" && p.type === "in") {
      const floatTime = new Date(p.timestamp).getTime();
      if (floatTime > shiftStartTimeMs) {
        shiftStartTimeMs = floatTime;
      }
    }
  });

  let grossSales = 0;
  let totalDiscounts = 0;
  let totalServiceCharge = 0;
  let totalVAT = 0;
  let totalSSCL = 0;
  let netSales = 0;
  
  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;
  let creditSales = 0;
  
  const orderTypes = {
    "Dine-in": { count: 0, amount: 0 },
    "Takeaway": { count: 0, amount: 0 },
    "Delivery": { count: 0, amount: 0 }
  };
  
  const categorySales = {};
  let totalBillsCount = 0;

  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime >= shiftStartTimeMs) {
      totalBillsCount++;
      const sub = parseFloat(inv.subtotal || 0);
      const disc = parseFloat(inv.discountAmount || 0);
      const sc = parseFloat(inv.scAmount || 0);
      const vat = parseFloat(inv.vatAmount || 0);
      const csl = parseFloat(inv.cslAmount || 0);
      const net = parseFloat(inv.netTotal || 0);

      grossSales += sub;
      totalDiscounts += disc;
      totalServiceCharge += sc;
      totalVAT += vat;
      totalSSCL += csl;
      netSales += net;

      const p = inv.payment || { method: "cash" };
      if (p.method === "cash") cashSales += net;
      else if (p.method === "card") cardSales += net;
      else if (p.method === "transfer") transferSales += net;
      else if (p.method === "credit") creditSales += net;
      else if (p.method === "split") {
        cashSales += parseFloat(p.splitCash || 0);
        cardSales += parseFloat(p.splitCard || 0);
      }

      const oType = inv.orderType || "Dine-in";
      if (orderTypes[oType]) {
        orderTypes[oType].count += 1;
        orderTypes[oType].amount += net;
      }

      (inv.items || []).forEach(item => {
        const cat = erpState.dishes[item.dishId]?.category || "General Dishes";
        if (!categorySales[cat]) categorySales[cat] = { qty: 0, amount: 0 };
        categorySales[cat].qty += (parseInt(item.qty) || 0);
        categorySales[cat].amount += (item.price * (parseInt(item.qty) || 0));
      });
    }
  });

  let pettyIn = 0;
  let pettyOut = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    const pTime = new Date(p.timestamp || 0).getTime();
    if (pTime >= shiftStartTimeMs) {
      const amt = parseFloat(p.amount || 0);
      if (p.type === "in") pettyIn += amt;
      else pettyOut += amt;
    }
  });

  const expectedCash = (cashSales + pettyIn) - pettyOut;

  currentZReportCalculatedData = {
    date: todayLocalStr,
    shiftStartTime: new Date(shiftStartTimeMs).toISOString(),
    auditTime: now.toISOString(),
    totalBillsCount,
    grossSales: Math.round(grossSales * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    totalServiceCharge: Math.round(totalServiceCharge * 100) / 100,
    totalVAT: Math.round(totalVAT * 100) / 100,
    totalSSCL: Math.round(totalSSCL * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    transferSales: Math.round(transferSales * 100) / 100,
    creditSales: Math.round(creditSales * 100) / 100,
    pettyIn: Math.round(pettyIn * 100) / 100,
    pettyOut: Math.round(pettyOut * 100) / 100,
    expectedCash: Math.round(expectedCash * 100) / 100,
    orderTypes,
    categorySales
  };

  const cVal = document.getElementById("dayEndCashSalesVal");
  const pIn = document.getElementById("dayEndPettyInVal");
  const pOut = document.getElementById("dayEndPettyOutVal");
  const expVal = document.getElementById("dayEndExpectedCashVal");
  const actIn = document.getElementById("dayEndActualCashInput");
  const vBox = document.getElementById("dayEndVarianceBox");

  if (cVal) cVal.innerText = `Rs. ${currentZReportCalculatedData.cashSales.toFixed(2)}`;
  if (pIn) pIn.innerText = `Rs. ${currentZReportCalculatedData.pettyIn.toFixed(2)}`;
  if (pOut) pOut.innerText = `Rs. ${currentZReportCalculatedData.pettyOut.toFixed(2)}`;
  if (expVal) expVal.innerText = `Rs. ${currentZReportCalculatedData.expectedCash.toFixed(2)}`;
  
  ["5000", "1000", "500", "100", "50", "20", "coins"].forEach(d => {
    const input = document.getElementById(`denom_${d}`);
    if (input) input.value = "";
  });

  if (actIn) actIn.value = "";
  if (vBox) {
    vBox.className = "p-3.5 rounded-xl border text-center font-bold text-sm bg-gray-100 text-gray-600";
    vBox.innerText = "නෝට්ටු ගණන හෝ මුළු මුදල ඇතුළත් කරන්න...";
  }

  renderZReportModalBreakdowns(currentZReportCalculatedData);
  document.getElementById("dayEndModal")?.classList.remove("hidden");
}

function renderZReportModalBreakdowns(data) {
  const oTypeContainer = document.getElementById("zModalOrderTypeSummary");
  if (oTypeContainer) {
    oTypeContainer.innerHTML = Object.entries(data.orderTypes).map(([type, d]) => `
      <div class="bg-gray-50 p-2 rounded-xl border border-gray-200 flex justify-between items-center text-xs">
        <div>
          <span class="font-bold text-gray-800">${type}</span>
          <span class="text-[10px] text-gray-400 block">${d.count} Orders</span>
        </div>
        <span class="font-black text-blue-600">Rs. ${d.amount.toFixed(2)}</span>
      </div>
    `).join("");
  }

  const catContainer = document.getElementById("zModalCategorySummary");
  if (catContainer) {
    catContainer.innerHTML = Object.entries(data.categorySales).map(([cat, d]) => `
      <div class="flex justify-between items-center py-1 border-b border-gray-100 text-xs">
        <span class="font-bold text-gray-700">${cat} (${d.qty} pcs)</span>
        <span class="font-black text-gray-900">Rs. ${d.amount.toFixed(2)}</span>
      </div>
    `).join("") || `<p class="text-center text-gray-400 text-xs py-2">අද විකුණුම් නොමැත</p>`;
  }
}

export function closeDayEndModal() {
  document.getElementById("dayEndModal")?.classList.add("hidden");
}

export function calculateCashDenominations() {
  const c5000 = (parseInt(document.getElementById("denom_5000")?.value) || 0) * 5000;
  const c1000 = (parseInt(document.getElementById("denom_1000")?.value) || 0) * 1000;
  const c500 = (parseInt(document.getElementById("denom_500")?.value) || 0) * 500;
  const c100 = (parseInt(document.getElementById("denom_100")?.value) || 0) * 100;
  const c50 = (parseInt(document.getElementById("denom_50")?.value) || 0) * 50;
  const c20 = (parseInt(document.getElementById("denom_20")?.value) || 0) * 20;
  const coins = parseFloat(document.getElementById("denom_coins")?.value || 0) || 0;

  const totalCalculatedPhysicalCash = c5000 + c1000 + c500 + c100 + c50 + c20 + coins;
  const actIn = document.getElementById("dayEndActualCashInput");
  if (actIn) actIn.value = totalCalculatedPhysicalCash > 0 ? totalCalculatedPhysicalCash.toFixed(2) : "";

  calculateDayEndVariance();
}

export function calculateDayEndVariance() {
  const expected = currentZReportCalculatedData ? currentZReportCalculatedData.expectedCash : 0;
  const actual = parseFloat(document.getElementById("dayEndActualCashInput")?.value || 0);
  const diff = actual - expected;

  const box = document.getElementById("dayEndVarianceBox");
  if (!box) return;

  if (actual === 0 && !document.getElementById("dayEndActualCashInput")?.value) {
    box.className = "p-3.5 rounded-xl border text-center font-bold text-sm bg-gray-100 text-gray-600";
    box.innerText = "නෝට්ටු ගණන හෝ මුළු මුදල ඇතුළත් කරන්න...";
    return;
  }

  if (Math.abs(diff) < 0.01) {
    box.className = "p-3.5 rounded-xl border border-green-300 bg-green-50 text-green-800 text-center font-black text-sm";
    box.innerHTML = `✅ Perfect Match! මුදල් පෙට්ටිය 100% ක් නිවැරදියි (Rs. 0.00)`;
  } else if (diff < 0) {
    box.className = "p-3.5 rounded-xl border border-red-300 bg-red-50 text-red-800 text-center font-black text-sm";
    box.innerHTML = `⚠️ මුදල් හිඟයකි (Cash Shortage): -Rs. ${Math.abs(diff).toFixed(2)}`;
  } else {
    box.className = "p-3.5 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-800 text-center font-black text-sm";
    box.innerHTML = `ℹ️ මුදල් වැඩිය (Cash Excess): +Rs. ${diff.toFixed(2)}`;
  }
}

// 🔒 SAVE Z-REPORT SAFELY WITHOUT OVERWRITING DAILY SHIFTS
export async function printAndSaveZReport() {
  if (!currentZReportCalculatedData) return;

  const actualCash = parseFloat(document.getElementById("dayEndActualCashInput")?.value || 0);
  const variance = actualCash - currentZReportCalculatedData.expectedCash;

  const fullZReportPayload = {
    ...currentZReportCalculatedData,
    actualCash: Math.round(actualCash * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    timestamp: new Date().toISOString(),
    hotelName: currentTenantInfo?.hotelName || "Restaurant ERP"
  };

  try {
    if (dbRef && pushFn && updateFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/dayEndReports`), fullZReportPayload);
      
      const shiftKey = `${fullZReportPayload.date}_${Date.now()}`;
      await updateFn(dbRef(`tenants/${currentTenant}/dailySummaries/${shiftKey}`), {
        date: fullZReportPayload.date,
        shiftStartTime: fullZReportPayload.shiftStartTime,
        auditTime: fullZReportPayload.auditTime,
        totalBills: fullZReportPayload.totalBillsCount,
        grossSales: fullZReportPayload.grossSales,
        netSales: fullZReportPayload.netSales,
        cashSales: fullZReportPayload.cashSales,
        cardSales: fullZReportPayload.cardSales,
        transferSales: fullZReportPayload.transferSales,
        creditSales: fullZReportPayload.creditSales,
        categorySales: fullZReportPayload.categorySales,
        updatedAt: new Date().toISOString()
      });
    }

    renderAdvancedThermalZReport(fullZReportPayload);

    closeDayEndModal();
    const printModal = document.getElementById("zReportPrintModal");
    if (printModal) {
      printModal.style.display = "block";
      window.print();
      printModal.style.display = "none";
    }
    showLiveToast("📑 Z-Report Completed", "දවසේ සම්පූර්ණ Z-Report එක සාර්ථකව Print විය.", "success", "fa-vault");
  } catch (err) {
    alert("Z-Report සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

function renderAdvancedThermalZReport(z) {
  const zHotel = document.getElementById("zHotelName");
  const zDate = document.getElementById("zReportDate");

  if (zHotel) zHotel.innerText = z.hotelName.toUpperCase();
  if (zDate) zDate.innerText = `Shift: ${new Date(z.shiftStartTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${new Date(z.auditTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} | ${z.date}`;

  const zGross = document.getElementById("zGrossSales");
  const zDisc = document.getElementById("zDiscounts");
  const zSC = document.getElementById("zServiceCharge");
  const zVAT = document.getElementById("zVAT");
  const zSSCL = document.getElementById("zSSCL");
  const zNet = document.getElementById("zNetSales");

  if (zGross) zGross.innerText = `Rs. ${z.grossSales.toFixed(2)}`;
  if (zDisc) zDisc.innerText = `-Rs. ${z.totalDiscounts.toFixed(2)}`;
  if (zSC) zSC.innerText = `Rs. ${z.totalServiceCharge.toFixed(2)}`;
  if (zVAT) zVAT.innerText = `Rs. ${z.totalVAT.toFixed(2)}`;
  if (zSSCL) zSSCL.innerText = `Rs. ${z.totalSSCL.toFixed(2)}`;
  if (zNet) zNet.innerText = `Rs. ${z.netSales.toFixed(2)}`;

  const zCash = document.getElementById("zCashSales");
  const zCard = document.getElementById("zCardSales");
  const zTrans = document.getElementById("zTransferSales");
  const zCred = document.getElementById("zCreditSales");

  if (zCash) zCash.innerText = `Rs. ${z.cashSales.toFixed(2)}`;
  if (zCard) zCard.innerText = `Rs. ${z.cardSales.toFixed(2)}`;
  if (zTrans) zTrans.innerText = `Rs. ${z.transferSales.toFixed(2)}`;
  if (zCred) zCred.innerText = `Rs. ${z.creditSales.toFixed(2)}`;

  const zOTypeBox = document.getElementById("zPrintOrderTypes");
  if (zOTypeBox) {
    zOTypeBox.innerHTML = Object.entries(z.orderTypes).map(([type, d]) => `
      <div class="flex justify-between">
        <span>${type} (${d.count}):</span>
        <span>Rs. ${d.amount.toFixed(2)}</span>
      </div>
    `).join("");
  }

  const zCatBox = document.getElementById("zPrintCategorySales");
  if (zCatBox) {
    zCatBox.innerHTML = Object.entries(z.categorySales).map(([cat, d]) => `
      <div class="flex justify-between">
        <span class="truncate w-36">${cat} (${d.qty}):</span>
        <span>Rs. ${d.amount.toFixed(2)}</span>
      </div>
    `).join("") || `<div>No item sales</div>`;
  }

  const zPIn = document.getElementById("zPettyIn");
  const zPOut = document.getElementById("zPettyOut");
  const zExp = document.getElementById("zExpectedCash");
  const zAct = document.getElementById("zActualCash");
  const zVar = document.getElementById("zVariance");

  if (zPIn) zPIn.innerText = `+ Rs. ${z.pettyIn.toFixed(2)}`;
  if (zPOut) zPOut.innerText = `- Rs. ${z.pettyOut.toFixed(2)}`;
  if (zExp) zExp.innerText = `Rs. ${z.expectedCash.toFixed(2)}`;
  if (zAct) zAct.innerText = `Rs. ${z.actualCash.toFixed(2)}`;
  if (zVar) {
    zVar.innerText = `Rs. ${z.variance.toFixed(2)}`;
    zVar.className = z.variance < 0 ? "text-red-700 font-black" : "font-black";
  }
}

// ==========================================================================
// 6. SHIFT HANDOVER (X-REPORT)
// ==========================================================================
export function openShiftHandoverModal() {
  const todayLocalStr = getLocalDateString(new Date());
  document.getElementById("shiftHandoverForm")?.reset();

  let cashSales = 0;
  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;
    if (getLocalDateString(inv.createdAt || new Date()) === todayLocalStr) {
      const p = inv.payment || { method: "cash" };
      if (p.method === "cash") cashSales += parseFloat(inv.netTotal || 0);
      else if (p.method === "split") cashSales += parseFloat(p.splitCash || 0);
    }
  });

  let pettyIn = 0;
  let pettyOut = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    if (getLocalDateString(p.timestamp || new Date()) === todayLocalStr) {
      const amt = parseFloat(p.amount || 0);
      if (p.type === "in") pettyIn += amt;
      else pettyOut += amt;
    }
  });

  const expectedCash = (cashSales + pettyIn) - pettyOut;
  const expVal = document.getElementById("handoverExpectedCashVal");
  if (expVal) expVal.innerText = `Rs. ${expectedCash.toFixed(2)}`;

  document.getElementById("shiftHandoverModal")?.classList.remove("hidden");
}

export function closeShiftHandoverModal() {
  document.getElementById("shiftHandoverModal")?.classList.add("hidden");
}

export async function handleShiftHandoverSubmit(e) {
  if (e) e.preventDefault();
  const outgoing = document.getElementById("handoverOutgoingCashier")?.value.trim() || "Cashier 1";
  const incoming = document.getElementById("handoverIncomingCashier")?.value.trim() || "Cashier 2";
  const actualCash = parseFloat(document.getElementById("handoverActualCashInput")?.value || 0);
  const note = document.getElementById("handoverNote")?.value.trim() || "";

  const payload = {
    date: getLocalDateString(new Date()),
    timestamp: new Date().toISOString(),
    outgoingCashier: outgoing,
    incomingCashier: incoming,
    actualCash: actualCash,
    note: note
  };

  try {
    if (dbRef && pushFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/shiftHandovers`), payload);
    }

    const xHotel = document.getElementById("xHotelName");
    const xTime = document.getElementById("xReportTime");
    const xOut = document.getElementById("xOutCashier");
    const xIn = document.getElementById("xInCashier");
    const xAct = document.getElementById("xActualCash");
    const xExp = document.getElementById("xExpectedCash");
    const xNote = document.getElementById("xNoteRow");

    if (xHotel) xHotel.innerText = (currentTenantInfo?.hotelName || "RESTAURANT ERP").toUpperCase();
    if (xTime) xTime.innerText = `Time: ${new Date().toLocaleString()}`;
    if (xOut) xOut.innerText = outgoing;
    if (xIn) xIn.innerText = incoming;
    if (xAct) xAct.innerText = `Rs. ${actualCash.toFixed(2)}`;
    if (xExp) xExp.innerText = document.getElementById("handoverExpectedCashVal")?.innerText || "Rs. 0.00";
    if (xNote) xNote.innerText = note ? `Note: ${note}` : "";

    closeShiftHandoverModal();
    const printModal = document.getElementById("xReportPrintModal");
    if (printModal) {
      printModal.style.display = "block";
      window.print();
      printModal.style.display = "none";
    }

    showLiveToast("🤝 Shift Handover Verified", `${outgoing} -> ${incoming} වෙත මුදල් පෙට්ටිය සාර්ථකව භාරදෙන ලදී.`, "success", "fa-arrows-split-up-and-left");
  } catch (err) {
    alert("Shift Handover දෝෂයක්: " + err.message);
  }
}

// Global Window Exports
window.switchReportTab = switchReportTab;
window.setReportPeriodPreset = setReportPeriodPreset;
window.applyReportDateFilter = applyReportDateFilter;
window.reprintInvoice = reprintInvoice;
window.shareWhatsAppInvoice = shareWhatsAppInvoice;
window.settleCustomerCredit = settleCustomerCredit;
window.exportCurrentReportToCSV = exportCurrentReportToCSV;
window.calculateCashDenominations = calculateCashDenominations;
window.calculateDayEndVariance = calculateDayEndVariance;
window.printAndSaveZReport = printAndSaveZReport;
window.requestManagerVoidOverride = requestManagerVoidOverride;
window.closeManagerOverrideModal = closeManagerOverrideModal;
window.submitManagerOverrideAction = submitManagerOverrideAction;
window.openShiftHandoverModal = openShiftHandoverModal;
window.closeShiftHandoverModal = closeShiftHandoverModal;
window.handleShiftHandoverSubmit = handleShiftHandoverSubmit;
window.renderPnLStatement = renderPnLStatement;
window.renderHourlyVelocityReport = renderHourlyVelocityReport;
window.renderWaiterSalesReport = renderWaiterSalesReport;


