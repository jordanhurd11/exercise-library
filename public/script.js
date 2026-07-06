// ── Config ────────────────────────────────────────────────────────
var EXERCISES_PER_PAGE = 20;

// ── State ─────────────────────────────────────────────────────────
var allExercises      = [];
var filteredExercises = [];
var favorites         = [];
var currentPage       = 1;

// ── DOM refs ──────────────────────────────────────────────────────
var searchInput     = document.getElementById('searchInput');
var categoryFilter  = document.getElementById('categoryFilter');
var equipmentFilter = document.getElementById('equipmentFilter');
var sortSelect      = document.getElementById('sortSelect');
var resetBtn        = document.getElementById('resetBtn');
var retryBtn        = document.getElementById('retryBtn');

var loadingState = document.getElementById('loadingState');
var errorState   = document.getElementById('errorState');
var emptyState   = document.getElementById('emptyState');
var exerciseGrid = document.getElementById('exerciseGrid');
var pagination   = document.getElementById('pagination');
var resultsCount = document.getElementById('resultsCount');
var pageInfo     = document.getElementById('pageInfo');
var prevPageBtn  = document.getElementById('prevPageBtn');
var nextPageBtn  = document.getElementById('nextPageBtn');

var detailModal   = document.getElementById('detailModal');
var modalBackdrop = document.getElementById('modalBackdrop');
var modalCloseBtn = document.getElementById('modalCloseBtn');
var modalBody     = document.getElementById('modalBody');

// ── Fetch via Vercel proxy ────────────────────────────────────────
function fetchExercises(params) {
    var qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetch('/api/exercises' + qs).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    });
}

// ── Bootstrap ─────────────────────────────────────────────────────
function init() {
    favorites = JSON.parse(localStorage.getItem('exerciseLibFavs') || '[]');
    fetchExercises()
        .then(function(data) {
            // Log raw shape so we can verify field names in DevTools
            console.log('MuscleWiki raw response:', data);

            // Handle both array response and paginated {results:[]} response
            var raw = Array.isArray(data) ? data
                    : Array.isArray(data.results) ? data.results
                    : [];

            allExercises = raw.map(processExercise).filter(function(ex) {
                return ex.name;
            });

            populateFilterDropdowns();
            applyFiltersAndRender();
            showGrid();
            renderFavoritesStrip();
        })
        .catch(function(err) {
            console.error(err);
            showError();
        });
}

// ── Normalise one exercise from MuscleWiki ────────────────────────
// Field names are guesses based on common API patterns.
// After first deploy, open /api/debug in your browser and
// check the console log to verify these match the real response.
function processExercise(raw) {
    var name = raw.name || raw.title || raw.exercise_name || '';

    var gif = raw.gif_url || raw.gifUrl || raw.gif || raw.animation_url || null;
    var image = raw.image || raw.image_url || raw.thumbnail || gif || null;

    var category = raw.category || raw.muscle || raw.muscle_group ||
                   raw.primary_muscle || raw.bodyPart || '';
    if (typeof category === 'object' && category !== null) {
        category = category.name || category.title || '';
    }

    var equipment = raw.equipment || raw.equipment_type || '';
    if (typeof equipment === 'object' && equipment !== null) {
        equipment = equipment.name || equipment.title || '';
    }
    var equipArr = equipment
        ? (Array.isArray(equipment) ? equipment : [equipment])
        : [];

    var secondary = raw.secondary_muscles || raw.muscles_secondary || raw.secondaryMuscles || [];
    if (!Array.isArray(secondary)) secondary = [secondary].filter(Boolean);

    var description = raw.instructions || raw.description || raw.steps || '';
    if (Array.isArray(description)) description = description.join(' ');
    description = stripHtml(String(description));

    return {
        id:         raw.id,
        name:       stripHtml(String(name)),
        gif:        gif,
        image:      image,
        category:   String(category),
        categoryId: raw.category_id || raw.category || String(category),
        equipment:  equipArr.map(function(e) { return typeof e === 'object' ? (e.name || '') : String(e); }),
        muscles:    secondary,
        description: description
    };
}

