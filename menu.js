// ==========================================================================
// MODULE 06: MENU, DISHES, PORTIONS & BOM RECIPES ENGINE (COMPATIBLE UNITS SAFE)
// ==========================================================================

import { erpState, currentTenant } from './state.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let renderPosDishesCallback = null;

export function initMenuContext(dbRefInstance, pushMethod, updateMethod, removeMethod, renderPosDishesFn) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  renderPosDishesCallback = renderPosDishesFn;
}

// 🔒 GET COMPATIBLE UNIT FAMILY (නොගැලපෙන ඒකක වැළැක්වීම)
export function getCompatibleUnits(baseUnit) {
  const u = (baseUnit || "").toLowerCase().trim();
  if (u === "kg" || u === "g") return ["kg", "g"];
  if (u === "l" || u === "ml") return ["l", "ml"];
  return ["pcs"];
}

// 🔒 STRICT BOM RECIPE UNIT CONVERSION HELPER
export function convertRecipeQtyToBaseUnit(rawItemUnit, recipeQty, recipeUnit) {
  const rQty = parseFloat(recipeQty || 0);
  const rUnit = (recipeUnit || rawItemUnit || "").toLowerCase().trim();
  const baseUnit = (rawItemUnit || "").toLowerCase().trim();
  
  // Weight Family
  if (baseUnit === "kg" && rUnit === "g") return rQty / 1000;
  if (baseUnit === "g" && rUnit === "kg") return rQty * 1000;
  
  // Volume Family
  if (baseUnit === "l" && rUnit === "ml") return rQty / 1000;
  if (baseUnit === "ml" && rUnit === "l") return rQty * 1000;
  
  // Same unit or count family (pcs)
  if (baseUnit === rUnit) return rQty;
  
  return rQty;
}

// 2. DISH CATEGORIES
export function openCategoryModal() {
  document.getElementById("categoryModal")?.classList.remove("hidden");
}

export function closeCategoryModal() {
  document.getElementById("categoryModal")?.classList.add("hidden");
}

export async function handleAddCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById("newCategoryName")?.value.trim();
  if (!name || !dbRef || !pushFn || !currentTenant) return;
  await pushFn(dbRef(`tenants/${currentTenant}/dishCategories`), { name });
  const input = document.getElementById("newCategoryName");
  if (input) input.value = "";
}

export function renderDishCategoryListUI() {
  const container = document.getElementById("categoryListContainer");
  if (!container) return;
  container.innerHTML = "";
  Object.entries(erpState.dishCategories || {}).forEach(([id, cat]) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center p-2 rounded-xl bg-gray-50 border border-gray-200 text-xs";
    row.innerHTML = `
      <span class="font-bold text-gray-800">${cat.name}</span>
      <button onclick="deleteDishCategory('${id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(row);
  });
}

export async function deleteDishCategory(id) {
  if (confirm("මෙම Category එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/dishCategories/${id}`));
    }
  }
}

export function populateDishCategoryDropdown() {
  const sel = document.getElementById("dishCategory");
  if (!sel) return;
  sel.innerHTML = `<option value="">General</option>`;
  Object.entries(erpState.dishCategories || {}).forEach(([id, cat]) => {
    sel.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
  });
}

