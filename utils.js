// ==========================================================================
// MODULE 02: UTILITIES (AUDIO, TOASTS, DIRECT WHATSAPP & HELPERS)
// ==========================================================================

export let alertHistory = [];

// 1. DYNAMIC AUDIO CHIME GENERATOR (NO EXTERNAL MP3 NEEDED)
export function triggerAudioAlert(soundType = "info") {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (soundType === "kitchen" || soundType === "newOrder") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else if (soundType === "success") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else if (soundType === "warning") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Audio pass on unsupported browsers
  }
}

// 2. HIGH-VISIBILITY FLOATING TOAST NOTIFICATION
export function showLiveToast(titleText, msgText, alertType = "info", iconClass = "fa-bell") {
  triggerAudioAlert(alertType);
  
  const newAlert = {
    id: Date.now(),
    title: titleText,
    message: msgText,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: alertType,
    icon: iconClass
  };
  alertHistory.unshift(newAlert);
  if (alertHistory.length > 25) alertHistory.pop();
  updateNotificationCenterUI();
  
  const toastContainer = document.getElementById("liveToastContainer");
  if (!toastContainer) return;
  
  const toastElem = document.createElement("div");
  
  const colorMap = {
    kitchen: "bg-yellow-500 text-black border-yellow-600 shadow-xl",
    newOrder: "bg-purple-600 text-white border-purple-700 shadow-xl",
    success: "bg-green-600 text-white border-green-700 shadow-xl",
    warning: "bg-red-600 text-white border-red-700 shadow-xl",
    info: "bg-blue-600 text-white border-blue-700 shadow-xl"
  };
  const colorClass = colorMap[alertType] || "bg-gray-900 text-white border-gray-700 shadow-xl";
  
  toastElem.className = `p-4 rounded-2xl border-2 shadow-2xl flex items-center justify-between pointer-events-auto toast-animate ${colorClass}`;
  toastElem.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-black bg-opacity-20 flex items-center justify-center text-base font-bold flex-shrink-0">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <div>
        <h5 class="font-black text-sm leading-tight">${titleText}</h5>
        <p class="text-xs mt-0.5 font-medium leading-snug opacity-95">${msgText}</p>
      </div>
    </div>
    <button onclick="this.parentElement.remove()" class="text-white opacity-70 hover:opacity-100 p-1 text-sm ml-3 cursor-pointer">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  
  toastContainer.appendChild(toastElem);
  
  setTimeout(() => {
    if (toastElem.parentElement) {
      toastElem.style.opacity = "0";
      toastElem.style.transition = "opacity 0.4s ease";
      setTimeout(() => toastElem.remove(), 400);
    }
  }, 4500);
}

