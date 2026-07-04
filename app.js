// State
let audioData = [];
let pdfData = [];
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
let currentCategory = 'all';
let searchQuery = '';
let showFavoritesOnly = false;
let currentPlayerItem = null;
let currentUser = null;
let db = null;
let authMode = 'signin';

// Config
const categoryIcons = {
    "জাদু": "🪄", "তাবেআ": "👤", "কারীন": "👥", "বদনজর": "🧿", "গিঁট ও বাঁধন": "🔗",
    "জ্বিন": "🔥", "অসুখ": "🏥", "সুরক্ষা": "🛡️", "আমল": "📿", "শিক্ষা": "🎓", "পারিবারিক": "🏠", "গাইড": "📜"
};

// DOM
const audioContainer = document.getElementById('audio-container');
const pdfContainer = document.getElementById('pdf-container');
const categoryFilters = document.getElementById('category-filters');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');
const favoriteToggleBtn = document.getElementById('favorite-toggle-btn');
const navButtons = document.querySelectorAll('.nav-btn');
const toast = document.getElementById('toast');

async function init() {
    showSkeleton();
    try {
        const [audioRes, pdfRes] = await Promise.all([
            fetch('audio.json'),
            fetch('pdf_list.json')
        ]);
        audioData = await audioRes.json();
        pdfData = await pdfRes.json();

        const statAudio = document.getElementById('stat-audio-count-home');
        const statPdf = document.getElementById('stat-pdf-count-home');
        if (statAudio) statAudio.innerText = `${audioData.length}+`;
        if (statPdf) statPdf.innerText = `${pdfData.length}+`;

        setupCategories();
        renderAudio();
        renderPDFs();
        renderRecentlyPlayed();
        setupEventListeners();
        setupTheme();
        registerServiceWorker();
        initFirebase();
    } catch (e) {
        audioContainer.innerHTML = '<p class="text-red-500 text-center py-10">তথ্য লোড করা যায়নি!</p>';
    }
}

function setupCategories() {
    const categories = ['all', ...new Set(audioData.map(item => item.category))];
    categoryFilters.innerHTML = categories.map(cat => {
        const count = cat === 'all' ? audioData.length : audioData.filter(i => i.category === cat).length;
        const icon = categoryIcons[cat] || '📁';
        const label = cat === 'all' ? 'সবগুলো' : cat;
        const isActive = (cat === currentCategory && !showFavoritesOnly);
        const activeClass = isActive ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300';
        return `
            <button class="category-btn flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-medium border border-transparent shadow-sm hover:border-indigo-200 ${activeClass}" data-category="${cat}">
                <span>${cat === 'all' ? '🌈' : icon}</span>
                <span>${label}</span>
                <span class="text-xs opacity-60">(${count})</span>
            </button>
        `;
    }).join('');

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.category;
            showFavoritesOnly = false;
            updateCategoryUI();
            renderAudio();
        });
    });
}

function updateCategoryUI() {
    document.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === currentCategory && !showFavoritesOnly;
        btn.classList.toggle('bg-indigo-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('shadow-lg', isActive);
        btn.classList.toggle('bg-white', !isActive);
        btn.classList.toggle('dark:bg-slate-800', !isActive);
        btn.classList.toggle('text-gray-600', !isActive);
    });
    favoriteToggleBtn.classList.toggle('bg-yellow-400', showFavoritesOnly);
    favoriteToggleBtn.classList.toggle('text-white', showFavoritesOnly);
}

