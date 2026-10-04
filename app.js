

// ==========================================================================
// RESTAURANT ERP - ENTERPRISE 10/10 ZERO-LAG HIGH-SPEED RESTAURANT PLATFORM
// ==========================================================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  push, 
  update, 
  remove, 
  onValue,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToLast,
  equalTo,
  runTransaction // 🔒 ATOMIC TRANSACTION SUPPORT
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- IMPORT CUSTOM ERP MODULES ---
import { 
  erpState, currentTenant, currentTenantInfo, currentUserRole, activeBillId, lastReadyOrderCount, activeSupplierLedgerId,
  setCurrentTenant, setCurrentTenantInfo, setCurrentUserRole, setActiveBillId, setLastReadyOrderCount
} from './state.js';

import { 
  showLiveToast, toggleNotificationPanel, clearAllNotifications, manualPurgeSystemMemory, sendInvoiceViaWhatsApp, triggerAudioAlert 
} from './utils.js';

import * as PettyCash from './pettycash.js';
import * as KDS from './kds.js';
import * as Tables from './tables.js';
import * as Inventory from './inventory.js';
import * as Menu from './menu.js';
import * as Suppliers from './suppliers.js';
import * as Payroll from './payroll.js';
import * as Reports from './reports.js';
import * as POS from './pos.js';
import * as PrinterDriver from './printer.js';

// --- 1. FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDIXe44rRz2FdUkJovTGi7HBOQiOZW4KYo",
  authDomain: "class-50456.firebaseapp.com",
  databaseURL: "https://class-50456-default-rtdb.firebaseio.com",
  projectId: "class-50456",
  storageBucket: "class-50456.firebasestorage.app",
  messagingSenderId: "688050476782",
  appId: "1:688050476782:web:4fc0d0bac04afdfb3e05ff",
  measurementId: "G-TV0MS5WM2G"
};

const appInstance = initializeApp(firebaseConfig);
const authInstance = getAuth(appInstance);
const dbInstance = getDatabase(appInstance);
const dbRef = (path) => ref(dbInstance, path);

// --- TERMINAL PAIRING SECURITY ENGINE ---
function updateDeviceTerminalBadgeUI() {
  const badgeText = document.getElementById("deviceTerminalText");
  const badgeContainer = document.getElementById("deviceTerminalBadge");
  const pairedTenant = localStorage.getItem("pairedHotelTenantId");
  const pairedHotelName = localStorage.getItem("pairedHotelName");

  if (pairedTenant && pairedHotelName) {
    if (badgeText) badgeText.innerText = `🔒 Paired Terminal: ${pairedHotelName}`;
    if (badgeContainer) badgeContainer.className = "mt-3 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 flex items-center justify-center gap-1.5";
  } else {
    if (badgeText) badgeText.innerText = `Device: Standard Web Client (Unpaired)`;
    if (badgeContainer) badgeContainer.className = "mt-3 p-2 rounded-xl bg-gray-100 border border-gray-200 text-[11px] font-bold text-gray-600 flex items-center justify-center gap-1.5";
  }
}

// BULLETPROOF SECONDARY AUTH ENGINE
async function createStaffAuthAccount(email, password, role, staffName, tenantId) {
  const tempAppName = "SecondaryAuthApp_" + Date.now();
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);
  
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const subUser = cred.user;

    await set(ref(dbInstance, `users/${subUser.uid}`), {
      email: email,
      tenantId: tenantId,
      ownerName: staffName,
      role: role
    });

    await signOut(tempAuth);
    return subUser.uid;
  } catch (err) {
    throw new Error(err.message || "Failed to create staff login");
  } finally {
    try { await deleteApp(tempApp); } catch (e) {}
  }
}

// --- OFFLINE LOCAL DATABASE SETUP ---
let localDB = null;
if (typeof Dexie !== 'undefined') {
  localDB = new Dexie("RestaurantERP_OfflineDB");
  localDB.version(1).stores({
    offlineInvoices: '++id, invoiceNumber, createdAt, synced',
    offlinePettyCash: '++id, timestamp, synced',
    offlineAttendance: '++id, date, synced'
  });
}

// --- INITIALIZE ALL MODULES ---
PettyCash.initPettyCashContext(dbRef, push, remove);
KDS.initKdsContext(dbRef, update);
Tables.initTablesContext(dbRef, push, update, remove, set, switchView, POS.renderBillTabsBar, POS.syncActiveBillToFormUI);
Inventory.initInventoryContext(dbRef, push, update, remove, runTransaction);
Menu.initMenuContext(dbRef, push, update, remove, POS.renderPOSDishesGrid);
Suppliers.initSuppliersContext(dbRef, push, update);
Payroll.initPayrollContext(dbRef, push, update, remove, createStaffAuthAccount);
Reports.initReportsContext(dbRef, push, update, POS.printThermalReceipt, { query, orderByChild, startAt, endAt, limitToLast, equalTo, get });
POS.initPosContext(dbRef, push, update, remove, set, localDB, runTransaction);

updateDeviceTerminalBadgeUI();

// PREVENT FORM RELOAD
document.querySelectorAll("form").forEach(f => {
  f.addEventListener("submit", (e) => e.preventDefault());
});

// AUTH ALERT HELPER
function renderAuthAlert(msgText, isError = true) {
  const box = document.getElementById("alertBox");
  if (!box) return;
  box.innerText = msgText;
  box.className = `p-3 mb-4 rounded-xl text-xs font-semibold text-white ${isError ? 'bg-red-500' : 'bg-green-600'}`;
  box.classList.remove("hidden");
}

