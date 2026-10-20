// =========================================================================
// 1. KONFIGURASI API UTAMA (VERCEL TO GOOGLE SHEETS)
// =========================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbyW_q1ubEafN_6qDkAYvTThSTNUV8JQMiBwqmrznU2znUeuVkTKDgEaNuqULBEFwTCH/exec"; 

// =========================================================================
// 2. VARIABEL GLOBAL (STATE APLIKASI)
// =========================================================================
let masterMaterial = [], masterJasa = [], masterOps = [];
let currentProjectData = [], activeWorkspaceData = null;
let gudangStock = [], gudangLogs = [];
let rawMasterData = [], filteredMasterData = [];
let rawDashboardData = [], filteredDashboardData = [];

let currentMasterMenu = '';
let currentPageMaster = 1, currentPageProj = 1, currentPageStok = 1;
const ROWS_MASTER = 10, ROWS_PROJ = 10;

const masterConfig = {
    'Master_Material': { sheetName: 'Master_Material', title: 'Material', headers: ['Material ID', 'Nama Material', 'Satuan Standar', 'Harga Estimasi', 'Supplier'], keys: ['Material_ID', 'Nama_Item', 'Satuan_Standar', 'Harga_Estimasi', 'Supplier'] },
    'Master_Jasa': { sheetName: 'Master_Jasa', title: 'Jasa (Tukang)', headers: ['Jasa ID', 'Kategori', 'Nama Jasa', 'Satuan', 'Tarif Dasar', 'Tarif Dengan Alat'], keys: ['Jasa_ID', 'Kategori', 'Nama_Jasa', 'Satuan_Standar', 'Tarif_Tanpa_Alat', 'Tarif_Dengan_Alat'] },
    'Master_Operasional': { sheetName: 'Master_Operational', title: 'Operasional', headers: ['Ops ID', 'Kategori', 'Nama Operasional', 'Satuan', 'Estimasi Biaya', 'Keterangan / Area'], keys: ['Ops_ID', 'Kategori', 'Nama_Operasional', 'Satuan', 'Biaya_Estimasi', 'Keterangan_Area'] },
    'Master_Supplier': { sheetName: 'Master_Supplier', title: 'Supplier', headers: ['Supplier ID', 'Nama Supplier', 'Telepon', 'Alamat Lengkap'], keys: ['Supplier_ID', 'Nama_Supplier', 'Telepon', 'Alamat'] }
};

// =========================================================================
// 3. FUNGSI UI / TAMPILAN DASAR
// =========================================================================
function showLoading(text) { 
    const textEl = document.getElementById('loading-text'); if (textEl) textEl.innerText = text || "Memproses..."; 
    const overlay = document.getElementById('loading-overlay'); if (overlay) overlay.style.display = 'flex'; 
}
function hideLoading() { 
    const overlay = document.getElementById('loading-overlay'); if (overlay) overlay.style.display = 'none'; 
}
function closeModal(id) { 
    const modal = document.getElementById(id); if (modal) modal.style.display = 'none'; 
}
function logout() { location.reload(); }

// =========================================================================
// 4. MESIN KOMUNIKASI API (FETCH)
// =========================================================================
async function apiGet(action, params = "") {
    try {
        const response = await fetch(`${API_URL}?action=${action}${params}`);
        return await response.json();
    } catch (error) { console.error(`Error GET [${action}]:`, error); return { success: false, message: error.message }; }
}
async function apiPost(bodyData) {
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(bodyData) });
        return await response.json();
    } catch (error) { console.error(`Error POST [${bodyData.action}]:`, error); return { success: false, message: error.message }; }
}
async function apiSaveMaster(sheetName, rowData) { return await apiPost({ action: 'saveMasterData', sheetName: sheetName, rowData: rowData }); }
async function apiUpdateMaster(sheetName, rowIndex, rowData) { return await apiPost({ action: 'updateMasterData', sheetName: sheetName, rowIndex: rowIndex, rowData: rowData }); }
async function apiDeleteMaster(sheetName, rowIndex) { return await apiPost({ action: 'deleteMasterData', sheetName: sheetName, rowIndex: rowIndex }); }

// =========================================================================
// 5. OTENTIKASI & AWALAN APLIKASI
// =========================================================================
async function doLogin() {
    showLoading("Mencocokkan Kredensial...");
    const uname = document.getElementById('username').value; const pass = document.getElementById('password').value;
    if(!uname || !pass) { hideLoading(); alert("Username dan Password tidak boleh kosong!"); return; }

    const res = await apiPost({ action: 'login', username: uname, password: pass });
    if (res && res.success) {
        document.getElementById('user-name').innerText = res.data.nama || uname;
        document.getElementById('user-role').innerText = res.data.jabatan || "Administrator";
        document.getElementById('user-initial').innerText = (res.data.nama || uname).charAt(0).toUpperCase();

        document.getElementById('login-section').style.display = 'none';
        let appSec = document.getElementById('app-section');
        appSec.classList.remove('hidden'); appSec.style.display = 'flex';
        
        showLoading("Mengunduh Data Master...");
        const [resMat, resJas, resOps] = await Promise.all([
            apiGet('getSheetData', '&sheetName=Master_Material'),
            apiGet('getSheetData', '&sheetName=Master_Jasa'),
            apiGet('getSheetData', '&sheetName=Master_Operational')
        ]);
        if(resMat.success) masterMaterial = resMat.data; if(resJas.success) masterJasa = resJas.data; if(resOps.success) masterOps = resOps.data;
        
        showMenu('Dashboard'); 
    } else { hideLoading(); alert(res.message || "Username atau Password salah!"); }
}

function showMenu(menu) {
    document.querySelectorAll('.menu-item').forEach(a => a.classList.remove('bg-gray-700', 'border-l-4', 'border-indigo-500'));
    if (event && event.currentTarget) event.currentTarget.classList.add('bg-gray-700', 'border-l-4', 'border-indigo-500');
    document.getElementById('header-title').innerText = menu.replace('_', ' ');
    document.getElementById('main-content').innerHTML = ''; 
    
    if(menu === 'Dashboard') renderVisualDashboard();
    else if(menu.startsWith('Master_')) renderMenuMaster(menu);
    else if(menu === 'Project') loadProjectData();
    else if(menu === 'Stok') renderMenuStok();
    else if(menu === 'Timeline') renderMenuTimeline();
    else if(menu === 'RAP_Awal' || menu === 'RAP_Belanja' || menu === 'RAP_Final') renderMenuRAP(menu);
}

// =========================================================================
// 6. MODUL DASHBOARD
// =========================================================================
async function renderVisualDashboard() {
    showLoading("Menganalisis Data Dashboard...");
    const [dashRes, gudangRes] = await Promise.all([ apiGet('getDashboardData'), apiGet('getGudangData') ]);
    hideLoading();
    if(dashRes.success && gudangRes.success) membangunUI_Dashboard(dashRes.data, gudangRes.data);
    else alert("Gagal memuat data Dashboard!");
}