function renderAudio() {
    let filtered = audioData.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = item.title_bn.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
        const isFavorite = favorites.includes(item.code);
        if (showFavoritesOnly) return isFavorite && matchesSearch;
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        audioContainer.innerHTML = `<div class="col-span-full text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-gray-300"><p class="text-gray-500 text-lg mb-2">কোনো ফলাফল পাওয়া যায়নি!</p></div>`;
        return;
    }

    audioContainer.innerHTML = filtered.map((item, idx) => {
        const isFav = favorites.includes(item.code);
        return `
            <div class="card-animate group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-xl transition-all duration-300 flex flex-col relative" style="animation-delay:${idx * 30}ms">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 rounded border border-gray-200 dark:border-slate-600">${item.code}</span>
                        <span class="text-xs font-medium text-indigo-500">${item.category}</span>
                    </div>
                    <button onclick="toggleFavorite('${item.code}')" class="text-xl transition-transform active:scale-150">${isFav ? '⭐' : '☆'}</button>
                </div>
                <h3 class="text-lg font-bold mb-1 leading-tight group-hover:text-indigo-600 transition-colors">${item.title_bn}</h3>
                <p class="text-xs text-gray-400 mb-3" dir="rtl">${item.title_ar || ''}</p>
                <div class="mb-4">
                    <p class="text-[10px] text-gray-400 font-medium mb-1 uppercase tracking-wider">📌 উপযোগী:</p>
                    <div class="flex flex-wrap gap-1">
                        ${item.tags.map(tag => `<span class="text-[11px] bg-gray-50 dark:bg-slate-700/50 px-2 py-0.5 rounded-full text-gray-500 border border-gray-100 dark:border-slate-600">${tag}</span>`).join('')}
                    </div>
                </div>
                <div class="mt-auto flex gap-2">
                    <button onclick="openPlayer('${item.code}')" class="flex-1 inline-flex items-center justify-center py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all gap-2 shadow-sm active:scale-95">▶ শুনুন</button>
                    <button onclick="copyLink('${item.url}')" class="p-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 rounded-xl transition-all shadow-sm active:scale-95">📋</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPDFs() {
    pdfContainer.innerHTML = pdfData.map(pdf => `
        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex flex-col shadow-sm hover:shadow-md transition-shadow">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-2xl">${categoryIcons[pdf.category] || '📄'}</span>
                <div>
                    <h4 class="font-bold text-sm leading-tight">${pdf.title_bn}</h4>
                    <span class="text-[10px] text-indigo-500 font-medium">${pdf.category}</span>
                </div>
            </div>
            <button onclick="viewPDF('pdf/${pdf.filename}', '${pdf.title_bn.replace(/'/g, "\\'")}')" class="mt-auto inline-flex items-center justify-center w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">
                পিডিএফ পড়ুন
            </button>
        </div>
    `).join('');
}

window.viewPDF = (url, title) => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    const modalTitle = document.getElementById('pdf-modal-title');
    modalTitle.innerText = title;
    frame.src = url;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closePDF = () => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    modal.classList.add('hidden');
    frame.src = '';
    document.body.style.overflow = 'auto';
};

window.toggleFavorite = (code) => {
    if (favorites.includes(code)) favorites = favorites.filter(c => c !== code);
    else favorites.push(code);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    saveToCloud('favorites', favorites);
    updatePlayerFavBtn();
    renderAudio();
};

window.copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => showToast('লিংক কপি হয়েছে!'));
};

function setupEventListeners() {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderAudio();
    });
    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        updateThemeIcons(document.documentElement.classList.contains('dark'));
    });
    favoriteToggleBtn.addEventListener('click', () => {
        showFavoritesOnly = !showFavoritesOnly;
        if (showFavoritesOnly) currentCategory = 'all';
        updateCategoryUI();
        renderAudio();
    });
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            document.querySelectorAll('#main-content > div').forEach(div => div.classList.add('hidden'));
            document.getElementById(`section-${section}`).classList.remove('hidden');
            navButtons.forEach(b => {
                b.classList.remove('text-indigo-600', 'active-nav');
                b.classList.add('text-gray-500');
            });
            btn.classList.add('text-indigo-600', 'active-nav');
            btn.classList.remove('text-gray-500');
        });
    });

    const searchToggle = document.getElementById('search-toggle');
    if (searchToggle) searchToggle.addEventListener('click', showSearchOverlay);

    const globalSearchInput = document.getElementById('global-search-input');
    if (globalSearchInput) globalSearchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearchOverlay();
            closePlayer();
            closeLoginModal();
        }
    });

    setupSwipeGestures();
}

function setupTheme() {
    const isDark = localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcons(isDark);
}

function updateThemeIcons(isDark) {
    document.getElementById('theme-toggle-dark-icon').classList.toggle('hidden', isDark);
    document.getElementById('theme-toggle-light-icon').classList.toggle('hidden', !isDark);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg) {
    toast.textContent = msg || '✅ সম্পন্ন!';
    toast.classList.add('opacity-100');
    setTimeout(() => toast.classList.remove('opacity-100'), 2000);
}

// ── Skeleton Loading ────────────────────────────────────────────────────────
function showSkeleton() {
    const card = () => `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-gray-100 dark:border-slate-700 flex flex-col gap-3">
            <div class="flex justify-between">
                <div class="skeleton h-4 w-16 rounded"></div>
                <div class="skeleton h-4 w-6 rounded"></div>
            </div>
            <div class="skeleton h-5 w-4/5 rounded"></div>
            <div class="skeleton h-3 w-3/5 rounded"></div>
            <div class="flex gap-1 mt-1">
                <div class="skeleton h-4 w-12 rounded-full"></div>
                <div class="skeleton h-4 w-16 rounded-full"></div>
                <div class="skeleton h-4 w-10 rounded-full"></div>
            </div>
            <div class="skeleton h-10 w-full rounded-xl mt-auto"></div>
        </div>
    `;
    audioContainer.innerHTML = Array(6).fill(card()).join('');
}

// ── Swipe Gesture Navigation ────────────────────────────────────────────────
function setupSwipeGestures() {
    const sections = ['home', 'library', 'pdf', 'prescriptions'];
    let touchStartX = 0, touchStartY = 0;
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainContent.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

        const activeBtn = document.querySelector('.nav-btn.active-nav') || navButtons[0];
        const currentSection = activeBtn?.dataset?.section || 'home';
        const idx = sections.indexOf(currentSection);
        let nextIdx = idx;
        if (dx < 0 && idx < sections.length - 1) nextIdx = idx + 1;
        else if (dx > 0 && idx > 0) nextIdx = idx - 1;
        if (nextIdx === idx) return;

        const targetBtn = document.querySelector(`.nav-btn[data-section="${sections[nextIdx]}"]`);
        if (targetBtn) targetBtn.click();
    }, { passive: true });
}

// ── Recently Played ─────────────────────────────────────────────────────────
function addToRecentlyPlayed(code) {
    recentlyPlayed = recentlyPlayed.filter(c => c !== code);
    recentlyPlayed.unshift(code);
    recentlyPlayed = recentlyPlayed.slice(0, 5);
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    saveToCloud('recentlyPlayed', recentlyPlayed);
    renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
    const section = document.getElementById('recently-played-section');
    const list = document.getElementById('recently-played-list');
    if (!section || !list) return;
    if (recentlyPlayed.length === 0 || audioData.length === 0) { section.classList.add('hidden'); return; }

    const items = recentlyPlayed.map(code => audioData.find(a => a.code === code)).filter(Boolean);
    if (items.length === 0) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    list.innerHTML = items.map(item => `
        <div class="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer" onclick="openPlayer('${item.code}')">
            <div class="w-9 h-9 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <span class="text-red-600 text-sm">▶</span>
            </div>
            <div class="min-w-0">
                <p class="font-semibold text-sm line-clamp-1">${item.title_bn}</p>
                <p class="text-xs text-gray-400">${item.code} · ${item.category}</p>
            </div>
        </div>
    `).join('');
}

// ── YouTube Player ──────────────────────────────────────────────────────────
function getYouTubeId(url) {
    const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?#]+)/);
    return match ? match[1] : null;
}

function openPlayer(code) {
    const item = audioData.find(a => a.code === code);
    if (!item) return;
    currentPlayerItem = item;
    addToRecentlyPlayed(code);

    const modal = document.getElementById('yt-modal');
    const iframe = document.getElementById('yt-frame');
    const titleEl = document.getElementById('yt-modal-title');
    const codeEl = document.getElementById('yt-modal-code');

    const videoId = getYouTubeId(item.url);
    if (iframe) iframe.src = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : '';
    if (titleEl) titleEl.textContent = item.title_bn;
    if (codeEl) codeEl.textContent = item.code;
    const extLink = document.getElementById('yt-external-link');
    if (extLink) extLink.href = item.url;

    updatePlayerFavBtn();

    const related = audioData.filter(a => a.category === item.category && a.code !== code).slice(0, 6);
    const relatedContainer = document.getElementById('yt-related');
    if (relatedContainer) {
        relatedContainer.innerHTML = related.length ? related.map(r => `
            <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-all" onclick="openPlayer('${r.code}')">
                <div class="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span class="text-red-500 text-xs">▶</span>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-medium line-clamp-2">${r.title_bn}</p>
                    <p class="text-xs text-gray-400">${r.code}</p>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400 text-center py-2">আর কোনো ভিডিও নেই</p>';
    }

    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closePlayer() {
    const modal = document.getElementById('yt-modal');
    const iframe = document.getElementById('yt-frame');
    if (!modal) return;
    modal.classList.add('hidden');
    if (iframe) iframe.src = '';
    document.body.style.overflow = 'auto';
    currentPlayerItem = null;
}

