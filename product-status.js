(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  if (!config || !window.supabase) return;

  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { detectSessionInUrl: false, persistSession: false }
  });

  function saleIsValid(record) {
    return Boolean(record?.sale_enabled && Number(record.sale_price) > 0 && /^https:\/\//i.test(record.sale_link || ''));
  }

  function money(value) {
    return `$${Number(value).toFixed(2)}`;
  }

  function optionControlIndex(option, fallbackIndex) {
    return option?.dataset.controlIndex === undefined
      ? fallbackIndex
      : Number(option.dataset.controlIndex);
  }

  function findControlledOption(select, rowIndex) {
    return [...select.options].find((option, index) => optionControlIndex(option, index) === Number(rowIndex));
  }

  function applySaleDisplay(card, sale, selectedOption) {
    const price = card.querySelector('.price strong');
    const button = card.querySelector('.buy-btn');
    if (!price || !button) return;

    if (!price.dataset.regularText) price.dataset.regularText = price.textContent.trim();
    if (!button.dataset.regularHref && button.getAttribute('href')) button.dataset.regularHref = button.getAttribute('href');

    card.classList.remove('sale-active');
    card.querySelector('.live-sale-badge')?.remove();

    const ticketOption = selectedOption?.value === 'ticket' || selectedOption?.dataset.ticket === 'true';
    const regularPrice = selectedOption
      ? (selectedOption.value === 'ticket' ? 'TICKET' : money(selectedOption.value))
      : price.dataset.regularText;
    const regularLink = selectedOption?.dataset.link || button.dataset.originalHref || button.dataset.regularHref;
    price.textContent = regularPrice;

    const unavailable = card.dataset.paused === 'true' || selectedOption?.disabled;
    if (!unavailable && regularLink) {
      button.href = regularLink;
      button.removeAttribute('aria-disabled');
      button.removeAttribute('tabindex');
      button.style.pointerEvents = '';
      button.style.opacity = '';
      button.style.cursor = '';
      if (ticketOption) {
        button.target = '_blank';
        button.rel = 'noreferrer';
        button.innerHTML = 'Open Ticket <span>→</span>';
      } else {
        button.removeAttribute('target');
        button.removeAttribute('rel');
        button.innerHTML = 'Buy Product <span>→</span>';
      }
    }

    if (!saleIsValid(sale) || unavailable || ticketOption) return;

    const badge = document.createElement('span');
    badge.className = 'live-sale-badge';
    badge.textContent = sale.sale_label || 'SALE';
    card.appendChild(badge);
    card.classList.add('sale-active');
    price.innerHTML = `<span class="regular-price">${regularPrice}</span><span class="discount-price">${money(sale.sale_price)}</span>`;
    button.href = sale.sale_link;
    button.innerHTML = 'Shop Sale <span>→</span>';
  }

  function setupCardSales(card, product, optionRows) {
    const select = card.querySelector('select');
    const apply = () => {
      let selectedSale = null;
      let selectedOption = null;
      if (select) {
        selectedOption = select.options[select.selectedIndex];
        optionRows.forEach(row => {
          const option = findControlledOption(select, row.option_index);
          if (!option) return;
          const base = option.dataset.originalLabel || option.textContent.replace(/ — (?:Temporarily )?Unavailable$/, '');
          option.dataset.originalLabel = base;
          option.textContent = `${base}${row.status === 'paused' ? ' — Unavailable' : saleIsValid(row) ? ` — ${row.sale_label || 'SALE'} ${money(row.sale_price)}` : ''}`;
        });
        const selectedIndex = optionControlIndex(selectedOption, select.selectedIndex);
        selectedSale = optionRows.find(row => Number(row.option_index) === selectedIndex);
      }
      applySaleDisplay(card, saleIsValid(selectedSale) ? selectedSale : product, selectedOption);
    };
    if (select) select.addEventListener('change', apply);
    apply();
  }

  function setCardStatus(card, status) {
    const paused = status === 'paused';
    card.dataset.paused = paused ? 'true' : 'false';

    const stock = card.querySelector('.stock');
    if (stock) {
      if (!stock.dataset.originalHtml) stock.dataset.originalHtml = stock.innerHTML;
      if (!stock.dataset.originalStyle) stock.dataset.originalStyle = stock.getAttribute('style') || '';
      stock.innerHTML = paused ? '<i></i> TEMPORARILY UNAVAILABLE' : '<i></i> IN STOCK';
      stock.style.color = paused ? '#aaaab4' : '';
    }

    card.querySelectorAll('select').forEach(select => {
      select.disabled = paused;
      select.setAttribute('aria-disabled', String(paused));
    });

    card.querySelectorAll('.buy-btn').forEach(button => {
      if (!button.dataset.originalHref && button.getAttribute('href')) {
        button.dataset.originalHref = button.getAttribute('href');
      }

      if (button.dataset.originalStyle === undefined) {
        button.dataset.originalStyle = button.getAttribute('style') || '';
      }

      if (paused) {
        button.removeAttribute('href');
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('tabindex', '-1');
        button.style.pointerEvents = 'none';
        button.style.opacity = '.58';
        button.style.cursor = 'not-allowed';
        button.textContent = 'Temporarily Unavailable';
        return;
      }

      const select = card.querySelector('select');
      const selectedOption = select?.options[select.selectedIndex];
      const selectedLink = selectedOption?.dataset.link;
      const ticketOption = selectedOption?.value === 'ticket' || selectedOption?.dataset.ticket === 'true';
      const restoredLink = selectedLink || button.dataset.originalHref;
      if (restoredLink) button.setAttribute('href', restoredLink);
      button.removeAttribute('aria-disabled');
      button.removeAttribute('tabindex');
      if (button.dataset.originalStyle) {
        button.setAttribute('style', button.dataset.originalStyle);
      } else {
        button.removeAttribute('style');
      }
      if (ticketOption) {
        button.target = '_blank';
        button.rel = 'noreferrer';
        button.innerHTML = 'Open Ticket <span>→</span>';
      } else {
        button.removeAttribute('target');
        button.removeAttribute('rel');
        button.innerHTML = 'Buy Product <span>→</span>';
      }
    });
  }

  function setOptionStatuses(card, optionRows) {
    const select = card.querySelector('select');
    if (!select) return;

    optionRows.forEach(row => {
      const option = findControlledOption(select, row.option_index);
      if (!option) return;
      if (!option.dataset.originalLabel) {
        option.dataset.originalLabel = option.textContent.replace(/ — (?:Temporarily )?Unavailable$/, '');
      }
      const paused = row.status === 'paused';
      option.disabled = paused;
      if (paused) {
        option.dataset.paused = 'true';
      } else {
        delete option.dataset.paused;
      }
      option.textContent = `${option.dataset.originalLabel}${paused ? ' — Unavailable' : ''}`;
    });

    if (select.options[select.selectedIndex]?.disabled) {
      const firstAvailable = [...select.options].find(option => !option.disabled);
      if (firstAvailable) {
        select.value = firstAvailable.value;
        firstAvailable.selected = true;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const allPaused = [...select.options].every(option => option.disabled);
    if (allPaused && card.dataset.paused !== 'true') {
      const button = card.querySelector('.buy-btn');
      const stock = card.querySelector('.stock');
      select.disabled = true;
      if (stock) {
        stock.innerHTML = '<i></i> TEMPORARILY UNAVAILABLE';
        stock.style.color = '#aaaab4';
      }
      if (button) {
        button.removeAttribute('href');
        button.setAttribute('aria-disabled', 'true');
        button.style.pointerEvents = 'none';
        button.style.opacity = '.58';
        button.textContent = 'Temporarily Unavailable';
      }
    }

    // Refresh the displayed price and checkout button after live statuses apply.
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function loadProductStatuses() {
    const [{ data: products, error: productError }, { data: options, error: optionError }] = await Promise.all([
      db.from('product_controls').select('product_id,status,sale_enabled,sale_price,sale_label,sale_link'),
      db.from('product_option_controls').select('product_id,option_index,status,sale_enabled,sale_price,sale_label,sale_link')
    ]);

    if (productError || !products) {
      console.warn('Live product availability could not be loaded. Using built-in website statuses.');
      return;
    }

    products.forEach(product => {
      const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
      if (card) setCardStatus(card, product.status);
    });

    if (!optionError && options) {
      products.forEach(product => {
        const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
        if (card) setOptionStatuses(card, options.filter(option => option.product_id === product.product_id));
      });
    }

    products.forEach(product => {
      const card = document.querySelector(`[data-product-id="${product.product_id}"]`);
      if (card) setupCardSales(card, product, optionError || !options ? [] : options.filter(option => option.product_id === product.product_id));
    });
  }

  loadProductStatuses();
})();