// 3. DISH & BOM RECIPE FORM
export function openDishModal(mode, dishId = null) {
  const modal = document.getElementById("dishModal");
  const form = document.getElementById("dishForm");
  if (form) form.reset();
  const editIdInput = document.getElementById("editDishId");
  if (editIdInput) editIdInput.value = "";
  const ingContainer = document.getElementById("recipeIngredientsContainer");
  if (ingContainer) ingContainer.innerHTML = "";
  
  populateDishCategoryDropdown();
  
  if (mode === "edit" && dishId && erpState.dishes[dishId]) {
    const d = erpState.dishes[dishId];
    const title = document.getElementById("dishModalTitle");
    if (title) title.innerText = "Edit Dish & Recipe";
    if (editIdInput) editIdInput.value = dishId;
    
    const nameIn = document.getElementById("dishName");
    const catSel = document.getElementById("dishCategory");
    const priceIn = document.getElementById("dishPrice");
    
    if (nameIn) nameIn.value = d.name;
    if (catSel) catSel.value = d.category || "";
    if (priceIn) priceIn.value = d.price;
    
    if (d.ingredients && Array.isArray(d.ingredients)) {
      d.ingredients.forEach(ing => addRecipeIngredientRow(ing.rawId, ing.qty, ing.unit));
    }
  } else {
    const title = document.getElementById("dishModalTitle");
    if (title) title.innerText = "Add Dish & Recipe";
  }
  
  calculateDishCostAndMargin();
  modal?.classList.remove("hidden");
}

export function closeDishModal() {
  document.getElementById("dishModal")?.classList.add("hidden");
}

export function addRecipeIngredientRow(selectedRawId = "", qty = 1, selectedUnit = "") {
  const container = document.getElementById("recipeIngredientsContainer");
  if (!container) return;
  
  const row = document.createElement("div");
  row.className = "flex items-center gap-2 ingredient-row text-xs";
  
  let options = `<option value="">-- අමුද්‍රව්‍ය තෝරන්න --</option>`;
  let baseUnitOfSelected = "kg";

  Object.entries(erpState.rawItems || {}).forEach(([id, raw]) => {
    const isSel = id === selectedRawId;
    if (isSel) baseUnitOfSelected = raw.unit || "kg";
    options += `<option value="${id}" data-baseunit="${raw.unit}" data-cost="${raw.cost}" ${isSel ? 'selected' : ''}>${raw.name} (${raw.unit} - Rs. ${raw.cost})</option>`;
  });

  // Generate only compatible unit options
  const compatibleUnits = getCompatibleUnits(baseUnitOfSelected);
  let unitOptions = "";
  compatibleUnits.forEach(u => {
    unitOptions += `<option value="${u}" ${selectedUnit === u ? 'selected' : ''}>${u}</option>`;
  });
  
  row.innerHTML = `
    <select class="flex-1 p-2 border rounded-xl text-xs bg-white ing-select outline-none font-bold" onchange="onRecipeIngredientChange(this)">
      ${options}
    </select>
    <input type="number" step="0.001" placeholder="Qty" value="${qty}" class="w-20 p-2 border rounded-xl text-xs bg-white ing-qty font-bold text-center outline-none" oninput="calculateDishCostAndMargin()">
    <select class="w-16 p-2 border rounded-xl text-xs bg-white ing-unit font-bold outline-none" onchange="calculateDishCostAndMargin()">
      ${unitOptions}
    </select>
    <button type="button" onclick="this.parentElement.remove(); calculateDishCostAndMargin();" class="text-red-500 hover:text-red-700 p-2"><i class="fa-solid fa-trash"></i></button>
  `;
  container.appendChild(row);
  calculateDishCostAndMargin();
}

export function onRecipeIngredientChange(sel) {
  const selectedOption = sel.options[sel.selectedIndex];
  const baseUnit = selectedOption.getAttribute("data-baseunit") || "pcs";
  const row = sel.closest(".ingredient-row");
  const unitSelect = row ? row.querySelector(".ing-unit") : null;
  
  if (unitSelect) {
    const compatibleUnits = getCompatibleUnits(baseUnit);
    unitSelect.innerHTML = "";
    compatibleUnits.forEach(u => {
      unitSelect.innerHTML += `<option value="${u}">${u}</option>`;
    });
    unitSelect.value = compatibleUnits[0];
  }
  calculateDishCostAndMargin();
}

