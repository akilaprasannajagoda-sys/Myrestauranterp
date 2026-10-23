// ==========================================================================
// MODULE 13: CUSTOMER DIRECTORY, CRM & LOYALTY POINTS ENGINE
// ==========================================================================

import { erpState, currentTenant } from './state.js';
import { showLiveToast, downloadCSVFile } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let transactionFn = null;

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
}

export function closeCustomerModal() {
  document.getElementById("customerModal")?.classList.add("hidden");
}

// 2. SUBMIT / SAVE CUSTOMER RECORD
export async function handleCustomerSubmit(e) {
  if (e) e.preventDefault();
  const editId = document.getElementById("editCustomerId")?.value;
  const name = document.getElementById("custNameInput")?.value.trim() || "";
  const phone = document.getElementById("custPhoneInput")?.value.trim() || "";
  const email = document.getElementById("custEmailInput")?.value.trim() || "";
  const address = document.getElementById("custAddressInput")?.value.trim() || "";
  const notes = document.getElementById("custNotesInput")?.value.trim() || "";

  if (!name || !phone) {
    alert("කරුණාකර පාරිභෝගිකයාගේ නම සහ දුරකථන අංකය ඇතුළත් කරන්න.");
    return;
  }

  // Clean phone number format
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
        showLiveToast("👤 Customer Updated", `${name} ගේ විස්තර සාර්ථකව යාවත්කාලීන විය.`, "success", "fa-user-check");
      } else if (pushFn) {
        // Initial metrics for new customer
        const newRecord = {
          ...customerData,
          loyaltyPoints: 0,
          totalVisits: 0,
          totalSpend: 0,
          createdAt: new Date().toISOString()
        };
        const newRef = await pushFn(dbRef(`tenants/${currentTenant}/customers`), newRecord);

        // Auto select in POS if called from billing
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
    alert("පාරිභෝගික විස්තර සේව් කිරීමේදී දෝෂයක්: " + err.message);
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
  // Sort by highest loyalty points or total visits
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
      showLiveToast("🗑️ Customer Removed", "පාරිභෝගිකයා සාර්ථකව ඉවත් කරන ලදී.", "warning", "fa-trash");
      renderCustomersTable();
    }
  }
}

// 5. LOYALTY MANUAL ADJUSTMENT MODAL
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
}

export function closeLoyaltyAdjustModal() {
  document.getElementById("loyaltyAdjustModal")?.classList.add("hidden");
  currentAdjustCustomerId = null;
}

export async function submitLoyaltyAdjustment(e) {
  if (e) e.preventDefault();
  if (!currentAdjustCustomerId) return;

  const pointsDelta = parseFloat(document.getElementById("loyaltyAdjustPtsInput")?.value || 0);
  const reason = document.getElementById("loyaltyAdjustReasonInput")?.value.trim() || "Manual Adjustment";

  if (pointsDelta === 0) {
    alert("කරුණාකර වෙනස් කරන Points අගය ඇතුළත් කරන්න.");
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

      showLiveToast("⭐ Loyalty Updated", `Points අගය සාර්ථකව යාවත්කාලීන විය. (New Balance: ${newPoints})`, "success", "fa-star");
    }
    closeLoyaltyAdjustModal();
    renderCustomersTable();
  } catch (err) {
    alert("Points යාවත්කාලීන කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 6. POS CUSTOMER SELECTION & REALTIME ATTACHMENT
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
      <div class="p-2 text-center text-gray-400 text-xs font-bold">
        පාරිභෝගිකයා හමු නොවීය.
        <button type="button" onclick="openCustomerModal('add')" class="text-blue-600 underline block mx-auto mt-1">+ Register New</button>
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

  if (!cust) return;

  if (searchInput) searchInput.value = "";
  if (hiddenId) hiddenId.value = customerId;
  if (nameLabel) nameLabel.innerText = `${cust.name} (${cust.phone})`;
  if (pointsBadge) pointsBadge.innerText = `⭐ ${cust.loyaltyPoints || 0} Points Available`;
  if (badgeContainer) badgeContainer.classList.remove("hidden");

  // Sync to active bill cloud state
  if (window.persistActiveBillToCloud) {
    window.persistActiveBillToCloud({
      customerId: customerId,
      customerName: cust.name,
      customerPhone: cust.phone,
      loyaltyPointsAvailable: cust.loyaltyPoints || 0
    });
  }

  showLiveToast("👤 Customer Linked", `${cust.name} මෙම බිලට සාර්ථකව සම්බන්ධ කරන ලදී.`, "info", "fa-user-check");
}

export function removeCustomerFromCurrentBill() {
  const badgeContainer = document.getElementById("posSelectedCustomerBadge");
  const hiddenId = document.getElementById("posAttachedCustomerId");
  if (badgeContainer) badgeContainer.classList.add("hidden");
  if (hiddenId) hiddenId.value = "";

  const redeemInput = document.getElementById("cartLoyaltyRedeemInput");
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
}

// 7. EXPORT CUSTOMERS DIRECTORY TO CSV
export function exportCustomersToCSV() {
  const list = Object.values(erpState.customers || {});
  if (list.length === 0) {
    alert("Export කිරීමට පාරිභෝගික දත්ත නොමැත.");
    return;
  }

  let csv = "Customer Name,Phone Number,Email,Address,Total Visits,Total Spent (Rs.),Loyalty Points,Notes\n";
  list.forEach(c => {
    csv += `"${c.name || ''}","${c.phone || ''}","${c.email || ''}","${c.address || ''}","${c.totalVisits || 0}","${parseFloat(c.totalSpend || 0).toFixed(2)}","${c.loyaltyPoints || 0}","${c.notes || ''}"\n`;
  });

  downloadCSVFile(csv, `Customer_Directory_${new Date().toISOString().split("T")[0]}.csv`);
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
