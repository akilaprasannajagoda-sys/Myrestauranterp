// ==========================================================================
// RESTAURANT ERP - ENTERPRISE ZERO-LAG HIGH-SPEED RESTAURANT PLATFORM
// 5-YEAR PRODUCTION HARDENED ARCHITECTURE (OFFLINE-FIRST HYBRID BOOT)
// 🛡️ RE-AUTHENTICATION & PERMISSION-DENIED SECURE AUTO-RECOVERY ENGINE
// 📡 OFFLINE LOCAL LAN AUTO-PRINT KOT/BOT INTEGRATED
// 🚀 MOBILE APK IN-APP GITHUB AUTO-UPDATE SYNC ENGINE
// 💰 FIREBASE DATA DOWNLOAD COST OPTIMIZED (ON-DEMAND QUERYING & BOUNDED STREAMS)
// 📄 INTEGRATED ENTERPRISE PDF & EXCEL REPORTING DISPATCHER
// ==========================================================================

// 🛡️ 1. OFFLINE STANDALONE FIREBASE BUNDLE IMPORT (NO CDN DEPENDENCY)
import { 
  initializeApp, 
  deleteApp,
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
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
  runTransaction
} from './vendor/firebase.bundle.js';

// --- IMPORT CUSTOM ERP MODULES ---
import { 
  erpState, currentTenant, currentTenantInfo, currentUserRole, activeBillId, lastReadyOrderCount, activeSupplierLedgerId, sharedOfflineDB,
  setCurrentTenant, setCurrentTenantInfo, setCurrentUserRole, setActiveBillId, setLastReadyOrderCount
} from './state.js';

import { 
  showLiveToast, toggleNotificationPanel, clearAllNotifications, manualPurgeSystemMemory, sendInvoiceViaWhatsApp, triggerAudioAlert, getLocalDateString, verifyPin, generateReportPDF 
} from './utils.js';

import * as PettyCash from './pettycash.js';
import * as KDS from './kds.js';
import * as Tables from './tables.js';
import * as Inventory from './inventory.js';
import * as Menu from './menu.js';
import * as Suppliers from './suppliers.js';
import * as Customers from './customers.js';
import * as Payroll from './payroll.js';
import * as Reports from './reports.js';
import * as POS from './pos.js';
import * as PrinterDriver from './printer.js';

// --- FIREBASE CONFIGURATION ---
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
export const authInstance = getAuth(appInstance);
window.authInstance = authInstance;
const dbInstance = getDatabase(appInstance);
const dbRef = (path) => ref(dbInstance, path);

// 🛡️ MEMORY LEAK UNSUBSCRIBE TRACKER
let activeFirebaseUnsubscribers = [];

export function clearAllFirebaseStreams() {
  activeFirebaseUnsubscribers.forEach(unsub => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (e) {}
  });
  activeFirebaseUnsubscribers = [];
}
window.clearAllFirebaseStreams = clearAllFirebaseStreams;

// 🛡️ PRE-LOAD LOCAL CACHED DATA ON STARTUP
try {
  const cachedDishes = localStorage.getItem("cached_erp_dishes");
  const cachedCats = localStorage.getItem("cached_erp_dishCategories");
  const cachedEmps = localStorage.getItem("cached_erp_employees");
  const cachedSettings = localStorage.getItem("cached_erp_settings");
  const cachedCustomers = localStorage.getItem("cached_erp_customers");
  
  if (cachedDishes) erpState.dishes = JSON.parse(cachedDishes);
  if (cachedCats) erpState.dishCategories = JSON.parse(cachedCats);
  if (cachedEmps) erpState.employees = JSON.parse(cachedEmps);
  if (cachedSettings) erpState.settings = JSON.parse(cachedSettings);
  if (cachedCustomers) erpState.customers = JSON.parse(cachedCustomers);
} catch (e) {}

let currentStaffPermissions = null;

// 🖨️ AUTO-DETECT WINDOWS PRINTERS INTO SETTINGS
export async function loadInstalledPrintersToUI() {
  const datalist = document.getElementById("installedPrintersList");
  if (!datalist) return;

  try {
    if (window.electronAPI && window.electronAPI.getPrinters) {
      const printers = await window.electronAPI.getPrinters();
      if (printers && Array.isArray(printers)) {
        datalist.innerHTML = "";
        printers.forEach(p => {
          const option = document.createElement("option");
          option.value = p.name;
          option.innerText = `${p.name} ${p.isDefault ? '(Default Printer)' : ''}`;
          datalist.appendChild(option);
        });
      }
    }
  } catch (err) {
    console.warn("Printers fetch bypass:", err.message);
  }
}
window.loadInstalledPrintersToUI = loadInstalledPrintersToUI;

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

