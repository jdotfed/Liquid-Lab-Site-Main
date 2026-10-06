const filterButtons = document.querySelectorAll('.filter');
const products = [...document.querySelectorAll('.product-card')];
const subfiltersBar = document.getElementById('subfilters');

// Paused services stay visible, but every checkout path is disabled.
document.querySelectorAll('.product-card[data-paused="true"]').forEach(card => {
  card.querySelectorAll('select').forEach(select => {
    select.disabled = true;
    select.setAttribute('aria-disabled', 'true');
  });
  card.querySelectorAll('.buy-btn').forEach(button => {
    button.removeAttribute('href');
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('tabindex', '-1');
    button.textContent = 'Temporarily Unavailable';
  });
});

// Add an entry here for any main filter (data-filter value) that should
// show a row of subcategory chips. "key" must match the data-subcategory
// attribute on the matching .product-card elements.
const subcategoryMap = {
  bo2: [
    { key: 'multiplayer', label: 'Multiplayer' },
    { key: 'zombies', label: 'Zombies' }
  ],
  bo3: [
    { key: 'divinium', label: 'Divinium' },
    { key: 'crypto', label: 'Crypto Keys' },
    { key: 'single', label: 'Single Unlocks' },
    { key: 'packages', label: 'Packages' },
    { key: 'spend', label: 'Spend Service' }
  ],
  bo4: [
    { key: 'mp', label: 'Multiplayer' },
    { key: 'crate', label: 'Reserve Crates' },
    { key: 'clan', label: 'Clan Tag' },
    { key: 'rare', label: 'Rare Items' }
  ]
  
  // Example for adding subcategories to BO4:
  // Test: [
  //   { key: 'unlocks', label: 'Unlocks' },
  //   { key: 'boosting', label: 'Boosting' }
  // ]
};

let activeMain = 'all';
let activeSub = 'all';

function renderSubfilters(mainFilter){
  const subs = subcategoryMap[mainFilter];
  subfiltersBar.innerHTML = '';

  if(!subs){
    subfiltersBar.classList.remove('open');
    return;
  }

  const allBtn = document.createElement('button');
  allBtn.className = 'subfilter active';
  allBtn.dataset.subfilter = 'all';
  allBtn.textContent = 'All';
  subfiltersBar.appendChild(allBtn);

  subs.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = 'subfilter';
    btn.dataset.subfilter = sub.key;
    btn.textContent = sub.label;
    subfiltersBar.appendChild(btn);
  });

  subfiltersBar.classList.add('open');
}

function applyFilters(){
  products.forEach(card => {
    const matchesMain = activeMain === 'all' || card.dataset.category === activeMain;
    const matchesSub = activeSub === 'all' || card.dataset.subcategory === activeSub;
    card.classList.toggle('hidden', !(matchesMain && matchesSub));
  });
}

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMain = btn.dataset.filter;
    activeSub = 'all';
    renderSubfilters(activeMain);
    applyFilters();
  });
});

subfiltersBar.addEventListener('click', e => {
  const btn = e.target.closest('.subfilter');
  if(!btn) return;
  subfiltersBar.querySelectorAll('.subfilter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeSub = btn.dataset.subfilter;
  applyFilters();
});

const modal = document.getElementById('searchModal');
const searchButton = document.getElementById('searchButton');
const closeSearch = document.getElementById('closeSearch');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

function closeModal(){
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
searchButton.addEventListener('click', () => {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => searchInput.focus(), 50);
});
closeSearch.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if(e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  searchResults.innerHTML = '';
  if(!q) return;

  const matched = products.filter(card => card.innerText.toLowerCase().includes(q));
  if(!matched.length){
    searchResults.innerHTML = '<div class="search-result">No matching services found.</div>';
    return;
  }

  matched.forEach(card => {
    const title = card.querySelector('h3').textContent;
    const category = card.dataset.category;
    const result = document.createElement('div');
    result.className = 'search-result';
    result.innerHTML = `<strong>${title}</strong> — ${category}`;
    result.addEventListener('click', () => {
      closeModal();
      document.getElementById('services').scrollIntoView({behavior:'smooth'});
    });
    searchResults.appendChild(result);
  });
});

// Review image lightbox: click any .review-media thumbnail to view it full size.
const lightbox = document.getElementById('reviewLightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

document.querySelectorAll('.review-media img').forEach(img => {
  img.addEventListener('click', () => {
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
  });
});

function closeLightbox(){
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
}
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if(e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeLightbox(); });

// Replace each href="#" on .sellix-link elements with your real Sellix product URL.
// Example:
// document.querySelectorAll('.sellix-link')[0].href = 'https://yourstore.sellix.io/product/...';
