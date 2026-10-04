// ==========================================================================
// MODULE 09: STAFF, ATTENDANCE KIOSK (WAKE-LOCK & AUTO-RETRY), PAYROLL ENGINE
// ==========================================================================

import { erpState, currentTenant, kioskCameraStream, setKioskCameraStream, todayLiveScans } from './state.js';
import { showLiveToast, downloadCSVFile } from './utils.js';

let dbRef = null;
let pushFn = null;
let updateFn = null;
let removeFn = null;
let createAuthUserFn = null;
let wakeLockSentinel = null;

export function initPayrollContext(dbRefInstance, pushMethod, updateMethod, removeMethod, authUserMethod = null) {
  dbRef = dbRefInstance;
  pushFn = pushMethod;
  updateFn = updateMethod;
  removeFn = removeMethod;
  createAuthUserFn = authUserMethod;
}

// 1. SCREEN WAKE LOCK ENGINE (PREVENTS KIOSK SCREEN FROM SLEEPING)
export async function requestKioskWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch (err) {
    console.warn("Wake lock active pass:", err.message);
  }
}

export function releaseKioskWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// 2. SMART ATTENDANCE KIOSK (CAMERA AUTO-RETRY & PIN)
export async function startKioskCameraStream() {
  requestKioskWakeLock();
  const videoEl = document.getElementById("kioskCameraVideo");
  if (!videoEl) return;

  try {
    if (kioskCameraStream) {
      kioskCameraStream.getTracks().forEach(t => t.stop());
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    setKioskCameraStream(stream);
    videoEl.srcObject = stream;
    videoEl.play();
  } catch (err) {
    console.warn("Webcam not attached, running in PIN-only mode:", err.message);
  }
}

export function stopKioskCameraStream() {
  releaseKioskWakeLock();
  if (kioskCameraStream) {
    kioskCameraStream.getTracks().forEach(t => t.stop());
    setKioskCameraStream(null);
  }
}

export function kioskKeypadPress(num) {
  const input = document.getElementById("kioskPinInput");
  if (input && input.value.length < 6) {
    input.value += num;
  }
}

export function kioskKeypadClear() {
  const input = document.getElementById("kioskPinInput");
  if (input) input.value = "";
}

export function kioskKeypadBackspace() {
  const input = document.getElementById("kioskPinInput");
  if (input) input.value = input.value.slice(0, -1);
}

// 🔥 ULTRA-MICRO COMPRESSION SNAPSHOT ENGINE (2KB Size)
export function captureInstantCameraSnapshot() {
  const videoEl = document.getElementById("kioskCameraVideo");
  const canvasEl = document.getElementById("kioskSnapshotCanvas");
  if (!videoEl || !canvasEl || !videoEl.videoWidth) return "";

  try {
    canvasEl.width = 90;
    canvasEl.height = 68;
    const ctx = canvasEl.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, 90, 68);
    return canvasEl.toDataURL("image/jpeg", 0.35);
  } catch (e) {
    return "";
  }
}