// 🔒 SECONDARY AUTH ENGINE
async function createStaffAuthAccount(email, password, role, staffName, tenantId, permissions = null) {
  const tempAppName = "SecondaryAuthApp_" + Date.now() + "_" + Math.random().toString(36).substring(7);
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);
  const tempDb = getDatabase(tempApp);
  
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const subUser = cred.user;

    await set(ref(tempDb, `users/${subUser.uid}`), {
      email: email,
      tenantId: tenantId,
      ownerName: staffName,
      role: role,
      permissions: permissions || null,
      createdAt: new Date().toISOString()
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
let localDB = sharedOfflineDB;

// --- INITIALIZE ALL MODULES ---
PettyCash.initPettyCashContext(dbRef, push, remove);
KDS.initKdsContext(dbRef, update);
Tables.initTablesContext(dbRef, push, update, remove, set, switchView, POS.renderBillTabsBar, POS.syncActiveBillToFormUI);
Inventory.initInventoryContext(dbRef, push, update, remove, runTransaction);
Menu.initMenuContext(dbRef, push, update, remove, POS.renderPOSDishesGrid);
Suppliers.initSuppliersContext(dbRef, push, update);
Customers.initCustomersContext(dbRef, push, update, remove, runTransaction);
Payroll.initPayrollContext(dbRef, push, update, remove, createStaffAuthAccount);
Reports.initReportsContext(dbRef, push, update, POS.printThermalReceipt, { query, orderByChild, startAt, endAt, limitToLast, equalTo, get }, runTransaction);
POS.initPosContext(dbRef, push, update, remove, set, localDB, runTransaction);

updateDeviceTerminalBadgeUI();
loadInstalledPrintersToUI();

document.querySelectorAll("form").forEach(f => {
  f.addEventListener("submit", (e) => e.preventDefault());
});

function renderAuthAlert(msgText, isError = true) {
  const box = document.getElementById("alertBox");
  if (!box) return;
  box.innerText = msgText;
  box.className = `p-3 mb-4 rounded-xl text-xs font-semibold text-white ${isError ? 'bg-red-500' : 'bg-green-600'}`;
  box.classList.remove("hidden");
}

// 🛡️ SWITCH AUTH MODE
export function switchAuthMode(mode) {
  const cloudTab = document.getElementById("authTabOnlineBtn");
  const offlineTab = document.getElementById("authTabOfflineBtn");
  const cloudForm = document.getElementById("loginForm");
  const offlineForm = document.getElementById("offlinePinForm");

  if (mode === "offline") {
    cloudTab?.classList.remove("bg-blue-600", "text-white", "shadow-sm");
    cloudTab?.classList.add("text-gray-600");
    offlineTab?.classList.add("bg-amber-500", "text-white", "shadow-sm");
    offlineTab?.classList.remove("text-gray-600");

    cloudForm?.classList.add("hidden");
    offlineForm?.classList.remove("hidden");
    setTimeout(() => document.getElementById("offlinePinInput")?.focus(), 50);
  } else {
    offlineTab?.classList.remove("bg-amber-500", "text-white", "shadow-sm");
    offlineTab?.classList.add("text-gray-600");
    cloudTab?.classList.add("bg-blue-600", "text-white", "shadow-sm");
    cloudTab?.classList.remove("text-gray-600");

    offlineForm?.classList.add("hidden");
    cloudForm?.classList.remove("hidden");
    setTimeout(() => document.getElementById("loginEmail")?.focus(), 50);
  }
}
window.switchAuthMode = switchAuthMode;

// ⚡ SILENT BACKGROUND RE-AUTHENTICATION
async function triggerBackgroundTerminalAuth() {
  if (!navigator.onLine || authInstance.currentUser) return;
  
  const savedEmail = localStorage.getItem("terminal_auth_email");
  const savedPass = localStorage.getItem("terminal_auth_password");

  if (savedEmail && savedPass) {
    try {
      await signInWithEmailAndPassword(authInstance, savedEmail, savedPass);
      if (currentTenant) {
        initializeRealtimeDataStreams(currentTenant);
      }
      if (POS && POS.syncOfflineInvoicesToCloud) {
        POS.syncOfflineInvoicesToCloud();
      }
    } catch (err) {
      console.warn("Silent background auth pass:", err.message);
    }
  }
}

// ⚡ OFFLINE PIN LOGIN HANDLER
export async function handleOfflinePinSubmit(ev) {
  if (ev) ev.preventDefault();
  const pinIn = document.getElementById("offlinePinInput");
  const pin = pinIn?.value.trim() || "";
  
  if (!pin) {
    renderAuthAlert("කරුණාකර ඔබගේ 4-Digit PIN අංකය ඇතුළත් කරන්න.", true);
    pinIn?.focus();
    return;
  }

  const pairedTenant = localStorage.getItem("pairedHotelTenantId");
  const pairedHotelName = localStorage.getItem("pairedHotelName") || "Restaurant ERP";

  if (!pairedTenant) {
    renderAuthAlert("මෙම පරිගණකය හෝටලයක් සමඟ Pair කර නොමැත. කරුණාකර පළමුව Internet ඇතිව Cloud Login එකෙන් Owner ලෙස ලොග් වන්න.", true);
    return;
  }

  let employeesList = Object.values(erpState.employees || {});
  if (employeesList.length === 0) {
    try {
      const cached = localStorage.getItem("cached_erp_employees");
      if (cached) employeesList = Object.values(JSON.parse(cached));
    } catch (e) {}
  }

  let matchedEmp = null;
  for (const e of employeesList) {
    if (await verifyPin(pin, e.password)) {
      matchedEmp = e;
      break;
    }
  }

  const isInitialSetupUnlock = employeesList.length === 0 && pin === "1234";

  if (matchedEmp || isInitialSetupUnlock) {
    const role = matchedEmp ? (matchedEmp.systemRole || matchedEmp.role?.toLowerCase() || "cashier") : "owner";
    const perms = matchedEmp ? matchedEmp.permissions : null;
    const staffName = matchedEmp ? matchedEmp.name : "Admin";

    setCurrentTenant(pairedTenant);
    setCurrentUserRole(role);

    document.getElementById("authScreen")?.classList.add("hidden");
    document.getElementById("mainApp")?.classList.remove("hidden");

    const sideUser = document.getElementById("sideUserName");
    const sideTen = document.getElementById("sideTenantId");
    const sideHotel = document.getElementById("sideHotelName");
    if (sideUser) sideUser.innerText = `${staffName} (${navigator.onLine ? '🟢 Online' : '⚡ Offline'})`;
    if (sideTen) sideTen.innerText = pairedTenant;
    if (sideHotel) sideHotel.innerText = pairedHotelName;

    applyRoleBasedUI(role, perms);
    startLiveClockWidget();
    resetInactivityTimer();
    loadInstalledPrintersToUI();

    if (navigator.onLine && !authInstance.currentUser) {
      triggerBackgroundTerminalAuth();
    } else if (authInstance.currentUser && currentTenant) {
      initializeRealtimeDataStreams(currentTenant);
    }

    showLiveToast("⚡ Counter Ready", `${staffName} ලෙස කවුන්ටරය සාර්ථකව විවෘත විය.`, "success", "fa-bolt");
  } else {
    renderAuthAlert("❌ වැරදි PIN අංකයකි! නැවත උත්සාහ කරන්න.", true);
    if (pinIn) {
      pinIn.value = "";
      pinIn.focus();
    }
  }
}
window.handleOfflinePinSubmit = handleOfflinePinSubmit;

// 🛡️ LOGIN SUBMIT HANDLER
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
    const userCred = await signInWithEmailAndPassword(authInstance, emailVal, passVal);
    
    if (userCred.user) {
      localStorage.setItem("terminal_auth_email", emailVal);
      localStorage.setItem("terminal_auth_password", passVal);
    }
  } catch (err) {
    let errDesc = "Login දෝෂයකි: Email හෝ Password වැරදිය.";
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
      errDesc = "Email ලිපිනය හෝ Password අංකය වැරදිය. කරුණාකර නැවත පරීක්ෂා කරන්න.";
    } else if (err.code === "auth/network-request-failed" || !navigator.onLine) {
      errDesc = "Internet සම්බන්ධතාවය නොමැත! කරුණාකර 'Offline PIN' Tab එක භාවිත කරන්න.";
      switchAuthMode("offline");
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

document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
document.getElementById("offlinePinForm")?.addEventListener("submit", handleOfflinePinSubmit);
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
document.getElementById("customerForm")?.addEventListener("submit", (e) => { e.preventDefault(); Customers.handleCustomerSubmit(e); });
document.getElementById("employeeForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleEmployeeSubmit(e); });
document.getElementById("salaryAdvanceForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleSalaryAdvanceSubmit(e); });
document.getElementById("staffLoginForm")?.addEventListener("submit", (e) => { e.preventDefault(); Payroll.handleStaffLoginSubmit(e); });
document.getElementById("mergeTableForm")?.addEventListener("submit", (e) => { e.preventDefault(); Tables.handleMergeTables(e); });
document.getElementById("shiftFloatForm")?.addEventListener("submit", (e) => { e.preventDefault(); POS.handleShiftFloatSubmit(e); });
document.getElementById("shiftHandoverForm")?.addEventListener("submit", (e) => { e.preventDefault(); Reports.handleShiftHandoverSubmit(e); });

// HOTEL PROFILE FORM
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
    showLiveToast("⚠️ Profile Error", "Profile යාවත්කාලීන කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
});

// PRINTER ROUTING FORM
document.getElementById("printerRoutingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dbRef || !currentTenant) return;

  const isSilent = document.getElementById("silentPrintEnabled")?.checked ?? true;
  const paperWidth = document.getElementById("setPaperWidth")?.value || "80mm";

  const printersData = {
    p1: { name: document.getElementById("p1_name")?.value.trim() || "Main Cashier 1", device: document.getElementById("p1_device")?.value.trim() || "POS-80", bill: document.getElementById("p1_bill")?.checked || false, kot: document.getElementById("p1_kot")?.checked || false },
    p2: { name: document.getElementById("p2_name")?.value.trim() || "Hot Kitchen KOT", device: document.getElementById("p2_device")?.value.trim() || "POS80-Kitchen", bill: document.getElementById("p2_bill")?.checked || false, kot: document.getElementById("p2_kot")?.checked || false },
    p3: { name: document.getElementById("p3_name")?.value.trim() || "Juice & Bar BOT", device: document.getElementById("p3_device")?.value.trim() || "POS80-Bar", bill: document.getElementById("p3_bill")?.checked || false, kot: document.getElementById("p3_kot")?.checked || false },
    p4: { name: document.getElementById("p4_name")?.value.trim() || "Cashier 2 / Accounts", device: document.getElementById("p4_device")?.value.trim() || "POS80-Accounts", bill: document.getElementById("p4_bill")?.checked || false, kot: document.getElementById("p4_kot")?.checked || false },
    p5: { name: document.getElementById("p5_name")?.value.trim() || "Accounts Payslip Printer", device: document.getElementById("p5_device")?.value.trim() || "", bill: false, kot: false, payslip: document.getElementById("p5_payslip")?.checked ?? true }
  };

  try {
    await update(ref(dbInstance, `tenants/${currentTenant}/settings`), { 
      silentPrintEnabled: isSilent, 
      paperWidth: paperWidth,
      printers: printersData 
    });
    if (!erpState.settings) erpState.settings = {};
    erpState.settings.silentPrintEnabled = isSilent;
    erpState.settings.paperWidth = paperWidth;
    erpState.settings.printers = printersData;
    showLiveToast("🖨️ Printers Updated", "Printers සහ කඩදාසි සැකසුම් සාර්ථකව යාවත්කාලීන විය.", "success", "fa-print");
  } catch (err) {
    showLiveToast("⚠️ Printers Error", "Printers සැකසීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
});

// TAX & INVENTORY SETTINGS FORM
document.getElementById("taxSettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dbRef || !currentTenant) return;

  const inventoryMode = document.querySelector('input[name="setInventoryMode"]:checked')?.value || "recipe";
  const paperWidth = document.getElementById("setPaperWidth")?.value || "80mm";

  const settingsData = {
    inventoryMode: inventoryMode,
    paperWidth: paperWidth,
    scEnabled: document.getElementById("setScEnabled")?.checked || false,
    scRate: parseFloat(document.getElementById("setScRate")?.value || 10),
    vatEnabled: document.getElementById("setVatEnabled")?.checked || false,
    vatRate: parseFloat(document.getElementById("setVatRate")?.value || 18),
    cslEnabled: document.getElementById("setCslEnabled")?.checked || false,
    cslRate: parseFloat(document.getElementById("setCslRate")?.value || 2.5),
    loyaltyRate: parseFloat(document.getElementById("setLoyaltyRate")?.value || 100),
    loyaltyPointValue: parseFloat(document.getElementById("setLoyaltyPointValue")?.value || 1.0),
    shiftHours: parseFloat(document.getElementById("setShiftHours")?.value || 8.0)
  };

  try {
    await update(ref(dbInstance, `tenants/${currentTenant}/settings`), settingsData);
    erpState.settings = Object.assign(erpState.settings || {}, settingsData);
    try {
      localStorage.setItem("cached_erp_settings", JSON.stringify(erpState.settings));
    } catch(e) {}
    POS.recalculateCartTotalsUI();
    showLiveToast("⚙️ Settings Saved", `Settings සාර්ථකව ස්ථිරව යාවත්කාලීන විය.`, "success", "fa-sliders");
  } catch (err) {
    showLiveToast("⚠️ Settings Error", "Settings සේව් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
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
    const dStr = getLocalDateString();
    
    a.href = url;
    a.download = `RestaurantERP_Backup_${hName}_${dStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showLiveToast("✅ Backup Downloaded", "100% ක් සම්පූර්ණ Backup ගොනුව සාර්ථකව Download විය.", "success", "fa-cloud-arrow-down");
  } catch (err) {
    showLiveToast("⚠️ Backup Error", "Backup සකස් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}
window.downloadFullDatabaseBackup = downloadFullDatabaseBackup;

// 1-CLICK COMPLETE DATABASE RESTORE
export async function handleRestoreBackupFile(event) {
  const file = event.target.files[0];
  if (!file || !dbRef || !currentTenant) return;

  const confirmMsg = `⚠️ අනතුරු ඇඟවීමයි!\n\nඔබ තෝරාගත් Backup ගොනුවෙන් පද්ධතිය Restore කිරීමට අවශ්‍යද?`;
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
        showLiveToast("⚠️ Restore Error", "Restore දෝෂයකි: " + parseErr.message, "warning", "fa-triangle-exclamation");
      }
    };
    reader.readAsText(file);
  } catch (err) {
    showLiveToast("⚠️ Restore Error", "Restore Error: " + err.message, "warning", "fa-triangle-exclamation");
  } finally {
    event.target.value = "";
  }
}
window.handleRestoreBackupFile = handleRestoreBackupFile;

// 🛡️ INACTIVITY AUTO PIN-LOCK ENGINE
let inactivityTimer = null;
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (currentUserRole === 'cook') return;

  inactivityTimer = setTimeout(() => {
    if ((authInstance.currentUser || currentTenant) && currentTenant) {
      const isKitchenActive = document.getElementById("viewKitchen") && !document.getElementById("viewKitchen").classList.contains("hidden");
      const isFaceScanActive = document.getElementById("viewFaceScan") && !document.getElementById("viewFaceScan").classList.contains("hidden");

      if (isKitchenActive || isFaceScanActive) return;

      const lockScreen = document.getElementById("inactivityLockScreen");
      if (lockScreen) {
        lockScreen.classList.remove("hidden");
        const pinIn = document.getElementById("unlockScreenPinInput");
        if (pinIn) {
          pinIn.value = "";
          setTimeout(() => {
            pinIn.focus();
            pinIn.select();
          }, 100);
        }
      }
    }
  }, 240000);
}

['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

window.submitCounterUnlock = async function() {
  const pinIn = document.getElementById("unlockScreenPinInput");
  const pin = pinIn?.value.trim();
  if (!pin) return;

  let employeesList = Object.values(erpState.employees || {});
  if (employeesList.length === 0) {
    try {
      const cached = localStorage.getItem("cached_erp_employees");
      if (cached) employeesList = Object.values(JSON.parse(cached));
    } catch(e) {}
  }

  let isMatchedEmployee = false;
  for (const e of employeesList) {
    if (await verifyPin(pin, e.password)) {
      isMatchedEmployee = true;
      break;
    }
  }

  const isInitialSetupUnlock = employeesList.length === 0 && pin === "1234";

  if (isMatchedEmployee || isInitialSetupUnlock) {
    document.getElementById("inactivityLockScreen")?.classList.add("hidden");
    resetInactivityTimer();
    showLiveToast("🔓 Terminal Unlocked", "කවුන්ටරය සාර්ථකව Unlock කරන ලදී.", "success", "fa-unlock");
    
    setTimeout(() => {
      const posInput = document.getElementById("posSearchInput");
      if (posInput && !posInput.closest(".hidden")) {
        posInput.focus();
      }
    }, 60);
  } else {
    showLiveToast("⚠️ අගුළු ඇරීමේ දෝෂයක්", "❌ වැරදි PIN අංකයකි! නැවත උත්සාහ කරන්න.", "warning", "fa-lock");
    if (pinIn) {
      pinIn.value = "";
      pinIn.focus();
    }
  }
};

// ==========================================================================
// 2. ROLE & ACCESS PERMISSIONS ENFORCEMENT ENGINE (BUG #20 FIXED)
// ==========================================================================
export function applyRoleBasedUI(role = "owner", permissions = null) {
  setCurrentUserRole(role);
  currentStaffPermissions = permissions;
  const roleBadge = document.getElementById("sideUserRole");

  const navMap = {
    pos: document.getElementById("nav-pos"),
    tables: document.getElementById("nav-tables"),
    kitchen: document.getElementById("nav-kitchen"),
    menu: document.getElementById("nav-menu"),
    inventory: document.getElementById("nav-inventory"),
    suppliersGrn: document.getElementById("nav-suppliersGrn"),
    customers: document.getElementById("nav-customers"),
    pettyCash: document.getElementById("nav-pettyCash"),
    dayEnd: document.getElementById("nav-dayEnd"),
    shiftHandover: document.getElementById("nav-shiftHandover"),
    faceScan: document.getElementById("nav-faceScan"),
    employees: document.getElementById("nav-employees"),
    reports: document.getElementById("nav-reports"),
    settings: document.getElementById("nav-settings")
  };

  Object.values(navMap).forEach(btn => btn?.classList.remove("hidden"));

  const feats = erpState.subscription?.features || {};
  Object.entries(navMap).forEach(([fKey, el]) => {
    if (feats[fKey] === false && el) {
      el.classList.add("hidden");
    }
  });

  if (role === "owner" || role === "superAdmin" || role === "superadmin") {
    if (roleBadge) roleBadge.innerText = "Owner Admin";
    return;
  }

  if (permissions && typeof permissions === "object" && Object.keys(permissions).length > 0) {
    let firstAllowedView = null;
    const modalOnlyKeys = ["shiftHandover", "dayEnd"];

    Object.entries(navMap).forEach(([modKey, btn]) => {
      if (btn) {
        if (permissions[modKey] === false) {
          btn.classList.add("hidden");
        } else if (permissions[modKey] === true) {
          btn.classList.remove("hidden");
          // 🛡️ REPAIRED (BUG #20): Do not pick modal buttons as full-screen views
          if (!firstAllowedView && !modalOnlyKeys.includes(modKey) && availableViews.includes(modKey)) {
            firstAllowedView = modKey;
          }
        }
      }
    });

    if (roleBadge) roleBadge.innerText = (role ? role.toUpperCase() : "STAFF");
    if (firstAllowedView) {
      switchView(firstAllowedView);
    } else {
      switchView("pos");
    }
    return;
  }

  // Fallback Presets
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
    navMap.customers?.classList.add("hidden");
    navMap.pettyCash?.classList.add("hidden");
    navMap.dayEnd?.classList.add("hidden");
    navMap.shiftHandover?.classList.add("hidden");
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
    navMap.customers?.classList.add("hidden");
    navMap.pettyCash?.classList.add("hidden");
    navMap.dayEnd?.classList.add("hidden");
    navMap.shiftHandover?.classList.add("hidden");
    navMap.employees?.classList.add("hidden");
    navMap.reports?.classList.add("hidden");
    navMap.settings?.classList.add("hidden");
    switchView("tables");
  } else {
    if (roleBadge) roleBadge.innerText = (role || "Staff").toUpperCase();
  }
}

// 🛡️ AUTH STATE LISTENER
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
        renderAuthAlert(`🚫 මෙම ගිණුම Database හි users node යටතේ ලියාපදිංචි වී නොමැත.`, true);
        await signOut(authInstance);
        return;
      }

      const uData = snap.val();
      const userRole = uData.role || "owner";
      let userPermissions = uData.permissions || null;
      const pairedTenant = localStorage.getItem("pairedHotelTenantId");

      if (userRole !== "owner") {
        if (!pairedTenant || pairedTenant !== uData.tenantId) {
          renderAuthAlert(`🚫 Access Denied: කරුණාකර පළමුව Owner Account එකෙන් ලොග් වන්න.`, true);
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

      if (userRole !== "owner" && !userPermissions) {
        try {
          const empSnap = await get(ref(dbInstance, `tenants/${uData.tenantId}/employees`));
          if (empSnap.exists()) {
            const allEmps = Object.values(empSnap.val());
            const matchedEmp = allEmps.find(e => e.authUid === activeUser.uid || e.loginEmail === activeUser.email);
            if (matchedEmp && matchedEmp.permissions) {
              userPermissions = matchedEmp.permissions;
            }
          }
        } catch (e) {}
      }

      document.getElementById("authScreen")?.classList.add("hidden");
      document.getElementById("mainApp")?.classList.remove("hidden");
      const sideUser = document.getElementById("sideUserName");
      const sideTen = document.getElementById("sideTenantId");
      if (sideUser) sideUser.innerText = uData.ownerName || activeUser.email;
      if (sideTen) sideTen.innerText = uData.tenantId;

      applyRoleBasedUI(userRole, userPermissions);
      initializeRealtimeDataStreams(uData.tenantId);
      startLiveClockWidget();
      resetInactivityTimer();
      loadInstalledPrintersToUI();

      if (navigator.onLine) {
        POS.syncOfflineInvoicesToCloud();
      }
    } catch (err) {
      console.error("Auth state error:", err);
      if (!navigator.onLine && localStorage.getItem("pairedHotelTenantId")) {
        showLiveToast("⚡ Offline Mode Active", "Internet නොමැති බැවින් Local Offline දත්ත භාවිත වේ.", "info", "fa-bolt");
      } else {
        renderAuthAlert("දත්ත ලබාගැනීමේ දෝෂයකි: " + err.message, true);
      }
    }
  } else {
    if (localStorage.getItem("pairedHotelTenantId")) {
      switchAuthMode("offline");
      if (navigator.onLine) {
        triggerBackgroundTerminalAuth();
      }
    } else {
      setCurrentTenant(null);
      currentStaffPermissions = null;
      clearAllFirebaseStreams();
      document.getElementById("authScreen")?.classList.remove("hidden");
      document.getElementById("mainApp")?.classList.add("hidden");
      Payroll.stopKioskCameraStream();
      updateDeviceTerminalBadgeUI();
    }
  }
});

setInterval(() => {
  if (navigator.onLine && currentTenant) {
    if (!authInstance.currentUser) {
      triggerBackgroundTerminalAuth();
    } else {
      POS.syncOfflineInvoicesToCloud();
    }
  }
}, 45000);

window.addEventListener("online", () => {
  showLiveToast("🌐 Internet Connected", "සම්බන්ධතාවය යථා තත්ත්වයට පත් විය. Cloud Sync වෙමින් පවතී...", "info", "fa-wifi");
  if (!authInstance.currentUser) {
    triggerBackgroundTerminalAuth();
  } else if (currentTenant) {
    POS.syncOfflineInvoicesToCloud();
  }
});

window.lockTerminal = function() {
  if (Payroll && Payroll.stopKioskCameraStream) {
    Payroll.stopKioskCameraStream();
  }
  document.getElementById("mainApp")?.classList.add("hidden");
  document.getElementById("authScreen")?.classList.remove("hidden");
  switchAuthMode("offline");
  showLiveToast("🔒 Terminal Locked", "කවුන්ටරය අගුළු වැටිණි. ඊළඟ Cashier හට PIN එකෙන් ඇතුළු විය හැක.", "info", "fa-lock");
};

window.logout = function() {
  const confirmFull = confirm("⚠️ අවධානයට:\n\nඔබට මෙම පරිගණකය හෝටල් ගිණුමෙන් සම්පූර්ණයෙන්ම ඉවත් කර (Sign Out) වීමට අවශ්‍යද?\n\n(සාමාන්‍ය Cashier මාරුවකට හෝ තාවකාලිකව වැසීමට නම් 'Cancel' ඔබා Lock Terminal භාවිත කරන්න)");
  
  if (confirmFull) {
    clearAllFirebaseStreams();
    if (Payroll && Payroll.stopKioskCameraStream) {
      Payroll.stopKioskCameraStream();
    }
    
    localStorage.removeItem("pairedHotelTenantId");
    localStorage.removeItem("pairedHotelName");
    localStorage.removeItem("terminal_auth_email");
    localStorage.removeItem("terminal_auth_password");

    signOut(authInstance).catch(() => {
      window.location.reload();
    });
  }
};

// ==========================================================================
// 5. FIREBASE BANDWIDTH-OPTIMIZED REALTIME DATA STREAMS (BUG #2 FIXED)
// ==========================================================================
function initializeRealtimeDataStreams(tenantId) {
  clearAllFirebaseStreams();
  const basePath = `tenants/${tenantId}`;

  // 1. Profile
  const unsubProfile = onValue(ref(dbInstance, `${basePath}/profile`), (snapshot) => {
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
  activeFirebaseUnsubscribers.push(unsubProfile);

  // 2. Settings
  const unsubSettings = onValue(ref(dbInstance, `${basePath}/settings`), (snapshot) => {
    if (snapshot.exists()) {
      erpState.settings = Object.assign({ 
        shiftHours: 8.0, 
        paperWidth: "80mm",
        silentPrintEnabled: true, 
        inventoryMode: "recipe", 
        loyaltyEnabled: true, 
        loyaltyRate: 100, 
        loyaltyPointValue: 1.0 
      }, snapshot.val());

      try {
        localStorage.setItem("cached_erp_settings", JSON.stringify(erpState.settings));
      } catch(e) {}

      syncSettingsUI();
      POS.recalculateCartTotalsUI();
    }
  });
  activeFirebaseUnsubscribers.push(unsubSettings);

  // 3. Dish Categories
  const unsubDishCat = onValue(ref(dbInstance, `${basePath}/dishCategories`), (snapshot) => {
    erpState.dishCategories = snapshot.val() || {};
    try {
      localStorage.setItem("cached_erp_dishCategories", JSON.stringify(erpState.dishCategories));
    } catch (e) {}
    POS.renderDishCategoriesFilterUI();
    Menu.renderDishCategoryListUI();
    Menu.populateDishCategoryDropdown();
  });
  activeFirebaseUnsubscribers.push(unsubDishCat);

  // 4. Dishes
  const unsubDishes = onValue(ref(dbInstance, `${basePath}/dishes`), (snapshot) => {
    erpState.dishes = snapshot.val() || {};
    try {
      localStorage.setItem("cached_erp_dishes", JSON.stringify(erpState.dishes));
    } catch (e) {}
    POS.renderPOSDishesGrid();
    Menu.renderMenuDishesTable();
  });
  activeFirebaseUnsubscribers.push(unsubDishes);

  // 5. Raw Categories
  const unsubRawCat = onValue(ref(dbInstance, `${basePath}/rawCategories`), (snapshot) => {
    erpState.rawCategories = snapshot.val() || {};
    Inventory.renderRawCategoryListUI();
    Inventory.populateRawCategoryDropdown();
  });
  activeFirebaseUnsubscribers.push(unsubRawCat);

  // 6. Raw Items
  const unsubRawItems = onValue(ref(dbInstance, `${basePath}/rawItems`), (snapshot) => {
    erpState.rawItems = snapshot.val() || {};
    Inventory.renderRawStockTable();
    POS.renderPOSDishesGrid();
  });
  activeFirebaseUnsubscribers.push(unsubRawItems);

  // 6.1 Store Issues
  const recentStoreIssuesQuery = query(ref(dbInstance, `${basePath}/storeIssues`), limitToLast(40));
  const unsubStoreIssues = onValue(recentStoreIssuesQuery, (snapshot) => {
    erpState.storeIssues = snapshot.val() || {};
    Inventory.renderStoreIssueHistoryTable();
    if (Reports.activeReportTabName === "pnl") {
      Reports.renderPnLStatement();
    }
  });
  activeFirebaseUnsubscribers.push(unsubStoreIssues);

  // 6.2 🗑️ Kitchen Spoilage / Wastage Logs (BUG #2 FIXED)
  const recentWastageQuery = query(ref(dbInstance, `${basePath}/wastageLogs`), limitToLast(50));
  const unsubWastage = onValue(recentWastageQuery, (snapshot) => {
    erpState.wastageLogs = snapshot.val() || {};
    if (Reports.activeReportTabName === "pnl") {
      Reports.renderPnLStatement();
    }
  });
  activeFirebaseUnsubscribers.push(unsubWastage);

  // 7. Floor Areas
  const unsubAreas = onValue(ref(dbInstance, `${basePath}/areas`), (snapshot) => {
    erpState.areas = snapshot.val() || {};
    Tables.renderAreaFiltersUI();
    Tables.renderAreaListModalUI();
    Tables.populateTableAreaDropdown();
  });
  activeFirebaseUnsubscribers.push(unsubAreas);

  // 8. Tables
  const unsubTables = onValue(ref(dbInstance, `${basePath}/tables`), (snapshot) => {
    erpState.tables = snapshot.val() || {};
    Tables.renderTablesFloorGrid();
  });
  activeFirebaseUnsubscribers.push(unsubTables);

  // 9. Kitchen Orders
  const recentKitchenQuery = query(ref(dbInstance, `${basePath}/kitchenOrders`), limitToLast(25));
  const unsubKitchen = onValue(recentKitchenQuery, (snapshot) => {
    const prevOrders = erpState.kitchenOrders || {};
    erpState.kitchenOrders = snapshot.val() || {};
    KDS.renderKDSOrdersGrid();
    
    const currentOrders = erpState.kitchenOrders;
    
    if (Object.keys(currentOrders).length > Object.keys(prevOrders).length) {
      triggerAudioAlert("newOrder");
    }
    
    if (window.electronAPI && window.electronAPI.printSilent) {
      Object.entries(currentOrders).forEach(([orderId, orderData]) => {
        if (orderData && orderData.status === "Cooking" && orderData.isPrinted === false) {
          POS.handleIncomingCloudPrint(orderId, orderData);
        }
      });
    }
    
    Object.keys(currentOrders).forEach(k => {
      if (currentOrders[k].status === "Ready" && prevOrders[k] && prevOrders[k].status === "Cooking") {
        triggerAudioAlert("kitchen");
        showLiveToast("🛎️ Order Ready!", `Table ${currentOrders[k].tableNo} කෑම පිළියෙල කර අවසන්!`, "kitchen", "fa-bell-concierge");
      }
    });
  });
  activeFirebaseUnsubscribers.push(unsubKitchen);

  // 10. Suppliers
  const unsubSuppliers = onValue(ref(dbInstance, `${basePath}/suppliers`), (snapshot) => {
    erpState.suppliers = snapshot.val() || {};
    Suppliers.renderSuppliersDirectoryTable();
    Suppliers.populateGRNSupplierDropdown();
  });
  activeFirebaseUnsubscribers.push(unsubSuppliers);

  // 10.1 Customers
  const unsubCustomers = onValue(ref(dbInstance, `${basePath}/customers`), (snapshot) => {
    erpState.customers = snapshot.val() || {};
    try {
      localStorage.setItem("cached_erp_customers", JSON.stringify(erpState.customers));
    } catch (e) {}
    Customers.renderCustomersTable();
  });
  activeFirebaseUnsubscribers.push(unsubCustomers);

  // 11. Supplier Payments
  const recentSupPayQuery = query(ref(dbInstance, `${basePath}/supplierPayments`), limitToLast(40));
  const unsubSupPay = onValue(recentSupPayQuery, (snapshot) => {
    erpState.supplierPayments = snapshot.val() || {};
    Suppliers.renderSuppliersDirectoryTable();
  });
  activeFirebaseUnsubscribers.push(unsubSupPay);

  // 12. GRNs
  const recentGrnQuery = query(ref(dbInstance, `${basePath}/grns`), limitToLast(30));
  const unsubGrns = onValue(recentGrnQuery, (snapshot) => {
    erpState.grns = snapshot.val() || {};
    Suppliers.renderGRNHistoryTable();
    Suppliers.renderSuppliersDirectoryTable();
  });
  activeFirebaseUnsubscribers.push(unsubGrns);

  // 13. Invoices
  const recentInvoicesQuery = query(ref(dbInstance, `${basePath}/invoices`), limitToLast(30));
  const unsubInvoices = onValue(recentInvoicesQuery, (snapshot) => {
    const fromVal = document.getElementById("repFromDate")?.value;
    const toVal = document.getElementById("repToDate")?.value;
    
    if (!fromVal && !toVal) {
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
    }
  });
  activeFirebaseUnsubscribers.push(unsubInvoices);

  // 14. Customer Credits
  const unsubCredits = onValue(ref(dbInstance, `${basePath}/customerCredits`), (snapshot) => {
    erpState.customerCredits = snapshot.val() || {};
    Reports.renderCustomerCreditsLedger();
  });
  activeFirebaseUnsubscribers.push(unsubCredits);

  // 15. Petty Cash
  const recentPettyQuery = query(ref(dbInstance, `${basePath}/pettyCash`), limitToLast(40));
  const unsubPetty = onValue(recentPettyQuery, (snapshot) => {
    erpState.pettyCash = snapshot.val() || {};
    PettyCash.renderPettyCashTable();
    if (Reports.activeReportTabName === "pnl") {
      Reports.renderPnLStatement();
    }
  });
  activeFirebaseUnsubscribers.push(unsubPetty);

  // 16. Employees
  const unsubEmployees = onValue(ref(dbInstance, `${basePath}/employees`), (snapshot) => {
    erpState.employees = snapshot.val() || {};
    try {
      localStorage.setItem("cached_erp_employees", JSON.stringify(erpState.employees));
    } catch (e) {}

    Payroll.renderEmployeesTable();
    Tables.populateTableWaiterDropdown();
    Payroll.populateAttendanceEmployeeFilter();
    Payroll.populateSalaryAdvanceEmployeeDropdown();
    Payroll.renderMonthlyPayrollSheet();
    if (Reports.activeReportTabName === "waiters") {
      Reports.renderWaiterSalesReport();
    }

    if (authInstance.currentUser && currentUserRole !== "owner") {
      const currentStaffEmp = Object.values(erpState.employees).find(e => e.authUid === authInstance.currentUser.uid || e.loginEmail === authInstance.currentUser.email);
      if (currentStaffEmp && currentStaffEmp.permissions) {
        applyRoleBasedUI(currentStaffEmp.systemRole || currentUserRole, currentStaffEmp.permissions);
      }
    }
  });
  activeFirebaseUnsubscribers.push(unsubEmployees);

  // 17. Attendance Logs
  const recentAttQuery = query(ref(dbInstance, `${basePath}/attendance`), limitToLast(50));
  const unsubAtt = onValue(recentAttQuery, (snapshot) => {
    erpState.attendance = snapshot.val() || {};
    Payroll.renderAttendanceLogsTable();
    Payroll.renderMonthlyPayrollSheet();
  });
  activeFirebaseUnsubscribers.push(unsubAtt);

  // 18. Salary Advances
  const recentAdvQuery = query(ref(dbInstance, `${basePath}/salaryAdvances`), limitToLast(30));
  const unsubAdvances = onValue(recentAdvQuery, (snapshot) => {
    erpState.salaryAdvances = snapshot.val() || {};
    Payroll.renderMonthlyPayrollSheet();
  });
  activeFirebaseUnsubscribers.push(unsubAdvances);

  // 18.1 Monthly Salary Adjustments
  const recentAdjQuery = query(ref(dbInstance, `${basePath}/salaryAdjustments`), limitToLast(60));
  const unsubAdjustments = onValue(recentAdjQuery, (snapshot) => {
    erpState.salaryAdjustments = snapshot.val() || {};
    Payroll.renderMonthlyPayrollSheet();
  });
  activeFirebaseUnsubscribers.push(unsubAdjustments);

  // 18.2 🤝 Shift Handovers Stream
  const recentHandoversQuery = query(ref(dbInstance, `${basePath}/shiftHandovers`), limitToLast(30));
  const unsubHandovers = onValue(recentHandoversQuery, (snapshot) => {
    erpState.shiftHandovers = snapshot.val() || {};
  });
  activeFirebaseUnsubscribers.push(unsubHandovers);

  // 19. Active Bills
  const unsubActiveBills = onValue(ref(dbInstance, `${basePath}/activeBills`), (snapshot) => {
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
  activeFirebaseUnsubscribers.push(unsubActiveBills);

  // 20. Heartbeat & SaaS Subscription
  const sendHeartbeat = () => {
    if (currentTenant && dbRef && navigator.onLine) {
      update(ref(dbInstance, `tenants/${currentTenant}/subscription`), {
        lastHeartbeat: new Date().toISOString()
      }).catch(() => {});
    }
  };
  sendHeartbeat();
  setInterval(sendHeartbeat, 180000);

  if (!erpState.subscription) erpState.subscription = {};

  const unsubStatus = onValue(ref(dbInstance, `${basePath}/subscription/status`), (snapshot) => {
    const status = snapshot.val() || "active";
    erpState.subscription.status = status;
    
    if (status === "suspended") {
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
              ඔබගේ හෝටලයේ මෘදුකාංග ගිණුම තාවකාලිකව අත්හිටුවා ඇත. කරුණාකර සේවා සපයන්නා අමතන්න.
            </p>
          </div>
        `;
    } else {
      const lockScreen = document.getElementById("saasLockoutScreen");
      if (lockScreen) lockScreen.classList.add("hidden");
      if (authInstance.currentUser || currentTenant) {
        document.getElementById("mainApp")?.classList.remove("hidden");
      }
    }
  });
  activeFirebaseUnsubscribers.push(unsubStatus);

  const unsubFeatures = onValue(ref(dbInstance, `${basePath}/subscription/features`), (snapshot) => {
    erpState.subscription.features = snapshot.val() || {};
    applyRoleBasedUI(currentUserRole, currentStaffPermissions);
  });
  activeFirebaseUnsubscribers.push(unsubFeatures);

  const unsubNotice = onValue(ref(dbInstance, `${basePath}/subscription/broadcastNotice`), (snapshot) => {
    const notice = snapshot.val();
    if (notice && String(notice).trim()) {
      showLiveToast("📢 Notice", String(notice).trim(), "info", "fa-bullhorn");
    }
  });
  activeFirebaseUnsubscribers.push(unsubNotice);

  // 21. Day-End Reports
  const recentDayEndQuery = query(ref(dbInstance, `${basePath}/dayEndReports`), limitToLast(20));
  const unsubDayEnd = onValue(recentDayEndQuery, (snapshot) => {
    erpState.dayEndReports = snapshot.val() || {};
  });
  activeFirebaseUnsubscribers.push(unsubDayEnd);
}

// 🖥️ DUAL SCREEN CUSTOMER DISPLAY TOGGLE
window.toggleCustomerDisplayWindow = async function() {
  if (window.electronAPI && window.electronAPI.openCustomerDisplay) {
    await window.electronAPI.openCustomerDisplay();
    showLiveToast("🖥️ Customer Display", "දෙවන තිරය (Customer Display) සාර්ථකව විවෘත විය.", "info", "fa-desktop");
  } else {
    const cfdWin = window.open("customer-display.html", "CustomerDisplayWindow", "width=1024,height=600,menubar=no,toolbar=no");
    if (cfdWin) {
      showLiveToast("🖥️ Display Window", "Customer Display Window එක සාර්ථකව විවෘත විය.", "info", "fa-desktop");
      setTimeout(() => POS.syncLiveCustomerDisplay(), 1000);
    }
  }
};

// NAVIGATION & VIEW SWITCHER
const availableViews = ["pos", "tables", "kitchen", "menu", "inventory", "suppliersGrn", "customers", "pettyCash", "faceScan", "employees", "reports", "settings"];

export function switchView(viewName) {
  const feats = erpState.subscription?.features || {};
  if (feats[viewName] === false) {
    showLiveToast("🚫 Access Restricted", `මෙම Feature එක ඔබගේ Package එකට අනුව අක්‍රීය කර ඇත.`, "warning", "fa-lock");
    viewName = "pos";
  }

  // Staff Permissions Guard
  if (currentUserRole !== "owner" && currentStaffPermissions && typeof currentStaffPermissions === "object") {
    if (currentStaffPermissions[viewName] === false) {
      showLiveToast("🚫 Access Denied", "මෙම අංශයට පිවිසීමට ඔබට Owner විසින් අවසර ලබා දී නොමැත.", "warning", "fa-lock");
      return;
    }
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
    customers: `<i class="fa-solid fa-users text-pink-600"></i> Customer Directory & Loyalty Program (CRM)`,
    pettyCash: `<i class="fa-solid fa-wallet text-green-600"></i> Petty Cash Book (මුදල් පෙට්ටිය)`,
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

  if (viewName === "tables") {
    setTimeout(Tables.renderTablesFloorGrid, 60);
  }

  if (viewName === "reports") {
    Reports.renderInvoiceReportsList();
  }

  if (viewName === "settings") {
    loadInstalledPrintersToUI();
    if (window.electronAPI && window.electronAPI.getLocalServerInfo) {
      window.electronAPI.getLocalServerInfo().then(info => {
        const badge = document.getElementById("lanServerIpDisplay");
        if (badge) badge.innerText = info.serverUrl;
      }).catch(() => {});
    }
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

// 🖨️ SYNC SETTINGS UI
function syncSettingsUI() {
  const setPaper = document.getElementById("setPaperWidth");
  if (setPaper) setPaper.value = erpState.settings?.paperWidth || "80mm";

  const setSc = document.getElementById("setScEnabled");
  const setScRate = document.getElementById("setScRate");
  const setVat = document.getElementById("setVatEnabled");
  const setVatRate = document.getElementById("setVatRate");
  const setCsl = document.getElementById("setCslEnabled");
  const setCslRate = document.getElementById("setCslRate");
  const setLoyalty = document.getElementById("setLoyaltyRate");
  const setLoyaltyPointVal = document.getElementById("setLoyaltyPointValue");
  const setShift = document.getElementById("setShiftHours");
  const setSilent = document.getElementById("silentPrintEnabled");

  const invMode = erpState.settings?.inventoryMode || "recipe";
  const modeRec = document.getElementById("modeRecipe");
  const modeIss = document.getElementById("modeIssue");
  if (modeRec && modeIss) {
    if (invMode === "issue") {
      modeIss.checked = true;
      modeRec.checked = false;
    } else {
      modeRec.checked = true;
      modeIss.checked = false;
    }
  }

  if (setSc) setSc.checked = erpState.settings?.scEnabled || false;
  if (setScRate) setScRate.value = erpState.settings?.scRate || 10;
  if (setVat) setVat.checked = erpState.settings?.vatEnabled || false;
  if (setVatRate) setVatRate.value = erpState.settings?.vatRate || 18;
  if (setCsl) setCsl.checked = erpState.settings?.cslEnabled || false;
  if (setCslRate) setCslRate.value = erpState.settings?.cslRate || 2.5;
  if (setLoyalty) setLoyalty.value = erpState.settings?.loyaltyRate || 100;
  if (setLoyaltyPointVal) setLoyaltyPointVal.value = erpState.settings?.loyaltyPointValue ?? 1.0;
  if (setShift) setShift.value = erpState.settings?.shiftHours || 8.0;
  if (setSilent) setSilent.checked = erpState.settings?.silentPrintEnabled ?? true;

  const pr = erpState.settings?.printers || {};
  ['p1', 'p2', 'p3', 'p4', 'p5'].forEach(k => {
    const p = pr[k];
    if (p) {
      const nameIn = document.getElementById(`${k}_name`);
      const devIn = document.getElementById(`${k}_device`);
      const billCb = document.getElementById(`${k}_bill`);
      const kotCb = document.getElementById(`${k}_kot`);
      const payslipCb = document.getElementById(`${k}_payslip`);
      if (nameIn) nameIn.value = p.name || '';
      if (devIn) devIn.value = p.device || '';
      if (billCb) billCb.checked = !!p.bill;
      if (kotCb) kotCb.checked = !!p.kot;
      if (payslipCb) payslipCb.checked = !!p.payslip;
    }
  });
}

// 📡 LOCAL LAN ORDER RECEIVER LISTENER
if (window.electronAPI && window.electronAPI.onLanOrderReceived) {
  window.electronAPI.onLanOrderReceived((orderData) => {
    triggerAudioAlert("newOrder");
    showLiveToast(
      "📱 Mobile Order (Offline Wi-Fi)",
      `Table ${orderData.tableNo || 'N/A'} සඳහා ඇණවුමක් ලැබුණි. KOT/BOT Print වෙමින් පවතී...`,
      "kitchen",
      "fa-print"
    );

    const tempOrderId = "lan_" + Date.now();
    const formattedOrder = {
      ...orderData,
      timestamp: orderData.timestamp || new Date().toISOString(),
      status: "Cooking",
      isPrinted: false
    };

    if (!erpState.kitchenOrders) erpState.kitchenOrders = {};
    erpState.kitchenOrders[tempOrderId] = formattedOrder;
    KDS.renderKDSOrdersGrid();

    if (orderData.tableNo) {
      const matchedTable = Object.values(erpState.tables || {}).find(
        t => String(t.tableNo) === String(orderData.tableNo) || parseInt(t.tableNo, 10) === parseInt(orderData.tableNo, 10)
      );
      if (matchedTable) {
        matchedTable.status = "Occupied";
        Tables.renderTablesFloorGrid();
      }
    }

    POS.handleIncomingCloudPrint(tempOrderId, formattedOrder);
  });
}

// 🚀 MOBILE APK GITHUB UPDATE DETECTOR
const CURRENT_MOBILE_VERSION = "1.0.20";
const GITHUB_REPO_PATH = "akilaprasannajagoda-sys/Myrestauranterp";

async function checkForMobileAppUpdates() {
  if (window.electronAPI) return;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO_PATH}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return;

    const releaseData = await res.json();
    const latestVersion = (releaseData.tag_name || "").replace(/^v/, "").trim();

    if (latestVersion && isNewerVersion(latestVersion, CURRENT_MOBILE_VERSION)) {
      const apkAsset = (releaseData.assets || []).find(a => a.name.endsWith('.apk'));
      const apkDownloadUrl = apkAsset ? apkAsset.browser_download_url : releaseData.html_url;

      showMobileUpdateModal(latestVersion, apkDownloadUrl, releaseData.body);
    }
  } catch (err) {
    console.log("Mobile update check bypass:", err.message);
  }
}

function isNewerVersion(latest, current) {
  const lParts = latest.split('.').map(Number);
  const cParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function showMobileUpdateModal(newVer, downloadUrl, releaseNotes) {
  if (document.getElementById("mobileUpdatePromptModal")) return;

  const modal = document.createElement("div");
  modal.id = "mobileUpdatePromptModal";
  modal.className = "fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4";
  modal.innerHTML = `
    <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border-2 border-blue-500 text-center space-y-4">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto text-3xl shadow-lg">
        <i class="fa-solid fa-cloud-arrow-down animate-pulse"></i>
      </div>
      <div>
        <span class="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase">Update Available</span>
        <h3 class="text-lg font-black text-gray-800 mt-1">නව Version එකක් ඇත!</h3>
        <p class="text-xs text-gray-500 mt-0.5 font-bold">Version ${newVer} (Current: v${CURRENT_MOBILE_VERSION})</p>
      </div>

      <div class="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] text-gray-600 text-left">
        <p class="font-bold text-gray-800 mb-1">🔥 අලුත් විශේෂාංග:</p>
        <p class="text-gray-500">Floor Plan, Local Wi-Fi Printing සහ නව වෙනස්කම් ලබා ගැනීමට කරුණාකර App එක දැන්ම Update කරගන්න.</p>
      </div>

      <div class="space-y-2 pt-1">
        <a href="${downloadUrl}" target="_blank" onclick="document.getElementById('mobileUpdatePromptModal').remove()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer block">
          <i class="fa-solid fa-download"></i> දැන්ම Update කරන්න (Download APK)
        </a>
        <button type="button" onclick="document.getElementById('mobileUpdatePromptModal').remove()" class="text-gray-400 hover:text-gray-600 text-[11px] font-bold block mx-auto py-1">
          පසුව කරන්න (Later)
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

setTimeout(checkForMobileAppUpdates, 2000);

// ==========================================================================
// ALL GLOBAL WINDOW EXPORTS (WITH PDF ENGINE ATTACHED)
// ==========================================================================
window.showLiveToast = showLiveToast;
window.toggleNotificationPanel = toggleNotificationPanel;
window.clearAllNotifications = clearAllNotifications;
window.manualPurgeSystemMemory = manualPurgeSystemMemory;
window.generateReportPDF = generateReportPDF;

// Petty Cash
window.openPettyCashModal = PettyCash.openPettyCashModal;
window.closePettyCashModal = PettyCash.closePettyCashModal;
window.selectPettyEntryType = PettyCash.selectPettyEntryType;
window.setPettyPeriodPreset = PettyCash.setPettyPeriodPreset;
window.renderPettyCashTable = PettyCash.renderPettyCashTable;
window.deletePettyCash = PettyCash.deletePettyCash;
window.exportPettyCashToCSV = PettyCash.exportPettyCashToCSV;

// KDS
window.completeKitchenOrder = KDS.completeKitchenOrder;
window.toggleKDSItemPrepared = KDS.toggleKDSItemPrepared;

// Tables
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
window.renderTablesFloorGrid = Tables.renderTablesFloorGrid;
window.handleTableClick = Tables.handleTableClick;
window.editTableByNumber = Tables.editTableByNumber;
window.setFloorPlanMode = Tables.setFloorPlanMode;

// Inventory
window.openRawCategoryModal = Inventory.openRawCategoryModal;
window.closeRawCategoryModal = Inventory.closeRawCategoryModal;
window.deleteRawCategory = Inventory.deleteRawCategory;
window.openRawItemModal = Inventory.openRawItemModal;
window.closeRawItemModal = Inventory.closeRawItemModal;
window.deleteRawItem = Inventory.deleteRawItem;
window.switchInventorySubTab = Inventory.switchInventorySubTab;
window.openStoreIssueModal = Inventory.openStoreIssueModal;
window.closeStoreIssueModal = Inventory.closeStoreIssueModal;
window.addStoreIssueItemRow = Inventory.addStoreIssueItemRow;
window.filterStoreIssueRowSelect = Inventory.filterStoreIssueRowSelect;
window.handleStoreIssueSubmit = Inventory.handleStoreIssueSubmit;
window.renderStoreIssueHistoryTable = Inventory.renderStoreIssueHistoryTable;
window.viewStoreIssueDetail = Inventory.viewStoreIssueDetail;
window.closeStoreIssueDetailModal = Inventory.closeStoreIssueDetailModal;
window.exportStoreIssuesToCSV = Inventory.exportStoreIssuesToCSV;
window.openWastageModal = Inventory.openWastageModal;
window.closeWastageModal = Inventory.closeWastageModal;
window.addWastageItemRow = Inventory.addWastageItemRow;
window.handleWastageSubmit = Inventory.handleWastageSubmit;
window.onRawSearchInput = Inventory.onRawSearchInput;

// Menu
window.openCategoryModal = Menu.openCategoryModal;
window.closeCategoryModal = Menu.closeCategoryModal;
window.deleteDishCategory = Menu.deleteDishCategory;
window.openDishModal = Menu.openDishModal;
window.closeDishModal = Menu.closeDishModal;
window.addRecipeIngredientRow = Menu.addRecipeIngredientRow;
window.onRecipeIngredientChange = Menu.onRecipeIngredientChange;
window.calculateDishCostAndMargin = Menu.calculateDishCostAndMargin;
window.deleteDish = Menu.deleteDish;
window.onMenuSearchInput = Menu.onMenuSearchInput;

// Suppliers & GRN
window.switchGrnTab = Suppliers.switchGrnTab;
window.openSupplierModal = Suppliers.openSupplierModal;
window.closeSupplierModal = Suppliers.closeSupplierModal;
window.openSupplierLedgerModal = Suppliers.openSupplierLedgerModal;
window.closeSupplierLedgerModal = Suppliers.closeSupplierLedgerModal;
window.filterSupplierLedgerByDate = Suppliers.filterSupplierLedgerByDate;
window.resetSupplierLedgerDateFilter = Suppliers.resetSupplierLedgerDateFilter;
window.renderSupplierLedgerTable = Suppliers.renderSupplierLedgerTable;
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

// Customers CRM
window.openCustomerModal = Customers.openCustomerModal;
window.closeCustomerModal = Customers.closeCustomerModal;
window.handleCustomerSubmit = Customers.handleCustomerSubmit;
window.onCustomerSearchInput = Customers.onCustomerSearchInput;
window.renderCustomersTable = Customers.renderCustomersTable;
window.deleteCustomer = Customers.deleteCustomer;
window.openLoyaltyAdjustModal = Customers.openLoyaltyAdjustModal;
window.closeLoyaltyAdjustModal = Customers.closeLoyaltyAdjustModal;
window.submitLoyaltyAdjustment = Customers.submitLoyaltyAdjustment;
window.onPosCustomerSearch = Customers.onPosCustomerSearch;
window.selectCustomerForCurrentBill = Customers.selectCustomerForCurrentBill;
window.removeCustomerFromCurrentBill = Customers.removeCustomerFromCurrentBill;
window.exportCustomersToCSV = Customers.exportCustomersToCSV;

// Payroll & Attendance Kiosk
window.applyStaffRolePreset = Payroll.applyStaffRolePreset;
window.kioskKeypadPress = Payroll.kioskKeypadPress;
window.kioskKeypadClear = Payroll.kioskKeypadClear;
window.kioskKeypadBackspace = Payroll.kioskKeypadBackspace;
window.submitKioskAttendance = Payroll.submitKioskAttendance;
window.switchEmployeeSubTab = Payroll.switchEmployeeSubTab;
window.openEmployeeModal = Payroll.openEmployeeModal;
window.closeEmployeeModal = Payroll.closeEmployeeModal;
window.handleEmployeeSubmit = Payroll.handleEmployeeSubmit;
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
window.handleSalaryAdvanceSubmit = Payroll.handleSalaryAdvanceSubmit;
window.openSalaryAdjustmentModal = Payroll.openSalaryAdjustmentModal;
window.closeSalaryAdjustmentModal = Payroll.closeSalaryAdjustmentModal;
window.handleSalaryAdjustmentSubmit = Payroll.handleSalaryAdjustmentSubmit;
window.renderMonthlyPayrollSheet = Payroll.renderMonthlyPayrollSheet;
window.printEmployeePayslip = Payroll.printEmployeePayslip;
window.printActiveThermalPayslip = Payroll.printActiveThermalPayslip;
window.closePayslipModal = Payroll.closePayslipModal;
window.exportPayrollToCSV = Payroll.exportPayrollToCSV;

// Reports (CSV & PDF)
window.switchReportTab = Reports.switchReportTab;
window.setReportPeriodPreset = Reports.setReportPeriodPreset;
window.applyReportDateFilter = Reports.applyReportDateFilter;
window.changeInvoicesPage = Reports.changeInvoicesPage;
window.reprintInvoice = Reports.reprintInvoice;
window.shareWhatsAppInvoice = Reports.shareWhatsAppInvoice;
window.settleCustomerCredit = Reports.settleCustomerCredit;
window.exportCurrentReportToCSV = Reports.exportCurrentReportToCSV;
window.exportCurrentReportToPDF = Reports.exportCurrentReportToPDF;
window.renderPnLStatement = Reports.renderPnLStatement;
window.renderHourlyVelocityReport = Reports.renderHourlyVelocityReport;
window.renderWaiterSalesReport = Reports.renderWaiterSalesReport;
window.renderItemWiseSalesSummary = Reports.renderItemWiseSalesSummary;
window.renderCustomerCreditsLedger = Reports.renderCustomerCreditsLedger;
window.requestManagerVoidOverride = Reports.requestManagerVoidOverride;
window.closeManagerOverrideModal = Reports.closeManagerOverrideModal;
window.submitManagerOverrideAction = Reports.submitManagerOverrideAction;
window.openDayEndModal = Reports.openDayEndModal;
window.closeDayEndModal = Reports.closeDayEndModal;
window.calculateCashDenominations = Reports.calculateCashDenominations;
window.calculateDayEndVariance = Reports.calculateDayEndVariance;
window.printAndSaveZReport = Reports.printAndSaveZReport;
window.openShiftHandoverModal = Reports.openShiftHandoverModal;
window.closeShiftHandoverModal = Reports.closeShiftHandoverModal;
window.handleShiftHandoverSubmit = Reports.handleShiftHandoverSubmit;

// Day-End History (CSV & PDF)
window.setZHistoryPreset = Reports.setZHistoryPreset;
window.loadDayEndHistory = Reports.loadDayEndHistory;
window.renderDayEndHistoryTable = Reports.renderDayEndHistoryTable;
window.reprintPastZReport = Reports.reprintPastZReport;
window.exportDayEndHistoryToCSV = Reports.exportDayEndHistoryToCSV;
window.exportDayEndHistoryToPDF = Reports.exportDayEndHistoryToPDF;

// POS
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
