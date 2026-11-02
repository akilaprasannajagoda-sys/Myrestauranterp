// ==========================================================================
// MODULE 13: CUSTOMER DIRECTORY, CRM & LOYALTY POINTS ENGINE (UNFREEZE READY)
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast, downloadCSVFile, getLocalDateString } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let transactionFn = null;

// 🛡️ Double-Submission Lock (පාරිභෝගිකයා දෙපාරක් Save වීම 100% ක් වළක්වයි)
let isSubmittingCustomer = false;

export function initCustomersContext(dbRefInstance, pushMethod, updateMethod, removeMethod, runTransactionMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  transactionFn = runTransactionMethod;
}

// 1. OPEN / CLOSE CUSTOMER MODAL
export function openCustomerModal(mode = 'add', customerId = null) {
  const modal = document.getElementById("customerModal");
  const form = document.getElementById("customerForm");
  if (form) form.reset();

  const editIdInput = document.getElementById("editCustomerId");
  if (editIdInput) editIdInput.value = "";

  const titleEl = document.getElementById("customerModalTitle");

  if (mode === 'edit' && customerId && erpState.customers && erpState.customers[customerId]) {
    const cust = erpState.customers[customerId];
    if (titleEl) titleEl.innerText = "Edit Customer Details";
    if (editIdInput) editIdInput.value = customerId;

    const nameIn = document.getElementById("custNameInput");
    const phoneIn = document.getElementById("custPhoneInput");
    const emailIn = document.getElementById("custEmailInput");
    const addrIn = document.getElementById("custAddressInput");
    const noteIn = document.getElementById("custNotesInput");

    if (nameIn) nameIn.value = cust.name || "";
    if (phoneIn) phoneIn.value = cust.phone || "";
    if (emailIn) emailIn.value = cust.email || "";
    if (addrIn) addrIn.value = cust.address || "";
    if (noteIn) noteIn.value = cust.notes || "";
  } else {
    if (titleEl) titleEl.innerText = "Register New Customer";
  }

  modal?.classList.remove("hidden");
  setTimeout(() => document.getElementById("custNameInput")?.focus(), 50);
}

export function closeCustomerModal() {
  document.getElementById("customerModal")?.classList.add("hidden");
  isSubmittingCustomer = false;
}

// 2. SUBMIT / SAVE CUSTOMER RECORD (WITH AUTO-FOCUS & ZERO FREEZE)
export async function handleCustomerSubmit(e) {
  if (e) e.preventDefault();
  
  if (isSubmittingCustomer) return;
  isSubmittingCustomer = true;

  const editId = document.getElementById("editCustomerId")?.value;
  const nameIn = document.getElementById("custNameInput");
  const phoneIn = document.getElementById("custPhoneInput");
  const emailIn = document.getElementById("custEmailInput");
  const addrIn = document.getElementById("custAddressInput");
  const noteIn = document.getElementById("custNotesInput");

  const name = nameIn?.value.trim() || "";
  const phone = phoneIn?.value.trim() || "";
  const email = emailIn?.value.trim() || "";
  const address = addrIn?.value.trim() || "";
  const notes = noteIn?.value.trim() || "";

  if (!name || !phone) {
    showLiveToast("⚠️ අඩුපාඩුවක්", "කරුණාකර පාරිභෝගිකයාගේ නම සහ දුරකථන අංකය ඇතුළත් කරන්න.", "warning", "fa-user-tag");
    if (!name && nameIn) {
      nameIn.focus();
    } else if (!phone && phoneIn) {
      phoneIn.focus();
    }
    isSubmittingCustomer = false;
    return;
  }

  let cleanPhone = phone.replace(/\D/g, "");

  const customerData = {
    name,
    phone: cleanPhone,
    email,
    address,
    notes,
    updatedAt: new Date().toISOString()
  };

  try {
    if (dbRef && currentTenant) {
      if (editId && updateFn) {
        await updateFn(dbRef(`tenants/${currentTenant}/customers/${editId}`), customerData);
        if (erpState.customers && erpState.customers[editId]) {
          Object.assign(erpState.customers[editId], customerData);
        }
        showLiveToast("👤 Customer Updated", `${name} ගේ විස්තර සාර්ථකව යාවත්කාලීන විය.`, "success", "fa-user-check");
      } else if (pushFn) {
        const newRecord = {
          ...customerData,
          loyaltyPoints: 0,
          totalVisits: 0,
          totalSpend: 0,
          createdAt: new Date().toISOString()
        };
        const newRef = await pushFn(dbRef(`tenants/${currentTenant}/customers`), newRecord);
        if (!erpState.customers) erpState.customers = {};
        erpState.customers[newRef.key] = newRecord;

        const posCustInput = document.getElementById("posCustomerSearchInput");
        if (posCustInput) {
          selectCustomerForCurrentBill(newRef.key);
        }

        showLiveToast("👤 Customer Registered", `${name} සාර්ථකව ලියාපදිංචි කරන ලදී.`, "success", "fa-user-plus");
      }
    }
    closeCustomerModal();
    renderCustomersTable();
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "පාරිභෝගික විස්තර සේව් කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  } finally {
    isSubmittingCustomer = false;
  }
}

