const API_URL = 'https://script.google.com/macros/s/AKfycbxKwM31VLM-LpoEIvyc0vh3T2iLDPTirFM3C3hdq1Mtd7eMw5if2nWZ2cm6KvXxAQe9/exec';
const IMGBB_API_KEY = '71307118640265da76172e90445b208b';

function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3300);
}

function checkAuth() {
    const token = sessionStorage.getItem('authToken');
    if (!token && !window.location.href.includes('index.html')) { window.location.href = 'index.html'; }
    return token;
}

function exportToCSV(data, filename) {
    if (data.length === 0) return showToast('لا توجد بيانات في هذا التقرير', 'warning');
    const headers = Object.keys(data[0]);
    const csvRows = []; csvRows.push(headers.join(','));
    data.forEach(row => {
        const values = headers.map(header => {
            let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
            val = val.replace(/"/g, '""'); return `"${val}"`;
        });
        csvRows.push(values.join(','));
    });
    const csvString = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
}

function parsePhones(phoneString) {
    if (!phoneString) return [];
    return phoneString.split(',').map(p => {
        p = p.trim();
        let wa = p.includes('(واتساب)');
        let num = p.replace('(واتساب)', '').trim();
        return { num, wa };
    });
}

async function uploadImageToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) return data.data.url;
        throw new Error('فشل رفع الصورة');
    } catch (err) { throw new Error('فشل الاتصال بمزود الصور'); }
}

if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const loader = document.getElementById('loginLoader');
        if (!username || !password) { return showToast('يرجى إدخال البيانات', 'warning'); }
        btnText.style.display = 'none'; loader.style.display = 'block'; loginBtn.disabled = true;
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', username, password }) });
            const data = await response.json();
            if (data.success) {
                showToast('تم تسجيل الدخول بنجاح!', 'success');
                sessionStorage.setItem('authToken', data.data.token);
                sessionStorage.setItem('userRole', data.data.role);
                sessionStorage.setItem('username', data.data.username);
                setTimeout(() => window.location.href = 'dashboard.html', 1000);
            } else { showToast(data.error || 'خطأ في الدخول', 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; loginBtn.disabled = false; }
    });
}