export function calculateDishCostAndMargin() {
  let totalCost = 0;
  const rows = document.querySelectorAll(".ingredient-row");
  rows.forEach(r => {
    const sel = r.querySelector(".ing-select");
    const qtyInput = r.querySelector(".ing-qty");
    const unitSelect = r.querySelector(".ing-unit");
    
    const rawId = sel ? sel.value : null;
    const qty = parseFloat(qtyInput ? qtyInput.value : 0);
    const unit = unitSelect ? unitSelect.value : "";
    
    if (rawId && erpState.rawItems[rawId]) {
      const rawItem = erpState.rawItems[rawId];
      const convertedQty = convertRecipeQtyToBaseUnit(rawItem.unit, qty, unit);
      const unitCost = parseFloat(rawItem.cost || 0);
      totalCost += (unitCost * convertedQty);
    }
  });
  
  totalCost = Math.round(totalCost * 100) / 100;
  const price = parseFloat(document.getElementById("dishPrice")?.value || 0);
  const margin = price > 0 ? (((price - totalCost) / price) * 100).toFixed(1) : 0;
  
  const costEl = document.getElementById("summaryFoodCost");
  const marginEl = document.getElementById("summaryProfitMargin");
  if (costEl) costEl.innerText = `Rs. ${totalCost.toFixed(2)}`;
  if (marginEl) marginEl.innerText = `${margin}%`;
  
  return totalCost;
}

export async function handleDishSubmit(e) {
  e.preventDefault();
  const dishId = document.getElementById("editDishId")?.value;
  const ingredients = [];
  
  document.querySelectorAll(".ingredient-row").forEach(r => {
    const rawId = r.querySelector(".ing-select")?.value;
    const qty = parseFloat(r.querySelector(".ing-qty")?.value || 0);
    const unit = r.querySelector(".ing-unit")?.value;
    if (rawId && qty > 0) {
      ingredients.push({ rawId, qty, unit });
    }
  });
  
  const foodCost = calculateDishCostAndMargin();
  const dishData = {
    name: document.getElementById("dishName")?.value.trim() || "",
    category: document.getElementById("dishCategory")?.value || "",
    price: parseFloat(document.getElementById("dishPrice")?.value || 0),
    foodCost: foodCost,
    ingredients: ingredients
  };
  
  if (dbRef && currentTenant) {
    if (dishId && updateFn) {
      await updateFn(dbRef(`tenants/${currentTenant}/dishes/${dishId}`), dishData);
    } else if (pushFn) {
      await pushFn(dbRef(`tenants/${currentTenant}/dishes`), dishData);
    }
  }
  closeDishModal();
}

export function renderMenuDishesTable() {
  const tbody = document.getElementById("dishTableBody");
  const badge = document.getElementById("menuItemCountBadge");
  if (!tbody) return;
  
  const list = Object.entries(erpState.dishes || {});
  if (badge) badge.innerText = `${list.length} Dishes`;
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">කෑම වර්ග තවම ඇතුළත් කර නැත... (+ Add Dish & Recipe ඔබන්න)</td></tr>`;
    return;
  }
  
  tbody.innerHTML = "";
  list.forEach(([id, dish]) => {
    const cost = parseFloat(dish.foodCost || 0);
    const price = parseFloat(dish.price || 0);
    const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : 0;
    
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-bold text-gray-800">${dish.name}</td>
      <td class="p-3.5"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-[10px] font-bold">${dish.category || 'General'}</span></td>
      <td class="p-3.5 font-bold text-blue-600">Rs. ${price.toFixed(2)}</td>
      <td class="p-3.5 font-semibold text-gray-600">Rs. ${cost.toFixed(2)}</td>
      <td class="p-3.5"><span class="text-green-600 font-black">${margin}%</span></td>
      <td class="p-3.5"><span class="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Active</span></td>
      <td class="p-3.5 text-right space-x-2">
        <button onclick="openDishModal('edit', '${id}')" class="text-blue-600 hover:text-blue-800"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteDish('${id}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deleteDish(id) {
  if (confirm("මෙම Dish එක මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/dishes/${id}`));
    }
  }
}