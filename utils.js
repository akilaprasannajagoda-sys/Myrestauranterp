// ==========================================================================
// MODULE 02: UTILITIES (AUDIO SYNTH, TOASTS, NOTIFICATIONS, CSV & WHATSAPP)
// ==========================================================================

export let alertHistory = [];

// 1. DYNAMIC AUDIO CHIME GENERATOR (NO EXTERNAL MP3 NEEDED)
export function triggerAudioAlert(soundType = "info") {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (soundType === "kitchen" || soundType === "newOrder") {
      // 🔔 Two-Tone Pleasant Kitchen Bell (High-Pitch Chime)
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else if (soundType === "success") {
      // 🎶 Tri-Tone Success Chime
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else if (soundType === "warning") {
      // ⚠️ Alert Tone
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      // ℹ️ Soft Notification
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
    <button onclick="this.parentElement.remove()" class="text-white opacity-70 hover:opacity-100 p-1 text-sm ml-3">
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

// 5. PROFESSIONAL WHATSAPP DIGITAL RECEIPT ENGINE (NO PROMPT CRASH / EXTERNAL URL SAFE)
let pendingWhatsAppInvoice = null;
let pendingWhatsAppHotel = "Restaurant ERP";

export function openWhatsAppModal(invoiceData, hotelName) {
  pendingWhatsAppInvoice = invoiceData;
  pendingWhatsAppHotel = hotelName;

  const modal = document.getElementById("whatsAppPhoneModal");
  const phoneInput = document.getElementById("whatsAppModalPhoneInput");

  if (phoneInput) {
    let presetPhone = "";
    if (invoiceData.payment && invoiceData.payment.customerPhone) {
      presetPhone = invoiceData.payment.customerPhone;
    }
    phoneInput.value = presetPhone;
    setTimeout(() => phoneInput.focus(), 150);
  }

  if (modal) modal.classList.remove("hidden");
}

export function closeWhatsAppModal() {
  const modal = document.getElementById("whatsAppPhoneModal");
  if (modal) modal.classList.add("hidden");
  pendingWhatsAppInvoice = null;
}

export function submitWhatsAppModalSend() {
  const phoneInput = document.getElementById("whatsAppModalPhoneInput");
  const phoneVal = phoneInput ? phoneInput.value.trim() : "";

  if (!phoneVal) {
    alert("කරුණාකර වලංගු දුරකථන අංකයක් ඇතුළත් කරන්න.");
    return;
  }

  if (pendingWhatsAppInvoice) {
    const inv = pendingWhatsAppInvoice;
    const hName = pendingWhatsAppHotel;
    closeWhatsAppModal();
    executeWhatsAppSendDirect(inv, hName, phoneVal);
  }
}

export function executeWhatsAppSendDirect(invoiceData, hotelName, targetPhone) {
  let cleanPhone = targetPhone.replace(/\D/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "94" + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith("94") && cleanPhone.length === 9) {
    cleanPhone = "94" + cleanPhone;
  }

  const dateStr = new Date(invoiceData.createdAt).toLocaleString();
  let itemsListText = "";

  (invoiceData.items || []).forEach(i => {
    const noteTag = i.note ? ` (${i.note})` : "";
    itemsListText += `▪️ ${i.name}${noteTag} x${i.qty} = Rs. ${(i.price * i.qty).toFixed(2)}\n`;
  });

  let message = `🍽️ *${hotelName.toUpperCase()}*\n`;
  message += `📜 *DIGITAL INVOICE: #${invoiceData.invoiceNumber}*\n`;
  message += `📅 Date: ${dateStr}\n`;
  message += `🏷️ Type: ${invoiceData.orderType} (Table: ${invoiceData.tableNo || 'N/A'})\n`;
  message += `------------------------------------\n`;
  message += `${itemsListText}`;
  message += `------------------------------------\n`;
  message += `Subtotal: Rs. ${parseFloat(invoiceData.subtotal || 0).toFixed(2)}\n`;

  if (invoiceData.discountAmount > 0) {
    message += `Discount: -Rs. ${parseFloat(invoiceData.discountAmount).toFixed(2)}\n`;
  }
  if (invoiceData.scAmount > 0) {
    message += `Service Charge: Rs. ${parseFloat(invoiceData.scAmount).toFixed(2)}\n`;
  }
  if (invoiceData.vatAmount > 0) {
    message += `VAT: Rs. ${parseFloat(invoiceData.vatAmount).toFixed(2)}\n`;
  }
  if (invoiceData.cslAmount > 0) {
    message += `SSCL: Rs. ${parseFloat(invoiceData.cslAmount).toFixed(2)}\n`;
  }

  message += `*NET TOTAL: Rs. ${parseFloat(invoiceData.netTotal || 0).toFixed(2)}*\n`;

  const p = invoiceData.payment || { method: "cash" };
  if (p.method === "split") {
    message += `💳 Payment: SPLIT (Cash: Rs. ${parseFloat(p.splitCash || 0).toFixed(2)} + Card: Rs. ${parseFloat(p.splitCard || 0).toFixed(2)})\n`;
  } else {
    message += `💳 Payment: ${p.method.toUpperCase()}\n`;
  }

  message += `------------------------------------\n`;
  message += `🙏 *Thank you for dining with us! Come again.*`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  // 🌐 Safe Electron External URL Launch (Never crashes Electron app)
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(waUrl);
  } else {
    window.open(waUrl, "_blank");
  }

  showLiveToast("📱 WhatsApp Bill Ready", `Invoice #${invoiceData.invoiceNumber} WhatsApp වෙත යවන ලදී.`, "success", "fa-brands fa-whatsapp");
}

export function sendInvoiceViaWhatsApp(invoiceData, hotelName = "Restaurant ERP", inputPhone = null) {
  let rawPhone = inputPhone;

  if (!rawPhone && invoiceData.payment && invoiceData.payment.customerPhone) {
    rawPhone = invoiceData.payment.customerPhone;
  }

  // If no phone number is present, open our custom clean modal (NEVER call disabled prompt())
  if (!rawPhone) {
    openWhatsAppModal(invoiceData, hotelName);
    return;
  }

  executeWhatsAppSendDirect(invoiceData, hotelName, rawPhone);
}

// Window Global Exports
window.openWhatsAppModal = openWhatsAppModal;
window.closeWhatsAppModal = closeWhatsAppModal;
window.submitWhatsAppModalSend = submitWhatsAppModalSend;
window.sendInvoiceViaWhatsApp = sendInvoiceViaWhatsApp;