if (document.querySelector('.dashboard-body')) {
    const token = checkAuth();
    const currentUser = sessionStorage.getItem('username');
    document.getElementById('displayUsername').innerText = currentUser || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    let currentPage = 1, searchQuery = '', currentDetailClientId = '';
    let globalSettings = { branches: [], specialties: [], specialists: [], sources: [] };
    let chatPolling, allUsersForMention = [], allUsersForEdit = [];

    async function fetchSettings() {
        try {
            const response = await fetch(`${API_URL}?action=getSettings`);
            const data = await response.json();
            if (data.success) {
                globalSettings = data.data;
                populateDropdowns(); populateEditDropdown(); populateImportDropdown(); populateReportDropdown();
            }
        } catch (error) { console.error('Settings Error:', error); }
    }

    function populateDropdowns() {
        document.getElementById('preferredBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('requiredSpecialty').innerHTML = globalSettings.specialties.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('source').innerHTML = globalSettings.sources.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('detailBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('detailSpecialist').innerHTML = '<option value="">لا يوجد</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('appSpecialist').innerHTML = '<option value="">اختر أخصائي</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('newAppSpecialist').innerHTML = '<option value="">لا يوجد</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('referralType').innerHTML = '<option value="صديق">صديق</option><option value="جوجل ماب">جوجل ماب</option><option value="لافتة">لافتة</option><option value="عادة">عادة</option>';
        
        document.getElementById('filterBranch').innerHTML = '<option value="All">كل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('filterSource').innerHTML = '<option value="All">كل المصادر</option>' + globalSettings.sources.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('filterSpecialty').innerHTML = '<option value="All">كل التخصصات</option>' + globalSettings.specialties.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('filterSpecialist').innerHTML = '<option value="All">كل الأخصائيين</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        
        const userBranches = '<option value="All">All لكل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('addUserBranch').innerHTML = userBranches;
        document.getElementById('editUserBranch').innerHTML = userBranches;
    }

    function populateEditDropdown() {
        const type = document.getElementById('editSettingType').value;
        const items = type === 'Branch' ? globalSettings.branches : type === 'Specialty' ? globalSettings.specialties : type === 'Specialist' ? globalSettings.specialists : globalSettings.sources;
        document.getElementById('editOldValue').innerHTML = items.map(item => `<option value="${item}">${item}</option>`).join('');
    }

    function populateImportDropdown() { document.getElementById('importBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join(''); }
    function populateReportDropdown() { document.getElementById('reportBranch').innerHTML = '<option value="All">كل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join(''); }

    async function fetchClients(page = 1, search = '') {
        try {
            const fBranch = document.getElementById('filterBranch').value;
            const fSource = document.getElementById('filterSource').value;
            const fSpecialty = document.getElementById('filterSpecialty').value;
            const fSpecialist = document.getElementById('filterSpecialist').value;
            
            const url = `${API_URL}?action=getClients&token=${token}&page=${page}&search=${encodeURIComponent(search)}&fBranch=${encodeURIComponent(fBranch)}&fSource=${encodeURIComponent(fSource)}&fSpecialty=${encodeURIComponent(fSpecialty)}&fSpecialist=${encodeURIComponent(fSpecialist)}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.success) { renderTable(data.data.clients, data.data.total, page); }
        } catch (error) { console.error('Fetch Clients Error:', error); }
    }

    function renderTable(clients, total, page) {
        const tbody = document.getElementById('clientsTableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';
        if (clients.length === 0) { emptyState.style.display = 'block'; document.getElementById('pagination').innerHTML = ''; return; }
        emptyState.style.display = 'none';
        clients.forEach(c => {
            const statusColor = c.Status === 'عميل محتمل' ? '#f5af19' : c.Status === 'تحت الجلسات' ? '#38ef7d' : '#fff';
            const date = c.CreatedAt ? new Date(c.CreatedAt).toLocaleDateString('ar-EG') : '-';
            tbody.innerHTML += `
                <tr>
                    <td><span style="background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:5px; font-size:12px;">${c.ClientID}</span></td>
                    <td>${c.FullName}</td><td>${c.Phone}</td><td>${c.PreferredBranch}</td><td>${c.RequiredSpecialty}</td>
                    <td style="font-size:12px; opacity:0.8;">${date}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor};">${c.Status}</span></td>
                    <td><button class="btn-primary btn-details" data-clientid="${c.ClientID}" style="padding:5px 10px; font-size:12px;">تفاصيل</button></td>
                </tr>
            `;
        });
        const totalPages = Math.ceil(total / 20);
        const paginationDiv = document.getElementById('pagination');
        paginationDiv.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === page ? 'active' : ''}`;
            btn.innerText = i;
            btn.addEventListener('click', () => { currentPage = i; fetchClients(currentPage, searchQuery); });
            paginationDiv.appendChild(btn);
        }
        document.querySelectorAll('.btn-details').forEach(btn => {
            btn.addEventListener('click', (e) => openClientDetails(e.target.getAttribute('data-clientid')));
        });
    }

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { searchQuery = e.target.value; currentPage = 1; fetchClients(currentPage, searchQuery); }, 500);
    });

    ['filterBranch', 'filterSource', 'filterSpecialty', 'filterSpecialist'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => { currentPage = 1; fetchClients(currentPage, searchQuery); });
    });

    const modal = document.getElementById('clientModal');
    document.getElementById('addClientBtn').addEventListener('click', () => {
        document.getElementById('phonesContainer').innerHTML = `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" required>
                <label class="wa-check"><input type="checkbox" class="phone-wa"> واتساب</label>
                <button type="button" class="remove-phone" onclick="removePhoneRow(this)">X</button>
            </div>
        `;
        modal.classList.add('active');
    });
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

    document.getElementById('addPhoneBtn').addEventListener('click', () => {
        const container = document.getElementById('phonesContainer');
        container.innerHTML += `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" required>
                <label class="wa-check"><input type="checkbox" class="phone-wa"> واتساب</label>
                <button type="button" class="remove-phone" onclick="removePhoneRow(this)">X</button>
            </div>
        `;
    });

    window.removePhoneRow = function(button) {
        const container = document.getElementById('phonesContainer');
        if (container.children.length > 1) button.parentElement.remove();
    };

    window.toggleSourceFields = function() {
        const source = document.getElementById('source').value;
        document.getElementById('referralTypeGroup').style.display = (source === 'زيارة فرع') ? 'block' : 'none';
        document.getElementById('platformGroup').style.display = (source === 'سوشيال ميديا') ? 'block' : 'none';
        document.getElementById('campaignGroup').style.display = (source === 'سوشيال ميديا') ? 'block' : 'none';
    };

    document.getElementById('addClientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitClientBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loader = document.getElementById('clientLoader');
        
        const phones = [];
        document.querySelectorAll('.phone-row').forEach(row => {
            const num = row.querySelector('.phone-input').value.trim();
            const wa = row.querySelector('.phone-wa').checked;
            if (num) phones.push({ num, wa });
        });

        if (phones.length === 0) return showToast('يرجى إدخال رقم هاتف واحد على الأقل', 'warning');

        const source = document.getElementById('source').value;
        let finalSource = source;
        if (source === 'زيارة فرع') {
            finalSource += ` (${document.getElementById('referralType').value})`;
        } else if (source === 'سوشيال ميديا') {
            finalSource += ` (${document.getElementById('platform').value} - ${document.getElementById('campaign').value})`;
        }

        const clientData = {
            action: 'addClient', token,
            fullName: document.getElementById('fullName').value, 
            age: document.getElementById('age').value, 
            preferredBranch: document.getElementById('preferredBranch').value,
            requiredSpecialty: document.getElementById('requiredSpecialty').value, 
            source: finalSource,
            notes: document.getElementById('notes').value, 
            createdBy: currentUser,
            phones: phones
        };
        
        btnText.style.display = 'none'; loader.style.display = 'block'; submitBtn.disabled = true;
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(clientData) });
            const data = await response.json();
            if (data.success) { 
                showToast('تم إضافة العميل بنجاح!', 'success'); 
                
                // حجز الموعد الأول إذا تم إدخاله
                const newAppDate = document.getElementById('newAppDate').value;
                const newAppTime = document.getElementById('newAppTime').value;
                const newAppSpecialist = document.getElementById('newAppSpecialist').value;
                const newClientId = data.data.clientId; // الكود الذي أرجعه الخادم
                
                if (newAppDate && newAppTime && newClientId) {
                    try {
                        await fetch(API_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({
                                action: 'addAppointment', token,
                                clientId: newClientId,
                                date: newAppDate,
                                time: newAppTime,
                                branch: clientData.preferredBranch,
                                specialist: newAppSpecialist,
                                createdBy: currentUser
                            })
                        });
                        showToast('تم حجز الموعد الأول بنجاح', 'success');
                    } catch (e) { console.error('Appointment Error', e); }
                }
                
                document.getElementById('addClientForm').reset(); 
                modal.classList.remove('active'); 
                fetchClients(currentPage, searchQuery); 
                fetchNotifs();
            } else { showToast(data.error, 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html'; });

    const detailsModal = document.getElementById('clientDetailsModal');
    document.getElementById('closeDetailsModal').addEventListener('click', () => detailsModal.classList.remove('active'));

    async function openClientDetails(clientId) {
        currentDetailClientId = clientId;
        try {
            const res = await fetch(`${API_URL}?action=getClientById&token=${token}&clientId=${clientId}`);
            const data = await res.json();
            if (!data.success) return showToast(data.error, 'error');
            const client = data.data;
            document.getElementById('detailClientName').innerText = client.FullName;
            document.getElementById('detailClientID').value = client.ClientID;
            document.getElementById('detailBranch').value = client.PreferredBranch;
            document.getElementById('detailSpecialist').value = client.AssignedSpecialist || "";
            document.getElementById('newNoteText').value = ''; 
            document.getElementById('appBranch').value = client.PreferredBranch;

            const phonesContainer = document.getElementById('detailPhonesContainer');
            phonesContainer.innerHTML = '';
            const phones = parsePhones(client.Phone);
            if (phones.length === 0) { addDetailPhoneRow(); } 
            else { phones.forEach(p => addDetailPhoneRow(p.num, p.wa)); }

            const waPhone = phones.find(p => p.wa);
            const phone = waPhone ? waPhone.num : (phones[0] ? phones[0].num : '');
            if (phone) {
                const cleanPhone = String(phone).replace(/\D/g, '');
                const message = `مرحباً ${client.FullName}، نتواصل معكم من مركز Be Perfect للصحة النفسية.`;
                document.getElementById('whatsappBtn').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
            } else { document.getElementById('whatsappBtn').href = '#'; }

            await fetchHistory(clientId);
            await fetchAppointments(clientId);
            detailsModal.classList.add('active');
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    function addDetailPhoneRow(num = '', wa = false) {
        const container = document.getElementById('detailPhonesContainer');
        container.innerHTML += `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" value="${num}">
                <label class="wa-check"><input type="checkbox" class="phone-wa" ${wa ? 'checked' : ''}> واتساب</label>
                <button type="button" class="remove-phone" onclick="removeDetailPhoneRow(this)">X</button>
            </div>
        `;
    }

    window.removeDetailPhoneRow = function(button) {
        const container = document.getElementById('detailPhonesContainer');
        if (container.children.length > 1) button.parentElement.remove();
    }

    document.getElementById('addDetailPhoneBtn').addEventListener('click', () => addDetailPhoneRow());

    async function fetchHistory(clientId) {
        const resHist = await fetch(`${API_URL}?action=getHistory&token=${token}&clientId=${clientId}`);
        const dataHist = await resHist.json();
        const historyBody = document.getElementById('historyTableBody');
        historyBody.innerHTML = '';
        if (dataHist.success && dataHist.data.length > 0) {
            dataHist.data.forEach(h => {
                const date = new Date(h.date).toLocaleString('ar-EG');
                historyBody.innerHTML += `<tr><td>${h.field}</td><td>${h.oldVal}</td><td>${h.newVal}</td><td>${h.changedBy}</td><td>${date}</td></tr>`;
            });
        } else { historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.7;">لا يوجد تغييرات مسجلة</td></tr>`; }
    }

    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const phones = [];
        document.querySelectorAll('#detailPhonesContainer .phone-row').forEach(row => {
            const num = row.querySelector('.phone-input').value.trim();
            const wa = row.querySelector('.phone-wa').checked;
            if (num) phones.push({ num, wa });
        });

        const data = {
            action: 'updateClient', token, clientId: currentDetailClientId,
            branch: document.getElementById('detailBranch').value, 
            specialist: document.getElementById('detailSpecialist').value,
            newNote: document.getElementById('newNoteText').value, 
            changedBy: currentUser,
            phones: phones
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { 
                showToast(result.data.message, 'success'); 
                document.getElementById('newNoteText').value = ''; 
                await fetchHistory(currentDetailClientId); 
                fetchClients(currentPage, searchQuery); 
                fetchNotifs(); 
                openClientDetails(currentDetailClientId);
            } else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('bookAppointmentBtn').addEventListener('click', async () => {
        const data = {
            action: 'addAppointment', token,
            clientId: currentDetailClientId,
            date: document.getElementById('appDate').value,
            time: document.getElementById('appTime').value,
            branch: document.getElementById('appBranch').value || document.getElementById('detailBranch').value,
            specialist: document.getElementById('appSpecialist').value,
            createdBy: currentUser
        };
        if (!data.date || !data.time) return showToast('يرجى إدخال اليوم والساعة', 'warning');
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast('تم حجز الموعد بنجاح', 'success'); document.getElementById('appDate').value = ''; document.getElementById('appTime').value = ''; fetchAppointments(currentDetailClientId); fetchNotifs(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    async function fetchAppointments(clientId) {
        try {
            const res = await fetch(`${API_URL}?action=getAppointments&token=${token}&clientId=${clientId}`);
            const data = await res.json();
            const list = document.getElementById('appointmentsList');
            list.innerHTML = '';
            if (data.success && data.data.length > 0) {
                list.innerHTML = `<h4 style="margin-bottom:10px; font-size:14px; color:#fff;">المواعيد القادمة:</h4>`;
                data.data.forEach(app => {
                    list.innerHTML += `<div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px;">
                        <strong>${new Date(app.date).toLocaleDateString('ar-EG')}</strong> - ${app.time} <br>
                        <small>الأخصائي: ${app.specialist} | الحالة: ${app.status}</small>
                    </div>`;
                });
            }
        } catch (e) { console.error('Appointments Error', e); }
    }

    const reportModal = document.getElementById('reportModal');
    document.getElementById('reportBtn').addEventListener('click', () => reportModal.classList.add('active'));
    document.getElementById('closeReportModal').addEventListener('click', () => reportModal.classList.remove('active'));

    document.getElementById('reportForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('generateReportBtn');
        const btnText = btn.querySelector('.btn-text');
        const loader = document.getElementById('reportLoader');
        const month = document.getElementById('reportMonth').value;
        const year = document.getElementById('reportYear').value;
        const branch = document.getElementById('reportBranch').value;
        btnText.style.display = 'none'; loader.style.display = 'block'; btn.disabled = true;
        try {
            const url = `${API_URL}?action=getMonthlyReport&token=${token}&month=${month}&year=${year}&branch=${encodeURIComponent(branch)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                exportToCSV(data.data, `Report_${month}_${year}_${branch}.csv`);
                showToast('تم تجهيز التقرير بنجاح', 'success');
                reportModal.classList.remove('active');
            } else { showToast(data.error, 'error'); }
        } catch (err) { showToast('فشل التقرير', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; btn.disabled = false; }
    });

    async function fetchNotifs() {
        try {
            const res = await fetch(`${API_URL}?action=getNotifs&token=${token}&user=${currentUser}`);
            const data = await res.json();
            if (data.success) {
                const unread = data.data.filter(n => !n.isRead).length;
                const badge = document.getElementById('notifBadge');
                badge.innerText = unread;
                badge.style.display = unread > 0 ? 'flex' : 'none';
                
                const list = document.getElementById('notifList');
                list.innerHTML = '';
                if (data.data.length === 0) {
                    list.innerHTML = '<div class="notif-item" style="text-align:center; opacity:0.7;">لا توجد تنبيهات</div>';
                } else {
                    data.data.forEach(n => {
                        const date = new Date(n.date).toLocaleString('ar-EG');
                        list.innerHTML += `<div class="notif-item ${!n.isRead ? 'unread' : ''}" data-action-type="${n.actionType}" data-action-id="${n.actionId}" style="cursor: pointer;">
                            <p style="margin-bottom:5px;">${n.message}</p>
                            <small style="font-size: 11px; opacity: 0.7;">${date}</small>
                        </div>`;
                    });
                    document.querySelectorAll('#notifList .notif-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const actionType = item.getAttribute('data-action-type');
                            const actionId = item.getAttribute('data-action-id');
                            document.getElementById('notifDropdown').style.display = 'none';
                            if (actionType === 'client_details' && actionId) { openClientDetails(actionId); } 
                            else if (actionType === 'chat' && actionId) {
                                document.getElementById('chatBtn').click();
                                setTimeout(() => {
                                    const select = document.getElementById('chatTarget');
                                    select.value = actionId;
                                    const event = new Event('change');
                                    select.dispatchEvent(event);
                                }, 1500);
                            }
                        });
                    });
                }
            }
        } catch (e) { console.error('Notif Error', e); }
    }

    window.toggleNotifs = function() {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown.style.display === 'block') { dropdown.style.display = 'none'; } 
        else { dropdown.style.display = 'block'; window.markNotifsRead(); }
    };

    window.markNotifsRead = async function() {
        try {
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'markNotifRead', token, user: currentUser }) });
            document.getElementById('notifBadge').style.display = 'none';
        } catch (e) { console.error(e); }
    };

    const chatModal = document.getElementById('chatModal');
    document.getElementById('chatBtn').addEventListener('click', async () => {
        chatModal.classList.add('active');
        try {
            const res = await fetch(`${API_URL}?action=getUsers&token=${token}`);
            const data = await res.json();
            const select = document.getElementById('chatTarget');
            select.innerHTML = '<option value="General">شات عام (للجميع)</option>';
            allUsersForMention = [];
            if (data.success) {
                data.data.forEach(u => {
                    if (u.Username !== currentUser) {
                        const roleMap = { 'Admin': 'أدمن', 'Moderator': 'مودريتور', 'Secretary': 'سكرتارية' };
                        const displayRole = roleMap[u.Role] || 'موظف';
                        select.innerHTML += `<option value="${u.Username}">${u.Username} (${u.JobTitle || displayRole})</option>`;
                        allUsersForMention.push(u);
                    }
                });
            }
        } catch (e) { console.error(e); }
        startChatPolling();
    });
    document.getElementById('closeChatModal').addEventListener('click', () => { chatModal.classList.remove('active'); clearInterval(chatPolling); });

    document.getElementById('chatTarget').addEventListener('change', fetchChat);

    async function fetchChat() {
        const target = document.getElementById('chatTarget').value;
        try {
            const res = await fetch(`${API_URL}?action=getChat&token=${token}&user=${currentUser}&target=${target}`);
            const data = await res.json();
            const box = document.getElementById('chatBox');
            box.innerHTML = '';
            if (data.success && data.data.length > 0) {
                data.data.forEach(msg => {
                    const isMe = msg.sender === currentUser;
                    const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    let msgText = msg.message.replace(/@(\w+)/g, '<span style="color:#ff9a44; font-weight:bold;">@$1</span>');
                    box.innerHTML += `<div class="chat-msg ${isMe ? 'me' : 'other'}"><div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">${isMe ? 'أنت' : msg.sender} - ${time}</div>${msgText}</div>`;
                });
                box.scrollTop = box.scrollHeight;
            }
        } catch (e) { console.error('Chat Fetch Error', e); }
    }

    function startChatPolling() {
        fetchChat();
        clearInterval(chatPolling);
        chatPolling = setInterval(fetchChat, 3000);
    }

    const chatInput = document.getElementById('chatInput');
    const mentionDropdown = document.getElementById('mentionDropdown');
    let mentionActive = false;

    chatInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const lastChar = val[val.length - 1];
        if (lastChar === '@' && !mentionActive) {
            mentionActive = true;
            mentionDropdown.innerHTML = '';
            allUsersForMention.forEach(u => {
                const div = document.createElement('div');
                div.innerText = u.Username;
                div.className = 'mention-item';
                div.onclick = () => {
                    chatInput.value = val.substring(0, val.length - 1) + '@' + u.Username + ' ';
                    mentionDropdown.style.display = 'none';
                    mentionActive = false;
                    chatInput.focus();
                };
                mentionDropdown.appendChild(div);
            });
            mentionDropdown.style.display = 'block';
        } else if (mentionActive && (lastChar === ' ' || val.length === 0)) {
            mentionDropdown.style.display = 'none';
            mentionActive = false;
        }
    });

    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        if (!msg) return;
        const target = document.getElementById('chatTarget').value;
        try {
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sendChat', token, sender: currentUser, receiver: target, message: msg }) });
            input.value = '';
            mentionDropdown.style.display = 'none';
            fetchChat();
            fetchNotifs();
        } catch (err) { showToast('فشل إرسال الرسالة', 'error'); }
    });

    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');
    if (sessionStorage.getItem('userRole') === 'Admin') { adminBtn.style.display = 'flex'; }
    adminBtn.addEventListener('click', () => { adminModal.classList.add('active'); loadUsersForAdmin(); });
    document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.classList.remove('active'));
    document.getElementById('editSettingType').addEventListener('change', populateEditDropdown);

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.getAttribute('data-tab')}`).classList.add('active');
        });
    });

    async function loadUsersForAdmin() {
        try {
            const res = await fetch(`${API_URL}?action=getUsers&token=${token}`);
            const data = await res.json();
            const select = document.getElementById('editUserSelect');
            select.innerHTML = '<option value="">-- اختر مستخدم من القائمة --</option>';
            allUsersForEdit = [];
            if (data.success) {
                data.data.forEach(u => {
                    const roleMap = { 'Admin': 'أدمن', 'Moderator': 'مودريتور', 'Secretary': 'سكرتارية' };
                    const displayRole = roleMap[u.Role] || 'موظف';
                    select.innerHTML += `<option value="${u.ID}">${u.Username} (${u.JobTitle || displayRole})</option>`;
                    allUsersForEdit.push(u);
                });
            }
        } catch (err) { showToast('فشل تحميل المستخدمين', 'error'); }
    }

    document.getElementById('editUserSelect').addEventListener('change', function() {
        const userId = this.value;
        const user = allUsersForEdit.find(u => u.ID === userId);
        if (user) {
            document.getElementById('editUserId').value = user.ID;
            document.getElementById('editUsername').value = user.Username; 
            document.getElementById('editPassword').value = ''; 
            document.getElementById('editJobTitle').value = user.JobTitle || '';
            document.getElementById('editEmail').value = user.Email || '';
            document.getElementById('editWhatsApp').value = user.WhatsApp || '';
            document.getElementById('editProfilePic').value = user.ProfilePic || '';
            document.getElementById('editProfilePicPreview').src = user.ProfilePic || '';
            document.getElementById('editProfilePicPreview').style.display = user.ProfilePic ? 'block' : 'none';
            document.getElementById('editRole').value = user.Role;
            document.getElementById('editUserBranch').value = user.Branch;
        } else { document.getElementById('editUserForm').reset(); }
    });

    document.getElementById('addProfilePicFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showToast('جاري رفع الصورة...', 'warning');
        try {
            const url = await uploadImageToImgBB(file);
            document.getElementById('addProfilePic').value = url;
            document.getElementById('addProfilePicPreview').src = url;
            document.getElementById('addProfilePicPreview').style.display = 'block';
            showToast('تم رفع الصورة بنجاح', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('editProfilePicFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showToast('جاري رفع الصورة...', 'warning');
        try {
            const url = await uploadImageToImgBB(file);
            document.getElementById('editProfilePic').value = url;
            document.getElementById('editProfilePicPreview').src = url;
            document.getElementById('editProfilePicPreview').style.display = 'block';
            showToast('تم رفع الصورة بنجاح', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('addUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = {
            action: 'addUser', token,
            username: document.getElementById('addUsername').value,
            password: document.getElementById('addPassword').value,
            jobTitle: document.getElementById('addJobTitle').value,
            email: document.getElementById('addEmail').value,
            whatsapp: document.getElementById('addWhatsApp').value,
            profilePic: document.getElementById('addProfilePic').value,
            role: document.getElementById('addRole').value,
            branch: document.getElementById('addUserBranch').value || 'All'
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('addUserForm').reset(); document.getElementById('addProfilePicPreview').style.display = 'none'; loadUsersForAdmin(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('editUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const userId = document.getElementById('editUserId').value;
        if (!userId) return showToast('يرجى اختيار مستخدم من القائمة أولاً', 'warning');
        const data = {
            action: 'updateUser', token, userId,
            username: document.getElementById('editUsername').value,
            newPassword: document.getElementById('editPassword').value,
            jobTitle: document.getElementById('editJobTitle').value,
            email: document.getElementById('editEmail').value,
            whatsapp: document.getElementById('editWhatsApp').value,
            profilePic: document.getElementById('editProfilePic').value,
            role: document.getElementById('editRole').value,
            branch: document.getElementById('editUserBranch').value || 'All'
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('editUserForm').reset(); document.getElementById('editProfilePicPreview').style.display = 'none'; loadUsersForAdmin(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('addSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'addSetting', token, type: document.getElementById('settingType').value, value: document.getElementById('settingValue').value };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast('تمت الإضافة بنجاح!', 'success'); document.getElementById('addSettingForm').reset(); fetchSettings(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('editSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'updateSetting', token, type: document.getElementById('editSettingType').value, oldValue: document.getElementById('editOldValue').value, newValue: document.getElementById('editNewValue').value };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('editSettingForm').reset(); fetchSettings(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('importClientsForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const importBtn = document.getElementById('importBtn');
        const btnText = importBtn.querySelector('.btn-text');
        const loader = document.getElementById('importLoader');
        const fileInput = document.getElementById('importFile');
        const branch = document.getElementById('importBranch').value;
        if (!fileInput.files[0]) { return showToast('يرجى اختيار ملف CSV', 'warning'); }
        btnText.style.display = 'none'; loader.style.display = 'block'; importBtn.disabled = true;
        try {
            const file = fileInput.files[0];
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const clientsArray = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(/[,،\t]/);
                const cleanPart = (p) => p ? p.replace(/^"|"$/g, '').trim() : '';
                const name = cleanPart(parts[2]); const phone = cleanPart(parts[3]);
                const age = cleanPart(parts[4]); const csvBranch = cleanPart(parts[7]);
                const specialist = cleanPart(parts[8]); const notes = cleanPart(parts[13]);
                if (name && phone) { clientsArray.push({ name, phone, age, csvBranch, specialist, notes }); }
            }
            if (clientsArray.length === 0) { 
                btnText.style.display = 'inline'; loader.style.display = 'none'; importBtn.disabled = false;
                return showToast('لم يتم العثور على بيانات صحيحة', 'warning'); 
            }
            const res = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'bulkAddClients', token, branch, clients: clientsArray, createdBy: currentUser })
            });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('importClientsForm').reset(); fetchClients(currentPage, searchQuery); fetchNotifs(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل قراءة الملف', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; importBtn.disabled = false; }
    });

    fetchSettings();
    fetchClients(currentPage, searchQuery);
    fetchNotifs();
    setInterval(fetchNotifs, 30000); 
}