// 3. RENDER CUSTOMERS DIRECTORY TABLE WITH LIVE SEARCH
export function onCustomerSearchInput() {
  renderCustomersTable();
}

export function renderCustomersTable() {
  const tbody = document.getElementById("customersTableBody");
  const badge = document.getElementById("customerCountBadge");
  const searchInput = document.getElementById("customerDirectorySearchInput");
  const query = (searchInput?.value || "").toLowerCase().trim();
  if (!tbody) return;

  let list = Object.entries(erpState.customers || {});

  if (query) {
    list = list.filter(([id, c]) => {
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      return name.includes(query) || phone.includes(query);
    });
  }

  if (badge) badge.innerText = `${list.length} Customers`;

  if (list.length === 0) {
    if (query) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">"${query}" නමින් පාරිභෝගිකයින් හමු නොවීය...</td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">පාරිභෝගිකයින් තවම ලියාපදිංචි කර නැත... (+ Add Customer ඔබන්න)</td></tr>`;
    }
    return;
  }

  tbody.innerHTML = "";
  list.sort((a, b) => (parseFloat(b[1].loyaltyPoints || 0)) - (parseFloat(a[1].loyaltyPoints || 0)));

  list.forEach(([id, c]) => {
    const points = parseFloat(c.loyaltyPoints || 0);
    const visits = parseInt(c.totalVisits || 0);
    const spend = parseFloat(c.totalSpend || 0);

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5">
        <span class="font-extrabold text-gray-900 block">${c.name}</span>
        <span class="text-[10px] text-gray-400 font-semibold">${c.address || 'No Address'}</span>
      </td>
      <td class="p-3.5 font-mono font-bold text-blue-600">${c.phone || '-'}</td>
      <td class="p-3.5 text-center font-bold text-gray-700">${visits} Visits</td>
      <td class="p-3.5 font-bold text-gray-900">Rs. ${spend.toFixed(2)}</td>
      <td class="p-3.5">
        <span class="px-3 py-1 rounded-full text-xs font-black ${
          points > 100 ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-gray-100 text-gray-800'
        }">
          ⭐ ${points} Pts
        </span>
      </td>
      <td class="p-3.5 text-gray-500 text-[11px] truncate max-w-xs">${c.notes || '-'}</td>
      <td class="p-3.5 text-right space-x-1.5 whitespace-nowrap">
        <button onclick="openLoyaltyAdjustModal('${id}')" title="Adjust Points" class="bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border border-purple-200 px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer">
          <i class="fa-solid fa-star-half-stroke mr-0.5"></i> Points
        </button>
        <button onclick="openCustomerModal('edit', '${id}')" class="text-blue-600 hover:text-blue-800 p-1 cursor-pointer"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteCustomer('${id}')" class="text-red-500 hover:text-red-700 p-1 cursor-pointer"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. DELETE CUSTOMER RECORD
export async function deleteCustomer(id) {
  if (confirm("මෙම පාරිභෝගිකයා ඉවත් කිරීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/customers/${id}`));
      if (erpState.customers) delete erpState.customers[id];
      showLiveToast("🗑️ Customer Removed", "පාරිභෝගිකයා සාර්ථකව ඉවත් කරන ලදී.", "warning", "fa-trash");
      renderCustomersTable();
    }
  }
}

// 5. LOYALTY MANUAL ADJUSTMENT MODAL (AUTO-FOCUS SAFE)
let currentAdjustCustomerId = null;

