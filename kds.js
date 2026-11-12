// ==========================================================================
// MODULE 03: KITCHEN DISPLAY SYSTEM (KDS) & LIVE ELAPSED TIMER ENGINE
// 🛡️ XSS & SPECIAL CHARACTER NOTE-SAFE ARCHITECTURE
// ❌ REAL-TIME ITEM & ORDER CANCELLATION (VOID) SAFE ENGINE
// ⚡ LEAK-FREE INTERVAL TICKER & DYNAMIC COLOR ALERT ENGINE
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast, escapeHTML } from './utils.js';

let dbRef = null;
let updateFn = null;
let kdsTimerInterval = null;

export function initKdsContext(dbRefInstance, updateMethod) {
  dbRef = dbRefInstance;
  updateFn = updateMethod;
  
  // Start Realtime KDS 1-Second Timer Ticker
  if (kdsTimerInterval) clearInterval(kdsTimerInterval);
  kdsTimerInterval = setInterval(() => {
    updateKDSElapsedTimersUI();
  }, 1000);
}

// 🛡️ REPAIRED (BUG #22 FIXED): CLEANUP INTERVAL TIMER TO PREVENT MEMORY LEAK
export function stopKDSTimer() {
  if (kdsTimerInterval) {
    clearInterval(kdsTimerInterval);
    kdsTimerInterval = null;
  }
}

// 1. RENDER KDS ORDERS GRID WITH ITEM-BY-ITEM STRIKE-THROUGH & CANCELLATION SUPPORT
export function renderKDSOrdersGrid() {
  const container = document.getElementById("kitchenOrdersList");
  const badge = document.getElementById("activeKitchenCount");
  const navBadge = document.getElementById("navKitchenBadge");
  if (!container) return;
  
  const orders = Object.entries(erpState.kitchenOrders || {}).filter(([id, o]) => o.status === "Cooking");
  
  if (badge) badge.innerText = `${orders.length} Active Orders`;
  if (navBadge) {
    if (orders.length > 0) {
      navBadge.innerText = orders.length;
      navBadge.classList.remove("hidden");
    } else {
      navBadge.classList.add("hidden");
    }
  }
  
  if (orders.length === 0) {
    container.innerHTML = `<p class="col-span-full text-center text-gray-400 py-16 text-xs bg-white rounded-2xl border border-gray-200">පිසීමට නියමිත Orders කිසිවක් නැත...</p>`;
    return;
  }
  
  container.innerHTML = "";
  orders.forEach(([id, order]) => {
    const card = document.createElement("div");
    card.setAttribute("data-order-id", id);
    card.setAttribute("data-order-time", order.timestamp);
    
    const itemsList = order.items || [];
    const nonCancelledItems = itemsList.filter(i => !i.isCancelled);
    const hasNonCancelled = nonCancelledItems.length > 0;
    
    // 🛡️ All non-cancelled items prepared check (Cancelled items do not block the ticket)
    const allItemsPrepared = hasNonCancelled && nonCancelledItems.every(i => i.isPrepared);
    const allItemsCancelled = itemsList.length > 0 && itemsList.every(i => i.isCancelled);
    
    card.className = allItemsCancelled ?
      "bg-red-50/40 p-4 rounded-2xl border-2 border-red-300 shadow-sm flex flex-col justify-between space-y-3 kds-ticket-card" :
      "bg-white p-4 rounded-2xl border-2 border-yellow-300 shadow-sm flex flex-col justify-between space-y-3 kds-ticket-card";
    
    const itemsHtml = itemsList.map((i, idx) => {
      const isCancelled = !!i.isCancelled;
      const isPrepared = !!i.isPrepared;
      return `
        <div ${isCancelled ? '' : `onclick="toggleKDSItemPrepared('${id}', ${idx})"`} class="flex justify-between items-center py-2 px-2.5 rounded-xl border transition select-none ${
          isCancelled 
            ? 'bg-red-50 border-red-200 line-through opacity-70 text-red-600 cursor-not-allowed' 
            : isPrepared 
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs cursor-pointer' 
              : 'bg-gray-50 hover:bg-yellow-50/70 border-gray-200 text-gray-800 cursor-pointer'
        }">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" ${isPrepared ? 'checked' : ''} ${isCancelled ? 'disabled' : ''} class="w-4 h-4 text-emerald-600 rounded cursor-pointer pointer-events-none">
            <div>
              <span class="font-bold text-xs ${isCancelled ? 'line-through text-red-700' : isPrepared ? 'line-through text-gray-500 font-semibold' : 'text-gray-900'}">${escapeHTML(i.name)}</span>
              ${i.isAddOn ? `<span class="ml-1 bg-yellow-100 text-yellow-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase">➕ Add-on</span>` : ''}
              ${isCancelled ? `<span class="ml-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase">❌ Cancelled</span>` : ''}
              ${i.cancelReason ? `<span class="block text-[10px] text-red-600 font-bold mt-0.5">⚠️ Reason: ${escapeHTML(i.cancelReason)}</span>` : ''}
              ${i.note ? `<span class="block text-[10px] text-purple-700 italic font-bold mt-0.5">📝 ${escapeHTML(i.note)}</span>` : ''}
            </div>
          </div>
          <span class="font-black ${isCancelled ? 'bg-red-200 text-red-900' : isPrepared ? 'bg-emerald-200 text-emerald-900' : 'bg-yellow-100 text-yellow-900'} px-2 py-0.5 rounded-lg text-xs">x${i.qty}</span>
        </div>
      `;
    }).join("");
    
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start border-b border-gray-100 pb-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] bg-yellow-100 text-yellow-800 font-extrabold px-2 py-0.5 rounded-full uppercase">${escapeHTML(order.orderType || 'Dine-in')}</span>
              <span id="kds-timer-${id}" class="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                ⏱️ 00:00
              </span>
            </div>
            <h4 class="font-black text-sm text-gray-900 mt-1">Table: ${escapeHTML(order.tableNo)}</h4>
          </div>
          <span class="text-[10px] text-gray-400 font-mono font-bold">${new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="pt-2 space-y-1.5">
          ${itemsHtml}
        </div>
      </div>

      <button onclick="completeKitchenOrder('${id}')" class="w-full ${
        allItemsCancelled 
          ? 'bg-red-600 hover:bg-red-700' 
          : allItemsPrepared 
            ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' 
            : 'bg-green-600 hover:bg-green-700'
      } text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer">
        <i class="fa-solid ${allItemsCancelled ? 'fa-xmark' : 'fa-check'} text-sm"></i>
        <span>${
          allItemsCancelled 
            ? '❌ All Items Cancelled - Dismiss Order' 
            : allItemsPrepared 
              ? '🎉 All Prepared - Mark Order Ready' 
              : 'Mark Ready / Complete'
        }</span>
      </button>
    `;
    container.appendChild(card);
  });
  
  updateKDSElapsedTimersUI();
}

// 2. LIVE ELAPSED TIMER TICKER (GREEN -> ORANGE -> RED DELAY)
export function updateKDSElapsedTimersUI() {
  const cards = document.querySelectorAll(".kds-ticket-card");
  if (cards.length === 0) return;
  const nowMs = Date.now();
  
  cards.forEach(card => {
    const id = card.getAttribute("data-order-id");
    const timeStr = card.getAttribute("data-order-time");
    if (!id || !timeStr) return;
    
    const orderMs = new Date(timeStr).getTime();
    const diffSec = Math.max(0, Math.floor((nowMs - orderMs) / 1000));
    
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    const formatted = `⏱️ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const timerEl = document.getElementById(`kds-timer-${id}`);
    if (!timerEl) return;
    
    timerEl.innerText = formatted;
    
    if (mins >= 20) {
      timerEl.className = "text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse";
      if (!card.classList.contains("border-red-500")) {
        card.className = "bg-white p-4 rounded-2xl border-2 border-red-500 shadow-lg flex flex-col justify-between space-y-3 kds-ticket-card";
      }
    } else if (mins >= 10) {
      timerEl.className = "text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-yellow-500 text-white";
      if (!card.classList.contains("border-yellow-400")) {
        card.className = "bg-white p-4 rounded-2xl border-2 border-yellow-400 shadow-sm flex flex-col justify-between space-y-3 kds-ticket-card";
      }
    } else {
      timerEl.className = "text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-green-100 text-green-800";
    }
  });
}