function stripHtml(str) {
    return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Dropdowns ─────────────────────────────────────────────────────
function populateFilterDropdowns() {
    var categories = {}, equipment = {};

    allExercises.forEach(function(ex) {
        if (ex.category) categories[ex.category] = ex.category;
        ex.equipment.forEach(function(e) { if (e) equipment[e] = e; });
    });

    Object.keys(categories).sort().forEach(function(name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        categoryFilter.appendChild(opt);
    });

    Object.keys(equipment).sort().forEach(function(name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        equipmentFilter.appendChild(opt);
    });
}

// ── Filter + sort + paginate ──────────────────────────────────────
function applyFiltersAndRender() {
    var query   = searchInput.value.trim().toLowerCase();
    var cat     = categoryFilter.value;
    var equip   = equipmentFilter.value;
    var sortVal = sortSelect.value;

    filteredExercises = allExercises.filter(function(ex) {
        var matchSearch = !query ||
            ex.name.toLowerCase().includes(query) ||
            ex.description.toLowerCase().includes(query) ||
            ex.category.toLowerCase().includes(query);
        var matchCat   = !cat   || ex.category === cat;
        var matchEquip = !equip || ex.equipment.some(function(e) { return e === equip; });
        return matchSearch && matchCat && matchEquip;
    });

    filteredExercises.sort(function(a, b) {
        if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
        if (sortVal === 'muscle')    return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
    });

    currentPage = 1;
    renderPage();
}

function renderPage() {
    var total      = filteredExercises.length;
    var totalPages = Math.max(1, Math.ceil(total / EXERCISES_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;

    var start = (currentPage - 1) * EXERCISES_PER_PAGE;
    var slice = filteredExercises.slice(start, start + EXERCISES_PER_PAGE);

    resultsCount.textContent = total + ' exercise' + (total !== 1 ? 's' : '') + ' found';

    if (total === 0) {
        exerciseGrid.classList.add('hidden');
        pagination.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    exerciseGrid.classList.remove('hidden');
    exerciseGrid.innerHTML = '';
    slice.forEach(function(ex, i) { exerciseGrid.appendChild(buildCard(ex, i)); });

    if (totalPages <= 1) {
        pagination.classList.add('hidden');
    } else {
        pagination.classList.remove('hidden');
        pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }
}

// ── Card builder ──────────────────────────────────────────────────
function buildCard(ex, animIndex) {
    var isFav = favorites.includes(ex.id);
    var card  = document.createElement('div');
    card.className = 'exercise-card';
    card.style.animationDelay = (animIndex * 0.03) + 's';

    var tagsHtml = '';
    if (ex.category) tagsHtml += '<span class="tag tag-cat">' + ex.category + '</span>';
    ex.equipment.forEach(function(e) { tagsHtml += '<span class="tag tag-equip">' + e + '</span>'; });
    ex.muscles.slice(0, 2).forEach(function(m) { tagsHtml += '<span class="tag tag-muscle">' + m + '</span>'; });

    var descSnippet = ex.description
        ? ex.description.slice(0, 110) + (ex.description.length > 110 ? '…' : '')
        : 'No description available.';

    var mediaHtml = '';
    if (ex.gif || ex.image) {
        mediaHtml =
            '<div class="card-media">' +
                (ex.gif
                    ? '<img class="card-img card-still" src="' + (ex.image || ex.gif) + '" alt="' + ex.name + '" loading="lazy">' +
                      '<img class="card-img card-gif hidden" src="' + ex.gif + '" alt="' + ex.name + '" loading="lazy">'
                    : '<img class="card-img" src="' + ex.image + '" alt="' + ex.name + '" loading="lazy">') +
                (ex.gif ? '<span class="gif-badge">GIF</span>' : '') +
            '</div>';
    }

    card.innerHTML =
        mediaHtml +
        '<div class="card-header">' +
            '<div class="card-name">' + ex.name + '</div>' +
            '<button class="card-fav ' + (isFav ? 'active' : '') + '" data-id="' + ex.id + '">' +
                (isFav ? '★' : '☆') +
            '</button>' +
        '</div>' +
        '<div class="card-tags">' + tagsHtml + '</div>' +
        '<div class="card-desc">' + descSnippet + '</div>' +
        '<div class="card-footer"><span class="card-detail-link">View details →</span></div>';

    if (ex.gif) {
        var still = card.querySelector('.card-still');
        var anim  = card.querySelector('.card-gif');
        card.addEventListener('mouseenter', function() {
            still.classList.add('hidden');
            anim.classList.remove('hidden');
        });
        card.addEventListener('mouseleave', function() {
            anim.classList.add('hidden');
            still.classList.remove('hidden');
        });
    }

    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('card-fav')) return;
        openModal(ex);
    });
    card.querySelector('.card-fav').addEventListener('click', function(e) {
        e.stopPropagation();
        toggleFavorite(ex.id, this);
    });

    return card;
}

// ── Favorites ─────────────────────────────────────────────────────
function toggleFavorite(id, btn) {
    var idx = favorites.indexOf(id);
    if (idx === -1) {
        favorites.push(id);
        if (btn) { btn.textContent = '★'; btn.classList.add('active'); }
    } else {
        favorites.splice(idx, 1);
        if (btn) { btn.textContent = '☆'; btn.classList.remove('active'); }
    }
    localStorage.setItem('exerciseLibFavs', JSON.stringify(favorites));
    renderFavoritesStrip();
}

function renderFavoritesStrip() {
    var existing = document.getElementById('favSection');
    if (favorites.length === 0) { if (existing) existing.remove(); return; }

    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'favSection';
        existing.className = 'fav-section';
        document.querySelector('.filter-bar').insertAdjacentElement('afterend', existing);
    }

    var favExercises = favorites
        .map(function(id) { return allExercises.find(function(ex) { return ex.id === id; }); })
        .filter(Boolean);

    existing.innerHTML =
        '<div class="fav-heading">⭐ Saved Exercises (' + favExercises.length + ')</div>' +
        '<div class="fav-chips">' +
        favExercises.map(function(ex) {
            return '<span class="fav-chip" data-id="' + ex.id + '">' + ex.name + '</span>';
        }).join('') +
        '</div>';

    existing.querySelectorAll('.fav-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            var chipId = parseInt(this.dataset.id);
            var ex = allExercises.find(function(e) { return e.id === chipId; });
            if (ex) openModal(ex);
        });
    });
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal(ex) {
    var isFav = favorites.includes(ex.id);

    var mediaHtml = '';
    if (ex.gif) {
        mediaHtml = '<img class="modal-img" src="' + ex.gif + '" alt="' + ex.name + '">';
    } else if (ex.image) {
        mediaHtml = '<img class="modal-img" src="' + ex.image + '" alt="' + ex.name + '">';
    }

    var secondaryHtml = ex.muscles.map(function(m) {
        return '<span class="muscle-badge secondary">' + m + '</span>';
    }).join('');

    var equipStr = ex.equipment.length ? ex.equipment.join(', ') : 'Bodyweight / no equipment';

    var descHtml = ex.description
        ? '<p>' + ex.description.replace(/\n+/g, '</p><p>') + '</p>'
        : '<p>No description available.</p>';

    modalBody.innerHTML =
        mediaHtml +
        '<div class="modal-title">' + ex.name + '</div>' +
        '<div class="modal-tags">' +
            (ex.category ? '<span class="tag tag-cat">' + ex.category + '</span>' : '') +
            ex.equipment.map(function(e) { return '<span class="tag tag-equip">' + e + '</span>'; }).join('') +
        '</div>' +
        '<div class="modal-section-label">Muscle Group</div>' +
        '<div class="modal-muscles"><span class="muscle-badge">' + (ex.category || 'Unknown') + '</span></div>' +
        (ex.muscles.length
            ? '<div class="modal-section-label">Secondary Muscles</div><div class="modal-muscles">' + secondaryHtml + '</div>'
            : '') +
        '<div class="modal-section-label">Equipment</div>' +
        '<div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:4px;">' + equipStr + '</div>' +
        (ex.description
            ? '<div class="modal-section-label">Instructions</div><div class="modal-description">' + descHtml + '</div>'
            : '') +
        '<button class="modal-add-btn" id="modalFavBtn">' +
            (isFav ? '★ Remove from Saved' : '☆ Save Exercise') +
        '</button>';

    document.getElementById('modalFavBtn').addEventListener('click', function() {
        toggleFavorite(ex.id, null);
        var nowFav = favorites.includes(ex.id);
        this.textContent = nowFav ? '★ Remove from Saved' : '☆ Save Exercise';
        var cardBtn = exerciseGrid.querySelector('[data-id="' + ex.id + '"]');
        if (cardBtn) { cardBtn.textContent = nowFav ? '★' : '☆'; cardBtn.classList.toggle('active', nowFav); }
    });

    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ── State helpers ─────────────────────────────────────────────────
function showGrid() {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
}

function showError() {
    loadingState.classList.add('hidden');
    exerciseGrid.classList.add('hidden');
    errorState.classList.remove('hidden');
}

// ── Events ────────────────────────────────────────────────────────
searchInput.addEventListener('input', applyFiltersAndRender);
categoryFilter.addEventListener('change', applyFiltersAndRender);
equipmentFilter.addEventListener('change', applyFiltersAndRender);
sortSelect.addEventListener('change', applyFiltersAndRender);

resetBtn.addEventListener('click', function() {
    searchInput.value = '';
    categoryFilter.value = '';
    equipmentFilter.value = '';
    sortSelect.value = 'name-asc';
    applyFiltersAndRender();
});

retryBtn.addEventListener('click', function() {
    errorState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    init();
});

prevPageBtn.addEventListener('click', function() {
    if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo(0, 0); }
});
nextPageBtn.addEventListener('click', function() {
    var tp = Math.ceil(filteredExercises.length / EXERCISES_PER_PAGE);
    if (currentPage < tp) { currentPage++; renderPage(); window.scrollTo(0, 0); }
});

modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

// ── Start ─────────────────────────────────────────────────────────
init();