export function openLoyaltyAdjustModal(customerId) {
  currentAdjustCustomerId = customerId;
  const cust = erpState.customers?.[customerId];
  if (!cust) return;

  const nameEl = document.getElementById("loyaltyAdjustCustName");
  const currentPtsEl = document.getElementById("loyaltyAdjustCurrentPts");
  const ptsIn = document.getElementById("loyaltyAdjustPtsInput");
  const reasonIn = document.getElementById("loyaltyAdjustReasonInput");

  if (nameEl) nameEl.innerText = `${cust.name} (${cust.phone})`;
  if (currentPtsEl) currentPtsEl.innerText = `${cust.loyaltyPoints || 0} Points`;
  if (ptsIn) ptsIn.value = "";
  if (reasonIn) reasonIn.value = "";

  document.getElementById("loyaltyAdjustModal")?.classList.remove("hidden");
  setTimeout(() => ptsIn?.focus(), 50);
}

export function closeLoyaltyAdjustModal() {
  document.getElementById("loyaltyAdjustModal")?.classList.add("hidden");
  currentAdjustCustomerId = null;
}

export async function submitLoyaltyAdjustment(e) {
  if (e) e.preventDefault();
  if (!currentAdjustCustomerId) return;

  const ptsIn = document.getElementById("loyaltyAdjustPtsInput");
  const reasonIn = document.getElementById("loyaltyAdjustReasonInput");
  const pointsDelta = parseFloat(ptsIn?.value || 0);
  const reason = reasonIn?.value.trim() || "Manual Adjustment";

  if (pointsDelta === 0 || isNaN(pointsDelta)) {
    showLiveToast("⚠️ Points අගය", "කරුණාකර වෙනස් කරන Points අගය ඇතුළත් කරන්න.", "warning", "fa-star");
    if (ptsIn) {
      ptsIn.focus();
      ptsIn.select();
    }
    return;
  }

  try {
    if (dbRef && currentTenant) {
      const cust = erpState.customers[currentAdjustCustomerId];
      const newPoints = Math.max(0, parseFloat(cust.loyaltyPoints || 0) + pointsDelta);

      if (updateFn) {
        await updateFn(dbRef(`tenants/${currentTenant}/customers/${currentAdjustCustomerId}`), {
          loyaltyPoints: newPoints,
          lastLoyaltyAdjustment: {
            delta: pointsDelta,
            reason: reason,
            date: new Date().toISOString()
          }
        });
      }

      if (erpState.customers[currentAdjustCustomerId]) {
        erpState.customers[currentAdjustCustomerId].loyaltyPoints = newPoints;
      }

      showLiveToast("⭐ Loyalty Updated", `Points අගය සාර්ථකව යාවත්කාලීන විය. (New Balance: ${newPoints})`, "success", "fa-star");
    }
    closeLoyaltyAdjustModal();
    renderCustomersTable();
  } catch (err) {
    showLiveToast("⚠️ දෝෂයකි", "Points යාවත්කාලීන කිරීමේදී දෝෂයක්: " + err.message, "warning", "fa-triangle-exclamation");
  }
}

// 6. POS CUSTOMER SELECTION & ATTACHMENT
export function onPosCustomerSearch(input) {
  const query = (input?.value || "").toLowerCase().trim();
  const dropdown = document.getElementById("posCustomerSearchResults");
  if (!dropdown) return;

  if (!query) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }

  const list = Object.entries(erpState.customers || {}).filter(([id, c]) => {
    const name = (c.name || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    return name.includes(query) || phone.includes(query);
  });

  if (list.length === 0) {
    dropdown.innerHTML = `
      <div class="p-2.5 text-center text-gray-400 text-xs font-bold">
        පාරිභෝගිකයා හමු නොවීය.
        <button type="button" onclick="openCustomerModal('add')" class="text-blue-600 underline block mx-auto mt-1 cursor-pointer">+ Register New Customer</button>
      </div>
    `;
    dropdown.classList.remove("hidden");
    return;
  }

  dropdown.innerHTML = list.slice(0, 6).map(([id, c]) => `
    <div onclick="selectCustomerForCurrentBill('${id}')" class="p-2 hover:bg-blue-50 border-b border-gray-100 cursor-pointer flex justify-between items-center transition select-none">
      <div>
        <span class="font-extrabold text-xs text-gray-900 block">${c.name}</span>
        <span class="text-[10px] text-gray-500 font-mono">${c.phone}</span>
      </div>
      <span class="text-[10px] font-black bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">⭐ ${c.loyaltyPoints || 0} Pts</span>
    </div>
  `).join("");
  dropdown.classList.remove("hidden");
}