function membangunUI_Dashboard(dashData, gudangData) {
    let activeProj = 0, totalRev = 0, chartLabels = [], chartDataAwal = [], chartDataFinal = [];
    let statusCount = { 'Draft': 0, 'Perencanaan': 0, 'Sedang Berjalan': 0, 'Selesai': 0, 'Batal': 0 };

    dashData.forEach(p => {
        if(p.Status === "Sedang Berjalan") activeProj++;
        if(p.Status === "Selesai") totalRev += parseFloat(p.Total_Final || 0);
        if(statusCount[p.Status] !== undefined) statusCount[p.Status]++;
        if(chartLabels.length < 5 && (p.Status === 'Sedang Berjalan' || p.Status === 'Selesai')) {
            let nameLable = p.Nama_Project ? p.Nama_Project.substring(0, 15) : p.Project_ID;
            chartLabels.push(nameLable + (p.Nama_Project && p.Nama_Project.length > 15 ? '...' : ''));
            chartDataAwal.push(parseFloat(p.Total_Awal) || 0); chartDataFinal.push(parseFloat(p.Total_Final) || 0);
        }
    });

    let stokKosong = 0; gudangData.currentStock.forEach(s => { if(s.Total_Stok <= 0) stokKosong++; });

    let html = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500 flex items-center justify-between">
            <div><p class="text-sm text-gray-500 font-semibold mb-1">Project Aktif</p><p class="text-3xl font-bold text-gray-800">${activeProj}</p></div><div class="text-blue-200 text-4xl"><i class="fas fa-hammer"></i></div>
        </div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-green-500 flex items-center justify-between">
            <div><p class="text-sm text-gray-500 font-semibold mb-1">Omset (Selesai)</p><p class="text-xl font-bold text-gray-800">Rp ${(totalRev/1000000).toFixed(1)} Jt</p></div><div class="text-green-200 text-4xl"><i class="fas fa-wallet"></i></div>
        </div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-indigo-500 flex items-center justify-between">
            <div><p class="text-sm text-gray-500 font-semibold mb-1">Macam Barang</p><p class="text-3xl font-bold text-gray-800">${gudangData.currentStock.length - stokKosong}</p></div><div class="text-indigo-200 text-4xl"><i class="fas fa-boxes"></i></div>
        </div>
        <div class="bg-white rounded-lg shadow p-5 border-l-4 border-red-500 flex items-center justify-between">
            <div><p class="text-sm text-gray-500 font-semibold mb-1">Stok Habis</p><p class="text-3xl font-bold text-red-600">${stokKosong}</p></div><div class="text-red-200 text-4xl"><i class="fas fa-exclamation-triangle"></i></div>
        </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="md:col-span-2 bg-white rounded-lg shadow p-5"><h3 class="text-lg font-bold text-gray-700 mb-4 border-b pb-2">Kesehatan Anggaran Project</h3><div class="relative h-64 w-full"><canvas id="chart-anggaran"></canvas></div></div>
        <div class="bg-white rounded-lg shadow p-5"><h3 class="text-lg font-bold text-gray-700 mb-4 border-b pb-2">Distribusi Status</h3><div class="relative h-64 w-full"><canvas id="chart-status"></canvas></div></div>
    </div>
    <div class="bg-white rounded-lg shadow overflow-hidden"><div class="p-4 bg-gray-800 text-white font-bold"><i class="fas fa-history mr-2"></i> 5 Aktivitas Gudang Terakhir</div><div class="overflow-x-auto"><table class="min-w-full text-left text-sm border-collapse"><thead><tr class="bg-gray-100 text-gray-600"><th class="p-3">Tanggal</th><th class="p-3">Material</th><th class="p-3">Keterangan</th><th class="p-3 text-center">In</th><th class="p-3 text-center">Out</th></tr></thead><tbody>`;
    
    let recentLogs = gudangData.logs.slice(0, 5);
    if(recentLogs.length === 0) html += `<tr><td colspan="5" class="p-4 text-center italic text-gray-500">Belum ada transaksi.</td></tr>`;
    recentLogs.forEach(l => {
        html += `<tr class="border-b hover:bg-gray-50"><td class="p-3 text-gray-500">${(l.Tanggal||'').split('T')[0]}</td><td class="p-3 font-bold text-indigo-700">${l.Nama_Material}</td><td class="p-3 text-xs uppercase">${l.Kategori_Alokasi}</td><td class="p-3 text-center text-green-600 font-bold bg-green-50">${parseFloat(l.Qty_Masuk)>0 ? l.Qty_Masuk : '-'}</td><td class="p-3 text-center text-red-600 font-bold bg-red-50">${parseFloat(l.Qty_Keluar)>0 ? l.Qty_Keluar : '-'}</td></tr>`;
    });
    document.getElementById('main-content').innerHTML = html + `</tbody></table></div></div>`;
    renderCharts(chartLabels, chartDataAwal, chartDataFinal, Object.values(statusCount));
}

function renderCharts(labels, dataAwal, dataFinal, dataStatus) {
    new Chart(document.getElementById('chart-anggaran').getContext('2d'), { type: 'bar', data: { labels: labels.length > 0 ? labels : ['Belum ada project'], datasets: [ { label: 'Target RAP Awal', data: dataAwal, backgroundColor: 'rgba(99, 102, 241, 0.7)', borderColor: 'rgba(99, 102, 241, 1)', borderWidth: 1 }, { label: 'Realisasi RAP Final', data: dataFinal, backgroundColor: 'rgba(239, 68, 68, 0.7)', borderColor: 'rgba(239, 68, 68, 1)', borderWidth: 1 } ] }, options: { responsive: true, maintainAspectRatio: false } });
    new Chart(document.getElementById('chart-status').getContext('2d'), { type: 'doughnut', data: { labels: ['Draft', 'Perencanaan', 'Sedang Berjalan', 'Selesai', 'Batal'], datasets: [{ data: dataStatus.reduce((a, b) => a + b, 0) > 0 ? dataStatus : [0,0,0,0,1], backgroundColor: ['#9CA3AF', '#FCD34D', '#3B82F6', '#10B981', '#EF4444'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// =========================================================================
// 7. MODUL DATA MASTER
// =========================================================================
async function renderMenuMaster(menuName) {
    currentMasterMenu = menuName; let config = masterConfig[menuName];
    showLoading(`Memuat Master ${config.title}...`);
    const res = await apiGet('getSheetData', `&sheetName=${config.sheetName}`);
    hideLoading();
    if(res.success) { rawMasterData = res.data; filteredMasterData = res.data; currentPageMaster = 1; renderMasterPage(); }
    else alert("Gagal memuat Data Master!");
}

function renderMasterPage() {
    let config = masterConfig[currentMasterMenu];
    let html = `<div class="mb-4 flex justify-between items-center"><button onclick="openModalMaster(false)" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow"><i class="fas fa-plus mr-2"></i>Tambah ${config.title}</button><div class="relative"><i class="fas fa-search absolute left-3 top-2.5 text-gray-400"></i><input type="text" id="search-master" onkeyup="cariMasterList()" placeholder="Cari data..." class="pl-10 border border-gray-300 p-2 rounded-lg w-72 text-sm focus:outline-indigo-500" autocomplete="off"></div></div><div class="bg-white rounded-lg shadow overflow-hidden flex flex-col"><div class="overflow-x-auto"><table class="min-w-full text-left border-collapse"><thead><tr class="bg-gray-800 text-white text-sm">`;
    config.headers.forEach(h => html += `<th class="p-3">${h}</th>`);
    html += `<th class="p-3 text-center">Aksi</th></tr></thead><tbody id="tbody-master"></tbody></table></div><div id="pagination-master" class="p-3 bg-white border-t border-gray-200 flex justify-between items-center text-sm text-gray-600"></div></div>`;
    document.getElementById('main-content').innerHTML = html;
    renderTbodyMaster();
}

