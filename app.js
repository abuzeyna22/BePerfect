// ====== إعدادات Supabase ======
const SUPABASE_URL = 'https://wwucyjrbadjaerqgyzyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3dWN5anJiYWRqYWVycWd5enluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjk0MzksImV4cCI6MjEwNTk0NTQzOX0._08cTLRhNfXwiNCaY1zOvmaMxAzVVkAiPqnHYRYQRU8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const IMGBB_API_KEY = '71307118640265da76172e90445b208b';
const SECRET_TOKEN = 'BP_CRM_SECURE_TOKEN_2024';

// دالة تشفير SHA-256 في المتصفح
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let audioCtx;
function playBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let oscillator = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) { console.log("Audio not supported"); }
}

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

function parsePhones(phoneArray) {
    if (!phoneArray || !Array.isArray(phoneArray)) return [];
    return phoneArray.map(p => ({ num: p.num || '', wa: p.wa || false }));
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

// ====== منطق تسجيل الدخول (Supabase) ======
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
            // جلب المستخدم من قاعدة البيانات
            const { data, error } = await db.from('users').select('*').eq('username', username).single();
            if (error || !data) throw new Error('اسم المستخدم غير موجود');
            
            // تشفير كلمة المرور المدخلة ومقارنتها
            const hashedPassword = await sha256(password + SECRET_TOKEN);
            if (data.password_hash !== hashedPassword) throw new Error('كلمة المرور غير صحيحة');
            
            showToast('تم تسجيل الدخول بنجاح!', 'success');
            sessionStorage.setItem('authToken', data.id);
            sessionStorage.setItem('userRole', data.role);
            sessionStorage.setItem('username', data.username);
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
            
        } catch (error) { showToast(error.message, 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; loginBtn.disabled = false; }
    });
}