export function selectCustomerForCurrentBill(customerId) {
  const cust = erpState.customers?.[customerId];
  const dropdown = document.getElementById("posCustomerSearchResults");
  if (dropdown) dropdown.classList.add("hidden");

  const searchInput = document.getElementById("posCustomerSearchInput");
  const badgeContainer = document.getElementById("posSelectedCustomerBadge");
  const nameLabel = document.getElementById("posSelectedCustomerName");
  const pointsBadge = document.getElementById("posSelectedCustomerPoints");
  const hiddenId = document.getElementById("posAttachedCustomerId");
  const redeemBox = document.getElementById("posLoyaltyRedeemBox");
  const redeemInput = document.getElementById("cartLoyaltyRedeemInput");

  if (!cust) return;

  if (searchInput) searchInput.value = "";
  if (hiddenId) hiddenId.value = customerId;
  if (nameLabel) nameLabel.innerText = `${cust.name} (${cust.phone})`;
  if (pointsBadge) pointsBadge.innerText = `⭐ ${cust.loyaltyPoints || 0} Points Available`;
  if (badgeContainer) badgeContainer.classList.remove("hidden");
  if (redeemBox) redeemBox.classList.remove("hidden");
  if (redeemInput) {
    redeemInput.value = "";
    redeemInput.max = cust.loyaltyPoints || 0;
  }

  const customerLinkData = {
    customerId: customerId,
    customerName: cust.name,
    customerPhone: cust.phone,
    loyaltyPointsAvailable: cust.loyaltyPoints || 0,
    loyaltyPointsRedeemed: 0
  };

  if (window.persistActiveBillToCloud) {
    window.persistActiveBillToCloud(customerLinkData);
  }

  if (window.recalculateCartTotalsUI) {
    window.recalculateCartTotalsUI();
  }

  showLiveToast("👤 Customer Linked", `${cust.name} (${cust.loyaltyPoints || 0} Pts) මෙම බිලට සම්බන්ධ කරන ලදී.`, "info", "fa-user-check");
}

export function removeCustomerFromCurrentBill() {
  const badgeContainer = document.getElementById("posSelectedCustomerBadge");
  const hiddenId = document.getElementById("posAttachedCustomerId");
  const redeemBox = document.getElementById("posLoyaltyRedeemBox");
  const redeemInput = document.getElementById("cartLoyaltyRedeemInput");

  if (badgeContainer) badgeContainer.classList.add("hidden");
  if (redeemBox) redeemBox.classList.add("hidden");
  if (hiddenId) hiddenId.value = "";
  if (redeemInput) redeemInput.value = "";

  if (window.persistActiveBillToCloud) {
    window.persistActiveBillToCloud({
      customerId: "",
      customerName: "",
      customerPhone: "",
      loyaltyPointsAvailable: 0,
      loyaltyPointsRedeemed: 0
    });
  }

  if (window.recalculateCartTotalsUI) {
    window.recalculateCartTotalsUI();
  }

  showLiveToast("👤 Customer Unlinked", "පාරිභෝගිකයා බිලෙන් ඉවත් කරන ලදී.", "info", "fa-user-minus");
}

// 7. EXPORT CUSTOMERS DIRECTORY TO CSV
export function exportCustomersToCSV() {
  const list = Object.values(erpState.customers || {});
  if (list.length === 0) {
    showLiveToast("ℹ️ Export Notice", "Export කිරීමට පාරිභෝගික දත්ත නොමැත.", "info", "fa-circle-info");
    return;
  }

  let csv = "Customer Name,Phone Number,Email,Address,Total Visits,Total Spent (Rs.),Loyalty Points,Notes\n";
  list.forEach(c => {
    csv += `"${c.name || ''}","${c.phone || ''}","${c.email || ''}","${c.address || ''}","${c.totalVisits || 0}","${parseFloat(c.totalSpend || 0).toFixed(2)}","${c.loyaltyPoints || 0}","${c.notes || ''}"\n`;
  });

  downloadCSVFile(csv, `Customer_Directory_${getLocalDateString()}.csv`);
}

// Global Window Exports
window.openCustomerModal = openCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.handleCustomerSubmit = handleCustomerSubmit;
window.onCustomerSearchInput = onCustomerSearchInput;
window.renderCustomersTable = renderCustomersTable;
window.deleteCustomer = deleteCustomer;
window.openLoyaltyAdjustModal = openLoyaltyAdjustModal;
window.closeLoyaltyAdjustModal = closeLoyaltyAdjustModal;
window.submitLoyaltyAdjustment = submitLoyaltyAdjustment;
window.onPosCustomerSearch = onPosCustomerSearch;
window.selectCustomerForCurrentBill = selectCustomerForCurrentBill;
window.removeCustomerFromCurrentBill = removeCustomerFromCurrentBill;
window.exportCustomersToCSV = exportCustomersToCSV;