function updatePlayerFavBtn() {
    const btn = document.getElementById('yt-fav-btn');
    if (!btn || !currentPlayerItem) return;
    btn.textContent = favorites.includes(currentPlayerItem.code) ? '⭐' : '☆';
}

window.openPlayer = openPlayer;
window.closePlayer = closePlayer;

window.toggleFavoriteFromPlayer = () => {
    if (currentPlayerItem) window.toggleFavorite(currentPlayerItem.code);
};

window.copyLinkFromPlayer = () => {
    if (currentPlayerItem) window.copyLink(currentPlayerItem.url);
};

window.openExternalPlayer = () => {
    if (currentPlayerItem) window.open(currentPlayerItem.url, '_blank');
};

// ── Global Search ───────────────────────────────────────────────────────────
function showSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('global-search-input')?.focus(), 100);
    renderSearchResults('');
}

function closeSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

window.closeSearchOverlay = closeSearchOverlay;

function renderSearchResults(query) {
    const container = document.getElementById('global-search-results');
    if (!container) return;

    if (!query.trim()) {
        container.innerHTML = `<p class="text-center text-gray-400 py-10">কিছু লিখুন...</p>`;
        return;
    }

    const q = query.toLowerCase();
    const audioResults = audioData.filter(item =>
        item.title_bn.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
    );
    const pdfResults = pdfData.filter(pdf =>
        pdf.title_bn.toLowerCase().includes(q) ||
        (pdf.category || '').toLowerCase().includes(q)
    );

    if (audioResults.length === 0 && pdfResults.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-400 py-10">কোনো ফলাফল পাওয়া যায়নি</p>`;
        return;
    }

    let html = '';
    if (audioResults.length > 0) {
        html += `<p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-2">অডিও (${audioResults.length})</p>`;
        html += audioResults.map(item => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-all" onclick="closeSearchOverlay(); openPlayer('${item.code}')">
                <span class="w-8 h-8 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center text-sm flex-shrink-0">▶</span>
                <div class="min-w-0">
                    <p class="font-semibold text-sm line-clamp-1">${item.title_bn}</p>
                    <p class="text-xs text-gray-400">${item.code} · ${item.category}</p>
                </div>
            </div>
        `).join('');
    }
    if (pdfResults.length > 0) {
        html += `<p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4">পিডিএফ (${pdfResults.length})</p>`;
        html += pdfResults.map(pdf => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-all" onclick="closeSearchOverlay(); viewPDF('pdf/${pdf.filename}', '${pdf.title_bn.replace(/'/g, "\\'")}')">
                <span class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center text-sm flex-shrink-0">📄</span>
                <div class="min-w-0">
                    <p class="font-semibold text-sm line-clamp-1">${pdf.title_bn}</p>
                    <p class="text-xs text-gray-400">${pdf.category}</p>
                </div>
            </div>
        `).join('');
    }
    container.innerHTML = html;
}

// ── Firebase Auth ───────────────────────────────────────────────────────────
function initFirebase() {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') return;
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        firebase.auth().onAuthStateChanged(handleAuthStateChange);
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) authBtn.classList.remove('hidden');
    } catch (e) {
        console.warn('Firebase init failed:', e);
    }
}

async function handleAuthStateChange(user) {
    currentUser = user;
    const authBtn = document.getElementById('auth-btn');
    const avatarBtn = document.getElementById('user-avatar-btn');
    const userPhoto = document.getElementById('user-photo');
    const userInitials = document.getElementById('user-initials');
    const dropdownPhoto = document.getElementById('dropdown-photo');
    const dropdownInitials = document.getElementById('dropdown-initials');
    const dropdownName = document.getElementById('dropdown-name');
    const dropdownEmail = document.getElementById('dropdown-email');
    const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

    if (user) {
        if (authBtn) authBtn.classList.add('hidden');
        if (avatarBtn) avatarBtn.classList.remove('hidden');
        if (user.photoURL) {
            if (userPhoto) { userPhoto.src = user.photoURL; userPhoto.classList.remove('hidden'); }
            if (userInitials) userInitials.classList.add('hidden');
            if (dropdownPhoto) { dropdownPhoto.src = user.photoURL; dropdownPhoto.classList.remove('hidden'); }
            if (dropdownInitials) dropdownInitials.classList.add('hidden');
        } else {
            if (userInitials) { userInitials.textContent = initial; userInitials.classList.remove('hidden'); }
            if (userPhoto) userPhoto.classList.add('hidden');
            if (dropdownInitials) { dropdownInitials.textContent = initial; dropdownInitials.classList.remove('hidden'); }
            if (dropdownPhoto) dropdownPhoto.classList.add('hidden');
        }
        if (dropdownName) dropdownName.textContent = user.displayName || 'ব্যবহারকারী';
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';
        closeLoginModal();
        await syncFromCloud(user);
    } else {
        if (authBtn) authBtn.classList.remove('hidden');
        if (avatarBtn) avatarBtn.classList.add('hidden');
    }
}

async function syncFromCloud(user) {
    if (!db || !user) return;
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.favorites) {
                favorites = data.favorites;
                localStorage.setItem('favorites', JSON.stringify(favorites));
                renderAudio();
            }
            if (data.recentlyPlayed) {
                recentlyPlayed = data.recentlyPlayed;
                localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
                renderRecentlyPlayed();
            }
        }
    } catch (e) {
        console.warn('Cloud sync failed:', e);
    }
}

async function saveToCloud(key, value) {
    if (!db || !currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set({ [key]: value }, { merge: true });
    } catch (e) {
        console.warn('Cloud save failed:', e);
    }
}

window.signInWithGoogle = async () => {
    if (typeof firebase === 'undefined') return;
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await firebase.auth().signInWithPopup(provider);
    } catch (e) {
        showAuthError(e.message);
    }
};

window.handleEmailAuth = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email')?.value;
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) return;
    try {
        if (authMode === 'signin') {
            await firebase.auth().signInWithEmailAndPassword(email, password);
        } else {
            await firebase.auth().createUserWithEmailAndPassword(email, password);
        }
    } catch (e) {
        showAuthError(e.message);
    }
};

window.toggleAuthMode = () => {
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    if (submitBtn) submitBtn.textContent = authMode === 'signin' ? 'লগইন করুন' : 'নিবন্ধন করুন';
    if (toggleBtn) toggleBtn.textContent = authMode === 'signin' ? 'নতুন? নিবন্ধন করুন' : 'অ্যাকাউন্ট আছে? লগইন করুন';
    const errorEl = document.getElementById('auth-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
};

window.resetPassword = async () => {
    const email = document.getElementById('auth-email')?.value;
    if (!email) { showAuthError('পাসওয়ার্ড রিসেটের জন্য ইমেইল দিন।'); return; }
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        showAuthError('✅ পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে।');
    } catch (e) {
        showAuthError(e.message);
    }
};

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
}

window.signOutUser = async () => {
    if (typeof firebase !== 'undefined') await firebase.auth().signOut();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
};

window.openLoginModal = () => {
    const modal = document.getElementById('login-modal');
    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
};

window.closeLoginModal = () => {
    const modal = document.getElementById('login-modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = 'auto'; }
};

window.toggleProfileDropdown = () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (dropdown && avatarBtn && !avatarBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

init();