// ====== لوحة التحكم ======
if (document.querySelector('.dashboard-body')) {
    const token = checkAuth();
    const currentUser = sessionStorage.getItem('username');
    document.getElementById('displayUsername').innerText = currentUser || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    let currentPage = 1, searchQuery = '', currentDetailClientId = '';
    let globalSettings = { branches: ['السيوف', 'ميامي', 'لوران', 'سموحة 1', 'سموحة 2', 'سبورتنج 1', 'سبورتنج 2', 'العجمي', 'أونلاين'], specialties: ['تعديل سلوك', 'تخاطب', 'كابل ثيرابي', 'التريكز والقلق', 'الصدمات', 'مشكلات دراسية', 'استشارات أونلاين'], specialists: ['د. مريم', 'د. أحمد', 'د. سارة'], sources: ['سوشيال ميديا', 'مكالمة مباشرة', 'زيارة فرع', 'إحالة', 'ورشة عمل'] };
    let chatPolling, allUsersForMention = [], allUsersForEdit = [];
    let lastUnreadCount = 0;

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
    populateDropdowns();

    async function fetchStats() {
        try {
            const { count: total } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('is_archived', false);
            const today = new Date(); today.setHours(0,0,0,0);
            const { count: todayCount } = await db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()).eq('is_archived', false);
            const { count: late } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'متأخر/متوقف').eq('is_archived', false);
            
            document.getElementById('totalClients').innerText = total || 0;
            document.getElementById('todayClients').innerText = todayCount || 0;
            document.getElementById('lateClients').innerText = late || 0;
            document.getElementById('pendingClients').innerText = '0'; // يتم حسابها لاحقا
        } catch (e) { console.error('Stats Error:', e); }
    }

    async function fetchClients(page = 1, search = '') {
        try {
            const fBranch = document.getElementById('filterBranch').value;
            const fStatus = document.getElementById('filterStatus').value;
            const fArchived = document.getElementById('filterArchived').checked;
            
            let query = db.from('clients').select('*', { count: 'exact' }).eq('is_archived', fArchived);
            
            if (fBranch !== 'All') query = query.eq('preferred_branch', fBranch);
            if (fStatus !== 'All') query = query.eq('status', fStatus);
            if (search) query = query.or(`full_name.ilike.%${search}%,phones.cs.[{"num":"${search}"}]`); // بحث بالنص أو JSONB
            
            const start = (page - 1) * 20;
            const { data, count, error } = await query.order('created_at', { ascending: false }).range(start, start + 19);
            if (error) throw error;
            renderTable(data || [], count || 0, page);
        } catch (error) { console.error('Fetch Clients Error:', error); showToast('فشل جلب العملاء', 'error'); }
    }

    function renderTable(clients, total, page) {
        const tbody = document.getElementById('clientsTableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';
        if (!clients || clients.length === 0) { emptyState.style.display = 'block'; document.getElementById('pagination').innerHTML = ''; return; }
        emptyState.style.display = 'none';
        
        const statusColors = { 'عميل محتمل': '#f5af19', 'تم الحجز': '#2575fc', 'تحت الجلسات': '#38ef7d', 'متأخر/متوقف': '#ff3b3b', 'مكتمل': '#aaaaaa' };
        
        clients.forEach(c => {
            const statusColor = statusColors[c.status] || '#fff';
            const date = c.created_at ? new Date(c.created_at).toLocaleDateString('ar-EG') : '-';
            const isLate = c.status === 'متأخر/متوقف';
            const archBtn = c.is_archived ? 
                `<button class="btn-primary unarchive-btn" data-id="${c.id}" style="padding:3px 6px; font-size:10px; background: #11998e;">إلغاء الأرشفة</button>` : 
                `<button class="btn-primary archive-btn" data-id="${c.id}" style="padding:3px 6px; font-size:10px; background: #6a11cb;">أرشفة</button>`;
            const phonesStr = (c.phones || []).map(p => `${p.num}${p.wa ? ' (واتساب)' : ''}`).join(', ');
            
            tbody.innerHTML += `
                <tr ${isLate ? 'class="status-late"' : ''}>
                    <td><span style="background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:5px; font-size:12px;">${c.client_code}</span></td>
                    <td>${c.full_name}</td>
                    <td>${phonesStr}</td>
                    <td>${c.preferred_branch}</td>
                    <td style="font-size:12px;">${c.source || '-'}</td>
                    <td style="font-size:12px;">${c.created_by || '-'}</td>
                    <td style="font-size:12px; opacity:0.8;">${date}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor}; font-weight:bold;">${c.status}</span></td>
                    <td style="display:flex; gap:5px;">
                        <button class="btn-primary btn-details" data-clientid="${c.id}" style="padding:5px 10px; font-size:12px;">تفاصيل</button>
                        ${archBtn}
                    </td>
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
        
        document.querySelectorAll('.btn-details').forEach(btn => btn.addEventListener('click', (e) => openClientDetails(e.currentTarget.getAttribute('data-clientid'))));
        document.querySelectorAll('.archive-btn, .unarchive-btn').forEach(btn => btn.addEventListener('click', (e) => archiveClient(e.currentTarget.getAttribute('data-id'), e.currentTarget.classList.contains('archive-btn'))));
    }

    async function archiveClient(clientId, archive) {
        try {
            const { error } = await db.from('clients').update({ is_archived: archive }).eq('id', clientId);
            if (error) throw error;
            showToast(archive ? 'تم أرشفة العميل' : 'تم إلغاء الأرشفة', 'success');
            fetchClients(currentPage, searchQuery); fetchStats();
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    }

    // ... (الأحداث الأخرى كالبحث والفلاتر تبقى كما هي)
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { searchQuery = e.target.value; currentPage = 1; fetchClients(currentPage, searchQuery); }, 500);
    });

    ['filterBranch', 'filterStatus', 'filterArchived'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => { currentPage = 1; fetchClients(currentPage, searchQuery); });
    });

    // منطق إضافة العميل (Supabase)
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

        const clientData = {
            client_code: 'BP-' + new Date().getTime().toString().slice(-6), // كود مبدئي سيتم تحديثه لاحقا
            full_name: document.getElementById('fullName').value, 
            age: document.getElementById('age').value, 
            preferred_branch: document.getElementById('preferredBranch').value,
            required_specialty: document.getElementById('requiredSpecialty').value, 
            source: document.getElementById('source').value,
            notes: document.getElementById('notes').value, 
            created_by: currentUser,
            owner: currentUser,
            phones: phones,
            status: 'عميل محتمل'
        };
        
        btnText.style.display = 'none'; loader.style.display = 'block'; submitBtn.disabled = true;
        try {
            const { data, error } = await db.from('clients').insert([clientData]).select();
            if (error) throw error;
            
            const newClientId = data[0].id;
            // تحديث الكود ليكون BP-1001 ... متسلسل (بسيط)
            const { count } = await db.from('clients').select('*', { count: 'exact', head: true });
            await db.from('clients').update({ client_code: 'BP-' + (1000 + count) }).eq('id', newClientId);
            
            showToast('تم إضافة العميل بنجاح!', 'success'); 
            document.getElementById('addClientForm').reset(); 
            document.getElementById('clientModal').classList.remove('active'); 
            fetchClients(currentPage, searchQuery); 
            fetchNotifs(); fetchStats();
        } catch (error) { showToast(error.message, 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    // فتح تفاصيل العميل (Supabase)
    async function openClientDetails(clientId) {
        currentDetailClientId = clientId;
        try {
            const { data: client, error } = await db.from('clients').select('*').eq('id', clientId).single();
            if (error) throw error;
            
            document.getElementById('detailClientName').innerText = client.full_name;
            document.getElementById('detailClientID').value = client.client_code;
            document.getElementById('detailBranch').value = client.preferred_branch;
            document.getElementById('detailSpecialist').value = client.assigned_specialist || "";
            document.getElementById('detailStatus').value = client.status || "عميل محتمل";
            document.getElementById('newNoteText').value = ''; 
            
            const phonesContainer = document.getElementById('detailPhonesContainer');
            phonesContainer.innerHTML = '';
            const phones = parsePhones(client.phones);
            if (phones.length === 0) { addDetailPhoneRow(); } 
            else { phones.forEach(p => addDetailPhoneRow(p.num, p.wa)); }

            const waPhone = phones.find(p => p.wa);
            const phone = waPhone ? waPhone.num : (phones[0] ? phones[0].num : '');
            if (phone) {
                const cleanPhone = String(phone).replace(/\D/g, '');
                const message = `مرحباً ${client.full_name}، نتواصل معكم من مركز Be Perfect للصحة النفسية.`;
                document.getElementById('whatsappBtn').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
            } else { document.getElementById('whatsappBtn').href = '#'; }

            document.getElementById('clientDetailsModal').classList.add('active'); 
            await fetchHistory(clientId);
            await fetchAppointments(clientId);
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    async function fetchHistory(clientId) {
        try {
            const { data, error } = await db.from('history').select('*').eq('client_id', clientId).order('changed_at', { ascending: false });
            if (error) throw error;
            const historyBody = document.getElementById('historyTableBody');
            historyBody.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(h => {
                    const date = new Date(h.changed_at).toLocaleString('ar-EG');
                    historyBody.innerHTML += `<tr><td>${h.field}</td><td>${h.old_val || '-'}</td><td>${h.new_val || '-'}</td><td>${h.changed_by}</td><td>${date}</td></tr>`;
                });
            } else { historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.7;">لا يوجد تغييرات مسجلة</td></tr>`; }
        } catch (e) { console.error('History Error:', e); }
    }

    // حفظ التعديلات (Supabase)
    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const phones = [];
        document.querySelectorAll('#detailPhonesContainer .phone-row').forEach(row => {
            const num = row.querySelector('.phone-input').value.trim();
            const wa = row.querySelector('.phone-wa').checked;
            if (num) phones.push({ num, wa });
        });

        const updateData = {
            preferred_branch: document.getElementById('detailBranch').value, 
            assigned_specialist: document.getElementById('detailSpecialist').value,
            status: document.getElementById('detailStatus').value,
            phones: phones
        };

        try {
            const { error } = await db.from('clients').update(updateData).eq('id', currentDetailClientId);
            if (error) throw error;
            
            // تسجيل في الهيستوري
            const histData = { client_id: currentDetailClientId, field: 'تعديل بيانات', new_val: 'تم حفظ التعديلات', changed_by: currentUser };
            await db.from('history').insert([histData]);
            
            const newNote = document.getElementById('newNoteText').value;
            if (newNote.trim() !== '') {
                await db.from('history').insert([{ client_id: currentDetailClientId, field: 'ملاحظة جديدة', new_val: newNote, changed_by: currentUser }]);
            }
            
            showToast('تم حفظ التعديلات بنجاح', 'success'); 
            document.getElementById('newNoteText').value = ''; 
            await fetchHistory(currentDetailClientId); 
            fetchClients(currentPage, searchQuery); 
            fetchNotifs(); fetchStats();
        } catch (err) { showToast('فشل حفظ التعديلات', 'error'); }
    });

    // باقي الدوال (المواعيد، الشات، التنبيهات، الإعدادات) تتبع نفس النمط في Supabase
    // للاختصار، تم ترك الأكواد الأساسية ويمكنني إرسال الباقي إذا احتجته
    
    fetchClients(currentPage, searchQuery);
    fetchNotifs();
    fetchStats();
    setInterval(fetchNotifs, 30000); 
    setInterval(fetchStats, 60000); 
}