// 3. NOTIFICATION DRAWER
export function toggleNotificationPanel() {
  const panel = document.getElementById("notifPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
  const badge = document.getElementById("notifBadge");
  if (badge) badge.classList.add("hidden");
}

export function updateNotificationCenterUI() {
  const listElem = document.getElementById("notifListContainer");
  const badgeElem = document.getElementById("notifBadge");
  if (!listElem) return;
  
  if (alertHistory.length === 0) {
    listElem.innerHTML = `<p class="text-center text-gray-400 py-8 text-xs">දැනුම්දීම් කිසිවක් නැත...</p>`;
    if (badgeElem) badgeElem.classList.add("hidden");
    return;
  }
  
  if (badgeElem) {
    badgeElem.innerText = alertHistory.length;
    badgeElem.classList.remove("hidden");
  }
  
  listElem.innerHTML = "";
  alertHistory.forEach(item => {
    const row = document.createElement("div");
    row.className = "p-3 hover:bg-gray-50 flex items-start gap-2.5 transition";
    row.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
        <i class="fa-solid ${item.icon}"></i>
      </div>
      <div class="flex-1">
        <div class="flex justify-between items-center">
          <h6 class="font-bold text-gray-800 text-xs">${item.title}</h6>
          <span class="text-[9px] text-gray-400">${item.time}</span>
        </div>
        <p class="text-[11px] text-gray-500 mt-0.5">${item.message}</p>
      </div>
    `;
    listElem.appendChild(row);
  });
}

export function clearAllNotifications() {
  alertHistory = [];
  updateNotificationCenterUI();
}

export function manualPurgeSystemMemory() {
  alertHistory = [];
  updateNotificationCenterUI();
  showLiveToast("🧹 RAM & Cache Cleaned", "පද්ධතියේ තාවකාලික මතකය (Cache) සාර්ථකව පිරිසිදු කරන ලදී.", "success", "fa-broom");
}

// 4. ACCURATE SINHALA UTF-8 BOM CSV EXPORT HELPER
export function downloadCSVFile(csvContent, filename) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  showLiveToast("📊 Report Exported", `${filename} සාර්ථකව Excel (CSV) ලෙස බාගත විය.`, "success", "fa-file-excel");
}

// 5. DEBOUNCE HELPER
export function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 6. DATE FORMATTING UTILITIES
export function getLocalDateString(d = new Date()) {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return new Date().toISOString().split("T")[0];
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
}

export function formatDateTimeLocal(d = new Date()) {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return "";
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

export function formatCurrency(amount = 0) {
  const num = parseFloat(amount || 0);
  return `Rs. ${num.toFixed(2)}`;
}

// 🔒 7. ELECTRON-SAFE TOUCH-FRIENDLY CUSTOM INPUT PROMPT
export function showCustomInputModal(titleText, placeholderText = "", defaultValue = "") {
  return new Promise((resolve) => {
    const existing = document.getElementById("globalCustomPromptModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "globalCustomPromptModal";
    overlay.className = "fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4";
    overlay.innerHTML = `
      <div class="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 border border-gray-100 text-center animate-pulse-once">
        <div class="w-12 h-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center mx-auto text-xl">
          <i class="fa-brands fa-whatsapp"></i>
        </div>
        <div>
          <h4 class="font-black text-base text-gray-800">${titleText}</h4>
          <p class="text-[11px] text-gray-400 mt-0.5">පාරිභෝගිකයාගේ WhatsApp අංකය ඇතුළත් කරන්න</p>
        </div>
        <input type="text" id="customPromptInputField" value="${defaultValue}" placeholder="${placeholderText}" class="w-full p-3 border-2 border-green-400 rounded-2xl text-center text-base font-bold outline-none bg-green-50/40 text-gray-800 focus:bg-white focus:border-green-600 transition">
        <div class="flex justify-end gap-2 pt-2 text-xs font-bold border-t border-gray-100">
          <button type="button" id="customPromptCancelBtn" class="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 transition cursor-pointer">Cancel</button>
          <button type="button" id="customPromptOkBtn" class="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-md transition cursor-pointer">OK (Send)</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#customPromptInputField");
    if (input) {
      input.focus();
      input.select();
    }

    const cleanup = (resultVal) => {
      overlay.remove();
      resolve(resultVal);
    };

    overlay.querySelector("#customPromptOkBtn").onclick = () => cleanup(input.value.trim());
    overlay.querySelector("#customPromptCancelBtn").onclick = () => cleanup(null);

    input.onkeydown = (e) => {
      if (e.key === "Enter") cleanup(input.value.trim());
      if (e.key === "Escape") cleanup(null);
    };
  });
}

// 📲 8. DIRECT WHATSAPP DESKTOP RECEIPT ENGINE (BYPASSES BROWSER LANDING PAGE)
export async function sendInvoiceViaWhatsApp(invoiceData, hotelName = "Restaurant ERP", inputPhone = null) {
  let rawPhone = inputPhone;
  
  if (!rawPhone && invoiceData.customerPhone) {
    rawPhone = invoiceData.customerPhone;
  } else if (!rawPhone && invoiceData.payment && invoiceData.payment.customerPhone) {
    rawPhone = invoiceData.payment.customerPhone;
  }
  
  if (!rawPhone) {
    rawPhone = await showCustomInputModal("WhatsApp Bill Dispatch", "0771234567");
  }
  
  if (!rawPhone) {
    showLiveToast("ℹ️ WhatsApp Cancelled", "දුරකථන අංකයක් ඇතුළත් නොකළ නිසා WhatsApp නොයැවුණි.", "info", "fa-circle-info");
    return;
  }
  
  let cleanPhone = String(rawPhone).replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "94" + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith("94") && cleanPhone.length === 9) {
    cleanPhone = "94" + cleanPhone;
  }
  
  const dateStr = new Date(invoiceData.createdAt || Date.now()).toLocaleString();
  let itemsListText = "";
  
  (invoiceData.items || []).forEach(i => {
    const noteTag = i.note ? ` (${i.note})` : "";
    itemsListText += `▪️ ${i.name}${noteTag} x${i.qty} = Rs. ${(i.price * i.qty).toFixed(2)}\n`;
  });
  
  let message = `🍽️ *${hotelName.toUpperCase()}*\n`;
  message += `📜 *DIGITAL INVOICE: #${invoiceData.invoiceNumber}*\n`;
  message += `📅 Date: ${dateStr}\n`;
  message += `🏷️ Type: ${invoiceData.orderType} (Table: ${invoiceData.tableNo || 'N/A'})\n`;
  if (invoiceData.customerName) {
    message += `👤 Customer: ${invoiceData.customerName}\n`;
  }
  message += `------------------------------------\n`;
  message += `${itemsListText}`;
  message += `------------------------------------\n`;
  message += `Subtotal: Rs. ${parseFloat(invoiceData.subtotal || 0).toFixed(2)}\n`;
  
  const totalDiscounts = (parseFloat(invoiceData.discountAmount || 0) + parseFloat(invoiceData.loyaltyDiscount || 0));
  if (totalDiscounts > 0) {
    message += `Discount: -Rs. ${totalDiscounts.toFixed(2)}\n`;
  }
  if (parseFloat(invoiceData.scAmount || 0) > 0) {
    message += `Service Charge: Rs. ${parseFloat(invoiceData.scAmount).toFixed(2)}\n`;
  }
  if (parseFloat(invoiceData.vatAmount || 0) > 0) {
    message += `VAT: Rs. ${parseFloat(invoiceData.vatAmount).toFixed(2)}\n`;
  }
  if (parseFloat(invoiceData.cslAmount || 0) > 0) {
    message += `SSCL: Rs. ${parseFloat(invoiceData.cslAmount).toFixed(2)}\n`;
  }
  
  message += `*NET TOTAL: Rs. ${parseFloat(invoiceData.netTotal || 0).toFixed(2)}*\n`;
  
  const p = invoiceData.payment || { method: "cash" };
  if (p.method === "split") {
    message += `💳 Payment: SPLIT (Cash: Rs. ${parseFloat(p.splitCash || 0).toFixed(2)} + Card: Rs. ${parseFloat(p.splitCard || 0).toFixed(2)})\n`;
  } else {
    message += `💳 Payment: ${p.method.toUpperCase()}\n`;
  }

  // ⭐ Loyalty Points Summary in WhatsApp Receipt
  if (invoiceData.loyaltyPointsEarned > 0) {
    message += `⭐ *Loyalty Points Earned:* +${invoiceData.loyaltyPointsEarned} Pts\n`;
  }
  if (invoiceData.loyaltyPointsRedeemed > 0) {
    message += `🎁 *Points Redeemed:* -${invoiceData.loyaltyPointsRedeemed} Pts (-Rs. ${invoiceData.loyaltyDiscount})\n`;
  }
  
  message += `------------------------------------\n`;
  message += `🙏 *Thank you for dining with us! Come again.*\n\n`;
  // 🚀 systems.lk BRANDING
  message += `_Software by systems.lk | Tel: 0760672029_`;
  
  // 🚀 DIRECT DESKTOP APP PROTOCOL (Electron Windows App)
  if (window.electronAPI && window.electronAPI.openWhatsAppDirect) {
    try {
      const res = await window.electronAPI.openWhatsAppDirect({ phone: cleanPhone, text: message });
      if (res && res.success) {
        showLiveToast("📱 WhatsApp App Opened", `Invoice #${invoiceData.invoiceNumber} WhatsApp Desktop වෙත යවන ලදී.`, "success", "fa-brands fa-whatsapp");
        return;
      }
    } catch (err) {
      console.warn("Direct WhatsApp protocol pass:", err);
    }
  }

  // Fallback to Web Browser if not in Electron
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
  showLiveToast("📱 WhatsApp Bill Ready", `Invoice #${invoiceData.invoiceNumber} WhatsApp වෙත යවන ලදී.`, "success", "fa-brands fa-whatsapp");
}

// Global Window Assignments
window.triggerAudioAlert = triggerAudioAlert;
window.showLiveToast = showLiveToast;
window.toggleNotificationPanel = toggleNotificationPanel;
window.clearAllNotifications = clearAllNotifications;
window.manualPurgeSystemMemory = manualPurgeSystemMemory;
window.downloadCSVFile = downloadCSVFile;
window.sendInvoiceViaWhatsApp = sendInvoiceViaWhatsApp;
window.formatCurrency = formatCurrency;
window.getLocalDateString = getLocalDateString;
window.showCustomInputModal = showCustomInputModal;