export async function submitKioskAttendance(mode) {
  const pinInput = document.getElementById("kioskPinInput");
  const enteredPin = (pinInput?.value || "").trim();

  if (!enteredPin) {
    alert("කරුණාකර ඔබගේ PIN අංකය ඇතුළත් කරන්න.");
    return;
  }

  const matchedEmpEntry = Object.entries(erpState.employees || {}).find(([id, emp]) => {
    return String(emp.password || "").trim() === enteredPin;
  });

  if (!matchedEmpEntry) {
    alert("❌ වැරදි PIN අංකයකි. කරුණාකර නැවත උත්සාහ කරන්න.");
    if (pinInput) pinInput.value = "";
    return;
  }

  const [empKey, emp] = matchedEmpEntry;
  const snapshotDataUrl = captureInstantCameraSnapshot();
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const stdShift = parseFloat(erpState.settings.shiftHours || 8.0);

  const existingAttKey = Object.keys(erpState.attendance || {}).find(k => {
    const a = erpState.attendance[k];
    return a.employeeId === empKey && a.date === dateStr;
  });

  try {
    if (mode === "in") {
      if (existingAttKey) {
        alert(`⚠️ ${emp.name} අද දිනට දැනටමත් Check-In වී ඇත.`);
        if (pinInput) pinInput.value = "";
        return;
      }

      const newRecord = {
        employeeId: empKey,
        empId: emp.empId || "EMP",
        employeeName: emp.name,
        role: emp.role || "Staff",
        date: dateStr,
        inTime: timeStr,
        inTimestamp: now.toISOString(),
        outTime: "",
        outTimestamp: "",
        snapshot: snapshotDataUrl,
        totalWorkedHours: 0,
        otHours: 0,
        status: "Present",
        createdAt: now.toISOString()
      };

      if (dbRef && pushFn && currentTenant) {
        await pushFn(dbRef(`tenants/${currentTenant}/attendance`), newRecord);
      }
      showLiveToast("🟢 Check-In Successful", `${emp.name} (${emp.role}) පැමිණීම සටහන් විය.`, "success", "fa-circle-check");
    } else {
      if (!existingAttKey) {
        alert(`⚠️ ${emp.name} අද දින Check-In වී නොමැත.`);
        if (pinInput) pinInput.value = "";
        return;
      }

      const attRec = erpState.attendance[existingAttKey];
      const inMs = new Date(attRec.inTimestamp || attRec.createdAt).getTime();
      const outMs = now.getTime();
      const workedHours = Math.max(0, (outMs - inMs) / (1000 * 60 * 60));
      const otHours = Math.max(0, workedHours - stdShift);

      if (dbRef && updateFn && currentTenant) {
        await updateFn(dbRef(`tenants/${currentTenant}/attendance/${existingAttKey}`), {
          outTime: timeStr,
          outTimestamp: now.toISOString(),
          outSnapshot: snapshotDataUrl,
          totalWorkedHours: parseFloat(workedHours.toFixed(2)),
          otHours: parseFloat(otHours.toFixed(2)),
          status: "Completed"
        });
      }

      showLiveToast("🔴 Check-Out Successful", `${emp.name} පිටවීම සටහන් විය. (${workedHours.toFixed(1)} hrs)`, "success", "fa-door-open");
    }

    todayLiveScans.unshift({
      snapshot: snapshotDataUrl,
      time: timeStr,
      empId: emp.empId || 'EMP',
      name: emp.name,
      role: emp.role || 'Staff',
      type: mode === 'in' ? '🟢 Check-In' : '🔴 Check-Out'
    });

    renderTodayLiveScansTable();
    if (pinInput) pinInput.value = "";
  } catch (err) {
    alert("Attendance සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

export function renderTodayLiveScansTable() {
  const tbody = document.getElementById("todayLiveScansTableBody");
  const countBadge = document.getElementById("todayScanCountBadge");
  if (!tbody) return;

  if (countBadge) countBadge.innerText = `${todayLiveScans.length} Scans Today`;

  if (todayLiveScans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-gray-400">අද දින ස්කෑන් සටහන් නොමැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  todayLiveScans.slice(0, 15).forEach(s => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-2">
        ${s.snapshot ? `<img src="${s.snapshot}" class="w-8 h-8 rounded-lg object-cover border">` : `<div class="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-xs"><i class="fa-solid fa-user"></i></div>`}
      </td>
      <td class="p-2.5 font-mono text-gray-600">${s.time}</td>
      <td class="p-2.5 font-bold text-blue-600">${s.empId}</td>
      <td class="p-2.5 font-bold text-gray-800">${s.name}</td>
      <td class="p-2.5 text-gray-500">${s.role}</td>
      <td class="p-2.5 font-bold ${s.type.includes('Check-In') ? 'text-green-600' : 'text-red-600'}">${s.type}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. STAFF DIRECTORY & SUB-TABS
export function switchEmployeeSubTab(tabName) {
  ["directory", "attendance", "payroll"].forEach(t => {
    const sec = document.getElementById("empSection-" + t);
    const tabBtn = document.getElementById("empSubTab-" + t);
    if (sec) sec.classList.add("hidden");
    if (tabBtn) {
      tabBtn.className = "px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 font-bold";
    }
  });

  const activeSec = document.getElementById("empSection-" + tabName);
  const activeBtn = document.getElementById("empSubTab-" + tabName);
  if (activeSec) activeSec.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.className = "px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow-sm font-bold";
  }

  if (tabName === "attendance") {
    renderAttendanceLogsTable();
  } else if (tabName === "payroll") {
    const monthInput = document.getElementById("payrollMonthSelect");
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    renderMonthlyPayrollSheet();
  }
}

export function openEmployeeModal(mode, empId = null) {
  const modal = document.getElementById("employeeModal");
  const form = document.getElementById("employeeForm");
  if (form) form.reset();
  const editId = document.getElementById("editEmployeeId");
  if (editId) editId.value = "";

  if (mode === "edit" && empId && erpState.employees[empId]) {
    const e = erpState.employees[empId];
    const title = document.getElementById("employeeModalTitle");
    if (title) title.innerText = "Edit Employee";
    if (editId) editId.value = empId;
    
    const empIdIn = document.getElementById("empIdInput");
    const roleSel = document.getElementById("empRoleSelect");
    const nameIn = document.getElementById("empNameInput");
    const phoneIn = document.getElementById("empPhoneInput");
    const passIn = document.getElementById("empPasswordInput");
    const salIn = document.getElementById("empSalaryInput");
    const otIn = document.getElementById("empOtRateInput");
    const addrIn = document.getElementById("empAddressInput");

    if (empIdIn) empIdIn.value = e.empId || "";
    if (roleSel) roleSel.value = e.role || "Waiter";
    if (nameIn) nameIn.value = e.name || "";
    if (phoneIn) phoneIn.value = e.phone || "";
    if (passIn) passIn.value = e.password || "";
    if (salIn) salIn.value = e.salary || "";
    if (otIn) otIn.value = e.otRate || "";
    if (addrIn) addrIn.value = e.address || "";
  } else {
    const title = document.getElementById("employeeModalTitle");
    if (title) title.innerText = "Add New Employee";
    const nextEmpNo = Object.keys(erpState.employees || {}).length + 1;
    const empIdIn = document.getElementById("empIdInput");
    if (empIdIn) empIdIn.value = `EMP-${String(nextEmpNo).padStart(2, '0')}`;
  }

  modal?.classList.remove("hidden");
}

export function closeEmployeeModal() {
  document.getElementById("employeeModal")?.classList.add("hidden");
}

export async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById("editEmployeeId")?.value;
  const empData = {
    empId: document.getElementById("empIdInput")?.value.trim() || "",
    role: document.getElementById("empRoleSelect")?.value || "Waiter",
    name: document.getElementById("empNameInput")?.value.trim() || "",
    phone: document.getElementById("empPhoneInput")?.value.trim() || "",
    password: document.getElementById("empPasswordInput")?.value.trim() || "",
    salary: parseFloat(document.getElementById("empSalaryInput")?.value || 0),
    otRate: parseFloat(document.getElementById("empOtRateInput")?.value || 0),
    address: document.getElementById("empAddressInput")?.value.trim() || "",
    createdAt: new Date().toISOString()
  };

  try {
    if (dbRef && currentTenant) {
      if (editId && updateFn) {
        await updateFn(dbRef(`tenants/${currentTenant}/employees/${editId}`), empData);
      } else if (pushFn) {
        await pushFn(dbRef(`tenants/${currentTenant}/employees`), empData);
      }
    }
    closeEmployeeModal();
    showLiveToast("👤 Employee Saved", `${empData.name} (${empData.role}) සාර්ථකව සේව් විය.`, "success", "fa-user-check");
  } catch (err) {
    alert("සේවක විස්තර සේව් කිරීමේදී දෝෂයක්: " + err.message);
  }
}

// 4. STAFF SYSTEM USER LOGIN MANAGEMENT
export function openStaffLoginModal(empId) {
  const emp = erpState.employees[empId];
  if (!emp) return;

  const keyInput = document.getElementById("staffLoginEmpKey");
  const nameLabel = document.getElementById("staffLoginEmpName");
  const roleSelect = document.getElementById("staffLoginRoleSelect");
  const emailInput = document.getElementById("staffLoginEmail");
  const passInput = document.getElementById("staffLoginPassword");

  if (keyInput) keyInput.value = empId;
  if (nameLabel) nameLabel.innerText = `Employee: ${emp.name} (${emp.empId || 'EMP'})`;

  let defRole = "cashier";
  if (emp.role === "Cook") defRole = "cook";
  else if (emp.role === "Waiter") defRole = "waiter";
  else if (emp.role === "Manager") defRole = "owner";

  if (roleSelect) roleSelect.value = emp.systemRole || defRole;
  if (emailInput) emailInput.value = emp.loginEmail || "";
  if (passInput) passInput.value = "";

  document.getElementById("staffLoginModal")?.classList.remove("hidden");
}

export function closeStaffLoginModal() {
  document.getElementById("staffLoginModal")?.classList.add("hidden");
}

export async function handleStaffLoginSubmit(e) {
  e.preventDefault();
  const empId = document.getElementById("staffLoginEmpKey")?.value;
  const sysRole = document.getElementById("staffLoginRoleSelect")?.value || "cashier";
  const email = document.getElementById("staffLoginEmail")?.value.trim() || "";
  const password = document.getElementById("staffLoginPassword")?.value || "";

  if (!empId || !email || !password) return;

  const emp = erpState.employees[empId];

  try {
    if (createAuthUserFn) {
      await createAuthUserFn(email, password, sysRole, emp?.name || "Staff", currentTenant);
    }

    if (dbRef && updateFn && currentTenant) {
      await updateFn(dbRef(`tenants/${currentTenant}/employees/${empId}`), {
        loginEmail: email,
        systemRole: sysRole,
        hasSystemLogin: true
      });
    }

    closeStaffLoginModal();
    showLiveToast("🔑 Staff Login Created", `${emp ? emp.name : 'Staff'} සඳහා ${sysRole.toUpperCase()} Login එක සාර්ථකව සාදන ලදී.`, "success", "fa-user-lock");
  } catch (err) {
    alert("Login සෑදීමේදී දෝෂයක්: " + err.message);
  }
}

export function renderEmployeesTable() {
  const tbody = document.getElementById("employeesTableBody");
  if (!tbody) return;

  const list = Object.entries(erpState.employees || {});
  const waiters = list.filter(([id, e]) => e.role === "Waiter");
  const cooks = list.filter(([id, e]) => e.role === "Cook");
  const cashiers = list.filter(([id, e]) => e.role === "Cashier" || e.role === "Manager");

  const totEl = document.getElementById("empTotalCount");
  const wEl = document.getElementById("empWaitersCount");
  const kEl = document.getElementById("empKitchenCount");
  const cEl = document.getElementById("empCashiersCount");

  if (totEl) totEl.innerText = `${list.length} Employees`;
  if (wEl) wEl.innerText = `${waiters.length} Waiters`;
  if (kEl) kEl.innerText = `${cooks.length} Cooks`;
  if (cEl) cEl.innerText = `${cashiers.length} Staff`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-gray-400">සේවකයින් තවම ලියාපදිංචි කර නැත... (+ Add Employee ඔබන්න)</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(([id, emp]) => {
    const roleColors = {
      Waiter: "bg-blue-100 text-blue-800",
      Cook: "bg-yellow-100 text-yellow-800",
      Cashier: "bg-green-100 text-green-800",
      Manager: "bg-purple-100 text-purple-800"
    };

    const hasLogin = !!emp.hasSystemLogin;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold text-blue-600">${emp.empId || 'EMP'}</td>
      <td class="p-3.5">
        <span class="font-bold text-gray-800 block">${emp.name}</span>
        ${hasLogin ? `<span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Login: ${emp.systemRole || 'user'}</span>` : ''}
      </td>
      <td class="p-3.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${roleColors[emp.role] || 'bg-gray-100 text-gray-800'}">${emp.role}</span></td>
      <td class="p-3.5 text-gray-500">${emp.phone}</td>
      <td class="p-3.5 font-mono font-bold text-pink-600">PIN: ${emp.password || '----'}</td>
      <td class="p-3.5 font-bold text-emerald-600">Rs. ${parseFloat(emp.salary || 0).toFixed(2)}</td>
      <td class="p-3.5 font-bold text-blue-600">Rs. ${parseFloat(emp.otRate || 0).toFixed(2)}</td>
      <td class="p-3.5 text-right space-x-1.5 whitespace-nowrap">
        <button onclick="openStaffLoginModal('${id}')" title="Create / Manage System Login" class="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200 px-2 py-1 rounded-lg text-xs font-bold transition">
          <i class="fa-solid fa-key mr-0.5"></i> Login
        </button>
        <button onclick="openEmployeeModal('edit', '${id}')" class="text-blue-600 hover:text-blue-800 p-1"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteEmployee('${id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deleteEmployee(id) {
  if (confirm("මෙම සේවකයා ඉවත් කිරීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/employees/${id}`));
    }
  }
}

// 5. ATTENDANCE LOGS
export function setAttendancePeriodPreset(preset) {
  const fromEl = document.getElementById("attFilterFromDate");
  const toEl = document.getElementById("attFilterToDate");
  if (!fromEl || !toEl) return;
  const now = new Date();
  const formatDate = (d) => d.toISOString().split("T")[0];

  if (preset === "today") {
    fromEl.value = formatDate(now);
    toEl.value = formatDate(now);
  } else if (preset === "yesterday") {
    const y = new Date(now.setDate(now.getDate() - 1));
    fromEl.value = formatDate(y);
    toEl.value = formatDate(y);
  } else if (preset === "thisWeek") {
    const cur = new Date();
    const first = new Date(cur.setDate(cur.getDate() - cur.getDay()));
    fromEl.value = formatDate(first);
    toEl.value = formatDate(new Date());
  } else if (preset === "thisMonth") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fromEl.value = formatDate(first);
    toEl.value = formatDate(last);
  } else if (preset === "all") {
    fromEl.value = "";
    toEl.value = "";
  }

  renderAttendanceLogsTable();
}

export function populateAttendanceEmployeeFilter() {
  const sel = document.getElementById("attFilterEmpSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="ALL">All Employees</option>`;
  Object.entries(erpState.employees || {}).forEach(([id, emp]) => {
    sel.innerHTML += `<option value="${id}">${emp.name} (${emp.empId || 'EMP'})</option>`;
  });
}

export function renderAttendanceLogsTable() {
  const tbody = document.getElementById("attendanceLogsTableBody");
  if (!tbody) return;

  const fromVal = document.getElementById("attFilterFromDate")?.value;
  const toVal = document.getElementById("attFilterToDate")?.value;
  const empVal = document.getElementById("attFilterEmpSelect")?.value || "ALL";

  let list = Object.entries(erpState.attendance || {});

  if (fromVal) list = list.filter(([id, a]) => a.date >= fromVal);
  if (toVal) list = list.filter(([id, a]) => a.date <= toVal);
  if (empVal !== "ALL") list = list.filter(([id, a]) => a.employeeId === empVal);

  let totalWorkedHours = 0;
  let totalOtHours = 0;

  list.forEach(([id, a]) => {
    totalWorkedHours += parseFloat(a.totalWorkedHours || 0);
    totalOtHours += parseFloat(a.otHours || 0);
  });

  const regularHours = Math.max(0, totalWorkedHours - totalOtHours);

  const totShifts = document.getElementById("attStatTotalRecords");
  const regHrs = document.getElementById("attStatRegularHours");
  const otHrs = document.getElementById("attStatOtHours");

  if (totShifts) totShifts.innerText = `${list.length} Shifts`;
  if (regHrs) regHrs.innerText = `${regularHours.toFixed(1)} hrs`;
  if (otHrs) otHrs.innerText = `${totalOtHours.toFixed(1)} hrs`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-10 text-gray-400">පැමිණීමේ සටහන් නොමැත...</td></tr>`;
    return;
  }

  list.sort((a, b) => new Date(b[1].date + " " + (b[1].inTime || "00:00")).getTime() - new Date(a[1].date + " " + (a[1].inTime || "00:00")).getTime());

  tbody.innerHTML = "";
  list.forEach(([id, att]) => {
    const isCompleted = !!att.outTime;
    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-2">
        ${att.snapshot ? `<img src="${att.snapshot}" class="w-7 h-7 rounded-lg object-cover border">` : `<div class="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center text-[10px]"><i class="fa-solid fa-user"></i></div>`}
      </td>
      <td class="p-3.5 font-semibold text-gray-600">${att.date}</td>
      <td class="p-3.5 font-mono font-bold text-blue-600">${att.empId || 'EMP'}</td>
      <td class="p-3.5 font-bold text-gray-800">${att.employeeName}</td>
      <td class="p-3.5 font-mono text-green-700 font-bold">${att.inTime || '--:--'}</td>
      <td class="p-3.5 font-mono text-red-700 font-bold">${att.outTime || '--:--'}</td>
      <td class="p-3.5 font-bold text-gray-900">${att.totalWorkedHours ? att.totalWorkedHours + ' hrs' : 'In Progress'}</td>
      <td class="p-3.5 font-black text-yellow-600">${att.otHours ? '+' + att.otHours + ' hrs' : '-'}</td>
      <td class="p-3.5">
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
          ${isCompleted ? 'Completed' : 'On Shift (In)'}
        </span>
      </td>
      <td class="p-3.5 text-right">
        <button onclick="deleteAttendanceRecord('${id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function deleteAttendanceRecord(id) {
  if (confirm("මෙම Attendance සටහන මකා දැමීමට අවශ්‍යද?")) {
    if (dbRef && removeFn && currentTenant) {
      await removeFn(dbRef(`tenants/${currentTenant}/attendance/${id}`));
    }
  }
}

export function exportAttendanceToCSV() {
  const rows = document.querySelectorAll("#attendanceLogsTableBody tr");
  if (rows.length === 0) {
    alert("Export කිරීමට Attendance දත්ත නොමැත.");
    return;
  }

  let csv = "Date,Emp ID,Employee Name,In Time,Out Time,Total Worked Hours,OT Hours,Status\n";
  rows.forEach(r => {
    const cols = r.querySelectorAll("td");
    if (cols.length >= 9) {
      csv += `"${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}","${cols[4].innerText}","${cols[5].innerText}","${cols[6].innerText}","${cols[7].innerText}","${cols[8].innerText}"\n`;
    }
  });

  downloadCSVFile(csv, `Attendance_Logs_${new Date().toISOString().split("T")[0]}.csv`);
}

// 6. SALARY ADVANCES & MONTHLY PAYROLL
export function openSalaryAdvanceModal() {
  document.getElementById("salaryAdvanceForm")?.reset();
  const dIn = document.getElementById("advDate");
  if (dIn) dIn.value = new Date().toISOString().split("T")[0];
  populateSalaryAdvanceEmployeeDropdown();
  document.getElementById("salaryAdvanceModal")?.classList.remove("hidden");
}

export function closeSalaryAdvanceModal() {
  document.getElementById("salaryAdvanceModal")?.classList.add("hidden");
}

export function populateSalaryAdvanceEmployeeDropdown() {
  const sel = document.getElementById("advEmployeeSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- සේවකයා තෝරන්න (Select Employee) --</option>`;
  Object.entries(erpState.employees || {}).forEach(([id, emp]) => {
    sel.innerHTML += `<option value="${id}">${emp.name} (${emp.empId || 'EMP'} - ${emp.role})</option>`;
  });
}

export async function handleSalaryAdvanceSubmit(e) {
  e.preventDefault();
  const empId = document.getElementById("advEmployeeSelect")?.value;
  const date = document.getElementById("advDate")?.value;
  const amount = parseFloat(document.getElementById("advAmount")?.value || 0);
  const reason = document.getElementById("advReason")?.value.trim() || "";

  if (!empId || amount <= 0) return;

  const advRecord = {
    employeeId: empId,
    employeeName: erpState.employees[empId]?.name || "Employee",
    date: date,
    amount: amount,
    reason: reason,
    createdAt: new Date().toISOString()
  };

  try {
    if (dbRef && pushFn && currentTenant) {
      await pushFn(dbRef(`tenants/${currentTenant}/salaryAdvances`), advRecord);
    }
    closeSalaryAdvanceModal();
    showLiveToast("💸 Advance Recorded", `Rs. ${amount.toFixed(2)} ක වැටුප් අත්තිකාරම් මුදල සාර්ථකව සටහන් විය.`, "success", "fa-hand-holding-dollar");
  } catch (err) {
    alert("දෝෂයක්: " + err.message);
  }
}

export function renderMonthlyPayrollSheet() {
  const tbody = document.getElementById("payrollTableBody");
  if (!tbody) return;

  const monthInput = document.getElementById("payrollMonthSelect");
  if (!monthInput || !monthInput.value) return;

  const selectedMonth = monthInput.value;
  const allStaff = Object.entries(erpState.employees || {});

  let grandBasic = 0;
  let grandOT = 0;
  let grandAdvances = 0;
  let grandNet = 0;

  if (allStaff.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-10 text-gray-400">සේවකයින් තවම ලියාපදිංචි කර නැත...</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  allStaff.forEach(([empId, emp]) => {
    const basicSalary = parseFloat(emp.salary || 0);
    const otRate = parseFloat(emp.otRate || 0);

    let daysWorked = 0;
    let totalOtHours = 0;

    Object.values(erpState.attendance || {}).forEach(att => {
      if (att.employeeId === empId && att.date && att.date.startsWith(selectedMonth)) {
        daysWorked += 1;
        totalOtHours += parseFloat(att.otHours || 0);
      }
    });

    const otAmount = totalOtHours * otRate;

    let totalAdvances = 0;
    Object.values(erpState.salaryAdvances || {}).forEach(adv => {
      if (adv.employeeId === empId && adv.date && adv.date.startsWith(selectedMonth)) {
        totalAdvances += parseFloat(adv.amount || 0);
      }
    });

    const netSalary = Math.max(0, basicSalary + otAmount - totalAdvances);

    grandBasic += basicSalary;
    grandOT += otAmount;
    grandAdvances += totalAdvances;
    grandNet += netSalary;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-3.5 font-mono font-bold text-blue-600">${emp.empId || 'EMP'}</td>
      <td class="p-3.5 font-bold text-gray-800">${emp.name}</td>
      <td class="p-3.5 text-gray-500">${emp.role || 'Staff'}</td>
      <td class="p-3.5 font-bold text-center">${daysWorked} Days</td>
      <td class="p-3.5 font-bold text-gray-800">Rs. ${basicSalary.toFixed(2)}</td>
      <td class="p-3.5 font-bold text-yellow-600 text-center">${totalOtHours.toFixed(1)} hrs</td>
      <td class="p-3.5 font-bold text-green-600">Rs. ${otAmount.toFixed(2)}</td>
      <td class="p-3.5 font-bold text-red-600">Rs. ${totalAdvances.toFixed(2)}</td>
      <td class="p-3.5 font-black text-emerald-700 text-sm">Rs. ${netSalary.toFixed(2)}</td>
      <td class="p-3.5 text-right">
        <button onclick="printEmployeePayslip('${empId}', '${selectedMonth}', ${daysWorked}, ${basicSalary}, ${totalOtHours}, ${otRate}, ${otAmount}, ${totalAdvances}, ${netSalary})" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs">
          <i class="fa-solid fa-receipt mr-1"></i> Payslip
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const bEl = document.getElementById("payGrandBasic");
  const otEl = document.getElementById("payGrandOT");
  const advEl = document.getElementById("payGrandAdvances");
  const netEl = document.getElementById("payGrandNet");

  if (bEl) bEl.innerText = `Rs. ${grandBasic.toFixed(2)}`;
  if (otEl) otEl.innerText = `Rs. ${grandOT.toFixed(2)}`;
  if (advEl) advEl.innerText = `Rs. ${grandAdvances.toFixed(2)}`;
  if (netEl) netEl.innerText = `Rs. ${grandNet.toFixed(2)}`;
}

export function printEmployeePayslip(empId, monthStr, daysWorked, basic, otHours, otRate, otAmount, advances, netSalary) {
  const emp = erpState.employees[empId];
  if (!emp) return;

  const mLabel = document.getElementById("payslipMonthLabel");
  const nameLabel = document.getElementById("payslipEmpName");
  const roleLabel = document.getElementById("payslipEmpIdRole");

  if (mLabel) mLabel.innerText = `Month: ${monthStr} (Days Worked: ${daysWorked})`;
  if (nameLabel) nameLabel.innerText = emp.name;
  if (roleLabel) roleLabel.innerText = `${emp.empId || 'EMP'} (${emp.role || 'Staff'})`;

  const rBasic = document.getElementById("payslipRowBasic");
  const rOtH = document.getElementById("payslipRowOtHours");
  const rOtR = document.getElementById("payslipRowOtRate");
  const rOtPay = document.getElementById("payslipRowOtPay");
  const rGross = document.getElementById("payslipRowGross");
  const rAdv = document.getElementById("payslipRowAdvance");
  const rNet = document.getElementById("payslipRowNet");

  if (rBasic) rBasic.innerText = `Rs. ${basic.toFixed(2)}`;
  if (rOtH) rOtH.innerText = otHours.toFixed(1);
  if (rOtR) rOtR.innerText = otRate.toFixed(2);
  if (rOtPay) rOtPay.innerText = `+ Rs. ${otAmount.toFixed(2)}`;

  const gross = basic + otAmount;
  if (rGross) rGross.innerText = `Rs. ${gross.toFixed(2)}`;
  if (rAdv) rAdv.innerText = `- Rs. ${advances.toFixed(2)}`;
  if (rNet) rNet.innerText = `Rs. ${netSalary.toFixed(2)}`;

  document.getElementById("payslipModal")?.classList.remove("hidden");
}

export function closePayslipModal() {
  document.getElementById("payslipModal")?.classList.add("hidden");
}

export function exportPayrollToCSV() {
  const month = document.getElementById("payrollMonthSelect")?.value || new Date().toISOString().split("T")[0].substring(0, 7);
  const rows = document.querySelectorAll("#payrollTableBody tr");

  if (rows.length === 0) {
    alert("Export කිරීමට Payroll දත්ත නොමැත.");
    return;
  }

  let csv = "Emp ID,Employee Name,Role,Days Worked,Basic Salary,OT Hours,OT Amount,Advances Deducted,Net Salary\n";
  rows.forEach(r => {
    const cols = r.querySelectorAll("td");
    if (cols.length >= 9) {
      csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText}","${cols[3].innerText}","${cols[4].innerText}","${cols[5].innerText}","${cols[6].innerText}","${cols[7].innerText}","${cols[8].innerText}"\n`;
    }
  });

  downloadCSVFile(csv, `Monthly_Payroll_${month}.csv`);
}

// Window Global Exports
window.kioskKeypadPress = kioskKeypadPress;
window.kioskKeypadClear = kioskKeypadClear;
window.kioskKeypadBackspace = kioskKeypadBackspace;
window.submitKioskAttendance = submitKioskAttendance;
window.switchEmployeeSubTab = switchEmployeeSubTab;
window.openEmployeeModal = openEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.deleteEmployee = deleteEmployee;
window.openStaffLoginModal = openStaffLoginModal;
window.closeStaffLoginModal = closeStaffLoginModal;
window.handleStaffLoginSubmit = handleStaffLoginSubmit;
window.setAttendancePeriodPreset = setAttendancePeriodPreset;
window.renderAttendanceLogsTable = renderAttendanceLogsTable;
window.deleteAttendanceRecord = deleteAttendanceRecord;
window.exportAttendanceToCSV = exportAttendanceToCSV;
window.openSalaryAdvanceModal = openSalaryAdvanceModal;
window.closeSalaryAdvanceModal = closeSalaryAdvanceModal;
window.renderMonthlyPayrollSheet = renderMonthlyPayrollSheet;
window.printEmployeePayslip = printEmployeePayslip;
window.closePayslipModal = closePayslipModal;
window.exportPayrollToCSV = exportPayrollToCSV;