// PURE LOGIN SUBMIT HANDLER
export async function handleLoginSubmit(ev) {
  if (ev) ev.preventDefault();
  const emailVal = document.getElementById("loginEmail")?.value.trim() || "";
  const passVal = document.getElementById("loginPassword")?.value || "";
  const submitBtn = document.getElementById("loginBtn");
  
  if (!emailVal || !passVal) {
    renderAuthAlert("කරුණාකර Email සහ Password ඇතුළත් කරන්න.");
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;
    }
    await signInWithEmailAndPassword(authInstance, emailVal, passVal);
  } catch (err) {
    let errDesc = "Login දෝෂයකි: Email හෝ Password වැරදිය.";
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
      errDesc = "Email ලිපිනය හෝ Password අංකය වැරදිය. කරුණාකර නැවත පරීක්ෂා කරන්න.";
    } else if (err.message) {
      errDesc = "Login දෝෂයකි: " + err.message;
    }
    renderAuthAlert(errDesc, true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Login වන්න</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

window.handleLoginSubmit = handleLoginSubmit;

// ATTACH EVENT LISTENERS SAFELY
document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
document.getElementById("pettyCashForm")?.addEventListener("submit", (e) => { e.preventDefault(); PettyCash.handlePettyCashSubmit(e); });
document.getElementById("addAreaForm")?.addEventListener("submit", (e) => { e.preventDefault(); Tables.handleAddAreaSubmit(e); });
document.getElementById("tableForm")?.addEventListener("submit", (e) => { e.preventDefault(); Tables.handleTableSubmit(e); });
document.getElementById("addRawCategoryForm")?.addEventListener("submit", (e) => { e.preventDefault(); Inventory.handleAddRawCategorySubmit(e); });
document.getElementById("rawItemForm")?.addEventListener("submit", (e) => { e.preventDefault(); Inventory.handleRawItemSubmit(e); });
document.getElementById("storeIssueForm")?.addEventListener("submit", (e) => { e.preventDefault(); Inventory.handleStoreIssueSubmit(e); });
document.getElementById("wastageForm")?.addEventListener("submit", (e) => { e.preventDefault(); Inventory.handleWastageSubmit(e); });
document.getElementById("addCategoryForm")?.addEventListener("submit", (e) => { e.preventDefault(); Menu.handleAddCategorySubmit(e); });
document.getElementById("dishForm")?.addEventListener("submit", (e) => { e.preventDefault(); Menu.handleDishSubmit(e); });
document.getElementById("supplierForm")?.addEventListener("submit", (e) => { e.preventDefault(); Suppliers.handleSupplierSubmit(e); });
document.getElementById("supplierPayForm")?.addEventListener("submit", (e) => { e.preventDefault(); Suppliers.handleSupplierPaySubmit(e); });
document.getElementById("grnEntryForm")?.addEventListener("submit", (e) => { e.preventDefault(); Suppliers.handleGrnSubmit(e); });
document.getElementById("employeeForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleEmployeeSubmit(e); });
document.getElementById("salaryAdvanceForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleSalaryAdvanceSubmit(e); });
document.getElementById("staffLoginForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleStaffLoginSubmit(e); });
document.getElementById("mergeTableForm")?.addEventListener("submit", (e) => { e.preventDefault(); Tables.handleMergeTables(e); });
document.getElementById("shiftFloatForm")?.addEventListener("submit", (e) => { e.preventDefault(); POS.handleShiftFloatSubmit(e); });
document.getElementById("shiftHandoverForm")?.addEventListener("submit", (e) => { e.preventDefault(); Reports.handleShiftHandoverSubmit(e); });

// HOTEL PROFILE
document.getElementById("hotelProfileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dbRef || !currentTenant) return;

  const profData = {
    hotelName: document.getElementById("profHotelName")?.value.trim() || "My Restaurant",
    phone: document.getElementById("profPhone")?.value.trim() || "",
    address: document.getElementById("profAddress")?.value.trim() || "",
    taxNo: document.getElementById("profTaxNo")?.value.trim() || "",
    footerNote: document.getElementById("profFooterNote")?.value.trim() || "*** THANK YOU! PLEASE VISIT US AGAIN ***",
    updatedAt: new Date().toISOString()
  };

  try {
    await update(ref(dbInstance, `tenants/${currentTenant}/profile`), profData);
    setCurrentTenantInfo(Object.assign(currentTenantInfo || {}, profData));
    localStorage.setItem("pairedHotelName", profData.hotelName);
    updateDeviceTerminalBadgeUI();
    showLiveToast("🏢 Profile Updated", "හෝටලයේ විස්තර සාර්ථකව යාවත්කාලීන විය.", "success", "fa-hotel");
  } catch (err) {
    alert("Profile Error: " + err.message);
  }
});

// PRINTER ROUTING
document.getElementById("printerRoutingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dbRef || !currentTenant) return;

  const isSilent = document.getElementById("silentPrintEnabled")?.checked ?? true;
  const printersData = {
    p1: { name: document.getElementById("p1_name")?.value.trim() || "Printer 1", device: document.getElementById("p1_device")?.value.trim() || "POS-80", bill: document.getElementById("p1_bill")?.checked || false, kot: document.getElementById("p1_kot")?.checked || false },
    p2: { name: document.getElementById("p2_name")?.value.trim() || "Printer 2", device: document.getElementById("p2_device")?.value.trim() || "POS80-Kitchen", bill: document.getElementById("p2_bill")?.checked || false, kot: document.getElementById("p2_kot")?.checked || false },
    p3: { name: document.getElementById("p3_name")?.value.trim() || "Printer 3", device: document.getElementById("p3_device")?.value.trim() || "POS80-Bar", bill: document.getElementById("p3_bill")?.checked || false, kot: document.getElementById("p3_kot")?.checked || false },
    p4: { name: document.getElementById("p4_name")?.value.trim() || "Printer 4", device: document.getElementById("p4_device")?.value.trim() || "POS80-Accounts", bill: document.getElementById("p4_bill")?.checked || false, kot: document.getElementById("p4_kot")?.checked || false }
  };

  try {
    await update(ref(dbInstance, `tenants/${currentTenant}/settings`), { silentPrintEnabled: isSilent, printers: printersData });
    if (!erpState.settings) erpState.settings = {};
    erpState.settings.silentPrintEnabled = isSilent;
    erpState.settings.printers = printersData;
    showLiveToast("🖨️ Printers Updated", "Printers සාර්ථකව යාවත්කාලීන විය.", "success", "fa-print");
  } catch (err) {
    alert("Printers Error: " + err.message);
  }
});

// TAX & INVENTORY SETTINGS
document.getElementById("taxSettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dbRef || !currentTenant) return;

  const inventoryMode = document.querySelector('input[name="setInventoryMode"]:checked')?.value || "recipe";

  const settingsData = {
    inventoryMode: inventoryMode,
    scEnabled: document.getElementById("setScEnabled")?.checked || false,
    scRate: parseFloat(document.getElementById("setScRate")?.value || 10),
    vatEnabled: document.getElementById("setVatEnabled")?.checked || false,
    vatRate: parseFloat(document.getElementById("setVatRate")?.value || 18),
    cslEnabled: document.getElementById("setCslEnabled")?.checked || false,
    cslRate: parseFloat(document.getElementById("setCslRate")?.value || 2.5),
    shiftHours: parseFloat(document.getElementById("setShiftHours")?.value || 8.0)
  };

  try {
    await update(ref(dbInstance, `tenants/${currentTenant}/settings`), settingsData);
    erpState.settings = Object.assign(erpState.settings || {}, settingsData);
    POS.recalculateCartTotalsUI();
    showLiveToast("⚙️ Settings Saved", "බදු ගාස්තු සහ Inventory Mode සාර්ථකව යාවත්කාලීන විය.", "success", "fa-sliders");
  } catch (err) {
    alert("Settings Error: " + err.message);
  }
});

// 100% COMPLETE DATABASE BACKUP
export async function downloadFullDatabaseBackup() {
  if (!dbRef || !currentTenant) return;

  try {
    showLiveToast("💾 Preparing Backup", "සම්පූර්ණ දත්ත ගොනුව සූදානම් වෙමින් පවතී...", "info", "fa-spinner fa-spin");
    
    const snap = await get(ref(dbInstance, `tenants/${currentTenant}`));
    let fullTenantData = snap.exists() ? snap.val() : JSON.parse(JSON.stringify(erpState));

    if (localDB) {
      try {
        const offlineInvoices = await localDB.offlineInvoices.toArray();
        if (offlineInvoices.length > 0) {
          if (!fullTenantData.offlineBackupPending) fullTenantData.offlineBackupPending = [];
          fullTenantData.offlineBackupPending = offlineInvoices;
        }
      } catch (dexErr) {}
    }

    const backupPayload = {
      tenantId: currentTenant,
      hotelName: currentTenantInfo?.hotelName || "Hotel",
      exportedAt: new Date().toISOString(),
      systemVersion: "Enterprise SME v2.5",
      databaseType: "Full Cloud & Offline Snapshot",
      data: fullTenantData
    };

    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const hName = (currentTenantInfo?.hotelName || "Hotel").replace(/\s+/g, '_');
    const dStr = new Date().toISOString().split("T")[0];
    
    a.href = url;
    a.download = `RestaurantERP_Backup_${hName}_${dStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showLiveToast("✅ Backup Downloaded", "100% ක් සම්පූර්ණ Backup ගොනුව සාර්ථකව Download විය.", "success", "fa-cloud-arrow-down");
  } catch (err) {
    alert("Backup Error: " + err.message);
  }
}
window.downloadFullDatabaseBackup = downloadFullDatabaseBackup;

// 1-CLICK COMPLETE DATABASE RESTORE ENGINE
export async function handleRestoreBackupFile(event) {
  const file = event.target.files[0];
  if (!file || !dbRef || !currentTenant) return;

  const confirmMsg = `⚠️ අනතුරු ඇඟවීමයි!\n\nඔබ තෝරාගත් Backup ගොනුවෙන් පද්ධතිය Restore කිරීමට අවශ්‍යද?\nමෙමගින් පද්ධතියේ පවතින දත්ත Backup ගොනුවේ ඇති දත්ත වලට යාවත්කාලීන වේ.`;
  if (!confirm(confirmMsg)) {
    event.target.value = "";
    return;
  }

  try {
    showLiveToast("🔄 Restoring Database", "දත්ත පද්ධතියට Restore වෙමින් පවතී...", "info", "fa-spinner fa-spin");
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backupObj = JSON.parse(e.target.result);
        const dataToRestore = backupObj.data || backupObj;

        if (!dataToRestore || typeof dataToRestore !== "object") {
          throw new Error("අවලංගු Backup ගොනුවකි (Invalid JSON Format).");
        }

        const safeData = { ...dataToRestore };
        delete safeData.subscription;

        await update(ref(dbInstance, `tenants/${currentTenant}`), safeData);

        showLiveToast("🎉 Restore Completed", "දත්ත සාර්ථකව පද්ධතියට Restore විය. පිටුව Refresh වේ.", "success", "fa-circle-check");
        setTimeout(() => window.location.reload(), 1500);
      } catch (parseErr) {
        alert("Restore දෝෂයකි: " + parseErr.message);
      }
    };
    reader.readAsText(file);
  } catch (err) {
    alert("Restore Error: " + err.message);
  } finally {
    event.target.value = "";
  }
}
window.handleRestoreBackupFile = handleRestoreBackupFile;

// 🔥 INACTIVITY AUTO PIN-LOCK ENGINE (4 MINUTE TIMEOUT)
let inactivityTimer = null;
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (authInstance.currentUser && currentTenant) {
      document.getElementById("inactivityLockScreen")?.classList.remove("hidden");
      const pinIn = document.getElementById("unlockScreenPinInput");
      if (pinIn) pinIn.value = "";
    }
  }, 240000);
}

['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

// 🔒 STRICT DATABASE STAFF PIN UNLOCK ONLY
window.submitCounterUnlock = function() {
  const pin = document.getElementById("unlockScreenPinInput")?.value.trim();
  if (!pin) return;

  const isMatched = Object.values(erpState.employees || {}).some(e => String(e.password || "").trim() === pin);
  
  if (isMatched) {
    document.getElementById("inactivityLockScreen")?.classList.add("hidden");
    resetInactivityTimer();
    showLiveToast("🔓 Terminal Unlocked", "කවුන්ටරය සාර්ථකව Unlock කරන ලදී.", "success", "fa-unlock");
  } else {
    alert("❌ වැරදි PIN අංකයකි! නැවත උත්සාහ කරන්න.");
    const pinIn = document.getElementById("unlockScreenPinInput");
    if (pinIn) pinIn.value = "";
  }
};

// REALTIME ROLE & FEATURE TOGGLE ENFORCEMENT
export function applyRoleBasedUI(role = "owner") {
  setCurrentUserRole(role);
  const roleBadge = document.getElementById("sideUserRole");

  const navMap = {
    pos: document.getElementById("nav-pos"),
    tables: document.getElementById("nav-tables"),
    kitchen: document.getElementById("nav-kitchen"),
    menu: document.getElementById("nav-menu"),
    inventory: document.getElementById("nav-inventory"),
    suppliersGrn: document.getElementById("nav-suppliersGrn"),
    pettyCash: document.getElementById("nav-pettyCash"),
    dayEndBtn: document.getElementById("nav-dayEnd"),
    shiftHandoverBtn: document.getElementById("nav-shiftHandover"),
    faceScan: document.getElementById("nav-faceScan"),
    employees: document.getElementById("nav-employees"),
    reports: document.getElementById("nav-reports"),
    settings: document.getElementById("nav-settings")
  };

  Object.values(navMap).forEach(btn => btn?.classList.remove("hidden"));

  const feats = erpState.subscription?.features || {};
  const featureNavMap = {
    tables: navMap.tables,
    kitchen: navMap.kitchen,
    menu: navMap.menu,
    inventory: navMap.inventory,
    suppliersGrn: navMap.suppliersGrn,
    pettyCash: navMap.pettyCash,
    dayEnd: navMap.dayEndBtn,
    faceScan: navMap.faceScan,
    employees: navMap.employees,
    reports: navMap.reports
  };

  Object.entries(featureNavMap).forEach(([fKey, el]) => {
    if (feats[fKey] === false && el) {
      el.classList.add("hidden");
    }
  });

  if (role === "cashier") {
    if (roleBadge) roleBadge.innerText = "Cashier";
    navMap.menu?.classList.add("hidden");
    navMap.inventory?.classList.add("hidden");
    navMap.suppliersGrn?.classList.add("hidden");
    navMap.employees?.classList.add("hidden");
    navMap.reports?.classList.add("hidden");
    navMap.settings?.classList.add("hidden");
    switchView("pos");
  } else if (role === "cook") {
    if (roleBadge) roleBadge.innerText = "Kitchen Cook";
    navMap.pos?.classList.add("hidden");
    navMap.tables?.classList.add("hidden");
    navMap.menu?.classList.add("hidden");
    navMap.inventory?.classList.add("hidden");
    navMap.suppliersGrn?.classList.add("hidden");
    navMap.pettyCash?.classList.add("hidden");
    navMap.dayEndBtn?.classList.add("hidden");
    navMap.shiftHandoverBtn?.classList.add("hidden");
    navMap.employees?.classList.add("hidden");
    navMap.reports?.classList.add("hidden");
    navMap.settings?.classList.add("hidden");
    switchView("kitchen");
  } else if (role === "waiter") {
    if (roleBadge) roleBadge.innerText = "Waiter";
    navMap.kitchen?.classList.add("hidden");
    navMap.menu?.classList.add("hidden");
    navMap.inventory?.classList.add("hidden");
    navMap.suppliersGrn?.classList.add("hidden");
    navMap.pettyCash?.classList.add("hidden");
    navMap.dayEndBtn?.classList.add("hidden");
    navMap.shiftHandoverBtn?.classList.add("hidden");
    navMap.employees?.classList.add("hidden");
    navMap.reports?.classList.add("hidden");
    navMap.settings?.classList.add("hidden");
    switchView("tables");
  } else {
    if (roleBadge) roleBadge.innerText = "Owner Admin";
  }
}

// 🔒 ROBUST AUTH STATE LISTENER (DIAGNOSTIC AUTO-REPORTING)
onAuthStateChanged(authInstance, async (activeUser) => {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `<span>Login වන්න</span> <i class="fa-solid fa-arrow-right"></i>`;
  }

  if (activeUser) {
    try {
      let snap = await get(ref(dbInstance, `users/${activeUser.uid}`));
      let attempts = 0;
      while (!snap.exists() && attempts < 4) {
        await new Promise(r => setTimeout(r, 600));
        snap = await get(ref(dbInstance, `users/${activeUser.uid}`));
        attempts++;
      }

      if (!snap.exists()) {
        renderAuthAlert(`🚫 මෙම ගිණුම (UID: ${activeUser.uid}) Database එකේ users node එක යටතේ ලියාපදිංචි වී නොමැත. කරුණාකර Super Admin Panel එකෙන් මෙම User හදන්න.`, true);
        await signOut(authInstance);
        return;
      }

      const uData = snap.val();
      const userRole = uData.role || "owner";
      const pairedTenant = localStorage.getItem("pairedHotelTenantId");

      if (userRole !== "owner") {
        if (!pairedTenant || pairedTenant !== uData.tenantId) {
          renderAuthAlert(`🚫 Access Denied: මෙම සේවක ගිණුමෙන් ලොග් විය හැක්කේ හෝටලයේ Owner ලොග් වූ පරිගණක වලින් පමණි. (කරුණාකර පළමුව Owner Account එකෙන් ලොග් වන්න).`, true);
          await signOut(authInstance);
          updateDeviceTerminalBadgeUI();
          return;
        }
      }

      if (userRole === "owner") {
        const profileSnap = await get(ref(dbInstance, `tenants/${uData.tenantId}/profile`));
        const hName = profileSnap.exists() ? (profileSnap.val().hotelName || "Hotel") : "Hotel";
        localStorage.setItem("pairedHotelTenantId", uData.tenantId);
        localStorage.setItem("pairedHotelName", hName);
        updateDeviceTerminalBadgeUI();
      }

      setCurrentTenant(uData.tenantId);

      document.getElementById("authScreen")?.classList.add("hidden");
      document.getElementById("mainApp")?.classList.remove("hidden");
      const sideUser = document.getElementById("sideUserName");
      const sideTen = document.getElementById("sideTenantId");
      if (sideUser) sideUser.innerText = uData.ownerName || activeUser.email;
      if (sideTen) sideTen.innerText = uData.tenantId;

      applyRoleBasedUI(userRole);
      initializeRealtimeDataStreams(uData.tenantId);
      startLiveClockWidget();
      resetInactivityTimer();

      // 🔄 AUTOMATIC STARTUP OFFLINE DATA CLOUD SYNC
      if (navigator.onLine) {
        POS.syncOfflineInvoicesToCloud();
      }
    } catch (err) {
      console.error("Auth state error:", err);
      renderAuthAlert("දත්ත ලබාගැනීමේ දෝෂයකි: " + err.message, true);
    }
  } else {
    setCurrentTenant(null);
    document.getElementById("authScreen")?.classList.remove("hidden");
    document.getElementById("mainApp")?.classList.add("hidden");
    Payroll.stopKioskCameraStream();
    updateDeviceTerminalBadgeUI();
  }
});

// 🔄 PERIODIC BACKGROUND OFFLINE SYNC (EVERY 60 SECONDS)
setInterval(() => {
  if (navigator.onLine && currentTenant) {
    POS.syncOfflineInvoicesToCloud();
  }
}, 60000);

window.logout = function() {
  if (confirm("ඔබට Logout වීමට අවශ්‍යද?")) {
    Payroll.stopKioskCameraStream();
    signOut(authInstance);
  }
};

// REALTIME DATA LISTENERS
function initializeRealtimeDataStreams(tenantId) {
  const basePath = `tenants/${tenantId}`;

  // 1. Profile & Branding
  onValue(ref(dbInstance, `${basePath}/profile`), (snapshot) => {
    const prof = snapshot.val() || {};
    setCurrentTenantInfo(prof);
    const titleStr = prof.hotelName || "My Restaurant";
    
    const sideH = document.getElementById("sideHotelName");
    const recH = document.getElementById("receiptHotel");
    const zH = document.getElementById("zHotelName");
    if (sideH) sideH.innerText = titleStr;
    if (recH) recH.innerText = titleStr;
    if (zH) zH.innerText = titleStr;

    const pName = document.getElementById("profHotelName");
    const pPhone = document.getElementById("profPhone");
    const pAddr = document.getElementById("profAddress");
    const pTax = document.getElementById("profTaxNo");
    const pFoot = document.getElementById("profFooterNote");

    if (pName && !pName.value) pName.value = prof.hotelName || "";
    if (pPhone && !pPhone.value) pPhone.value = prof.phone || "";
    if (pAddr && !pAddr.value) pAddr.value = prof.address || "";
    if (pTax && !pTax.value) pTax.value = prof.taxNo || "";
    if (pFoot && !pFoot.value) pFoot.value = prof.footerNote || "*** THANK YOU! PLEASE VISIT US AGAIN ***";
  });

  // 2. Settings & Taxes
  onValue(ref(dbInstance, `${basePath}/settings`), (snapshot) => {
    if (snapshot.exists()) {
      erpState.settings = Object.assign({ shiftHours: 8.0, silentPrintEnabled: true, inventoryMode: "recipe" }, snapshot.val());
      syncSettingsUI();
      POS.recalculateCartTotalsUI();
    }
  });

  // 3. Menu Categories
  onValue(ref(dbInstance, `${basePath}/dishCategories`), (snapshot) => {
    erpState.dishCategories = snapshot.val() || {};
    POS.renderDishCategoriesFilterUI();
    Menu.renderDishCategoryListUI();
    Menu.populateDishCategoryDropdown();
  });

  // 4. Dishes & BOM Recipes
  onValue(ref(dbInstance, `${basePath}/dishes`), (snapshot) => {
    erpState.dishes = snapshot.val() || {};
    POS.renderPOSDishesGrid();
    Menu.renderMenuDishesTable();
  });

  // 5. Raw Material Categories
  onValue(ref(dbInstance, `${basePath}/rawCategories`), (snapshot) => {
    erpState.rawCategories = snapshot.val() || {};
    Inventory.renderRawCategoryListUI();
    Inventory.populateRawCategoryDropdown();
  });

  // 6. Raw Items Stock
  onValue(ref(dbInstance, `${basePath}/rawItems`), (snapshot) => {
    erpState.rawItems = snapshot.val() || {};
    Inventory.renderRawStockTable();
    POS.renderPOSDishesGrid();
  });

  // 📦 6.1 STORE ISSUES REALTIME LISTENER
  onValue(ref(dbInstance, `${basePath}/storeIssues`), (snapshot) => {
    erpState.storeIssues = snapshot.val() || {};
  });

  // 7. Floor Areas
  onValue(ref(dbInstance, `${basePath}/areas`), (snapshot) => {
    erpState.areas = snapshot.val() || {};
    Tables.renderAreaFiltersUI();
    Tables.renderAreaListModalUI();
    Tables.populateTableAreaDropdown();
  });

  // 8. Tables Floor Plan
  onValue(ref(dbInstance, `${basePath}/tables`), (snapshot) => {
    erpState.tables = snapshot.val() || {};
    Tables.renderTablesFloorGrid();
  });

  // 9. Kitchen Orders (WITH NEW ORDER CHIME)
  const recentKitchenQuery = query(ref(dbInstance, `${basePath}/kitchenOrders`), limitToLast(100));
  onValue(recentKitchenQuery, (snapshot) => {
    const prevOrders = erpState.kitchenOrders || {};
    erpState.kitchenOrders = snapshot.val() || {};
    KDS.renderKDSOrdersGrid();

    const currentOrders = erpState.kitchenOrders;
    
    if (Object.keys(currentOrders).length > Object.keys(prevOrders).length) {
      triggerAudioAlert("newOrder");
    }

    Object.keys(currentOrders).forEach(k => {
      if (currentOrders[k].status === "Ready" && prevOrders[k] && prevOrders[k].status === "Cooking") {
        triggerAudioAlert("kitchen");
        showLiveToast("🛎️ Order Ready!", `Table ${currentOrders[k].tableNo} කෑම පිළියෙල කර අවසන්!`, "kitchen", "fa-bell-concierge");
      }
    });
  });

  // 10. Suppliers Directory
  onValue(ref(dbInstance, `${basePath}/suppliers`), (snapshot) => {
    erpState.suppliers = snapshot.val() || {};
    Suppliers.renderSuppliersDirectoryTable();
    Suppliers.populateGRNSupplierDropdown();
  });

  // 11. Supplier Payments
  const recentSupPayQuery = query(ref(dbInstance, `${basePath}/supplierPayments`), limitToLast(100));
  onValue(recentSupPayQuery, (snapshot) => {
    erpState.supplierPayments = snapshot.val() || {};
    Suppliers.renderSuppliersDirectoryTable();
  });

  // 12. GRNs
  const recentGrnQuery = query(ref(dbInstance, `${basePath}/grns`), limitToLast(100));
  onValue(recentGrnQuery, (snapshot) => {
    erpState.grns = snapshot.val() || {};
    Suppliers.renderGRNHistoryTable();
    Suppliers.renderSuppliersDirectoryTable();
  });

  // 13. Invoices & Reports Sync
  const recentInvoicesQuery = query(ref(dbInstance, `${basePath}/invoices`), limitToLast(100));
  onValue(recentInvoicesQuery, (snapshot) => {
    erpState.invoices = snapshot.val() || {};
    if (Reports.activeReportTabName === "pnl") {
      Reports.renderPnLStatement();
    } else if (Reports.activeReportTabName === "hourly") {
      Reports.renderHourlyVelocityReport();
    } else if (Reports.activeReportTabName === "waiters") {
      Reports.renderWaiterSalesReport();
    } else if (Reports.activeReportTabName === "items") {
      Reports.renderItemWiseSalesSummary();
    } else if (Reports.activeReportTabName === "credits") {
      Reports.renderCustomerCreditsLedger();
    } else {
      Reports.renderInvoiceReportsList();
    }
  });

  // 14. Customer Credits
  onValue(ref(dbInstance, `${basePath}/customerCredits`), (snapshot) => {
    erpState.customerCredits = snapshot.val() || {};
    Reports.renderCustomerCreditsLedger();
  });

  // 15. Petty Cash
  const recentPettyQuery = query(ref(dbInstance, `${basePath}/pettyCash`), limitToLast(150));
  onValue(recentPettyQuery, (snapshot) => {
    erpState.pettyCash = snapshot.val() || {};
    PettyCash.renderPettyCashTable();
    if (Reports.activeReportTabName === "pnl") {
      Reports.renderPnLStatement();
    }
  });

  // 16. Employees
  onValue(ref(dbInstance, `${basePath}/employees`), (snapshot) => {
    erpState.employees = snapshot.val() || {};
    Payroll.renderEmployeesTable();
    Tables.populateTableWaiterDropdown();
    Payroll.populateAttendanceEmployeeFilter();
    Payroll.populateSalaryAdvanceEmployeeDropdown();
    Payroll.renderMonthlyPayrollSheet();
    if (Reports.activeReportTabName === "waiters") {
      Reports.renderWaiterSalesReport();
    }
  });

  // 17. Attendance Logs
  const recentAttQuery = query(ref(dbInstance, `${basePath}/attendance`), limitToLast(150));
  onValue(recentAttQuery, (snapshot) => {
    erpState.attendance = snapshot.val() || {};
    Payroll.renderAttendanceLogsTable();
    Payroll.renderMonthlyPayrollSheet();
  });

  // 18. Salary Advances
  const recentAdvQuery = query(ref(dbInstance, `${basePath}/salaryAdvances`), limitToLast(100));
  onValue(recentAdvQuery, (snapshot) => {
    erpState.salaryAdvances = snapshot.val() || {};
    Payroll.renderMonthlyPayrollSheet();
  });

  // 19. Active Bills
  onValue(ref(dbInstance, `${basePath}/activeBills`), (snapshot) => {
    erpState.activeBills = snapshot.val() || {};
    const billKeys = Object.keys(erpState.activeBills);

    if (billKeys.length === 0) {
      const initialKey = "bill_" + Date.now();
      set(ref(dbInstance, `${basePath}/activeBills/${initialKey}`), {
        name: "Bill #1",
        orderType: "Dine-in",
        tableNo: "",
        waiterName: "",
        cart: [],
        selectedPayMethod: "cash",
        updatedAt: new Date().toISOString()
      });
      setActiveBillId(initialKey);
      return;
    }

    if (!erpState.activeBills[activeBillId]) {
      setActiveBillId(billKeys[0]);
    }

    POS.renderBillTabsBar();
    POS.syncActiveBillToFormUI();
  });

  // 20. LIVE HEARTBEAT & REALTIME FEATURE TOGGLE LISTENER
  const sendHeartbeat = () => {
    if (currentTenant && dbRef) {
      update(ref(dbInstance, `tenants/${currentTenant}/subscription`), {
        lastHeartbeat: new Date().toISOString()
      }).catch(() => {});
    }
  };
  sendHeartbeat();
  setInterval(sendHeartbeat, 45000);

  onValue(ref(dbInstance, `${basePath}/subscription`), (snapshot) => {
    const sub = snapshot.val() || {};
    erpState.subscription = sub;

    if (sub.broadcastNotice && sub.broadcastNotice.trim()) {
      showLiveToast("📢 Super Admin Notice", sub.broadcastNotice, "info", "fa-bullhorn");
    }

    applyRoleBasedUI(currentUserRole);

    if (sub.status === "suspended") {
      document.getElementById("mainApp")?.classList.add("hidden");
      document.getElementById("authScreen")?.classList.add("hidden");
      
      let lockScreen = document.getElementById("saasLockoutScreen");
      if (!lockScreen) {
        lockScreen = document.createElement("div");
        lockScreen.id = "saasLockoutScreen";
        lockScreen.className = "fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center p-6 text-center text-white";
        document.body.appendChild(lockScreen);
      }
      
      lockScreen.classList.remove("hidden");
      lockScreen.innerHTML = `
        <div class="bg-gray-900 border border-red-500/30 p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/40 flex items-center justify-center mx-auto text-3xl">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h2 class="text-xl font-black text-white">Software Subscription Suspended</h2>
          <p class="text-xs text-gray-400 leading-relaxed">
            ඔබගේ හෝටලයේ මෘදුකාංග ගිණුම තාවකාලිකව අත්හිටුවා ඇත (Suspended). කරුණාකර සේවා සපයන්නා (Software Provider) අමතා මාසික බිල්පත පියවා සේවාව නැවත සක්‍රීය කරගන්න.
          </p>
          <div class="p-3 bg-gray-800 rounded-xl border border-gray-700 text-xs font-mono text-purple-400 font-bold">
            Tenant ID: ${tenantId}
          </div>
          <p class="text-xs font-bold text-gray-500 pt-2">
            📞 Software Provider Support Line
          </p>
        </div>
      `;
    } else {
      const lockScreen = document.getElementById("saasLockoutScreen");
      if (lockScreen) lockScreen.classList.add("hidden");
      if (authInstance.currentUser) {
        document.getElementById("mainApp")?.classList.remove("hidden");
      }
    }
  });
}

// NAVIGATION & VIEW SWITCHER
const availableViews = ["pos", "tables", "kitchen", "menu", "inventory", "suppliersGrn", "pettyCash", "faceScan", "employees", "reports", "settings"];

export function switchView(viewName) {
  const feats = erpState.subscription?.features || {};
  if (feats[viewName] === false) {
    showLiveToast("🚫 Access Restricted", `මෙම Feature එක ඔබගේ Package එකට අනුව අක්‍රීය කර ඇත.`, "warning", "fa-lock");
    viewName = "pos";
  }

  availableViews.forEach(v => {
    const el = document.getElementById("view" + v.charAt(0).toUpperCase() + v.slice(1));
    const navBtn = document.getElementById("nav-" + v);
    if (el) el.classList.add("hidden");
    if (navBtn) {
      navBtn.classList.remove("bg-blue-600", "text-white", "shadow-md");
      navBtn.classList.add("text-gray-400");
    }
  });

  const targetView = document.getElementById("view" + viewName.charAt(0).toUpperCase() + viewName.slice(1));
  const targetNav = document.getElementById("nav-" + viewName);

  if (targetView) targetView.classList.remove("hidden");
  if (targetNav) {
    targetNav.classList.remove("text-gray-400");
    targetNav.classList.add("bg-blue-600", "text-white", "shadow-md");
  }

  const titleElem = document.getElementById("viewTitle");
  const headers = {
    pos: `<i class="fa-solid fa-cash-register text-blue-600"></i> POS & Billing Engine`,
    tables: `<i class="fa-solid fa-chair text-blue-600"></i> Floor Plan & Table Management`,
    kitchen: `<i class="fa-solid fa-fire text-yellow-500"></i> Kitchen Display System (KDS)`,
    menu: `<i class="fa-solid fa-bowl-food text-yellow-400"></i> Dish & Recipe Management (BOM)`,
    inventory: `<i class="fa-solid fa-boxes-stacked text-indigo-400"></i> Raw Materials & Stock`,
    suppliersGrn: `<i class="fa-solid fa-truck-ramp-box text-purple-400"></i> Suppliers & GRN Supply Chain`,
    pettyCash: `<i class="fa-solid fa-wallet text-emerald-600"></i> Petty Cash Book (මුදල් පෙට්ටිය)`,
    faceScan: `<i class="fa-solid fa-camera text-pink-600"></i> Smart Attendance Kiosk (PIN + Photo)`,
    employees: `<i class="fa-solid fa-users-gear text-blue-600"></i> Staff, Attendance Logs & Payroll`,
    reports: `<i class="fa-solid fa-chart-line text-green-400"></i> Reports & Financial Analytics`,
    settings: `<i class="fa-solid fa-gear text-teal-400"></i> Settings & Backup`
  };
  if (titleElem && headers[viewName]) titleElem.innerHTML = headers[viewName];

  if (viewName === "faceScan") {
    Payroll.startKioskCameraStream();
  } else {
    Payroll.stopKioskCameraStream();
  }

  const sidebarElem = document.getElementById("sidebar");
  if (sidebarElem && !sidebarElem.classList.contains("hidden") && window.innerWidth < 768) {
    sidebarElem.classList.add("hidden");
  }
}

window.switchView = switchView;
window.toggleMobileSidebar = () => document.getElementById("sidebar")?.classList.toggle("hidden");

function startLiveClockWidget() {
  setInterval(() => {
    const now = new Date();
    const clockTime = document.getElementById("liveClockTime");
    const clockDate = document.getElementById("liveClockDate");
    if (clockTime) clockTime.innerText = now.toLocaleTimeString();
    if (clockDate) clockDate.innerText = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, 1000);
}

function syncSettingsUI() {
  const setSc = document.getElementById("setScEnabled");
  const setScRate = document.getElementById("setScRate");
  const setVat = document.getElementById("setVatEnabled");
  const setVatRate = document.getElementById("setVatRate");
  const setCsl = document.getElementById("setCslEnabled");
  const setCslRate = document.getElementById("setCslRate");
  const setShift = document.getElementById("setShiftHours");
  const setSilent = document.getElementById("silentPrintEnabled");

  // Sync Inventory Deduction Mode Radio Buttons
  const invMode = erpState.settings?.inventoryMode || "recipe";
  const modeRec = document.getElementById("modeRecipe");
  const modeIss = document.getElementById("modeIssue");
  if (modeRec && modeIss) {
    if (invMode === "issue") modeIss.checked = true;
    else modeRec.checked = true;
  }

  if (setSc) setSc.checked = erpState.settings.scEnabled || false;
  if (setScRate) setScRate.value = erpState.settings.scRate || 10;
  if (setVat) setVat.checked = erpState.settings.vatEnabled || false;
  if (setVatRate) setVatRate.value = erpState.settings.vatRate || 18;
  if (setCsl) setCsl.checked = erpState.settings.cslEnabled || false;
  if (setCslRate) setCslRate.value = erpState.settings.cslRate || 2.5;
  if (setShift) setShift.value = erpState.settings.shiftHours || 8.0;
  if (setSilent) setSilent.checked = erpState.settings.silentPrintEnabled ?? true;

  const pr = erpState.settings.printers || {};
  ['p1', 'p2', 'p3', 'p4'].forEach(k => {
    const p = pr[k];
    if (p) {
      const nameIn = document.getElementById(`${k}_name`);
      const devIn = document.getElementById(`${k}_device`);
      const billCb = document.getElementById(`${k}_bill`);
      const kotCb = document.getElementById(`${k}_kot`);
      if (nameIn) nameIn.value = p.name || '';
      if (devIn) devIn.value = p.device || '';
      if (billCb) billCb.checked = !!p.bill;
      if (kotCb) kotCb.checked = !!p.kot;
    }
  });
}

// ALL GLOBAL WINDOW EXPORTS
window.showLiveToast = showLiveToast;
window.toggleNotificationPanel = toggleNotificationPanel;
window.clearAllNotifications = clearAllNotifications;
window.manualPurgeSystemMemory = manualPurgeSystemMemory;
window.openPettyCashModal = PettyCash.openPettyCashModal;
window.closePettyCashModal = PettyCash.closePettyCashModal;
window.selectPettyEntryType = PettyCash.selectPettyEntryType;
window.setPettyPeriodPreset = PettyCash.setPettyPeriodPreset;
window.renderPettyCashTable = PettyCash.renderPettyCashTable;
window.deletePettyCash = PettyCash.deletePettyCash;
window.exportPettyCashToCSV = PettyCash.exportPettyCashToCSV;
window.completeKitchenOrder = KDS.completeKitchenOrder;
window.toggleKDSItemPrepared = KDS.toggleKDSItemPrepared;
window.openAreaModal = Tables.openAreaModal;
window.closeAreaModal = Tables.closeAreaModal;
window.deleteArea = Tables.deleteArea;
window.filterTableByArea = Tables.filterTableByArea;
window.openTableModal = Tables.openTableModal;
window.closeTableModal = Tables.closeTableModal;
window.deleteTable = Tables.deleteTable;
window.linkTableToPos = Tables.linkTableToPos;
window.openMergeTableModal = Tables.openMergeTableModal;
window.closeMergeTableModal = Tables.closeMergeTableModal;
window.handleMergeTables = Tables.handleMergeTables;
window.openRawCategoryModal = Inventory.openRawCategoryModal;
window.closeRawCategoryModal = Inventory.closeRawCategoryModal;
window.deleteRawCategory = Inventory.deleteRawCategory;
window.openRawItemModal = Inventory.openRawItemModal;
window.closeRawItemModal = Inventory.closeRawItemModal;
window.deleteRawItem = Inventory.deleteRawItem;
window.openStoreIssueModal = Inventory.openStoreIssueModal;
window.closeStoreIssueModal = Inventory.closeStoreIssueModal;
window.addStoreIssueItemRow = Inventory.addStoreIssueItemRow;
window.handleStoreIssueSubmit = Inventory.handleStoreIssueSubmit;
window.openWastageModal = Inventory.openWastageModal;
window.closeWastageModal = Inventory.closeWastageModal;
window.addWastageItemRow = Inventory.addWastageItemRow;
window.handleWastageSubmit = Inventory.handleWastageSubmit;
window.openCategoryModal = Menu.openCategoryModal;
window.closeCategoryModal = Menu.closeCategoryModal;
window.deleteDishCategory = Menu.deleteDishCategory;
window.openDishModal = Menu.openDishModal;
window.closeDishModal = Menu.closeDishModal;
window.addRecipeIngredientRow = Menu.addRecipeIngredientRow;
window.onRecipeIngredientChange = Menu.onRecipeIngredientChange;
window.calculateDishCostAndMargin = Menu.calculateDishCostAndMargin;
window.deleteDish = Menu.deleteDish;
window.switchGrnTab = Suppliers.switchGrnTab;
window.openSupplierModal = Suppliers.openSupplierModal;
window.closeSupplierModal = Suppliers.closeSupplierModal;
window.openSupplierLedgerModal = Suppliers.openSupplierLedgerModal;
window.closeSupplierLedgerModal = Suppliers.closeSupplierLedgerModal;
window.openSupPayFromLedger = Suppliers.openSupPayFromLedger;
window.exportSupplierLedgerToCSV = Suppliers.exportSupplierLedgerToCSV;
window.addGrnItemRow = Suppliers.addGrnItemRow;
window.filterGrnRowSelect = Suppliers.filterGrnRowSelect;
window.onGrnRawSelectChange = Suppliers.onGrnRawSelectChange;
window.calculateGrnTotals = Suppliers.calculateGrnTotals;
window.onGrnPaymentMethodChange = Suppliers.onGrnPaymentMethodChange;
window.renderGRNHistoryTable = Suppliers.renderGRNHistoryTable;
window.viewGrnDetail = Suppliers.viewGrnDetail;
window.closeGrnDetailModal = Suppliers.closeGrnDetailModal;
window.exportGrnToCSV = Suppliers.exportGrnToCSV;
window.openSupplierPayModal = Suppliers.openSupplierPayModal;
window.closeSupplierPayModal = Suppliers.closeSupplierPayModal;
window.onSupPayMethodChange = Suppliers.onSupPayMethodChange;
window.kioskKeypadPress = Payroll.kioskKeypadPress;
window.kioskKeypadClear = Payroll.kioskKeypadClear;
window.kioskKeypadBackspace = Payroll.kioskKeypadBackspace;
window.submitKioskAttendance = Payroll.submitKioskAttendance;
window.switchEmployeeSubTab = Payroll.switchEmployeeSubTab;
window.openEmployeeModal = Payroll.openEmployeeModal;
window.closeEmployeeModal = Payroll.closeEmployeeModal;
window.deleteEmployee = Payroll.deleteEmployee;
window.openStaffLoginModal = Payroll.openStaffLoginModal;
window.closeStaffLoginModal = Payroll.closeStaffLoginModal;
window.handleStaffLoginSubmit = Payroll.handleStaffLoginSubmit;
window.setAttendancePeriodPreset = Payroll.setAttendancePeriodPreset;
window.renderAttendanceLogsTable = Payroll.renderAttendanceLogsTable;
window.deleteAttendanceRecord = Payroll.deleteAttendanceRecord;
window.exportAttendanceToCSV = Payroll.exportAttendanceToCSV;
window.openSalaryAdvanceModal = Payroll.openSalaryAdvanceModal;
window.closeSalaryAdvanceModal = Payroll.closeSalaryAdvanceModal;
window.renderMonthlyPayrollSheet = Payroll.renderMonthlyPayrollSheet;
window.printEmployeePayslip = Payroll.printEmployeePayslip;
window.closePayslipModal = Payroll.closePayslipModal;
window.exportPayrollToCSV = Payroll.exportPayrollToCSV;

// Reports Global Window Exports
window.switchReportTab = Reports.switchReportTab;
window.setReportPeriodPreset = Reports.setReportPeriodPreset;
window.applyReportDateFilter = Reports.applyReportDateFilter;
window.reprintInvoice = Reports.reprintInvoice;
window.shareWhatsAppInvoice = Reports.shareWhatsAppInvoice;
window.settleCustomerCredit = Reports.settleCustomerCredit;
window.exportCurrentReportToCSV = Reports.exportCurrentReportToCSV;
window.renderPnLStatement = Reports.renderPnLStatement;
window.renderHourlyVelocityReport = Reports.renderHourlyVelocityReport;
window.renderWaiterSalesReport = Reports.renderWaiterSalesReport;
window.openDayEndModal = Reports.openDayEndModal;
window.closeDayEndModal = Reports.closeDayEndModal;
window.openShiftHandoverModal = Reports.openShiftHandoverModal;
window.closeShiftHandoverModal = Reports.closeShiftHandoverModal;
window.handleShiftHandoverSubmit = Reports.handleShiftHandoverSubmit;
window.calculateDayEndVariance = Reports.calculateDayEndVariance;
window.printAndSaveZReport = Reports.printAndSaveZReport;
window.voidInvoice = Reports.executeVoidInvoiceProcess;
window.requestManagerVoidOverride = Reports.requestManagerVoidOverride;
window.closeManagerOverrideModal = Reports.closeManagerOverrideModal;
window.submitManagerOverrideAction = Reports.submitManagerOverrideAction;

// POS Global Window Exports
window.addNewBillTab = POS.addNewBillTab;
window.switchBillTab = POS.switchBillTab;
window.closeBillTab = POS.closeBillTab;
window.updateCurrentBillSettings = POS.updateCurrentBillSettings;
window.onPosSearchInput = POS.onPosSearchInput;
window.filterPosByCategory = POS.filterPosByCategory;
window.changeCartQty = POS.changeCartQty;
window.clearCurrentCart = POS.clearCurrentCart;
window.selectPayMethod = POS.selectPayMethod;
window.calculateCashChange = POS.calculateCashChange;
window.sendOrderToKitchen = POS.sendOrderToKitchen;
window.processOrder = POS.processOrder;
window.openSplitBillModal = POS.openSplitBillModal;
window.closeSplitBillModal = POS.closeSplitBillModal;
window.calculateEqualSplitUI = POS.calculateEqualSplitUI;
window.executeItemSplitToNewBill = POS.executeItemSplitToNewBill;
window.openShiftFloatModal = POS.openShiftFloatModal;
window.closeShiftFloatModal = POS.closeShiftFloatModal;
window.handleShiftFloatSubmit = POS.handleShiftFloatSubmit;