function renderTbodyMaster() {
    let tbody = document.getElementById('tbody-master'); let config = masterConfig[currentMasterMenu]; let html = '';
    const totalPages = Math.ceil(filteredMasterData.length / ROWS_MASTER) || 1;
    if(currentPageMaster > totalPages) currentPageMaster = totalPages;
    const slice = filteredMasterData.slice((currentPageMaster - 1) * ROWS_MASTER, currentPageMaster * ROWS_MASTER);
    
    if(slice.length === 0) html = `<tr><td colspan="${config.headers.length + 1}" class="p-6 text-center text-gray-500 italic">Data tidak ditemukan.</td></tr>`; 
    else {
        slice.forEach(row => {
            html += `<tr class="border-b hover:bg-indigo-50 text-sm">`;
            config.keys.forEach((key, index) => {
                let val = row[key] || '-'; let hName = config.headers[index].toLowerCase();
                if (hName.includes('harga') || hName.includes('tarif') || hName.includes('biaya')) {
                    val = `<span class="font-bold text-gray-700">Rp ${(parseInt(val.toString().replace(/[^0-9-]/g, ""))||0).toLocaleString('id-ID')}</span>`;
                }
                html += `<td class="p-3">${val}</td>`;
            });
            html += `<td class="p-3 text-center whitespace-nowrap"><button onclick="openModalMaster(true, ${row.rowIndex})" class="bg-yellow-500 text-white px-2 py-1.5 rounded text-xs mx-0.5"><i class="fas fa-edit"></i></button><button onclick="hapusMaster(${row.rowIndex})" class="bg-red-500 text-white px-2 py-1.5 rounded text-xs mx-0.5"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
    tbody.innerHTML = html;
    let pag = document.getElementById('pagination-master');
    if(pag) pag.innerHTML = totalPages <= 1 ? `<div class="text-gray-500 w-full text-center">Semua data ditampilkan</div>` : `<div>Halaman <span class="font-bold">${currentPageMaster}</span> dari ${totalPages}</div><div class="flex gap-2"><button onclick="changePageMaster(-1)" class="px-3 py-1 border rounded bg-white hover:bg-gray-100" ${currentPageMaster===1?'disabled':''}>Prev</button><button onclick="changePageMaster(1)" class="px-3 py-1 border rounded bg-white hover:bg-gray-100" ${currentPageMaster===totalPages?'disabled':''}>Next</button></div>`;
}

function changePageMaster(dir) { currentPageMaster += dir; renderTbodyMaster(); }
function cariMasterList() {
    const kw = document.getElementById('search-master').value.toLowerCase(); let config = masterConfig[currentMasterMenu];
    filteredMasterData = rawMasterData.filter(row => config.keys.map(k => (row[k] || '')).join(' ').toLowerCase().includes(kw));
    currentPageMaster = 1; renderTbodyMaster();
}

function openModalMaster(isEdit, rowIndex = null) {
    let config = masterConfig[currentMasterMenu];
    document.getElementById('modal-master-title').innerText = isEdit ? `Edit ${config.title}` : `Tambah ${config.title}`;
    document.getElementById('m-rowIndex').value = isEdit ? rowIndex : "";
    let body = document.getElementById('modal-master-body'); body.innerHTML = ''; 
    let rowData = isEdit ? (rawMasterData.find(r => r.rowIndex === rowIndex) || {}) : {};

    config.headers.forEach((header, index) => {
        let val = isEdit ? (rowData[config.keys[index]] || '') : '';
        let type = (header.toLowerCase().includes('harga') || header.toLowerCase().includes('tarif') || header.toLowerCase().includes('biaya')) ? 'number' : 'text';
        if(type === 'number' && val !== '') val = val.toString().replace(/[^0-9-]/g, "");
        body.innerHTML += `<div><label class="block text-sm font-semibold text-gray-600 mb-1">${header}</label><input type="${type}" id="m-input-${index}" value="${val}" class="w-full border p-2 rounded focus:outline-blue-500"></div>`;
    });
    document.getElementById('modal-master').style.display = 'flex';
}

async function saveMaster() {
    let config = masterConfig[currentMasterMenu]; let rData = [];
    for(let i = 0; i < config.headers.length; i++) rData.push(document.getElementById(`m-input-${i}`).value);
    if(!rData[0] || !rData[1]) return alert(`Pastikan ${config.headers[0]} dan ${config.headers[1]} terisi!`);
    
    closeModal('modal-master'); showLoading("Menyimpan...");
    const idx = document.getElementById('m-rowIndex').value;
    const res = idx ? await apiUpdateMaster(config.sheetName, idx, rData) : await apiSaveMaster(config.sheetName, rData);
    if(res.success) renderMenuMaster(currentMasterMenu); else { hideLoading(); alert(res.message); }
}

async function hapusMaster(rowIndex) {
    if(confirm("Yakin hapus permanen?")) {
        showLoading("Menghapus...");
        const res = await apiDeleteMaster(masterConfig[currentMasterMenu].sheetName, rowIndex);
        if(res.success) renderMenuMaster(currentMasterMenu); else { hideLoading(); alert(res.message); }
    }
}

// =========================================================================
// 8. MODUL PROJECT
// =========================================================================
async function loadProjectData() {
    showLoading("Memuat Data Project...");
    const [dashRes, projRes] = await Promise.all([ apiGet('getDashboardData'), apiGet('getSheetData', '&sheetName=Data_Project') ]);
    hideLoading();
    if(dashRes.success && projRes.success) {
        currentProjectData = projRes.data;
        rawDashboardData = dashRes.data.map(r => {
            let fd = projRes.data.find(x => x.Project_ID === r.Project_ID);
            if(fd) { r.Nama_PIC_Klien = fd.Nama_PIC_Klien; r.rowIndex = fd.rowIndex; } return r;
        });
        filteredDashboardData = rawDashboardData; currentPageProj = 1; renderProjectPage(); 
    } else alert("Gagal memuat Project!");
}

function renderProjectPage() {
    document.getElementById('main-content').innerHTML = `<div class="mb-4 flex justify-between items-center"><button onclick="openModalProject(false)" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow"><i class="fas fa-plus mr-2"></i>Tambah Project</button><div class="relative"><i class="fas fa-search absolute left-3 top-2.5 text-gray-400"></i><input type="text" id="search-project" onkeyup="cariProjectList()" placeholder="Cari Project..." class="pl-10 border border-gray-300 p-2 rounded-lg w-72 text-sm focus:outline-indigo-500"></div></div><div class="bg-white rounded-lg shadow overflow-hidden flex flex-col"><div class="overflow-x-auto"><table class="min-w-full text-left border-collapse"><thead><tr class="bg-gray-800 text-white text-sm"><th class="p-3">Project ID</th><th class="p-3 w-1/3">Klien & Detail</th><th class="p-3 text-right">RAP Awal</th><th class="p-3 text-right border-l border-gray-700">Final</th><th class="p-3 text-center">Status</th><th class="p-3 text-center">Aksi</th></tr></thead><tbody id="tbody-project"></tbody></table></div><div id="pagination-project" class="p-3 bg-white border-t border-gray-200 flex justify-between items-center text-sm"></div></div>`;
    renderTbodyProject();
}

function renderTbodyProject() {
    let tbody = document.getElementById('tbody-project'); let html = '';
    const tot = Math.ceil(filteredDashboardData.length / ROWS_PROJ) || 1; if(currentPageProj > tot) currentPageProj = tot;
    const slice = filteredDashboardData.slice((currentPageProj - 1) * ROWS_PROJ, currentPageProj * ROWS_PROJ);
    
    if(slice.length === 0) html = `<tr><td colspan="6" class="p-6 text-center text-gray-500 italic">Project tidak ditemukan.</td></tr>`; 
    else {
        slice.forEach(r => {
            let sc = r.Status === "Sedang Berjalan" ? "bg-blue-100 text-blue-700" : (r.Status === "Selesai" ? "bg-green-100 text-green-700" : (r.Status === "Batal" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"));
            html += `<tr class="border-b hover:bg-indigo-50 text-sm"><td class="p-3 font-semibold text-gray-600">${r.Project_ID}</td><td class="p-3"><div class="font-bold text-indigo-700 text-base mb-0.5"><i class="fas fa-user-tag text-gray-400 mr-1 text-xs"></i> ${r.Nama_PIC_Klien || '-'}</div><div class="text-xs text-gray-500">Proyek: ${r.Nama_Project} | Brand: ${r.Brand || '-'}</div></td><td class="p-3 text-right font-medium text-gray-700">Rp ${Number(r.Total_Awal || 0).toLocaleString('id-ID')}</td><td class="p-3 text-right font-bold text-indigo-700 border-l border-gray-200 bg-indigo-50/30">Rp ${Number(r.Total_Final || 0).toLocaleString('id-ID')}</td><td class="p-3 text-center"><span class="${sc} px-2 py-1 rounded text-xs font-bold shadow-sm">${r.Status}</span></td><td class="p-3 text-center"><button onclick="openModalProject(true, '${r.Project_ID}')" class="bg-yellow-500 text-white px-2 py-1.5 rounded text-xs mx-0.5"><i class="fas fa-edit"></i></button><button onclick="hapusProject(${r.rowIndex})" class="bg-red-500 text-white px-2 py-1.5 rounded text-xs mx-0.5"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
    tbody.innerHTML = html;
    let pag = document.getElementById('pagination-project');
    if(pag) pag.innerHTML = tot <= 1 ? `<div class="text-gray-500 w-full text-center">Semua data ditampilkan</div>` : `<div>Halaman <span class="font-bold">${currentPageProj}</span> dari ${tot}</div><div class="flex gap-2"><button onclick="changePageProj(-1)" class="px-3 py-1 border rounded bg-white hover:bg-gray-100" ${currentPageProj===1?'disabled':''}>Prev</button><button onclick="changePageProj(1)" class="px-3 py-1 border rounded bg-white hover:bg-gray-100" ${currentPageProj===tot?'disabled':''}>Next</button></div>`;
}

function changePageProj(dir) { currentPageProj += dir; renderTbodyProject(); }
function cariProjectList() {
    const kw = document.getElementById('search-project').value.toLowerCase();
    filteredDashboardData = rawDashboardData.filter(p => (p.Nama_Project||'').toLowerCase().includes(kw) || (p.Brand||'').toLowerCase().includes(kw) || (p.Nama_PIC_Klien||'').toLowerCase().includes(kw) || (p.Project_ID||'').toLowerCase().includes(kw));
    currentPageProj = 1; renderTbodyProject();
}

async function hapusProject(rowIndex) {
    if(confirm("Hapus Project ini? Data akan hilang.")) {
        showLoading("Menghapus Project...");
        const res = await apiDeleteMaster('Data_Project', rowIndex);
        if(res.success) loadProjectData(); else { hideLoading(); alert(res.message); }
    }
}

function openModalProject(isEdit, pId) {
    if(isEdit) {
        let d = currentProjectData.find(x => x.Project_ID === pId);
        document.getElementById('p-rowIndex').value = d.rowIndex; document.getElementById('p-id').value = d.Project_ID; 
        document.getElementById('p-brand').value = d.Brand; document.getElementById('p-pic').value = d.Nama_PIC_Klien; 
        document.getElementById('p-kontak').value = d.Kontak_Klien; document.getElementById('p-nama').value = d.Nama_Project; 
        document.getElementById('p-alamat').value = d.Alamat_Project; document.getElementById('p-status').value = d.Status || "Draft";
        try { document.getElementById('p-mulai').value = (d.Tanggal_Mulai||'').split('T')[0]; document.getElementById('p-selesai').value = (d.Tanggal_Target||'').split('T')[0]; } catch(e){}
    } else {
        ['p-rowIndex','p-id','p-brand','p-pic','p-kontak','p-nama','p-alamat','p-mulai','p-selesai'].forEach(id => document.getElementById(id).value = "");
        document.getElementById('p-status').value = "Draft";
    }
    document.getElementById('modal-Project').style.display = 'flex';
}

async function saveProject() {
    const r = [ document.getElementById('p-id').value, document.getElementById('p-brand').value, document.getElementById('p-pic').value, document.getElementById('p-kontak').value, document.getElementById('p-nama').value, document.getElementById('p-alamat').value, document.getElementById('p-mulai').value, document.getElementById('p-selesai').value, document.getElementById('p-status').value ];
    if(!r[0] || !r[4]) return alert("Project ID dan Nama wajib diisi!");
    closeModal('modal-Project'); showLoading("Menyimpan...");
    const idx = document.getElementById('p-rowIndex').value;
    const res = idx ? await apiUpdateMaster('Data_Project', idx, r) : await apiSaveMaster('Data_Project', r);
    if(res.success) loadProjectData(); else { hideLoading(); alert(res.message); }
}

// =========================================================================
// 9. MODUL STOK & INVENTORY
// =========================================================================
async function renderMenuStok() {
    showLoading("Memuat Gudang...");
    const [pDataRes, gDataRes] = await Promise.all([ apiGet('getSheetData', '&sheetName=Data_Project'), apiGet('getGudangData') ]);
    hideLoading();
    if(pDataRes.success && gDataRes.success) {
        currentProjectData = pDataRes.data; gudangStock = gDataRes.data.currentStock; gudangLogs = gDataRes.data.logs; currentPageStok = 1;
        document.getElementById('main-content').innerHTML = `<div class="mb-4"><button onclick="bukaModalStok()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow"><i class="fas fa-plus-circle mr-2"></i> Input Transaksi Stok</button></div><div class="bg-white rounded-lg shadow mb-6 flex flex-col"><div class="flex border-b"><button onclick="switchTabStok('stok')" id="t-stok" class="w-1/2 py-3 tab-active transition">Stok Aktual</button><button onclick="switchTabStok('log')" id="t-log" class="w-1/2 py-3 tab-inactive transition hover:bg-gray-50">Riwayat Transaksi</button></div><div id="area-stok" class="p-4"></div><div id="area-log" class="p-4 hidden"></div></div>`;
        renderTabelStokAktual(); renderTabelStokLog();
    } else alert("Gagal memuat Data Gudang!");
}

function renderTabelStokAktual() {
    const tot = Math.ceil(gudangStock.length / 10) || 1; const slice = gudangStock.slice((currentPageStok - 1) * 10, currentPageStok * 10);
    let h = `<div class="overflow-x-auto"><table class="min-w-full text-left text-sm mb-4"><thead><tr class="bg-gray-800 text-white"><th class="p-3">Nama Material</th><th class="p-3 text-center">Total Stok Fisik</th></tr></thead><tbody>`;
    if (slice.length === 0) h += `<tr><td colspan="2" class="p-4 text-center italic text-gray-500">Gudang kosong.</td></tr>`;
    slice.forEach(s => { h += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-semibold text-gray-700">${s.Nama_Item} <span class="text-xs text-gray-400">(${s.Satuan || '-'})</span></td><td class="p-3 text-center text-lg font-bold ${s.Total_Stok<=0?'text-red-500 bg-red-50':'text-green-600 bg-green-50'}">${s.Total_Stok}</td></tr>`; });
    document.getElementById('area-stok').innerHTML = h + `</tbody></table></div><div class="flex justify-between items-center text-sm text-gray-600 mt-2"><span>Hal ${currentPageStok} dari ${tot}</span><div class="flex gap-2"><button onclick="if(currentPageStok>1){currentPageStok--;renderTabelStokAktual();}" class="px-3 py-1 border rounded bg-white hover:bg-gray-100">Prev</button><button onclick="if(currentPageStok<${tot}){currentPageStok++;renderTabelStokAktual();}" class="px-3 py-1 border rounded bg-white hover:bg-gray-100">Next</button></div></div>`;
}

function renderTabelStokLog() {
    let h = `<div class="max-h-96 overflow-y-auto"><table class="min-w-full text-left text-sm"><thead><tr class="bg-gray-800 text-white"><th class="p-2">Tgl</th><th class="p-2">Keterangan</th><th class="p-2">Material</th><th class="p-2 text-right">Harga</th><th class="p-2 text-center">In</th><th class="p-2 text-center">Out</th></tr></thead><tbody>`;
    gudangLogs.forEach(l => {
        let col = parseFloat(l.Qty_Masuk) > 0 ? "text-green-600" : "text-red-600";
        h += `<tr class="border-b hover:bg-gray-50"><td class="p-2 text-gray-500">${(l.Tanggal||'').split('T')[0]}</td><td class="p-2 font-semibold ${col} text-xs uppercase">${l.Kategori_Alokasi} <div class="text-gray-500 font-normal">Ref: ${l.Project_ID !== "" ? l.Project_ID : (l.Referensi||'-')}</div></td><td class="p-2 font-medium">${l.Nama_Material || l.Nama_Item}</td><td class="p-2 text-right text-gray-600">Rp ${(parseFloat(l.Harga_Satuan)||0).toLocaleString('id-ID')}</td><td class="p-2 text-center text-green-600 font-bold bg-green-50">${parseFloat(l.Qty_Masuk)>0?l.Qty_Masuk:'-'}</td><td class="p-2 text-center text-red-600 font-bold bg-red-50">${parseFloat(l.Qty_Keluar)>0?l.Qty_Keluar:'-'}</td></tr>`;
    });
    document.getElementById('area-log').innerHTML = h + `</tbody></table></div>`;
}

function switchTabStok(t) {
    document.getElementById('t-stok').className = t==='stok' ? "w-1/2 py-3 text-center tab-active transition" : "w-1/2 py-3 text-center tab-inactive transition hover:bg-gray-50";
    document.getElementById('t-log').className = t==='log' ? "w-1/2 py-3 text-center tab-active transition" : "w-1/2 py-3 text-center tab-inactive transition hover:bg-gray-50";
    document.getElementById('area-stok').style.display = t==='stok' ? 'block' : 'none'; document.getElementById('area-log').style.display = t==='log' ? 'block' : 'none';
}

function bukaModalStok() { document.getElementById('s-tanggal').value = new Date().toISOString().split('T')[0]; document.getElementById('s-jenis').value = "Masuk"; onChangeJenisStok(); document.getElementById('modal-stok').style.display = 'flex'; }
function onChangeJenisStok() {
    const j = document.getElementById('s-jenis').value; const alok = document.getElementById('s-alokasi'); const h = document.getElementById('s-harga');
    if(j === 'Masuk') { alok.innerHTML = `<option value="Pembelian Umum">Stok Umum</option><option value="Pembelian Project">Untuk Project</option>`; h.readOnly = false; h.className = "w-full border p-2 rounded focus:outline-indigo-500 bg-white"; }
    else { alok.innerHTML = `<option value="Dipakai Project (RAP Final)">Dipakai Project</option><option value="Penyesuaian (Keluar)">Penyesuaian Hilang/Rusak</option>`; h.readOnly = true; h.className = "w-full border p-2 rounded bg-gray-200 text-gray-700 cursor-not-allowed"; }
    ['s-nama','s-qty','s-harga'].forEach(id => document.getElementById(id).value = ''); onChangeAlokasiStok(); 
}
function onChangeAlokasiStok() {
    const wrap = document.getElementById('wrap-stok-project');
    if(document.getElementById('s-alokasi').value.includes('Project')) wrap.classList.remove('hidden');
    else { wrap.classList.add('hidden'); document.getElementById('s-project-search').value = ''; document.getElementById('s-project-id').value = ''; }
}

function liveSearchMaterialStok() {
    let inp = document.getElementById('s-nama').value.toLowerCase(); let ul = document.getElementById('s-search-material'); ul.innerHTML = '';
    if(inp.length < 1){ ul.classList.add('hidden'); return; }
    let fil = masterMaterial.filter(i => (i.Nama_Item||"").toLowerCase().includes(inp));
    if(fil.length > 0) {
        ul.classList.remove('hidden');
        fil.forEach(i => {
            let sat = (i.Satuan_Standar||"").toString().trim(); sat = sat.substring(sat.indexOf(' ')+1)||sat;
            let li = document.createElement('li'); li.className = "p-2 border-b cursor-pointer hover:bg-indigo-50 text-sm"; li.innerText = `${i.Nama_Item} (${sat})`;
            li.onclick = () => { 
                document.getElementById('s-nama').value = i.Nama_Item; document.getElementById('s-satuan').value = sat; 
                if(document.getElementById('s-jenis').value === 'Masuk') { document.getElementById('s-harga').value = ""; document.getElementById('s-harga').focus(); } 
                else {
                    let lastP = 0; let lLog = gudangLogs.find(l => (l.Nama_Material||l.Nama_Item) === i.Nama_Item && parseFloat(l.Qty_Masuk) > 0);
                    if(lLog && lLog.Harga_Satuan) lastP = parseInt(lLog.Harga_Satuan.toString().replace(/[^0-9-]/g, "")) || 0;
                    else lastP = parseInt((i.Harga_Estimasi||0).toString().replace(/[^0-9-]/g, "")) || 0;
                    document.getElementById('s-harga').value = lastP; document.getElementById('s-qty').focus();
                } ul.classList.add('hidden'); 
            }; ul.appendChild(li);
        });
    }
}
function liveSearchProjectStok() {
    let inp = document.getElementById('s-project-search').value.toLowerCase(); let ul = document.getElementById('s-search-project'); ul.innerHTML = '';
    if(inp.length < 1){ ul.classList.add('hidden'); return; }
    let fil = currentProjectData.filter(p => (p.Nama_PIC_Klien||"").toLowerCase().includes(inp));
    if(fil.length > 0) {
        ul.classList.remove('hidden');
        fil.forEach(p => {
            let li = document.createElement('li'); li.className = "p-3 border-b cursor-pointer hover:bg-indigo-50 text-sm"; li.innerHTML = `<span class="font-bold text-indigo-700">${p.Nama_PIC_Klien||'Tanpa Klien'}</span><div class="text-xs">${p.Nama_Project}</div>`;
            li.onclick = () => { document.getElementById('s-project-search').value = `${p.Nama_PIC_Klien} - ${p.Nama_Project}`; document.getElementById('s-project-id').value = p.Project_ID; ul.classList.add('hidden'); }; ul.appendChild(li);
        });
    }
}
async function simpanTransaksiStok() {
    const isP = !document.getElementById('wrap-stok-project').classList.contains('hidden'); const pId = document.getElementById('s-project-id').value;
    if(isP && (!pId || document.getElementById('s-project-search').value === "")) return alert("Pilih Klien valid!");
    const tgl = document.getElementById('s-tanggal').value, j = document.getElementById('s-jenis').value, alok = document.getElementById('s-alokasi').value;
    const nama = document.getElementById('s-nama').value, qty = parseFloat(document.getElementById('s-qty').value)||0, hrg = parseFloat(document.getElementById('s-harga').value)||0, sat = document.getElementById('s-satuan').value, ref = document.getElementById('s-referensi').value||"-";
    if(!nama || qty <= 0 || hrg <= 0) return alert("Nama, Qty, Harga wajib diisi (tidak boleh 0)!");
    
    showLoading("Menyimpan Stok...");
    const res = await apiSaveMaster('Data_Kartu_Stok', ["STK-"+new Date().getTime(), tgl, nama, j, alok, isP?pId:"", j==="Masuk"?qty:0, j==="Keluar"?qty:0, sat, hrg, qty*hrg, ref]);
    if(res.success) { closeModal('modal-stok'); renderMenuStok(); } else { hideLoading(); alert(res.message); }
}

// =========================================================================
// 10. MODUL RAP (RENCANA ANGGARAN PROJECT)
// =========================================================================
async function renderMenuRAP(jenisMenu) {
    showLoading("Memuat Daftar Project...");
    const res = await apiGet('getSheetData', '&sheetName=Data_Project');
    hideLoading();
    if(res.success) {
        currentProjectData = res.data;
        let judul = jenisMenu.replace('_', ' ');
        let html = `<div class="bg-white rounded p-4 mb-4 shadow border-t-4 border-indigo-600"><div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-gray-800">Pilih Project untuk ${judul}</h2><div class="relative"><i class="fas fa-search absolute left-3 top-2.5 text-gray-400"></i><input type="text" id="cari-rap" onkeyup="filterRapProject()" placeholder="Cari Project..." class="pl-10 border p-2 rounded w-64 text-sm focus:outline-indigo-500"></div></div><div id="grid-rap-project" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
        res.data.forEach(p => {
            html += `<div class="card-rap border rounded p-4 hover:shadow-lg bg-gray-50" data-nama="${(p.Nama_Project||'').toLowerCase()}" data-klien="${(p.Nama_PIC_Klien||'').toLowerCase()}"><div class="font-bold text-xl text-indigo-900 mb-2"><i class="fas fa-user-tag mr-2"></i>${p.Nama_PIC_Klien||'-'}</div><div class="text-sm text-gray-600 mb-4 bg-white p-2 rounded"><div><span class="font-semibold text-gray-500 w-16 inline-block">Project:</span> ${p.Nama_Project}</div></div><button onclick="bukaWorkspaceRAP('${jenisMenu}', '${p.Project_ID}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded shadow font-semibold"><i class="fas fa-folder-open mr-1"></i> Buka ${judul}</button></div>`;
        });
        document.getElementById('main-content').innerHTML = html + `</div></div>`;
    } else alert("Gagal muat Project!");
}

function filterRapProject() {
    const kw = document.getElementById('cari-rap').value.toLowerCase();
    document.querySelectorAll('.card-rap').forEach(c => c.style.display = (c.getAttribute('data-nama').includes(kw) || c.getAttribute('data-klien').includes(kw)) ? 'block' : 'none');
}

async function bukaWorkspaceRAP(jenisMenu, pId) {
    showLoading(`Membuka Data ${jenisMenu.replace('_', ' ')}...`);
    const res = await apiGet('getWorkspaceData', `&projectId=${pId}`);
    hideLoading();
    if(res.success) {
        activeWorkspaceData = res.data;
        if(jenisMenu === 'RAP_Awal') renderWSAwal(); else if(jenisMenu === 'RAP_Belanja') renderWSBelanja(); else if(jenisMenu === 'RAP_Final') renderWSFinal();
    } else alert("Gagal buka Workspace!");
}

function renderHeaderWS(title, kembaliKe) {
    const p = activeWorkspaceData.projectInfo;
    return `<div class="flex justify-between items-center mb-4 no-print"><button onclick="renderMenuRAP('${kembaliKe}')" class="bg-gray-500 text-white px-4 py-2 rounded"><i class="fas fa-arrow-left mr-2"></i>Kembali</button><button onclick="window.print()" class="bg-green-600 text-white px-4 py-2 rounded"><i class="fas fa-print mr-2"></i>Cetak</button></div><div class="print-area bg-white p-8 rounded-lg shadow-lg"><div class="border-b-2 border-gray-800 pb-4 mb-6"><h2 class="text-2xl font-bold uppercase text-center mb-6">${title}</h2><div class="grid grid-cols-2 text-sm text-gray-700"><div><p class="text-xl font-bold text-indigo-900 mb-1"><i class="fas fa-user-tag text-indigo-400 mr-2"></i>${p.Nama_PIC_Klien}</p><p>Project: ${p.Nama_Project}</p></div><div class="text-right"><p><strong>ID:</strong> ${p.Project_ID}</p><p><strong>Alamat:</strong> ${p.Alamat_Project}</p></div></div></div>`;
}

// RAP AWAL
function renderWSAwal() { 
    let html = renderHeaderWS("RAP Awal", "RAP_Awal");
    html += `<div class="bg-indigo-50 border p-4 rounded-lg mb-6 no-print"><h4 class="font-bold mb-3 text-indigo-700">Input Item RAP</h4><input type="hidden" id="ra-rowIndex"><div class="grid grid-cols-1 md:grid-cols-6 gap-3 items-end"><div><label class="block text-xs font-semibold mb-1">Kategori</label><select id="ra-kategori" class="w-full border p-2 rounded text-sm bg-white" onchange="resetFormRa()"><option>Material</option><option>Jasa</option><option>Operasional</option></select></div><div class="col-span-2 relative"><label class="block text-xs font-semibold mb-1">Cari Master</label><input type="text" id="ra-nama" onkeyup="liveSearchRa()" class="w-full border p-2 rounded text-sm" autocomplete="off"><ul id="ra-search" class="absolute z-50 w-full bg-white shadow-xl rounded max-h-48 overflow-y-auto hidden"></ul></div><div><label class="block text-xs font-semibold mb-1">Harga</label><input type="text" id="ra-harga-display" class="w-full border p-2 bg-gray-200 text-sm font-semibold" readonly><input type="hidden" id="ra-harga"></div><div class="flex gap-1"><div class="w-1/2"><label class="block text-xs font-semibold mb-1 text-red-600">Qty</label><input type="number" id="ra-qty" class="w-full border border-red-300 p-2 rounded text-sm"></div><div class="w-1/2"><label class="block text-xs mb-1">Satuan</label><input type="text" id="ra-satuan" class="w-full border p-2 bg-gray-200 text-sm" readonly></div></div><div><button onclick="simpanItemRa()" id="btn-simpan-ra" class="w-full bg-indigo-600 text-white font-bold py-2 rounded text-sm">Simpan</button></div></div></div><table class="w-full text-sm border-collapse mb-6"><thead><tr class="bg-gray-800 text-white"><th class="p-2 border">Kategori</th><th class="p-2 border">Nama</th><th class="p-2 border">Qty</th><th class="p-2 border">Harga</th><th class="p-2 border">Total</th><th class="p-2 border text-center no-print">Aksi</th></tr></thead><tbody>`;
    let subMat=0, subJasa=0, subOps=0;
    activeWorkspaceData.rapAwal.forEach(r => {
        let t = parseFloat(r.Total_Harga)||0; if(r.Kategori === 'Material') subMat+=t; else if(r.Kategori === 'Jasa') subJasa+=t; else subOps+=t;
        html += `<tr class="border-b"><td class="p-2 border uppercase">${r.Kategori}</td><td class="p-2 border">${r.Nama_Item}</td><td class="p-2 border">${r.Qty} ${r.Satuan}</td><td class="p-2 border">Rp ${(parseFloat(r.Harga_Satuan)||0).toLocaleString('id-ID')}</td><td class="p-2 border font-bold">Rp ${t.toLocaleString('id-ID')}</td><td class="p-2 border text-center no-print"><button onclick="editItemRa(${r.rowIndex})" class="text-blue-500 mx-1"><i class="fas fa-edit"></i></button><button onclick="hapusItemRa(${r.rowIndex})" class="text-red-500 mx-1"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    const dsr = subMat+subJasa+subOps, prm = dsr*0.20;
    document.getElementById('main-content').innerHTML = html + `</tbody></table><div class="flex justify-end"><div class="bg-gray-50 p-4 rounded border shadow-sm w-full md:w-1/2"><div class="flex justify-between text-xs mb-1"><span>Material:</span> <span>Rp ${subMat.toLocaleString('id-ID')}</span></div><div class="flex justify-between text-xs mb-1"><span>Jasa:</span> <span>Rp ${subJasa.toLocaleString('id-ID')}</span></div><div class="flex justify-between text-xs mb-1"><span>Ops:</span> <span>Rp ${subOps.toLocaleString('id-ID')}</span></div><div class="flex justify-between text-indigo-600 font-bold border-t pt-1"><span>Premi 20%:</span> <span>Rp ${prm.toLocaleString('id-ID')}</span></div><div class="flex justify-between font-bold text-lg text-indigo-900 border-t-2 pt-2"><span>TOTAL RAP:</span> <span>Rp ${(dsr+prm).toLocaleString('id-ID')}</span></div></div></div></div>`;
}

function resetFormRa() { ['ra-nama','ra-harga','ra-harga-display','ra-qty','ra-satuan','ra-rowIndex'].forEach(id => document.getElementById(id).value = ''); document.getElementById('btn-simpan-ra').innerText = "Simpan"; document.getElementById('btn-simpan-ra').className = "w-full bg-indigo-600 text-white font-bold py-2 rounded text-sm"; }
function liveSearchRa() {
    const inp = document.getElementById('ra-nama').value.toLowerCase(), kat = document.getElementById('ra-kategori').value, ul = document.getElementById('ra-search'); ul.innerHTML = '';
    if(inp.length < 1) { ul.classList.add('hidden'); return; }
    let src = kat === 'Material' ? masterMaterial : (kat === 'Jasa' ? masterJasa : masterOps);
    let fil = src.filter(i => (i.Nama_Item || i.Nama_Jasa || i.Nama_Operasional || "").toLowerCase().includes(inp));
    if(fil.length > 0) {
        ul.classList.remove('hidden');
        fil.forEach(i => {
            let n = i.Nama_Item || i.Nama_Jasa || i.Nama_Operasional;
            let s = (i.Satuan_Standar||i.Satuan||"").toString().trim(); s = s.substring(s.indexOf(' ')+1)||s;
            let h = parseInt((i.Harga_Estimasi||i.Tarif_Tanpa_Alat||i.Biaya_Estimasi||0).toString().replace(/[^0-9-]/g, "")) || 0;
            let li = document.createElement('li'); li.className = "p-2 border-b cursor-pointer hover:bg-indigo-100 text-sm"; li.innerHTML = `<strong>${n}</strong> <span class="text-xs">(Rp ${h.toLocaleString('id-ID')} / ${s})</span>`;
            li.onclick = () => { document.getElementById('ra-nama').value = n; document.getElementById('ra-harga').value = h; document.getElementById('ra-harga-display').value = 'Rp ' + h.toLocaleString('id-ID'); document.getElementById('ra-satuan').value = s; ul.classList.add('hidden'); document.getElementById('ra-qty').focus(); }; ul.appendChild(li);
        });
    }
}
async function simpanItemRa() {
    const rIdx = document.getElementById('ra-rowIndex').value, pId = activeWorkspaceData.projectInfo.Project_ID, kat = document.getElementById('ra-kategori').value, nm = document.getElementById('ra-nama').value, qty = parseFloat(document.getElementById('ra-qty').value)||0, hrg = parseFloat(document.getElementById('ra-harga').value)||0, sat = document.getElementById('ra-satuan').value; 
    if(!nm || qty<=0) return alert("Nama dan Qty wajib diisi!");
    showLoading("Menyimpan Item...");
    const row = [rIdx ? activeWorkspaceData.rapAwal.find(r=>r.rowIndex==rIdx).ID_RAP : "RA-"+new Date().getTime(), pId, kat, nm, sat, hrg, qty, qty*hrg];
    const res = rIdx ? await apiUpdateMaster('Data_RAP_Awal', rIdx, row) : await apiSaveMaster('Data_RAP_Awal', row);
    if(res.success) bukaWorkspaceRAP('RAP_Awal', pId); else { hideLoading(); alert(res.message); }
}
function editItemRa(rIdx) {
    const d = activeWorkspaceData.rapAwal.find(r => r.rowIndex == rIdx);
    document.getElementById('ra-rowIndex').value = d.rowIndex; document.getElementById('ra-kategori').value = d.Kategori; document.getElementById('ra-nama').value = d.Nama_Item; 
    let hrg = parseFloat(d.Harga_Satuan)||0; document.getElementById('ra-harga').value = hrg; document.getElementById('ra-harga-display').value = 'Rp '+hrg.toLocaleString('id-ID'); document.getElementById('ra-qty').value = d.Qty; document.getElementById('ra-satuan').value = d.Satuan;
    document.getElementById('btn-simpan-ra').innerText = "Update"; document.getElementById('btn-simpan-ra').className = "w-full bg-orange-500 text-white font-bold py-2 rounded text-sm";
}
async function hapusItemRa(rIdx) { if(confirm("Hapus item rencana ini?")) { showLoading("Menghapus..."); const res = await apiDeleteMaster('Data_RAP_Awal', rIdx); if(res.success) bukaWorkspaceRAP('RAP_Awal', activeWorkspaceData.projectInfo.Project_ID); else { hideLoading(); alert(res.message); } } }

// RAP BELANJA
function renderWSBelanja() {
    let html = renderHeaderWS("RAP Belanja (Kebutuhan vs Stok)", "RAP_Belanja");
    html += `<table class="w-full text-sm border-collapse mb-6"><thead><tr class="bg-gray-100 text-left"><th class="p-2 border">Nama Material</th><th class="p-2 border text-center">Kebutuhan</th><th class="p-2 border text-center">Stok Gudang</th><th class="p-2 border text-center bg-red-600 text-white font-bold">Harus Beli</th></tr></thead><tbody>`;
    activeWorkspaceData.rapAwal.filter(r => r.Kategori === 'Material').forEach(r => {
        let dS = activeWorkspaceData.gudangStock.find(s => s.Nama_Item === r.Nama_Item); let sG = dS ? parseFloat(dS.Total_Stok) : 0; let beli = Math.max(0, (parseFloat(r.Qty)||0) - sG);
        html += `<tr class="border-b"><td class="p-2 border">${r.Nama_Item}</td><td class="p-2 border text-center">${r.Qty} ${r.Satuan}</td><td class="p-2 border text-center bg-blue-50">${sG} ${r.Satuan}</td><td class="p-2 border text-center font-bold text-red-700 ${beli>0?'bg-red-50':''}">${beli} ${r.Satuan}</td></tr>`;
    });
    document.getElementById('main-content').innerHTML = html + `</tbody></table></div>`;
}

// RAP FINAL 
function renderWSFinal() {
    let html = renderHeaderWS("RAP Final", "RAP_Final");
    html += `<h3 class="font-bold mb-2">1. MATERIAL FISIK (Ditarik Otomatis)</h3><table class="w-full text-sm border-collapse mb-6"><thead><tr class="bg-gray-100"><th class="p-2 border w-1/2">Nama Material</th><th class="p-2 border">Qty</th><th class="p-2 border">Harga Aktual</th><th class="p-2 border">Total Riil</th></tr></thead><tbody>`;
    let subMat = 0;
    activeWorkspaceData.stokMaterialFinal.forEach(m => { let h=parseFloat(m.Harga_Satuan)||0, t=parseFloat(m.Total_Nilai)||0; subMat+=t; html += `<tr class="border-b"><td class="p-2 border">${m.Nama_Material||m.Nama_Item} <span class="text-xs text-gray-400">Tgl: ${(m.Tanggal||'').split('T')[0]}</span></td><td class="p-2 border text-center">${m.Qty_Keluar} ${m.Satuan}</td><td class="p-2 border text-right">Rp ${h.toLocaleString('id-ID')}</td><td class="p-2 border text-right font-bold">Rp ${t.toLocaleString('id-ID')}</td></tr>`; });
    html += `<tr><td colspan="3" class="p-2 border text-right font-bold bg-gray-50">Subtotal Material:</td><td class="p-2 border text-right font-bold bg-gray-50">Rp ${subMat.toLocaleString('id-ID')}</td></tr></tbody></table>`;

    html += `<h3 class="font-bold mb-2 flex justify-between"><span>2. JASA & OPERASIONAL AKTUAL</span> <button onclick="bukaModalJasaOps(false)" class="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded shadow no-print"><i class="fas fa-plus"></i> Tambah Data</button></h3><table class="w-full text-sm border-collapse mb-6"><thead><tr class="bg-gray-100"><th class="p-2 border w-1/2">Nama Item</th><th class="p-2 border text-center">Qty</th><th class="p-2 border text-right">Harga</th><th class="p-2 border text-right">Total Riil</th><th class="p-2 border text-center no-print">Aksi</th></tr></thead><tbody>`;
    let subJasa = 0;
    
    if(activeWorkspaceData.rapFinalManual.length === 0) {
        html += `<tr><td colspan="5" class="p-3 text-center text-gray-500 italic">Belum ada Jasa/Operasional aktual yang diinput.</td></tr>`;
    } else {
        activeWorkspaceData.rapFinalManual.forEach(m => { 
            let h=parseFloat(m.Harga_Satuan)||0, t=parseFloat(m.Total_Harga)||0; subJasa+=t; 
            html += `<tr class="border-b hover:bg-gray-50"><td class="p-2 border"><span class="uppercase text-xs text-orange-600 font-bold mr-1">[${m.Kategori}]</span> ${m.Nama_Item}</td><td class="p-2 border text-center">${m.Qty} ${m.Satuan}</td><td class="p-2 border text-right">Rp ${h.toLocaleString('id-ID')}</td><td class="p-2 border text-right font-bold text-gray-800">Rp ${t.toLocaleString('id-ID')}</td><td class="p-2 border text-center no-print"><button onclick="bukaModalJasaOps(true, ${m.rowIndex})" class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs shadow mx-1"><i class="fas fa-edit"></i></button><button onclick="hapusJasaOps(${m.rowIndex})" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs shadow mx-1"><i class="fas fa-trash"></i></button></td></tr>`; 
        });
    }

    const dsr = subMat+subJasa, prm = dsr*0.20;
    document.getElementById('main-content').innerHTML = html + `<tr><td colspan="3" class="p-2 border text-right font-bold bg-gray-50">Subtotal Jasa/Ops:</td><td class="p-2 border text-right font-bold text-orange-600 bg-gray-50">Rp ${subJasa.toLocaleString('id-ID')}</td><td class="p-2 border bg-gray-50 no-print"></td></tr></tbody></table><div class="flex justify-end print-summary"><div class="bg-white p-6 rounded border border-gray-400 shadow-md w-full md:w-1/2"><div class="flex justify-between text-gray-700"><span>TOTAL DASAR:</span> <span class="font-bold">Rp ${dsr.toLocaleString('id-ID')}</span></div><div class="flex justify-between text-indigo-600 mt-2 text-sm"><span>Premi 20%:</span> <span class="font-semibold">Rp ${prm.toLocaleString('id-ID')}</span></div><div class="flex justify-between font-bold text-xl text-indigo-900 border-t-2 border-indigo-900 pt-3 mt-3"><span>REALISASI FINAL:</span> <span>Rp ${(dsr+prm).toLocaleString('id-ID')}</span></div></div></div></div>`;
}

function bukaModalJasaOps(isEdit, rIdx = null) { 
    if(isEdit) {
        const d = activeWorkspaceData.rapFinalManual.find(r => r.rowIndex == rIdx);
        document.getElementById('modal-title-jo').innerText = "Edit Jasa/Ops Aktual";
        document.getElementById('jo-rowIndex').value = d.rowIndex;
        document.getElementById('jo-kategori').value = d.Kategori;
        document.getElementById('jo-nama').value = d.Nama_Item;
        document.getElementById('jo-qty').value = d.Qty;
        document.getElementById('jo-satuan').value = d.Satuan;
        document.getElementById('jo-harga').value = parseFloat(d.Harga_Satuan) || 0;
        document.getElementById('btn-simpan-jo').innerText = "Update Data";
        document.getElementById('btn-simpan-jo').className = "bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded shadow font-bold";
    } else {
        document.getElementById('modal-title-jo').innerText = "Input Jasa/Ops Manual Aktual";
        document.getElementById('jo-rowIndex').value = "";
        ['jo-nama','jo-qty','jo-harga','jo-satuan'].forEach(id=>document.getElementById(id).value=''); 
        document.getElementById('btn-simpan-jo').innerText = "Simpan Data";
        document.getElementById('btn-simpan-jo').className = "bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded shadow font-bold";
    }
    document.getElementById('modal-jasa-ops').style.display='flex'; 
}

function liveSearchMaterialJO() {
    let inp = document.getElementById('jo-nama').value.toLowerCase(), ul = document.getElementById('jo-search'), kat = document.getElementById('jo-kategori').value; ul.innerHTML = '';
    if(inp.length<1){ul.classList.add('hidden');return;}
    let fil = (kat==='Jasa'?masterJasa:masterOps).filter(i => (i.Nama_Jasa||i.Nama_Operasional||"").toLowerCase().includes(inp));
    if(fil.length>0) {
        ul.classList.remove('hidden');
        fil.forEach(i => {
            let n = i.Nama_Jasa||i.Nama_Operasional; let sat = (i.Satuan_Standar||i.Satuan||"").toString().trim(); sat = sat.substring(sat.indexOf(' ')+1)||sat;
            let h = parseInt((i.Tarif_Tanpa_Alat||i.Biaya_Estimasi||0).toString().replace(/[^0-9-]/g, ""))||0;
            let li = document.createElement('li'); li.className = "p-2 border-b cursor-pointer hover:bg-indigo-100 text-sm"; li.innerHTML = `<strong>${n}</strong> <span class="text-xs text-gray-500">(Rp ${h.toLocaleString('id-ID')} / ${sat})</span>`;
            li.onclick = () => { document.getElementById('jo-nama').value = n; document.getElementById('jo-satuan').value = sat; document.getElementById('jo-harga').value = h; ul.classList.add('hidden'); document.getElementById('jo-qty').focus(); }; ul.appendChild(li);
        });
    }
}

async function simpanJasaOps() {
    const rIdx = document.getElementById('jo-rowIndex').value;
    const kat = document.getElementById('jo-kategori').value, nm = document.getElementById('jo-nama').value, q = parseFloat(document.getElementById('jo-qty').value)||0, h = parseFloat(document.getElementById('jo-harga').value)||0, sat = document.getElementById('jo-satuan').value, pId = activeWorkspaceData.projectInfo.Project_ID;
    if(!nm || q<=0) return alert("Pastikan Nama dan Qty diisi dengan benar!");
    
    showLoading(rIdx ? "Memperbarui Data..." : "Menyimpan Data Aktual...");
    const idF = rIdx ? activeWorkspaceData.rapFinalManual.find(r=>r.rowIndex==rIdx).ID_RAP : "F-"+new Date().getTime();
    const rowData = [idF, pId, kat, nm, sat, h, q, q*h];
    
    const res = rIdx ? await apiUpdateMaster('Data_RAP_Final', rIdx, rowData) : await apiSaveMaster('Data_RAP_Final', rowData);
    if(res.success) { closeModal('modal-jasa-ops'); bukaWorkspaceRAP('RAP_Final', pId); } else { hideLoading(); alert(res.message); }
}

async function hapusJasaOps(rIdx) {
    if(confirm("Apakah Anda yakin ingin menghapus data Jasa/Operasional ini?")) {
        showLoading("Menghapus Data...");
        const res = await apiDeleteMaster('Data_RAP_Final', rIdx);
        if(res.success) { bukaWorkspaceRAP('RAP_Final', activeWorkspaceData.projectInfo.Project_ID); } else { hideLoading(); alert(res.message); }
    }
}

// =========================================================================
// 11. MODUL TIMELINE PRODUKSI (DINAMIS DENGAN FITUR STATUS HARI INI)
// =========================================================================
const legendDataTimeline = [
    { code: 1, label: 'Survey ulang', bgClass: 'bg-yellow-300', textClass: 'text-black' },
    { code: 2, label: 'Meeting', bgClass: 'bg-emerald-800', textClass: 'text-white' },
    { code: 3, label: 'Belanja', bgClass: 'bg-slate-800', textClass: 'text-white' },
    { code: 4, label: 'Produksi', bgClass: 'bg-red-600', textClass: 'text-white' },
    { code: 5, label: 'QC', bgClass: 'bg-teal-700', textClass: 'text-white' },
    { code: 6, label: 'Instalasi', bgClass: 'bg-green-600', textClass: 'text-white' },
    { code: 7, label: 'Sipil', bgClass: 'bg-orange-500', textClass: 'text-white' }, 
    { code: 8, label: 'Selesai', bgClass: 'bg-lime-400', textClass: 'text-black' } 
];

let rawTimelineData = [];

async function renderMenuTimeline() {
    showLoading("Memuat Data Database Timeline...");
    
    const [projRes, timeRes] = await Promise.all([ apiGet('getSheetData', '&sheetName=Data_Project'), apiGet('getSheetData', '&sheetName=Data_Timeline') ]);
    hideLoading();

    if(projRes.success && timeRes.success) {
        currentProjectData = projRes.data;
        rawTimelineData = timeRes.data;
        
        let html = `
        <div class="bg-white border-b shadow-sm p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4 rounded no-print">
            <div class="w-full xl:w-1/2">
                <h1 class="text-lg font-bold text-teal-700 mb-2 uppercase">A. Keterangan Kode Warna</h1>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2" id="legend-container"></div>
            </div>
            <div class="w-full xl:w-1/2 flex flex-col sm:flex-row justify-start xl:justify-end items-start sm:items-center gap-3">
                <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center bg-gray-50 p-2 rounded border w-full sm:w-auto">
                    <span class="text-sm font-bold text-gray-600">Filter:</span>
                    <div class="flex gap-2 w-full sm:w-auto">
                        <input type="date" id="filter-start" class="border p-1.5 text-sm rounded focus:outline-teal-500 w-full sm:w-auto">
                        <span class="text-sm text-gray-500 self-center">s/d</span>
                        <input type="date" id="filter-end" class="border p-1.5 text-sm rounded focus:outline-teal-500 w-full sm:w-auto">
                    </div>
                    <button onclick="terapkanFilterTimeline()" class="bg-teal-600 text-white px-3 py-1.5 rounded text-sm font-bold shadow hover:bg-teal-700 w-full sm:w-auto"><i class="fas fa-search"></i></button>
                </div>
                <div class="inline-block bg-white border border-gray-300 rounded shadow-sm px-3 py-1 text-center w-full sm:w-auto">
                    <span class="text-gray-400 font-bold uppercase text-[10px]">Hari Ini</span>
                    <div class="text-lg font-bold text-yellow-500" id="current-date-display"></div>
                </div>
            </div>
        </div>
        <div class="overflow-auto bg-white rounded-lg shadow border border-gray-200 relative print-area" id="table-container" style="max-height: 65vh;">
            <table class="w-full text-left timeline-table bg-white">
                <thead id="table-head"></thead>
                <tbody id="table-body"></tbody>
            </table>
        </div>`;
        
        document.getElementById('main-content').innerHTML = html;
        injectModalTimeline(); 
        renderLegendTimeline();

        const today = new Date();
        const start = new Date(today); start.setDate(today.getDate() - 7);
        const end = new Date(today); end.setDate(today.getDate() + 30);
        document.getElementById('filter-start').value = start.toISOString().split('T')[0];
        document.getElementById('filter-end').value = end.toISOString().split('T')[0];

        renderTableTimeline();
    } else {
        alert("Gagal memuat data. Pastikan Sheet 'Data_Timeline' sudah dibuat di Google Sheets Anda.");
    }
}

function terapkanFilterTimeline() { renderTableTimeline(); }

function renderLegendTimeline() {
    const container = document.getElementById('legend-container');
    let html = '';
    legendDataTimeline.forEach(item => {
        html += `<div class="flex items-center space-x-1.5 bg-gray-50 border p-1 rounded"><div class="w-5 h-5 flex items-center justify-center rounded font-bold text-[10px] ${item.bgClass} ${item.textClass}">${item.code}</div><span class="text-[11px] text-gray-700 font-medium">${item.label}</span></div>`;
    });
    container.innerHTML = html;
}

function renderTableTimeline() {
    const tglMulaiStr = document.getElementById('filter-start').value, tglSelesaiStr = document.getElementById('filter-end').value;
    if(!tglMulaiStr || !tglSelesaiStr) return alert("Pilih rentang tanggal terlebih dahulu!");

    const startDate = new Date(tglMulaiStr), endDate = new Date(tglSelesaiStr), targetDateStr = new Date().toISOString().split('T')[0];
    const timelineDates = [], monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    
    let curr = new Date(startDate);
    while (curr <= endDate) { timelineDates.push(new Date(curr)); curr.setDate(curr.getDate() + 1); }

    const todayArr = targetDateStr.split('-');
    document.getElementById('current-date-display').innerText = `${todayArr[2]}/${todayArr[1]}/${todayArr[0].substring(2)}`;

    let monthHeadersHtml = '', currentMonth = -1, currentYear = -1, monthColspan = 0;
    timelineDates.forEach((date, index) => {
        const m = date.getMonth(), y = date.getFullYear();
        if (m !== currentMonth) {
            if (currentMonth !== -1) monthHeadersHtml += `<th colspan="${monthColspan}" class="px-2 py-1.5 text-center border-r border-b border-gray-400 font-bold bg-teal-600 text-white shadow-bottom sticky-header-top">${monthNames[currentMonth]} ${currentYear}</th>`;
            currentMonth = m; currentYear = y; monthColspan = 1;
        } else monthColspan++;
        if (index === timelineDates.length - 1) monthHeadersHtml += `<th colspan="${monthColspan}" class="px-2 py-1.5 text-center border-r border-b border-gray-400 font-bold bg-teal-600 text-white shadow-bottom sticky-header-top">${monthNames[currentMonth]} ${currentYear}</th>`;
    });

    let headerRow1 = `<tr class="bg-teal-600 text-white text-[10px] uppercase tracking-wide"><th colspan="4" class="px-4 py-2 text-center border-r-2 border-b border-gray-400 sticky-corner bg-teal-700 z-40 shadow-right shadow-bottom">DATA PROJECT</th>${monthHeadersHtml}</tr>`;
    
    let dateHeadersHtml = '';
    timelineDates.forEach(date => {
        const dStr = date.toISOString().split('T')[0], isToday = (dStr === targetDateStr);
        let classes = `min-w-[28px] w-[28px] max-w-[28px] py-1 text-center font-semibold text-xs border-r border-b border-gray-300 sticky-header-top z-20 shadow-bottom ${isToday ? 'bg-yellow-400 text-black today-highlight-header' : 'bg-gray-200 text-gray-700'}`;
        dateHeadersHtml += `<th class="${classes}">${date.getDate()}</th>`;
    });

    let headerRow2 = `<tr class="bg-gray-200 text-gray-600 text-[10px] uppercase font-bold sticky-header-top shadow-bottom z-30">
        <th class="px-2 py-1.5 sticky-col-left z-30 shadow-bottom bg-gray-200">Aksi</th>
        <th class="px-2 py-1.5 sticky-col-left z-30 shadow-bottom bg-gray-200" style="left:50px;">PIC Klien</th>
        <th class="px-2 py-1.5 sticky-col-left z-30 shadow-bottom bg-gray-200" style="left:150px;">Nama Project</th>
        <th class="px-2 py-1.5 sticky-col-left z-30 shadow-bottom shadow-right bg-gray-200 border-r-2 border-gray-400 text-center" style="left:270px; width:85px;">Status</th>
        ${dateHeadersHtml}</tr>`;
    
    document.getElementById('table-head').innerHTML = headerRow1 + headerRow2;

    let bodyHtml = '';
    const activeProjects = currentProjectData.filter(p => p.Status !== 'Draft' && p.Status !== 'Batal');

    if(activeProjects.length === 0) {
        bodyHtml = `<tr><td colspan="${4 + timelineDates.length}" class="p-6 text-center text-gray-500 italic">Belum ada project aktif untuk ditampilkan.</td></tr>`;
    } else {
        activeProjects.forEach(item => {
            const projTimeline = rawTimelineData.filter(t => t.Project_ID === item.Project_ID);
            const daily = {};
            projTimeline.forEach(event => {
                if(!event.Tanggal_Mulai || !event.Tanggal_Selesai) return;
                let dCurr = new Date(event.Tanggal_Mulai.split('T')[0]), dEnd = new Date(event.Tanggal_Selesai.split('T')[0]), isFirst = true;
                while(dCurr <= dEnd) { daily[dCurr.toISOString().split('T')[0]] = { code: parseInt(event.Kode_Tahapan), showNumber: isFirst }; isFirst = false; dCurr.setDate(dCurr.getDate()+1); }
            });

            // LOGIKA STATUS OTOMATIS: Berubah mengikuti kegiatan apa yang dijadwalkan pada HARI INI
            let currentStageLabel = (item.Status || "MENUNGGU").toUpperCase();
            let currentStageColor = item.Status === "Selesai" ? "bg-lime-400 text-black" : "bg-gray-100 text-gray-500";

            if (item.Status === "Sedang Berjalan" || item.Status === "Perencanaan") {
                if (projTimeline.length > 0) {
                    let todayTime = new Date(targetDateStr).getTime();
                    let latestStageCode = 0;
                    let isOngoing = false;

                    // Cari tahapan yang sedang berjalan hari ini, atau tahapan terakhir yang sudah dilewati
                    projTimeline.forEach(t => {
                        let start = new Date(t.Tanggal_Mulai.split('T')[0]).getTime();
                        let end = new Date(t.Tanggal_Selesai.split('T')[0]).getTime();
                        let code = parseInt(t.Kode_Tahapan);

                        if (todayTime >= start && todayTime <= end) {
                            if(code > latestStageCode) { latestStageCode = code; isOngoing = true; } 
                        } else if (todayTime > end) {
                            if(code > latestStageCode && !isOngoing) latestStageCode = code; 
                        }
                    });

                    if (latestStageCode > 0) {
                        const leg = legendDataTimeline.find(x => x.code === latestStageCode);
                        if (leg) {
                            currentStageLabel = leg.label;
                            currentStageColor = `${leg.bgClass} ${leg.textClass}`;
                        }
                    } else {
                        currentStageLabel = "Menunggu Mulai";
                        currentStageColor = "bg-blue-50 text-blue-600";
                    }
                }
            }

            let tCells = '';
            timelineDates.forEach(date => {
                const dStr = date.toISOString().split('T')[0], sc = daily[dStr];
                let content = '', cClasses = `text-center text-[10px] font-bold border-r border-gray-200 p-0 m-0 w-[28px] max-w-[28px] ${(dStr===targetDateStr && !sc) ? 'bg-yellow-50' : ''}`;
                if(sc) {
                    const l = legendDataTimeline.find(x => x.code === sc.code);
                    cClasses += l ? ` ${l.bgClass} ${l.textClass}` : '';
                    content = sc.showNumber ? date.getDate() : (sc.code===1 ? '<span class="text-yellow-600/70">-</span>' : (sc.code===6 ? '<span class="text-green-900/40">-</span>' : ''));
                }
                tCells += `<td class="${cClasses}">${content}</td>`;
            });

            bodyHtml += `<tr class="hover:bg-blue-50 text-[11px] bg-white transition-colors">
                <td class="px-2 py-1 text-center sticky-col-left bg-inherit"><button onclick="bukaModalTimeline('${item.Project_ID}')" class="bg-yellow-400 hover:bg-yellow-500 text-black px-2 py-1 rounded shadow text-[10px] font-bold"><i class="fas fa-edit"></i> Edit</button></td>
                <td class="px-2 py-1 font-bold sticky-col-left bg-inherit text-indigo-800" style="left:50px; min-width:100px;">${item.Nama_PIC_Klien || '-'}</td>
                <td class="px-2 py-1 sticky-col-left bg-inherit" style="left:150px; min-width:120px; white-space:normal; line-height:1.2;">${item.Nama_Project || '-'}</td>
                <td class="px-1 py-1 text-center font-bold sticky-col-left z-10 shadow-right border-r-2 border-gray-400 ${currentStageColor} text-[10px] leading-tight" style="left:270px; width:85px; white-space:normal;">${currentStageLabel}</td>
                ${tCells}
            </tr>`;
        });
    }
    
    document.getElementById('table-body').innerHTML = bodyHtml;
    // Auto Scroll ke Hari Ini
    setTimeout(() => { const tCell = document.querySelector('.today-highlight-header'); if(tCell) document.getElementById('table-container').scrollLeft = tCell.offsetLeft - 300; }, 100);
}

function injectModalTimeline() {
    if (document.getElementById('modal-timeline-edit')) return;
    
    let rowsHtml = '';
    legendDataTimeline.forEach(leg => {
        rowsHtml += `<div class="flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded border border-gray-200">
            <div class="w-8 h-8 flex items-center justify-center rounded font-bold text-xs ${leg.bgClass} ${leg.textClass} shrink-0">${leg.code}</div>
            <div class="w-1/3 text-sm font-semibold text-gray-700">${leg.label}</div>
            <div class="w-1/3"><input type="date" id="tl-start-${leg.code}" class="w-full border p-1.5 rounded text-sm focus:outline-teal-500"></div>
            <div class="w-1/3"><input type="date" id="tl-end-${leg.code}" class="w-full border p-1.5 rounded text-sm focus:outline-teal-500"></div>
        </div>`;
    });

    const modalHtml = `
    <div id="modal-timeline-edit" class="fixed inset-0 bg-black bg-opacity-50 hidden justify-center items-center z-[100] no-print">
        <div class="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg relative max-h-[90vh] flex flex-col">
            <h3 class="text-lg font-bold text-gray-800 mb-2 border-b pb-2"><i class="fas fa-calendar-alt text-teal-600 mr-2"></i> Edit Timeline Tahapan</h3>
            <div class="text-sm font-bold text-indigo-700 mb-4" id="modal-tl-proj-name"></div>
            <input type="hidden" id="modal-tl-proj-id">
            
            <div class="flex-1 overflow-y-auto pr-2 mb-4">
                <div class="flex text-xs font-bold text-gray-500 mb-2 px-2"><div class="w-1/3 ml-10">Tahapan</div><div class="w-1/3">Tgl Mulai</div><div class="w-1/3">Tgl Selesai</div></div>
                ${rowsHtml}
                <div class="text-[11px] text-gray-500 italic mt-2">* Kosongkan tanggal pada tahapan yang belum/tidak dikerjakan.</div>
            </div>
            
            <div class="flex justify-end gap-2 border-t pt-4">
                <button onclick="document.getElementById('modal-timeline-edit').style.display='none'" class="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded shadow">Batal</button>
                <button onclick="simpanTimeline()" class="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded shadow font-bold">Simpan Jadwal</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function bukaModalTimeline(pId) {
    const proj = currentProjectData.find(p => p.Project_ID === pId);
    document.getElementById('modal-tl-proj-name').innerText = `${proj.Nama_PIC_Klien} - ${proj.Nama_Project}`;
    document.getElementById('modal-tl-proj-id').value = pId;

    legendDataTimeline.forEach(l => { document.getElementById(`tl-start-${l.code}`).value = ''; document.getElementById(`tl-end-${l.code}`).value = ''; });

    const existing = rawTimelineData.filter(t => t.Project_ID === pId);
    existing.forEach(t => {
        if(document.getElementById(`tl-start-${t.Kode_Tahapan}`)) {
            document.getElementById(`tl-start-${t.Kode_Tahapan}`).value = t.Tanggal_Mulai ? t.Tanggal_Mulai.split('T')[0] : '';
            document.getElementById(`tl-end-${t.Kode_Tahapan}`).value = t.Tanggal_Selesai ? t.Tanggal_Selesai.split('T')[0] : '';
        }
    });

    document.getElementById('modal-timeline-edit').style.display = 'flex';
}

async function simpanTimeline() {
    const pId = document.getElementById('modal-tl-proj-id').value;
    let dataToSave = [];
    
    legendDataTimeline.forEach(l => {
        const tStart = document.getElementById(`tl-start-${l.code}`).value, tEnd = document.getElementById(`tl-end-${l.code}`).value;
        if(tStart) dataToSave.push(["TML-" + pId + "-" + l.code + "-" + new Date().getTime(), pId, l.code, tStart, tEnd || tStart]); 
    });

    document.getElementById('modal-timeline-edit').style.display = 'none'; showLoading("Menyimpan Jadwal...");
    
    const res = await apiPost({ action: 'saveTimelineBatch', projectId: pId, rows: dataToSave });
    if(res.success) {
        const timeRes = await apiGet('getSheetData', '&sheetName=Data_Timeline');
        if(timeRes.success) { rawTimelineData = timeRes.data; renderTableTimeline(); }
        hideLoading();
    } else { hideLoading(); alert("Gagal menyimpan Timeline: " + res.message); }
}
