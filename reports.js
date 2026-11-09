// ==========================================================================
// MODULE 10: REPORTS, FINANCIAL ANALYTICS, ADVANCED Z-REPORT, VOID AUDIT & WHATSAPP
// 5-YEAR PRODUCTION HARDENED ARCHITECTURE (USAR COMPLIANT P&L WITH STORE ISSUES & WASTAGE)
// 💳 DAY-END CARD MACHINE BATCH RECONCILIATION & CARD TYPE BREAKDOWN
// 📑 SMART INVOICE LIST PAGINATION (ZERO-LAG BROWSER RENDERING)
// ==========================================================================

import { erpState, currentTenant, currentTenantInfo, currentUserRole } from './state.js';
import { showLiveToast, downloadCSVFile, sendInvoiceViaWhatsApp, getLocalDateString, formatDateTimeLocal, showCustomInputModal, verifyPin } from './utils.js';
import { convertRecipeQtyToBaseUnit } from './menu.js';
import { sendDirectSilentPrint } from './printer.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let printThermalReceiptCallback = null;
let fbQuery = null;
let transactionFn = null;

let pendingVoidInvoiceId = null;

// Pagination State for Invoices Report
export let currentInvoicesPage = 1;
export const INVOICES_PER_PAGE = 25;

export function initReportsContext(dbRefInstance, pushMethod, updateMethod, printReceiptFn, fbQueryTools = null, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  printThermalReceiptCallback = printReceiptFn;
  fbQuery = fbQueryTools;
  transactionFn = runTransactionMethod;
}

export let activeReportTabName = "invoices";

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
    currentInvoicesPage = 1;
    renderInvoiceReportsList();
  }
}

export function setReportPeriodPreset(preset) {
  const fromElem = document.getElementById("repFromDate");
  const toElem = document.getElementById("repToDate");
  if (!fromElem || !toElem) return;
  const now = new Date();

  if (preset === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "thisWeek") {
    const curDate = new Date();
    const firstDay = new Date(curDate.setDate(curDate.getDate() - curDate.getDay()));
    firstDay.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    fromElem.value = formatDateTimeLocal(firstDay);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "thisMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    fromElem.value = formatDateTimeLocal(start);
    toElem.value = formatDateTimeLocal(end);
  } else if (preset === "all") {
    fromElem.value = "";
    toElem.value = "";
  }

  applyReportDateFilter();
}

// 🛡️ ZERO-BANDWIDTH INTELLIGENT REPORT QUERY ENGINE
let isFetchingReports = false;
let lastReportQueryKey = "";
let lastReportFetchTime = 0;