// 3. TOGGLE SINGLE ITEM PREPARED / COOKED STATUS
export async function toggleKDSItemPrepared(orderId, itemIndex) {
  if (!dbRef || !updateFn || !currentTenant) return;
  const order = erpState.kitchenOrders[orderId];
  if (!order || !order.items || !order.items[itemIndex]) return;
  
  // 🛡️ Cancelled items cannot be marked as prepared
  if (order.items[itemIndex].isCancelled) return;
  
  const currentPrepared = !!order.items[itemIndex].isPrepared;
  const updatedItems = [...order.items];
  updatedItems[itemIndex] = {
    ...updatedItems[itemIndex],
    isPrepared: !currentPrepared
  };
  
  try {
    await updateFn(dbRef(`tenants/${currentTenant}/kitchenOrders/${orderId}`), {
      items: updatedItems
    });
    if (erpState.kitchenOrders[orderId]) {
      erpState.kitchenOrders[orderId].items = updatedItems;
    }
    renderKDSOrdersGrid();
  } catch (err) {
    console.error("KDS item toggle error:", err);
  }
}

// 4. MARK FULL KITCHEN ORDER COMPLETE / DISMISS
export async function completeKitchenOrder(id) {
  if (!dbRef || !updateFn || !currentTenant) return;
  const order = erpState.kitchenOrders[id];
  const allCancelled = (order?.items || []).length > 0 && (order?.items || []).every(i => i.isCancelled);
  
  const newStatus = allCancelled ? "Cancelled" : "Ready";
  await updateFn(dbRef(`tenants/${currentTenant}/kitchenOrders/${id}`), { status: newStatus });
  
  if (erpState.kitchenOrders[id]) {
    erpState.kitchenOrders[id].status = newStatus;
  }
  
  if (allCancelled) {
    showLiveToast("🗑️ Order Dismissed", `Table ${order ? order.tableNo : ''} අවලංගු කළ ඇණවුම KDS තිරයෙන් ඉවත් කරන ලදී.`, "info", "fa-ban");
  } else {
    showLiveToast("🛎️ Order Ready!", `Table ${order ? order.tableNo : ''} කෑම පිළියෙල කර අවසන්!`, "kitchen", "fa-bell-concierge");
  }
  
  renderKDSOrdersGrid();
}

// Global Window Exports
window.completeKitchenOrder = completeKitchenOrder;
window.toggleKDSItemPrepared = toggleKDSItemPrepared;
window.renderKDSOrdersGrid = renderKDSOrdersGrid;
window.updateKDSElapsedTimersUI = updateKDSElapsedTimersUI;
window.stopKDSTimer = stopKDSTimer;
