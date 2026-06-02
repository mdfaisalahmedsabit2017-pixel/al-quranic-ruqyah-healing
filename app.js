// State
let audioData = [];
let pdfData = [];
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let currentCategory = 'all';
let searchQuery = '';
let showFavoritesOnly = false;

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
    try {
        const [audioRes, pdfRes] = await Promise.all([
            fetch('audio.json'),
            fetch('pdf_list.json')
        ]);
        audioData = await audioRes.json();
        pdfData = await pdfRes.json();
        
        setupCategories();
        renderAudio();
        renderPDFs();
        setupEventListeners();
        setupTheme();
        registerServiceWorker();
    } catch (e) {
        audioContainer.innerHTML = '<p class="text-red-500 text-center py-10">তথ্য লোড করা যায়নি!</p>';
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
        audioContainer.innerHTML = `<div class="col-span-full text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-gray-300"><p class="text-gray-500 text-lg mb-2">কোনো ফলাফল পাওয়া যায়নি!</p></div>`;
        return;
    }

    audioContainer.innerHTML = filtered.map(item => {
        const isFav = favorites.includes(item.code);
        return `
            <div class="group bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-xl transition-all duration-300 flex flex-col relative">
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
                    <a href="${item.url}" target="_blank" class="flex-1 inline-flex items-center justify-center py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all gap-2 shadow-sm active:scale-95">শুনুন</a>
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
            <button onclick="viewPDF('pdf/${pdf.filename}', '${pdf.title_bn}')" class="mt-auto inline-flex items-center justify-center w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">
                পিডিএফ পড়ুন
            </button>
        </div>
    `).join('');
}

window.viewPDF = (url, title) => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    const modalTitle = document.getElementById('pdf-modal-title');
    
    modalTitle.innerText = title;
    
    // On mobile, standard iframe can be problematic. 
    // We use standard URL first, but for wide compatibility, we could use Google Docs viewer if needed.
    // frame.src = `https://docs.google.com/viewer?url=${window.location.origin}/${url}&embedded=true`;
    frame.src = url;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
};

window.closePDF = () => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    
    modal.classList.add('hidden');
    frame.src = '';
    document.body.style.overflow = 'auto'; // Restore scrolling
};

window.toggleFavorite = (code) => {
    if (favorites.includes(code)) favorites = favorites.filter(c => c !== code);
    else favorites.push(code);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    renderAudio();
};

window.copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => {
        toast.classList.add('opacity-100');
        setTimeout(() => toast.classList.remove('opacity-100'), 2000);
    });
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

init();