export async function applyReportDateFilter(forceRefresh = false) {
  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;
  const queryKey = `${fromVal || 'ALL'}_${toVal || 'ALL'}`;
  const nowMs = Date.now();
  
  const isSameQueryRecent = (queryKey === lastReportQueryKey && (nowMs - lastReportFetchTime) < 30000 && !forceRefresh);
  
  if (!isSameQueryRecent && fbQuery && fbQuery.query && dbRef && currentTenant) {
    if (isFetchingReports) return;
    isFetchingReports = true;
    
    try {
      let q;
      const baseInvoicesRef = dbRef(`tenants/${currentTenant}/invoices`);
      
      if (fromVal && toVal) {
        const fromIso = new Date(fromVal).toISOString();
        const toIso = new Date(toVal).toISOString();
        q = fbQuery.query(baseInvoicesRef, fbQuery.orderByChild("createdAt"), fbQuery.startAt(fromIso), fbQuery.endAt(toIso), fbQuery.limitToLast(1200));
      } else if (fromVal) {
        const fromIso = new Date(fromVal).toISOString();
        q = fbQuery.query(baseInvoicesRef, fbQuery.orderByChild("createdAt"), fbQuery.startAt(fromIso), fbQuery.limitToLast(600));
      } else {
        q = fbQuery.query(baseInvoicesRef, fbQuery.limitToLast(150));
      }
      
      const snap = await fbQuery.get(q);
      if (snap.exists()) {
        erpState.invoices = snap.val();
      } else {
        erpState.invoices = {};
      }
      
      lastReportQueryKey = queryKey;
      lastReportFetchTime = nowMs;
    } catch (err) {
      console.warn("Server query fallback to cache:", err.message);
    } finally {
      isFetchingReports = false;
    }
  }
  
  currentInvoicesPage = 1;
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

// 1. INVOICES & INCOME REPORT (WITH CLEAN PAGINATION)
export function changeInvoicesPage(newPage) {
  currentInvoicesPage = Math.max(1, newPage);
  renderInvoiceReportsList();
}

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

  list.sort((a, b) => new Date(b[1].createdAt || 0).getTime() - new Date(a[1].createdAt || 0).getTime());

  // 📑 PAGINATION SLICING ENGINE
  const totalPages = Math.ceil(list.length / INVOICES_PER_PAGE) || 1;
  if (currentInvoicesPage > totalPages) currentInvoicesPage = totalPages;

  const startIndex = (currentInvoicesPage - 1) * INVOICES_PER_PAGE;
  const endIndex = startIndex + INVOICES_PER_PAGE;
  const pagedSubset = list.slice(startIndex, endIndex);

  tbody.innerHTML = "";

  pagedSubset.forEach(([id, inv]) => {
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
        payDetailHtml += ` <span class="text-[10px] text-gray-700 block font-bold">${p.cardType || 'Card'}${p.last4 ? ' (**** ' + p.last4 + ')' : ''}</span>`;
      } else if (p.method === "transfer") {
        payDetailHtml += ` <span class="text-[10px] text-gray-500 block font-mono">Ref: ${p.refNo || '-'}</span>`;
      } else if (p.method === "split") {
        payDetailHtml += ` <span class="text-[10px] text-indigo-700 block font-bold">Cash: ${p.splitCash} | Card: ${p.splitCard}</span>`;
      } else if (p.method === "credit") {
        payDetailHtml += ` <span class="text-[10px] text-yellow-800 block font-bold">${p.customerName || 'Customer'} (${p.customerPhone || ''})</span>`;
      }

      if (parseFloat(inv.loyaltyDiscount || 0) > 0) {
        payDetailHtml += `<span class="text-[9.5px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-extrabold block mt-0.5 w-fit">⭐ Pts Disc: -Rs. ${parseFloat(inv.loyaltyDiscount).toFixed(2)} (${inv.loyaltyPointsRedeemed || 0} Pts)</span>`;
      }
      if (inv.loyaltyPointsEarned > 0) {
        payDetailHtml += `<span class="text-[9px] text-emerald-600 font-bold block">+${inv.loyaltyPointsEarned} Pts Earned</span>`;
      }

    } else {
      payDetailHtml += `<span class="text-[10px] text-red-600 font-bold block mt-0.5">Reason: ${inv.voidReason || 'Cancelled'}</span>`;
      if (inv.voidAuthorizedBy) {
        payDetailHtml += `<span class="text-[9px] text-gray-500 font-semibold block">Authorized By: ${inv.voidAuthorizedBy}</span>`;
      }
    }

    const tr = document.createElement("tr");
    tr.className = `border-b border-gray-100 ${isVoided ? 'bg-red-50/50 opacity-70' : 'hover:bg-gray-50'}`;
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold ${isVoided ? 'text-gray-400 line-through' : 'text-blue-600'}">
        ${inv.invoiceNumber}
        ${isVoided ? `<span class="ml-1 text-[9px] bg-red-600 text-white font-black px-1.5 py-0.2 rounded">VOIDED</span>` : ''}
      </td>
      <td class="p-3.5 text-gray-500">${new Date(inv.createdAt || Date.now()).toLocaleString()}</td>
      <td class="p-3.5 font-bold">${inv.orderType} (Table: ${inv.tableNo || 'N/A'}${inv.waiterName ? ' | ' + inv.waiterName : ''}${inv.customerName ? ' | Cust: ' + inv.customerName : ''})</td>
      <td class="p-3.5">${payDetailHtml}</td>
      <td class="p-3.5 font-black ${isVoided ? 'text-gray-400 line-through' : 'text-gray-900'}">Rs. ${parseFloat(inv.netTotal || 0).toFixed(2)}</td>
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
              <button onclick="requestManagerVoidOverride('${id}')" title="Void Bill" class="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 px-2 py-1 rounded-lg font-bold text-xs transition cursor-pointer">
                <i class="fa-solid fa-ban mr-0.5"></i> Void
              </button>
            `
            : `<span class="text-[10px] font-black text-red-600 uppercase bg-red-100 px-2 py-0.5 rounded-md">Cancelled</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 📑 PAGINATION CONTROLS BAR
  if (totalPages > 1) {
    const pagRow = document.createElement("tr");
    pagRow.innerHTML = `
      <td colspan="6" class="p-3 bg-gray-50 border-t border-gray-200">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span class="text-gray-500 font-bold">
            Showing ${startIndex + 1} - ${Math.min(endIndex, list.length)} of ${list.length} Invoices (Page ${currentInvoicesPage} of ${totalPages})
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="changeInvoicesPage(${currentInvoicesPage - 1})" ${currentInvoicesPage <= 1 ? 'disabled class="opacity-40 cursor-not-allowed px-2.5 py-1 rounded-lg border bg-white"' : 'class="px-2.5 py-1 rounded-lg border bg-white hover:bg-gray-100 font-bold cursor-pointer"'}>
              <i class="fa-solid fa-chevron-left mr-1"></i> Prev
            </button>
            <span class="px-3 py-1 font-black bg-blue-50 text-blue-700 rounded-lg border border-blue-200">${currentInvoicesPage} / ${totalPages}</span>
            <button type="button" onclick="changeInvoicesPage(${currentInvoicesPage + 1})" ${currentInvoicesPage >= totalPages ? 'disabled class="opacity-40 cursor-not-allowed px-2.5 py-1 rounded-lg border bg-white"' : 'class="px-2.5 py-1 rounded-lg border bg-white hover:bg-gray-100 font-bold cursor-pointer"'}>
              Next <i class="fa-solid fa-chevron-right ml-1"></i>
            </button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(pagRow);
  }
}

// 2. ⭐ COMPREHENSIVE PROFIT & LOSS (P&L) STATEMENT
export function renderPnLStatement() {
  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  const invMode = erpState.settings?.inventoryMode || "recipe";

  // 1. REVENUE CALCULATIONS
  let grossMenuSales = 0;
  let totalBillDiscounts = 0;
  let totalLoyaltyDiscounts = 0;
  let recipeBOMCost = 0;

  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;

    const invTime = new Date(inv.createdAt || 0).getTime();
    if (invTime < fromTime || invTime > toTime) return;

    const sub = parseFloat(inv.subtotal || 0);
    const disc = parseFloat(inv.discountAmount || 0);
    const loyaltyDisc = parseFloat(inv.loyaltyDiscount || 0);

    grossMenuSales += sub;
    totalBillDiscounts += disc;
    totalLoyaltyDiscounts += loyaltyDisc;

    if (invMode === "recipe") {
      (inv.items || []).forEach(item => {
        const q = parseInt(item.qty) || 0;
        const dish = erpState.dishes[item.dishId];
        if (dish && dish.foodCost) {
          recipeBOMCost += (parseFloat(dish.foodCost) * q);
        } else if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
          let singleDishCost = 0;
          dish.ingredients.forEach(ing => {
            const raw = erpState.rawItems[ing.rawId];
            if (raw) {
              const convertedQty = convertRecipeQtyToBaseUnit(raw.unit, ing.qty, ing.unit);
              singleDishCost += (parseFloat(raw.cost || 0) * convertedQty);
            }
          });
          recipeBOMCost += (singleDishCost * q);
        }
      });
    }
  });

  // 2. STORE ISSUES CALCULATION
  let productionStoreIssuesCost = 0;
  let otherDeptIssuesCost = 0;

  const productionDepts = ["Kitchen", "Bar", "F&B", "Bakery"];

  Object.values(erpState.storeIssues || {}).forEach(iss => {
    const issTime = new Date(iss.timestamp || iss.date).getTime();
    if (issTime >= fromTime && issTime <= toTime) {
      const cost = parseFloat(iss.totalIssuedCost || 0);
      const dept = iss.department || "Kitchen";

      if (invMode === "issue") {
        if (productionDepts.includes(dept)) {
          productionStoreIssuesCost += cost;
        } else {
          otherDeptIssuesCost += cost;
        }
      } else {
        if (!productionDepts.includes(dept)) {
          otherDeptIssuesCost += cost;
        }
      }
    }
  });

  // 3. KITCHEN WASTAGE / SPOILAGE LOSS CALCULATION
  let totalWastageLoss = 0;
  Object.values(erpState.wastageLogs || {}).forEach(w => {
    const wTime = new Date(w.timestamp || w.date).getTime();
    if (wTime >= fromTime && wTime <= toTime) {
      totalWastageLoss += parseFloat(w.totalLossAmount || 0);
    }
  });

  // 4. PETTY CASH OPERATING EXPENSES
  let totalPettyExpenses = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    const pTime = new Date(p.timestamp || p.date || 0).getTime();
    if (pTime >= fromTime && pTime <= toTime) {
      if (p.type === "out") {
        totalPettyExpenses += parseFloat(p.amount || 0);
      }
    }
  });

  // 5. FINAL P&L METRICS
  const totalFoodCostCOGS = (invMode === "issue") ? productionStoreIssuesCost : recipeBOMCost;
  const totalAllDiscounts = totalBillDiscounts + totalLoyaltyDiscounts;
  const netSalesRevenue = Math.max(0, grossMenuSales - totalAllDiscounts);
  const grossProfit = Math.max(0, netSalesRevenue - totalFoodCostCOGS);
  
  const totalOperatingExpenses = totalPettyExpenses + otherDeptIssuesCost + totalWastageLoss;
  const estimatedNetProfit = netSalesRevenue - totalFoodCostCOGS - totalOperatingExpenses;
  
  const netProfitMarginPct = netSalesRevenue > 0 ? ((estimatedNetProfit / netSalesRevenue) * 100).toFixed(1) : "0.0";
  const foodCostPct = netSalesRevenue > 0 ? ((totalFoodCostCOGS / netSalesRevenue) * 100).toFixed(1) : "0.0";

  // 6. UPDATE SUMMARY CARDS
  const revEl = document.getElementById("pnlNetRevenueVal");
  const cogsEl = document.getElementById("pnlFoodCostVal");
  const cogsPctEl = document.getElementById("pnlFoodCostPctVal");
  const expEl = document.getElementById("pnlPettyExpensesVal");
  const expSubEl = document.getElementById("pnlExpensesSubtext");
  const netProfEl = document.getElementById("pnlNetProfitVal");
  const netMargEl = document.getElementById("pnlProfitMarginPctVal");
  const modeBadge = document.getElementById("pnlModeBadge");

  if (modeBadge) {
    modeBadge.innerText = (invMode === "issue") ? "Mode: Daily Store Issues" : "Mode: Recipe BOM";
    modeBadge.className = (invMode === "issue") ? "text-xs bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full" : "text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full";
  }

  if (revEl) revEl.innerText = `Rs. ${netSalesRevenue.toFixed(2)}`;
  if (cogsEl) cogsEl.innerText = `Rs. ${totalFoodCostCOGS.toFixed(2)}`;
  if (cogsPctEl) cogsPctEl.innerText = `${foodCostPct}% of Revenue (${invMode === 'issue' ? 'Store Issues' : 'BOM Recipe'})`;
  if (expEl) expEl.innerText = `Rs. ${totalOperatingExpenses.toFixed(2)}`;
  if (expSubEl) expSubEl.innerText = `Petty (Rs. ${totalPettyExpenses.toFixed(0)}) + Issues (Rs. ${otherDeptIssuesCost.toFixed(0)}) + Waste (Rs. ${totalWastageLoss.toFixed(0)})`;
  
  if (netProfEl) {
    netProfEl.innerText = `Rs. ${estimatedNetProfit.toFixed(2)}`;
    netProfEl.className = estimatedNetProfit >= 0 ? "text-2xl font-black text-emerald-700 mt-1 block" : "text-2xl font-black text-red-600 mt-1 block";
  }
  if (netMargEl) netMargEl.innerText = `Net Margin: ${netProfitMarginPct}%`;

  // 7. UPDATE DETAILED LEDGER BREAKDOWN ROWS
  const rGross = document.getElementById("pnlRowGrossSales");
  const rDisc = document.getElementById("pnlRowDiscounts");
  const rNet = document.getElementById("pnlRowNetSales");
  const rLabelCOGS = document.getElementById("pnlLabelCOGS");
  const rCogs = document.getElementById("pnlRowCOGS");
  const rGrossProf = document.getElementById("pnlRowGrossProfit");
  const rPetty = document.getElementById("pnlRowPettyExp");
  const rLabelDeptIssues = document.getElementById("pnlLabelDeptIssues");
  const rDeptIssues = document.getElementById("pnlRowDeptIssues");
  const rWastage = document.getElementById("pnlRowWastage");
  const rFinalNet = document.getElementById("pnlRowFinalNetProfit");

  if (rGross) rGross.innerText = `Rs. ${grossMenuSales.toFixed(2)}`;
  
  if (rDisc) {
    let discText = `-Rs. ${totalAllDiscounts.toFixed(2)}`;
    if (totalLoyaltyDiscounts > 0) {
      discText += ` (Bill: -Rs. ${totalBillDiscounts.toFixed(2)} | Pts: -Rs. ${totalLoyaltyDiscounts.toFixed(2)})`;
    }
    rDisc.innerText = discText;
  }

  if (rNet) rNet.innerText = `Rs. ${netSalesRevenue.toFixed(2)}`;
  
  if (rLabelCOGS) {
    rLabelCOGS.innerText = (invMode === "issue") 
      ? "3. (-) Cost of Goods Sold (Materials Issued to Kitchen, Bar & F&B: Store Issues)" 
      : "3. (-) Cost of Goods Sold (BOM Food Ingredients Cost of Billed Dishes)";
  }
  if (rCogs) rCogs.innerText = `-Rs. ${totalFoodCostCOGS.toFixed(2)}`;
  if (rGrossProf) rGrossProf.innerText = `Rs. ${grossProfit.toFixed(2)}`;
  if (rPetty) rPetty.innerText = `-Rs. ${totalPettyExpenses.toFixed(2)}`;

  if (rLabelDeptIssues) {
    rLabelDeptIssues.innerText = (invMode === "issue")
      ? "5. (-) Non-Food Department Store Issues (Staff Meals, Housekeeping, Other)"
      : "5. (-) Department Material Issues (Staff Meals, Housekeeping, Cleaning)";
  }
  if (rDeptIssues) rDeptIssues.innerText = `-Rs. ${otherDeptIssuesCost.toFixed(2)}`;
  if (rWastage) rWastage.innerText = `-Rs. ${totalWastageLoss.toFixed(2)}`;

  if (rFinalNet) {
    rFinalNet.innerText = `Rs. ${estimatedNetProfit.toFixed(2)}`;
    rFinalNet.className = estimatedNetProfit >= 0 ? "text-base text-emerald-700 font-black" : "text-base text-red-600 font-black";
  }
}

// 3. HOURLY SALES VELOCITY & PEAK TIMES REPORT
export function renderHourlyVelocityReport() {
  const tbody = document.getElementById("repHourlyTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

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

  let peakBucket = { hour: 0, label: "N/A", totalRevenue: 0, ordersCount: 0 };
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
    if (b.ordersCount === 0 && b.totalRevenue === 0) return;

    const pctBarWidth = Math.min(100, Math.round((b.totalRevenue / maxHourRevenue) * 100));
    const isPeak = b.hour === peakBucket.hour && peakBucket.totalRevenue > 0;

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

// 4. WAITER-WISE SALES & SERVICE CHARGE DISTRIBUTION REPORT
export function renderWaiterSalesReport() {
  const tbody = document.getElementById("repWaitersTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("repFromDate")?.value;
  const toVal = document.getElementById("repToDate")?.value;

  const fromTime = fromVal ? new Date(fromVal).getTime() : 0;
  const toTime = toVal ? new Date(toVal).getTime() : Infinity;

  const waiterMap = {};

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

// 🔒 MANAGER OVERRIDE VERIFICATION (TOAST SAFE)
export function requestManagerVoidOverride(invoiceId) {
  pendingVoidInvoiceId = invoiceId;
  const inv = erpState.invoices[invoiceId];
  if (!inv) return;

  const desc = document.getElementById("managerOverrideDesc");
  if (desc) desc.innerText = `Invoice #${inv.invoiceNumber} (Rs. ${inv.netTotal}) අවලංගු කිරීමට Manager PIN එක ඇතුළත් කරන්න:`;

  const pinIn = document.getElementById("managerOverridePinInput");
  if (pinIn) pinIn.value = "";

  document.getElementById("managerOverrideModal")?.classList.remove("hidden");
  setTimeout(() => pinIn?.focus(), 50);
}

export function closeManagerOverrideModal() {
  document.getElementById("managerOverrideModal")?.classList.add("hidden");
  pendingVoidInvoiceId = null;
}

export async function submitManagerOverrideAction() {
  const enteredPin = document.getElementById("managerOverridePinInput")?.value.trim();
  if (!enteredPin || !pendingVoidInvoiceId) return;

  let matchedManager = null;
  for (const e of Object.values(erpState.employees || {})) {
    const role = (e.role || "").toLowerCase().trim();
    const isManagerRole = role === "manager" || role === "owner" || role === "admin";
    if (isManagerRole) {
      const isMatch = await verifyPin(enteredPin, e.password);
      if (isMatch) {
        matchedManager = e;
        break;
      }
    }
  }

  const isOwnerDefault = (Object.values(erpState.employees || {}).length === 0 && enteredPin === "1234");

  if (!matchedManager && !isOwnerDefault) {
    showLiveToast("🚫 අවසර නැත", "බලයලත් Manager කෙනෙකුගේ PIN අංකයක් නොවේ! කරුණාකර නිවැරදි PIN එක ඇතුළත් කරන්න.", "warning", "fa-shield-halved");
    const pinIn = document.getElementById("managerOverridePinInput");
    if (pinIn) {
      pinIn.value = "";
      pinIn.focus();
    }
    return;
  }

  const idToVoid = pendingVoidInvoiceId;
  const authorizerName = matchedManager ? matchedManager.name : "Admin Manager";
  closeManagerOverrideModal();
  await executeVoidInvoiceProcess(idToVoid, authorizerName);
}

// 🔒 EXECUTE VOID INVOICE ENGINE
export async function executeVoidInvoiceProcess(invoiceId, authorizedByName = "Manager") {
  const inv = erpState.invoices[invoiceId];
  if (!inv) return;

  const reason = await showCustomInputModal(
    `Void Invoice #${inv.invoiceNumber}`,
    "අවලංගු කිරීමට හේතුව (උදා: Wrong Item, Cancelled)",
    ""
  );

  if (!reason || !reason.trim()) {
    showLiveToast("ℹ️ Void Cancelled", "හේතුවක් ඇතුළත් නොකළ නිසා බිල අවලංගු නොවුණි.", "info", "fa-circle-info");
    return;
  }

  try {
    if (dbRef && updateFn && currentTenant) {
      await updateFn(dbRef(`tenants/${currentTenant}/invoices/${invoiceId}`), {
        status: "Voided",
        voidReason: reason.trim(),
        voidedAt: new Date().toISOString(),
        voidAuthorizedBy: authorizedByName
      });

      if (erpState.invoices[invoiceId]) {
        erpState.invoices[invoiceId].status = "Voided";
        erpState.invoices[invoiceId].voidReason = reason.trim();
        erpState.invoices[invoiceId].voidAuthorizedBy = authorizedByName;
      }

      if (inv.customerId && erpState.customers?.[inv.customerId]) {
        const cust = erpState.customers[inv.customerId];
        const pointsReversed = Math.max(0, parseFloat(cust.loyaltyPoints || 0) + (inv.loyaltyPointsRedeemed || 0) - (inv.loyaltyPointsEarned || 0));
        const spendReversed = Math.max(0, parseFloat(cust.totalSpend || 0) - parseFloat(inv.netTotal || 0));
        const visitsReversed = Math.max(0, parseInt(cust.totalVisits || 1) - 1);

        await updateFn(dbRef(`tenants/${currentTenant}/customers/${inv.customerId}`), {
          loyaltyPoints: pointsReversed,
          totalSpend: Math.round(spendReversed * 100) / 100,
          totalVisits: visitsReversed
        });

        if (erpState.customers[inv.customerId]) {
          erpState.customers[inv.customerId].loyaltyPoints = pointsReversed;
          erpState.customers[inv.customerId].totalSpend = Math.round(spendReversed * 100) / 100;
          erpState.customers[inv.customerId].totalVisits = visitsReversed;
        }
      }

      const isRecipeMode = (erpState.settings?.inventoryMode || "recipe") === "recipe";
      if (isRecipeMode) {
        for (const item of (inv.items || [])) {
          const dish = erpState.dishes[item.dishId];
          if (dish && dish.ingredients && Array.isArray(dish.ingredients)) {
            for (const ing of dish.ingredients) {
              const rawItem = erpState.rawItems[ing.rawId];
              if (rawItem) {
                const convertedQty = convertRecipeQtyToBaseUnit(rawItem.unit, ing.qty, ing.unit);
                const totalRestock = convertedQty * (parseInt(item.qty) || 1);

                if (transactionFn) {
                  await transactionFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}/stock`), (currentStock) => {
                    const prev = (currentStock === null || isNaN(currentStock)) ? 0 : parseFloat(currentStock);
                    return parseFloat((prev + totalRestock).toFixed(3));
                  });
                } else {
                  const currentStock = parseFloat(erpState.rawItems[ing.rawId]?.stock || 0);
                  await updateFn(dbRef(`tenants/${currentTenant}/rawItems/${ing.rawId}`), {
                    stock: parseFloat((currentStock + totalRestock).toFixed(3))
                  });
                }
              }
            }
          }
        }
      }

      const matchedCreditEntry = Object.entries(erpState.customerCredits || {}).find(([id, c]) => c.invoiceId === invoiceId || c.invoiceNumber === inv.invoiceNumber);
      if (matchedCreditEntry) {
        await updateFn(dbRef(`tenants/${currentTenant}/customerCredits/${matchedCreditEntry[0]}`), {
          status: "Voided",
          voidReason: reason.trim()
        });
        if (erpState.customerCredits[matchedCreditEntry[0]]) {
          erpState.customerCredits[matchedCreditEntry[0]].status = "Voided";
        }
      }

      showLiveToast("🚫 Bill Voided", `Invoice #${inv.invoiceNumber} (${authorizedByName} විසින්) සාර්ථකව අවලංගු කරන ලදී.`, "warning", "fa-ban");
      renderInvoiceReportsList();
    }
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "බිල්පත Void කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
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
      <td class="p-3.5 text-gray-500">${c.date || new Date(c.createdAt || Date.now()).toLocaleDateString()}</td>
      <td class="p-3.5 font-mono text-blue-600">${c.invoiceNumber}</td>
      <td class="p-3.5 font-black ${isVoid ? 'text-gray-400 line-through' : 'text-red-600'}">Rs. ${parseFloat(c.amount || 0).toFixed(2)}</td>
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
      if (erpState.customerCredits[id]) {
        erpState.customerCredits[id].status = "Settled";
      }
      showLiveToast("💳 Credit Settled", "පාරිභෝගික ණය සාර්ථකව පියවන ලදී.", "success", "fa-circle-check");
      renderCustomerCreditsLedger();
    }
  }
}

// 🔒 UTF-8 BOM CSV EXPORT ENGINE
export function exportCurrentReportToCSV() {
  const dateStr = getLocalDateString();
  const invMode = erpState.settings?.inventoryMode || "recipe";

  if (activeReportTabName === "invoices") {
    const list = getFilteredInvoicesList();
    if (list.length === 0) {
      showLiveToast("ℹ️ Export Notice", "Export කිරීමට බිල්පත් දත්ත නොමැත.", "info", "fa-circle-info");
      return;
    }
    let csv = `Invoice Number,Date Time,Order Type,Table No,Waiter,Customer Name,Phone,Payment Method,Card Type,Subtotal,Bill Discount,Loyalty Pts Redeemed,Loyalty Discount (Rs.),Points Earned,SC,VAT,SSCL,Net Total,Status\n`;
    list.forEach(([id, inv]) => {
      csv += `"${inv.invoiceNumber}","${inv.createdAt}","${inv.orderType}","${inv.tableNo}","${inv.waiterName || 'N/A'}","${inv.customerName || ''}","${inv.customerPhone || ''}","${inv.payment ? inv.payment.method : 'cash'}","${inv.payment ? (inv.payment.cardType || '') : ''}","${inv.subtotal}","${inv.discountAmount || 0}","${inv.loyaltyPointsRedeemed || 0}","${inv.loyaltyDiscount || 0}","${inv.loyaltyPointsEarned || 0}","${inv.scAmount}","${inv.vatAmount}","${inv.cslAmount}","${inv.netTotal}","${inv.status || 'Paid'}"\n`;
    });
    downloadCSVFile(csv, `Invoices_Report_${dateStr}.csv`);

  } else if (activeReportTabName === "pnl") {
    const rGross = document.getElementById("pnlRowGrossSales")?.innerText || "0.00";
    const rDisc = document.getElementById("pnlRowDiscounts")?.innerText || "0.00";
    const rNet = document.getElementById("pnlRowNetSales")?.innerText || "0.00";
    const rCogs = document.getElementById("pnlRowCOGS")?.innerText || "0.00";
    const rGrossProf = document.getElementById("pnlRowGrossProfit")?.innerText || "0.00";
    const rPetty = document.getElementById("pnlRowPettyExp")?.innerText || "0.00";
    const rDeptIssues = document.getElementById("pnlRowDeptIssues")?.innerText || "0.00";
    const rWastage = document.getElementById("pnlRowWastage")?.innerText || "0.00";
    const rFinalNet = document.getElementById("pnlRowFinalNetProfit")?.innerText || "0.00";

    let csv = `P&L Statement Breakdown (${invMode === 'issue' ? 'Daily Store Issues Mode' : 'Recipe BOM Mode'}),Amount (Rs.)\n`;
    csv += `"1. Gross Menu Sales","${rGross}"\n`;
    csv += `"2. (-) Bill & Loyalty Discounts","${rDisc}"\n`;
    csv += `"3. Net Food & Beverage Revenue","${rNet}"\n`;
    csv += `"4. (-) Cost of Goods Sold (COGS: ${invMode === 'issue' ? 'Kitchen Store Issues' : 'BOM Recipe'})","${rCogs}"\n`;
    csv += `"5. Gross Kitchen Profit","${rGrossProf}"\n`;
    csv += `"6. (-) Operating Petty Cash Expenses","${rPetty}"\n`;
    csv += `"7. (-) Department Material Issues (Staff Meals/Housekeeping/Other)","${rDeptIssues}"\n`;
    csv += `"8. (-) Kitchen Spoilage / Wastage Loss","${rWastage}"\n`;
    csv += `"9. ESTIMATED NET OPERATING PROFIT","${rFinalNet}"\n`;

    downloadCSVFile(csv, `Profit_And_Loss_Statement_${dateStr}.csv`);

  } else if (activeReportTabName === "hourly") {
    const rows = document.querySelectorAll("#repHourlyTableBody tr");
    if (rows.length === 0) {
      showLiveToast("ℹ️ Export Notice", "Export කිරීමට පැයෙන් පැය විකුණුම් දත්ත නොමැත.", "info", "fa-circle-info");
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
      showLiveToast("ℹ️ Export Notice", "Export කිරීමට වේටර්වරුන්ගේ දත්ත නොමැත.", "info", "fa-circle-info");
      return;
    }
    let csv = `Emp ID,Waiter Name,Orders Served,Total Sales (Rs.),Generated SC (Rs.),Avg per Table (Rs.)\n`;
    rows.forEach(r => {
      const cols = r.querySelectorAll("td");
      if (cols.length >= 6) {
        csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}"\n`;
      }
    });
    downloadCSVFile(csv, `Waiter_Sales_Performance_${dateStr}.csv`);

  } else if (activeReportTabName === "items") {
    const rows = document.querySelectorAll("#repItemSalesTableBody tr");
    if (rows.length === 0) {
      showLiveToast("ℹ️ Export Notice", "Export කිරීමට දත්ත නොමැත.", "info", "fa-circle-info");
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
      showLiveToast("ℹ️ Export Notice", "Export කිරීමට ණය දත්ත නොමැත.", "info", "fa-circle-info");
      return;
    }
    let csv = `Customer Name,Phone,Date,Invoice Number,Amount,Status\n`;
    list.forEach(c => {
      csv += `"${c.customerName}","${c.customerPhone}","${c.date}","${c.invoiceNumber}","${c.amount}","${c.status}"\n`;
    });
    downloadCSVFile(csv, `Customer_Credits_${dateStr}.csv`);
  }
}

// 5. SMART SHIFT-BASED DAY-END Z-REPORT (WITH DETAILED CARD BREAKDOWN & RECONCILIATION)
export let currentZReportCalculatedData = null;

export async function openDayEndModal() {
  const now = new Date();
  const todayLocalStr = getLocalDateString(now);

  let shiftStartTimeMs;
  if (now.getHours() < 5) {
    shiftStartTimeMs = now.getTime() - (24 * 60 * 60 * 1000);
  } else {
    const todayMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0);
    shiftStartTimeMs = todayMorning.getTime();
  }

  const pastReports = Object.values(erpState.dayEndReports || {});
  if (pastReports.length > 0) {
    const validPastTimestamps = pastReports
      .map(r => new Date(r.auditTime || r.timestamp || r.date).getTime())
      .filter(t => !isNaN(t) && t < now.getTime());

    if (validPastTimestamps.length > 0) {
      const lastAuditTimestamp = Math.max(...validPastTimestamps);
      const hoursSinceLastZ = (now.getTime() - lastAuditTimestamp) / (1000 * 60 * 60);
      if (hoursSinceLastZ <= 36) {
        shiftStartTimeMs = lastAuditTimestamp;
      }
    }
  }

  let openingFloat = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    if (p.category === "Main Cash Drawer Top-up" && p.type === "in") {
      const floatTime = new Date(p.timestamp).getTime();
      if (floatTime >= shiftStartTimeMs) {
        openingFloat += parseFloat(p.amount || 0);
      }
    }
  });

  let grossSales = 0;
  let totalBillDiscounts = 0;
  let totalLoyaltyDiscounts = 0;
  let totalLoyaltyPointsRedeemed = 0;
  let totalServiceCharge = 0;
  let totalVAT = 0;
  let totalSSCL = 0;
  let netSales = 0;
  
  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;
  let creditSales = 0;

  // 💳 DETAILED CARD TYPES BREAKDOWN
  let cardVisa = 0;
  let cardMaster = 0;
  let cardAmex = 0;
  let cardOther = 0;
  
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
      const loyaltyDisc = parseFloat(inv.loyaltyDiscount || 0);
      const sc = parseFloat(inv.scAmount || 0);
      const vat = parseFloat(inv.vatAmount || 0);
      const csl = parseFloat(inv.cslAmount || 0);
      const net = parseFloat(inv.netTotal || 0);

      grossSales += sub;
      totalBillDiscounts += disc;
      totalLoyaltyDiscounts += loyaltyDisc;
      totalLoyaltyPointsRedeemed += parseInt(inv.loyaltyPointsRedeemed || 0);
      totalServiceCharge += sc;
      totalVAT += vat;
      totalSSCL += csl;
      netSales += net;

      const p = inv.payment || { method: "cash" };
      let invoiceCardAmount = 0;

      if (p.method === "cash") {
        cashSales += net;
      } else if (p.method === "card") {
        cardSales += net;
        invoiceCardAmount = net;
      } else if (p.method === "transfer") {
        transferSales += net;
      } else if (p.method === "credit") {
        creditSales += net;
      } else if (p.method === "split") {
        cashSales += parseFloat(p.splitCash || 0);
        const sCard = parseFloat(p.splitCard || 0);
        cardSales += sCard;
        invoiceCardAmount = sCard;
      }

      // 💳 Sort into Card Type Buckets
      if (invoiceCardAmount > 0) {
        const cType = (p.cardType || "Visa").toLowerCase();
        if (cType.includes("visa")) cardVisa += invoiceCardAmount;
        else if (cType.includes("master")) cardMaster += invoiceCardAmount;
        else if (cType.includes("amex")) cardAmex += invoiceCardAmount;
        else cardOther += invoiceCardAmount;
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

  let shiftPettyIn = 0;
  let shiftPettyOut = 0;
  let totalLifetimeIn = 0;
  let totalLifetimeOut = 0;

  Object.values(erpState.pettyCash || {}).forEach(p => {
    const amt = parseFloat(p.amount || 0);
    const pTime = new Date(p.timestamp || 0).getTime();

    if (p.type === "in") totalLifetimeIn += amt;
    else totalLifetimeOut += amt;

    if (pTime >= shiftStartTimeMs) {
      if (p.type === "in") shiftPettyIn += amt;
      else shiftPettyOut += amt;
    }
  });

  const pettyNetBalance = Math.round((totalLifetimeIn - totalLifetimeOut) * 100) / 100;
  const expectedDrawerCash = Math.round((cashSales + openingFloat) * 100) / 100;
  const totalAllDiscounts = totalBillDiscounts + totalLoyaltyDiscounts;

  currentZReportCalculatedData = {
    date: todayLocalStr,
    shiftStartTime: new Date(shiftStartTimeMs).toISOString(),
    auditTime: now.toISOString(),
    totalBillsCount,
    grossSales: Math.round(grossSales * 100) / 100,
    totalDiscounts: Math.round(totalAllDiscounts * 100) / 100,
    totalBillDiscounts: Math.round(totalBillDiscounts * 100) / 100,
    totalLoyaltyDiscounts: Math.round(totalLoyaltyDiscounts * 100) / 100,
    totalLoyaltyPointsRedeemed: totalLoyaltyPointsRedeemed,
    totalServiceCharge: Math.round(totalServiceCharge * 100) / 100,
    totalVAT: Math.round(totalVAT * 100) / 100,
    totalSSCL: Math.round(totalSSCL * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    cashSales: Math.round(cashSales * 100) / 100,
    cardSales: Math.round(cardSales * 100) / 100,
    cardBreakdown: {
      visa: Math.round(cardVisa * 100) / 100,
      master: Math.round(cardMaster * 100) / 100,
      amex: Math.round(cardAmex * 100) / 100,
      other: Math.round(cardOther * 100) / 100
    },
    transferSales: Math.round(transferSales * 100) / 100,
    creditSales: Math.round(creditSales * 100) / 100,
    openingFloat: Math.round(openingFloat * 100) / 100,
    expectedCash: expectedDrawerCash,
    pettyIn: Math.round(shiftPettyIn * 100) / 100,
    pettyOut: Math.round(shiftPettyOut * 100) / 100,
    pettyNetBalance: pettyNetBalance,
    orderTypes,
    categorySales
  };

  const cVal = document.getElementById("dayEndCashSalesVal");
  const flVal = document.getElementById("dayEndOpeningFloatVal");
  const cardVal = document.getElementById("dayEndCardSalesVal");
  const expVal = document.getElementById("dayEndExpectedCashVal");
  
  // Card Types Breakdown Spans
  const visaVal = document.getElementById("dayEndVisaTotalVal");
  const masterVal = document.getElementById("dayEndMasterTotalVal");
  const amexVal = document.getElementById("dayEndAmexTotalVal");
  const otherCardVal = document.getElementById("dayEndOtherCardTotalVal");
  const actCardIn = document.getElementById("dayEndActualCardInput");
  const cardVBox = document.getElementById("dayEndCardVarianceBox");

  const pettyBoxVal = document.getElementById("zModalPettyBoxBalance");
  const actIn = document.getElementById("dayEndActualCashInput");
  const vBox = document.getElementById("dayEndVarianceBox");

  if (cVal) cVal.innerText = `Rs. ${currentZReportCalculatedData.cashSales.toFixed(2)}`;
  if (flVal) flVal.innerText = `Rs. ${currentZReportCalculatedData.openingFloat.toFixed(2)}`;
  if (cardVal) cardVal.innerText = `Rs. ${currentZReportCalculatedData.cardSales.toFixed(2)}`;
  if (expVal) expVal.innerText = `Rs. ${currentZReportCalculatedData.expectedCash.toFixed(2)}`;

  if (visaVal) visaVal.innerText = `Rs. ${cardVisa.toFixed(2)}`;
  if (masterVal) masterVal.innerText = `Rs. ${cardMaster.toFixed(2)}`;
  if (amexVal) amexVal.innerText = `Rs. ${cardAmex.toFixed(2)}`;
  if (otherCardVal) otherCardVal.innerText = `Rs. ${cardOther.toFixed(2)}`;

  if (pettyBoxVal) pettyBoxVal.innerText = `Rs. ${currentZReportCalculatedData.pettyNetBalance.toFixed(2)}`;
  
  ["5000", "1000", "500", "100", "50", "20", "coins"].forEach(d => {
    const input = document.getElementById(`denom_${d}`);
    if (input) input.value = "";
  });

  if (actIn) actIn.value = "";
  if (actCardIn) actCardIn.value = "";

  if (vBox) {
    vBox.className = "p-3 rounded-xl border text-center font-bold text-xs bg-gray-100 text-gray-600";
    vBox.innerText = "නෝට්ටු ගණන හෝ මුළු මුදල ඇතුළත් කරන්න...";
  }

  if (cardVBox) {
    cardVBox.className = "p-1.5 rounded-lg border text-center font-bold text-[11px] bg-white text-gray-600";
    cardVBox.innerText = "Card Machine එකේ Settlement Total මුදල ඇතුළත් කරන්න...";
  }

  renderZReportModalBreakdowns(currentZReportCalculatedData);
  document.getElementById("dayEndModal")?.classList.remove("hidden");
  setTimeout(() => actIn?.focus(), 50);
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
  // 1. CASH RECONCILIATION
  const expectedCash = currentZReportCalculatedData ? currentZReportCalculatedData.expectedCash : 0;
  const actualCash = parseFloat(document.getElementById("dayEndActualCashInput")?.value || 0);
  const diffCash = actualCash - expectedCash;

  const box = document.getElementById("dayEndVarianceBox");
  if (box) {
    if (actualCash === 0 && !document.getElementById("dayEndActualCashInput")?.value) {
      box.className = "p-3 rounded-xl border text-center font-bold text-xs bg-gray-100 text-gray-600";
      box.innerText = "නෝට්ටු ගණන හෝ මුළු මුදල ඇතුළත් කරන්න...";
    } else if (Math.abs(diffCash) < 0.01) {
      box.className = "p-3 rounded-xl border border-green-300 bg-green-50 text-green-800 text-center font-black text-xs";
      box.innerHTML = `✅ Perfect Match! මුදල් පෙට්ටිය 100% ක් නිවැරදියි (Rs. 0.00)`;
    } else if (diffCash < 0) {
      box.className = "p-3 rounded-xl border border-red-300 bg-red-50 text-red-800 text-center font-black text-xs";
      box.innerHTML = `⚠️ මුදල් හිඟයකි (Cash Shortage): -Rs. ${Math.abs(diffCash).toFixed(2)}`;
    } else {
      box.className = "p-3 rounded-xl border border-yellow-300 bg-yellow-50 text-yellow-800 text-center font-black text-xs";
      box.innerHTML = `ℹ️ මුදල් වැඩිය (Cash Excess): +Rs. ${diffCash.toFixed(2)}`;
    }
  }

  // 2. 💳 CARD MACHINE RECONCILIATION
  const expectedCard = currentZReportCalculatedData ? currentZReportCalculatedData.cardSales : 0;
  const actualCardInput = document.getElementById("dayEndActualCardInput");
  const actualCard = parseFloat(actualCardInput?.value || 0);
  const diffCard = actualCard - expectedCard;

  const cardBox = document.getElementById("dayEndCardVarianceBox");
  if (cardBox) {
    if (actualCard === 0 && !actualCardInput?.value) {
      cardBox.className = "p-1.5 rounded-lg border text-center font-bold text-[11px] bg-white text-gray-600";
      cardBox.innerText = "Card Machine එකේ Settlement Total මුදල ඇතුළත් කරන්න...";
    } else if (Math.abs(diffCard) < 0.01) {
      cardBox.className = "p-1.5 rounded-lg border border-green-300 bg-green-50 text-green-800 text-center font-black text-[11px]";
      cardBox.innerHTML = `✅ Card Match! සම්පූර්ණයෙන්ම සමානයි (Rs. 0.00)`;
    } else if (diffCard < 0) {
      cardBox.className = "p-1.5 rounded-lg border border-red-300 bg-red-50 text-red-800 text-center font-black text-[11px]";
      cardBox.innerHTML = `⚠️ Card හිඟයකි (Card Shortage): -Rs. ${Math.abs(diffCard).toFixed(2)}`;
    } else {
      cardBox.className = "p-1.5 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800 text-center font-black text-[11px]";
      cardBox.innerHTML = `ℹ️ Card වැඩිය (Card Excess): +Rs. ${diffCard.toFixed(2)}`;
    }
  }
}

// 🔒 SAVE Z-REPORT & SILENT DIRECT HARDWARE PRINT
export async function printAndSaveZReport() {
  if (!currentZReportCalculatedData) return;

  const actualCash = parseFloat(document.getElementById("dayEndActualCashInput")?.value || 0);
  const varianceCash = actualCash - currentZReportCalculatedData.expectedCash;

  const actualCard = parseFloat(document.getElementById("dayEndActualCardInput")?.value || 0);
  const varianceCard = actualCard - currentZReportCalculatedData.cardSales;

  const fullZReportPayload = {
    ...currentZReportCalculatedData,
    actualCash: Math.round(actualCash * 100) / 100,
    variance: Math.round(varianceCash * 100) / 100,
    actualCard: Math.round(actualCard * 100) / 100,
    cardVariance: Math.round(varianceCard * 100) / 100,
    timestamp: new Date().toISOString(),
    hotelName: currentTenantInfo?.hotelName || "Restaurant ERP"
  };

  try {
    if (dbRef && pushFn && updateFn && currentTenant) {
      const zRef = await pushFn(dbRef(`tenants/${currentTenant}/dayEndReports`), fullZReportPayload);
      if (!erpState.dayEndReports) erpState.dayEndReports = {};
      erpState.dayEndReports[zRef.key] = fullZReportPayload;
      
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
        cardBreakdown: fullZReportPayload.cardBreakdown,
        transferSales: fullZReportPayload.transferSales,
        creditSales: fullZReportPayload.creditSales,
        totalDiscounts: fullZReportPayload.totalDiscounts,
        loyaltyDiscounts: fullZReportPayload.totalLoyaltyDiscounts,
        categorySales: fullZReportPayload.categorySales,
        updatedAt: new Date().toISOString()
      });
    }

    try {
      if (window.electronAPI && window.electronAPI.saveLocalAutoBackup) {
        const localBackupPayload = {
          tenantId: currentTenant,
          date: fullZReportPayload.date,
          zReport: fullZReportPayload,
          databaseSnapshot: JSON.parse(JSON.stringify(erpState))
        };
        await window.electronAPI.saveLocalAutoBackup(localBackupPayload);
      }
    } catch (backupErr) {
      console.warn("Auto local backup pass:", backupErr);
    }

    renderAdvancedThermalZReport(fullZReportPayload);

    const pr = erpState.settings?.printers || {};
    const targetPrinter = pr.p1?.device || pr.p4?.device || "";
    await sendDirectSilentPrint(targetPrinter, "", "zReportPrintModal");

    closeDayEndModal();
    showLiveToast("📑 Z-Report Completed", "දවසේ සම්පූර්ණ Z-Report එක සාර්ථකව Print වී Local Backup එක සුරැකිණි.", "success", "fa-vault");
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Z-Report සේව් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// THERMAL PRINTABLE Z-REPORT FORMATTER (WITH CARD AUDIT)
function renderAdvancedThermalZReport(z) {
  const zHotel = document.getElementById("zHotelName");
  const zDate = document.getElementById("zReportDate");

  if (zHotel) zHotel.innerText = (z.hotelName || "RESTAURANT ERP").toUpperCase();
  if (zDate) zDate.innerText = `Shift: ${new Date(z.shiftStartTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${new Date(z.auditTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} | ${z.date}`;

  const zGross = document.getElementById("zGrossSales");
  const zDisc = document.getElementById("zDiscounts");
  const zSC = document.getElementById("zServiceCharge");
  const zVAT = document.getElementById("zVAT");
  const zSSCL = document.getElementById("zSSCL");
  const zNet = document.getElementById("zNetSales");

  if (zGross) zGross.innerText = `Rs. ${z.grossSales.toFixed(2)}`;

  let discDisplay = `-Rs. ${z.totalDiscounts.toFixed(2)}`;
  if (z.totalLoyaltyDiscounts > 0) {
    discDisplay += ` (Pts: -Rs.${z.totalLoyaltyDiscounts.toFixed(0)})`;
  }
  if (zDisc) zDisc.innerText = discDisplay;

  if (zSC) zSC.innerText = `Rs. ${z.totalServiceCharge.toFixed(2)}`;
  if (zVAT) zVAT.innerText = `Rs. ${z.totalVAT.toFixed(2)}`;
  if (zSSCL) zSSCL.innerText = `Rs. ${z.totalSSCL.toFixed(2)}`;
  if (zNet) zNet.innerText = `Rs. ${z.netSales.toFixed(2)}`;

  const zCash = document.getElementById("zCashSales");
  const zCard = document.getElementById("zCardSales");
  const zTrans = document.getElementById("zTransferSales");
  const zCred = document.getElementById("zCreditSales");

  if (zCash) zCash.innerText = `Rs. ${z.cashSales.toFixed(2)}`;
  
  if (zCard) {
    const cb = z.cardBreakdown || { visa: 0, master: 0, amex: 0, other: 0 };
    zCard.innerHTML = `
      <span>Rs. ${z.cardSales.toFixed(2)}</span>
      <div style="font-size: 8.5px; color: #444; font-weight: normal; margin-top: 2px;">
        Visa: Rs.${cb.visa.toFixed(0)} | Master: Rs.${cb.master.toFixed(0)}<br>
        AMEX: Rs.${cb.amex.toFixed(0)} | Other: Rs.${cb.other.toFixed(0)}
      </div>
    `;
  }

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

  const zOpeningFloat = document.getElementById("zOpeningFloat");
  const zDrawerCash = document.getElementById("zDrawerCashSales");
  const zExp = document.getElementById("zExpectedCash");
  const zAct = document.getElementById("zActualCash");
  const zVar = document.getElementById("zVariance");

  if (zOpeningFloat) zOpeningFloat.innerText = `+ Rs. ${z.openingFloat.toFixed(2)}`;
  if (zDrawerCash) zDrawerCash.innerText = `+ Rs. ${z.cashSales.toFixed(2)}`;
  if (zExp) zExp.innerText = `Rs. ${z.expectedCash.toFixed(2)}`;
  if (zAct) zAct.innerText = `Rs. ${z.actualCash.toFixed(2)}`;
  if (zVar) {
    zVar.innerText = `Rs. ${z.variance.toFixed(2)}`;
    zVar.className = z.variance < 0 ? "text-red-700 font-black" : "font-black";
  }

  const zPIn = document.getElementById("zPrintPettyIn");
  const zPOut = document.getElementById("zPrintPettyOut");
  const zPBal = document.getElementById("zPrintPettyBal");

  if (zPIn) zPIn.innerText = `Rs. ${z.pettyIn.toFixed(2)}`;
  if (zPOut) zPOut.innerText = `Rs. ${z.pettyOut.toFixed(2)}`;
  if (zPBal) zPBal.innerText = `Rs. ${z.pettyNetBalance.toFixed(2)}`;
}

// 6. SHIFT HANDOVER (X-REPORT)
export function openShiftHandoverModal() {
  const todayLocalStr = getLocalDateString(new Date());
  document.getElementById("shiftHandoverForm")?.reset();

  let openingFloat = 0;
  Object.values(erpState.pettyCash || {}).forEach(p => {
    if (p.category === "Main Cash Drawer Top-up" && p.type === "in") {
      const pDate = p.date || (p.timestamp ? getLocalDateString(new Date(p.timestamp)) : '');
      if (pDate === todayLocalStr) {
        openingFloat += parseFloat(p.amount || 0);
      }
    }
  });

  let cashSales = 0;
  Object.values(erpState.invoices || {}).forEach(inv => {
    if (inv.status === "Voided") return;
    const invDate = inv.date || (inv.createdAt ? getLocalDateString(new Date(inv.createdAt)) : '');
    if (invDate === todayLocalStr) {
      const p = inv.payment || { method: "cash" };
      if (p.method === "cash") cashSales += parseFloat(inv.netTotal || 0);
      else if (p.method === "split") cashSales += parseFloat(p.splitCash || 0);
    }
  });

  const expectedCash = openingFloat + cashSales;
  const expVal = document.getElementById("handoverExpectedCashVal");
  if (expVal) expVal.innerText = `Rs. ${expectedCash.toFixed(2)}`;

  document.getElementById("shiftHandoverModal")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("handoverActualCashInput")?.focus(), 50);
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

    const pr = erpState.settings?.printers || {};
    const targetPrinter = pr.p1?.device || pr.p4?.device || "";
    await sendDirectSilentPrint(targetPrinter, "", "xReportPrintModal");

    showLiveToast("🤝 Shift Handover Verified", `${outgoing} -> ${incoming} වෙත මුදල් පෙට්ටිය සාර්ථකව භාරදෙන ලදී.`, "success", "fa-arrows-split-up-and-left");
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Shift Handover දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// Global Window Exports
window.switchReportTab = switchReportTab;
window.setReportPeriodPreset = setReportPeriodPreset;
window.applyReportDateFilter = applyReportDateFilter;
window.changeInvoicesPage = changeInvoicesPage;
window.reprintInvoice = reprintInvoice;
window.shareWhatsAppInvoice = shareWhatsAppInvoice;
window.settleCustomerCredit = settleCustomerCredit;
window.exportCurrentReportToCSV = exportCurrentReportToCSV;
window.renderPnLStatement = renderPnLStatement;
window.renderHourlyVelocityReport = renderHourlyVelocityReport;
window.renderWaiterSalesReport = renderWaiterSalesReport;
window.renderItemWiseSalesSummary = renderItemWiseSalesSummary;
window.renderCustomerCreditsLedger = renderCustomerCreditsLedger;
window.requestManagerVoidOverride = requestManagerVoidOverride;
window.closeManagerOverrideModal = closeManagerOverrideModal;
window.submitManagerOverrideAction = submitManagerOverrideAction;
window.openDayEndModal = openDayEndModal;
window.closeDayEndModal = closeDayEndModal;
window.calculateCashDenominations = calculateCashDenominations;
window.calculateDayEndVariance = calculateDayEndVariance;
window.printAndSaveZReport = printAndSaveZReport;
window.openShiftHandoverModal = openShiftHandoverModal;
window.closeShiftHandoverModal = closeShiftHandoverModal;
window.handleShiftHandoverSubmit = handleShiftHandoverSubmit;
