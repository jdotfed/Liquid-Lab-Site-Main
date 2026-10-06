(() => {
  'use strict';
  const ticket = 'https://discord.gg/liquidlab';
  const links = window.LIQUID_LAB_BO2_ZM_LINKS || {};
  const pairs = [
    ['bo2ZmRecoveryOption', 'bo2ZmRecoveryPrice', 'bo2ZmRecoveryDetails', 'bo2ZmRecoveryBuy'],
    ['bo2ZmUnlockOption', 'bo2ZmUnlockPrice', 'bo2ZmUnlockDetails', 'bo2ZmUnlockBuy'],
    ['bo2ZmPerksOption', 'bo2ZmPerksPrice', 'bo2ZmPerksDetails', 'bo2ZmPerksBuy']
  ];
  function checkoutUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password
        && (url.hostname === 'buy.stripe.com' || url.hostname === 'sellix.io'
          || url.hostname.endsWith('.sellix.io')) ? url.href : null;
    } catch { return null; }
  }
  for (const [selectId, priceId, detailsId, buyId] of pairs) {
    const select = document.getElementById(selectId);
    const price = document.getElementById(priceId);
    const details = document.getElementById(detailsId);
    const buy = document.getElementById(buyId);
    if (!select || !price || !details || !buy) continue;
    const card = select.closest('.product-card');
    for (const option of select.options) {
      const link = option.dataset.ticketOnly === 'true' ? null : checkoutUrl(links[option.dataset.checkoutKey]);
      option.dataset.link = link || ticket;
      option.dataset.ticket = String(!link);
    }
    function update() {
      const selected = select.selectedOptions[0];
      if (!selected) return;
      price.textContent = `$${Number(selected.value).toFixed(2)}`;
      details.textContent = selected.dataset.details || '';
      const customStats = document.getElementById('bo2ZmStatsHelp');
      if (selectId === 'bo2ZmUnlockOption' && customStats) customStats.hidden = selected.dataset.ticketOnly !== 'true';
      const navcards = document.getElementById('bo2ZmNavcards');
      if (selectId === 'bo2ZmRecoveryOption' && navcards) {
        navcards.hidden = selected.dataset.checkoutKey !== 'fullRecovery';
        if (navcards.hidden) navcards.open = false;
      }
      if (selectId === 'bo2ZmPerksOption') document.getElementById('bo2ZmPerksPriceLabel').textContent = selected.dataset.ticketOnly === 'true' ? 'PRICE EACH' : 'PRICE';
      if (card.dataset.paused === 'true' || select.disabled || selected.disabled) {
        buy.removeAttribute('href');
        buy.setAttribute('aria-disabled', 'true');
        buy.setAttribute('tabindex', '-1');
        buy.textContent = 'Temporarily Unavailable';
        return;
      }
      buy.href = selected.dataset.link;
      buy.removeAttribute('aria-disabled');
      buy.removeAttribute('tabindex');
      if (selected.dataset.ticket === 'true') {
        buy.target = '_blank';
        buy.rel = 'noopener noreferrer';
        buy.innerHTML = 'Open Ticket <span>→</span>';
      } else {
        buy.removeAttribute('target');
        buy.removeAttribute('rel');
        buy.innerHTML = 'Buy Product <span>→</span>';
      }
    }
    select.addEventListener('change', update);
    update();
  }
})();
