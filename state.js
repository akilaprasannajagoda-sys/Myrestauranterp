// ==========================================================================
// MODULE 01: GLOBAL ERP STATE & DATA STORE (MULTI-PRINTER ROUTING SUPPORTED)
// ==========================================================================

export let currentTenant = null;
export let currentTenantInfo = null;
export let currentUserRole = "owner"; // Available: owner, cashier, cook, waiter

export const erpState = {
  dishes: {},
  dishCategories: {},
  rawItems: {},
  rawCategories: {},
  tables: {},
  areas: {},
  suppliers: {},
  supplierPayments: {},
  grns: {},
  invoices: {},
  kitchenOrders: {},
  customerCredits: {},
  activeBills: {},
  pettyCash: {},
  employees: {},
  attendance: {},
  salaryAdvances: {},
  dayEndReports: {},
  settings: {
    scEnabled: false,
    scRate: 10,
    vatEnabled: false,
    vatRate: 18,
    cslEnabled: false,
    cslRate: 2.5,
    shiftHours: 8.0,
    printers: {
      p1: { name: "Main Cashier 1", bill: true, kot: false },
      p2: { name: "Hot Kitchen KOT", bill: false, kot: true },
      p3: { name: "Juice & Bar KOT", bill: false, kot: true },
      p4: { name: "Cashier 2 / Accounts", bill: true, kot: false }
    }
  }
};

export let activeBillId = "bill_default";
export let currentCategoryFilter = "ALL";
export let currentAreaFilter = "ALL";
export let lastReadyOrderCount = null;
export let activeSupplierLedgerId = null;

// Attendance Kiosk Camera State
export let kioskCameraStream = null;
export let todayLiveScans = [];

// Safe State Mutators
export function setCurrentTenant(val) { currentTenant = val; }
export function setCurrentTenantInfo(val) { currentTenantInfo = val; }
export function setCurrentUserRole(val) { currentUserRole = val; }
export function setActiveBillId(val) { activeBillId = val; }
export function setCurrentCategoryFilter(val) { currentCategoryFilter = val; }
export function setCurrentAreaFilter(val) { currentAreaFilter = val; }
export function setLastReadyOrderCount(val) { lastReadyOrderCount = val; }
export function setActiveSupplierLedgerId(val) { activeSupplierLedgerId = val; }
export function setKioskCameraStream(val) { kioskCameraStream = val; }