(() => {
  const config = window.LIQUID_LAB_ADMIN_CONFIG;
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');
  const dashboardMessage = document.getElementById('dashboardMessage');
  const productGrid = document.getElementById('productGrid');
  const historyList = document.getElementById('historyList');
  const ownerIdentity = document.getElementById('ownerIdentity');
  const signOutButton = document.getElementById('signOutButton');
  const refreshButton = document.getElementById('refreshButton');
  const announcementForm = document.getElementById('announcementForm');
  const announcementEnabled = document.getElementById('announcementEnabled');
  const announcementTitleInput = document.getElementById('announcementTitleInput');
  const announcementMessageInput = document.getElementById('announcementMessageInput');
  const announcementStyle = document.getElementById('announcementStyle');
  const announcementButtonText = document.getElementById('announcementButtonText');
  const announcementButtonUrl = document.getElementById('announcementButtonUrl');
  const announcementPreview = document.getElementById('announcementPreview');
  const announcementMessageStatus = document.getElementById('announcementMessageStatus');
  const saveAnnouncementButton = document.getElementById('saveAnnouncementButton');

  if (!config || !window.supabase) {
    loginMessage.textContent = 'Admin configuration could not be loaded.';
    loginMessage.classList.add('error');
    return;
  }

  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  let expandedProductId = '';
  let access = null;
  let accessGeneration = 0;
  let accessRefreshGeneration = 0;
  let editingAdmin = '';
  let accessRows = [];
  let accessListGeneration = 0;
  const accessPanel = document.getElementById('adminAccessPanel');
  const accessForm = document.getElementById('adminAccessForm');
  const accessEmail = document.getElementById('adminAccessEmail');
  const accessList = document.getElementById('adminAccessList');
  const accessMessage = document.getElementById('adminAccessMessage');
  const saveAccess = document.getElementById('saveAdminAccess');
  const cancelEdit = document.getElementById('cancelAdminEdit');
  const permissionLabels = {
    availability: 'Product availability', sales: 'Sales and discounts',
    announcements: 'Announcements', view_orders: 'View purchases', update_orders: 'Update order status'
  };

  function can(permission) { return access?.role === 'owner' || access?.permissions?.includes(permission); }
  function showMessage(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('error', error);
  }

  function escapeAttribute(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  async function renderDashboard(session) {
    const current = ++accessGeneration;
    access = null;
    ++accessListGeneration;
    accessPanel.hidden = true;
    accessList.replaceChildren();
    accessRows = [];
    dashboardView.hidden = true;
    loginView.hidden = false;
    ownerIdentity.textContent = '';
    if (!session) {
      signOutButton.hidden = true;
      return;
    }
    signOutButton.hidden = false;
    try {
      const { data: identity, error: identityError } = await db.auth.getUser();
      if (current !== accessGeneration) return;
      if (identityError || !identity?.user) throw new Error('Your login could not be verified. Sign in again.');
      const { data, error } = await db.rpc('liquidlab_my_admin_access');
      if (current !== accessGeneration) return;
      if (error) throw new Error('Admin access could not be checked. Run ADMIN-ACCESS.sql or try again shortly.');
      if (!data || !['owner','admin'].includes(data.role)) {
        showMessage(loginMessage, 'This email does not have admin access. Ask an owner to add it.', true);
        await db.auth.signOut();
        return;
      }
      access = data;
      loginView.hidden = true;
      dashboardView.hidden = false;
      ownerIdentity.textContent = `${identity.user.email} · ${access.role === 'owner' ? 'Owner' : 'Admin'}`;
      document.querySelector('.announcement-panel').hidden = !can('announcements');
      document.getElementById('recentPurchasesLink').hidden = !can('view_orders');
      // An existing inline display style must not override hidden.
      document.getElementById('recentPurchasesLink').style.display = can('view_orders') ? 'inline-flex' : 'none';
      accessPanel.hidden = access.role !== 'owner';
      resetAdminForm();
      await Promise.all([loadDashboard(), access.role === 'owner' ? loadAdminList() : Promise.resolve()]);
    } catch (error) {
      if (current !== accessGeneration) return;
      loginView.hidden = false;
      dashboardView.hidden = true;
      showMessage(loginMessage, error.message || 'Admin access could not be verified.', true);
    }
  }

  function statusButtons(currentStatus, onChange) {
    const actions = document.createElement('div');
    actions.className = 'status-actions';
    if (!can('availability')) {
      const label = document.createElement('span');
      label.textContent = currentStatus === 'paused' ? 'Paused' : 'Available';
      actions.append(label);
      return actions;
    }
    ['available', 'paused'].forEach(nextStatus => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `status-button ${nextStatus} ${currentStatus === nextStatus ? 'active' : ''}`;
      button.textContent = nextStatus === 'available' ? 'Available' : 'Pause';
      button.addEventListener('click', onChange(nextStatus));
      actions.appendChild(button);
    });
    return actions;
  }

  function saleEditor(record, table, idColumn, idValue, row) {
    if (!can('sales')) return document.createDocumentFragment();
    const panel = document.createElement('details');
    panel.className = `sale-editor ${record.sale_enabled ? 'sale-live' : ''}`;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span><strong>${record.sale_enabled ? '🔥 SALE LIVE' : 'Add a sale'}</strong><small>${record.sale_enabled ? `${escapeAttribute(record.sale_label || 'SALE')} • $${Number(record.sale_price).toFixed(2)}` : 'Special price + Stripe checkout link'}</small></span><b>+</b>`;

    const form = document.createElement('form');
    form.className = 'sale-form';
    form.innerHTML = `
      <label>Sale price<input class="sale-price-input" type="number" min="0.01" step="0.01" placeholder="19.99" value="${escapeAttribute(record.sale_price)}"></label>
      <label>Sale badge<input class="sale-label-input" type="text" maxlength="30" placeholder="WEEKEND SALE" value="${escapeAttribute(record.sale_label)}"></label>
      <label class="sale-link-field">Discounted Stripe link<input class="sale-link-input" type="url" maxlength="500" placeholder="https://buy.stripe.com/..." value="${escapeAttribute(record.sale_link)}"></label>
      <div class="sale-form-actions">
        <button class="primary-button start-sale-button" type="submit">${record.sale_enabled ? 'Update Sale' : 'Start Sale'}</button>
        <button class="ghost-button end-sale-button" type="button" ${record.sale_enabled ? '' : 'disabled'}>End Sale</button>
      </div>`;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const price = Number(form.querySelector('.sale-price-input').value);
      const label = form.querySelector('.sale-label-input').value.trim() || 'SALE';
      const link = form.querySelector('.sale-link-input').value.trim();
      if (!Number.isFinite(price) || price <= 0 || !/^https:\/\//i.test(link)) {
        showMessage(dashboardMessage, 'Enter a valid sale price and full https:// Stripe link.', true);
        return;
      }
      await updateSale(table, idColumn, idValue, { sale_enabled: true, sale_price: price, sale_label: label, sale_link: link }, row);
    });

    form.querySelector('.end-sale-button').addEventListener('click', async () => {
      await updateSale(table, idColumn, idValue, { sale_enabled: false }, row);
    });

    panel.append(summary, form);
    return panel;
  }

  function productRow(product, options) {
    const row = document.createElement('article');
    row.className = `admin-product product-accordion ${product.status}`;
    row.dataset.productId = product.product_id;
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'product-summary';
    summary.setAttribute('aria-expanded', String(expandedProductId === product.product_id));
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = product.product_name;
    const status = document.createElement('span');
    status.className = 'status-label';
    status.textContent = product.status === 'paused' ? 'Paused on public store' : 'Available on public store';
    info.append(title, status);
    const chevron = document.createElement('span');
    chevron.className = 'accordion-chevron';
    chevron.textContent = '⌄';
    summary.append(info, chevron);

    const body = document.createElement('div');
    body.className = 'product-accordion-body';
    body.hidden = expandedProductId !== product.product_id;

    const wholeProduct = document.createElement('div');
    wholeProduct.className = 'control-row main-control-row';
    const wholeLabel = document.createElement('div');
    wholeLabel.innerHTML = '<strong>Entire product</strong><small>Pause every option and block checkout</small>';
    wholeProduct.append(wholeLabel, statusButtons(product.status, nextStatus => event => {
      event.stopPropagation();
      updateStatus(product.product_id, nextStatus, row);
    }));
    body.appendChild(wholeProduct);
    const instantProduct = product.product_id === 'premium-modded-account';
    if (!instantProduct) body.appendChild(saleEditor(product, 'product_controls', 'product_id', product.product_id, row));

    if (instantProduct) {
      const note = document.createElement('p');
      note.className = 'no-options';
      note.textContent = 'Manage BO2, BO3, and BO2 + BO3 prices, included items, stock, and checkout links in Instant Account Delivery.';
      body.appendChild(note);
      if (access?.role === 'owner') {
        const link = document.createElement('a'); link.href = '#instantAccountsPanel';
        link.className = 'admin-home-button'; link.textContent = 'Open Account Inventory';
        body.appendChild(link);
      }
    } else if (options.length) {
      const optionHeading = document.createElement('p');
      optionHeading.className = 'option-heading';
      optionHeading.textContent = 'DROPDOWN OPTIONS';
      body.appendChild(optionHeading);
      options.forEach(option => {
        const optionRow = document.createElement('div');
        optionRow.className = `control-row option-control-row ${option.status}`;
        const optionInfo = document.createElement('div');
        const optionName = document.createElement('strong');
        optionName.textContent = option.option_name;
        const optionState = document.createElement('small');
        optionState.textContent = option.status === 'paused' ? 'Unavailable on store' : 'Available on store';
        optionInfo.append(optionName, optionState);
        optionRow.append(optionInfo, statusButtons(option.status, nextStatus => () => updateOptionStatus(option.id, nextStatus, row)));
        body.appendChild(optionRow);
        body.appendChild(saleEditor(option, 'product_option_controls', 'id', option.id, row));
      });
    } else {
      const noOptions = document.createElement('p');
      noOptions.className = 'no-options';
      noOptions.textContent = 'This product has no dropdown options.';
      body.appendChild(noOptions);
    }

    summary.addEventListener('click', () => {
      const opening = body.hidden;
      document.querySelectorAll('.product-accordion-body').forEach(panel => { panel.hidden = true; });
      document.querySelectorAll('.product-summary').forEach(button => button.setAttribute('aria-expanded', 'false'));
      body.hidden = !opening;
      summary.setAttribute('aria-expanded', String(opening));
      expandedProductId = opening ? product.product_id : '';
    });

    row.append(summary, body);
    return row;
  }

  async function loadDashboard() {
    const current = accessGeneration;
    if (!access) return;
    showMessage(dashboardMessage, '');
    productGrid.innerHTML = '<p class="empty">Loading products…</p>';
    const [{ data: products, error: productError }, { data: options, error: optionError }, { data: history, error: historyError }] = await Promise.all([
      db.from('product_controls').select('product_id,product_name,status,sort_order,sale_enabled,sale_price,sale_label,sale_link').order('sort_order'),
      db.from('product_option_controls').select('id,product_id,option_index,option_name,status,sale_enabled,sale_price,sale_label,sale_link').order('option_index'),
      db.from('product_change_log').select('product_name,old_status,new_status,changed_by,changed_at').order('changed_at', { ascending: false }).limit(25)
    ]);
    if (current !== accessGeneration || !access) return;

    await loadAnnouncement();
    if (current !== accessGeneration || !access) return;

    if (productError) {
      productGrid.innerHTML = '';
      showMessage(dashboardMessage, `Could not load products: ${productError.message}`, true);
      return;
    }

    productGrid.innerHTML = '';
    products.forEach(product => productGrid.appendChild(productRow(product, optionError ? [] : options.filter(option => option.product_id === product.product_id))));
    if (!products.length) productGrid.innerHTML = '<p class="empty">No products found. Run the included Supabase setup file.</p>';

    historyList.innerHTML = '';
    if (historyError || !history?.length) {
      historyList.innerHTML = '<p class="empty">No admin changes yet.</p>';
      return;
    }
    history.forEach(item => {
      const row = document.createElement('div');
      row.className = 'history-item';
      const detail = document.createElement('div');
      detail.textContent = `${item.product_name}: ${item.old_status || 'new'} → ${item.new_status}`;
      const meta = document.createElement('small');
      meta.textContent = `${item.changed_by} • ${new Date(item.changed_at).toLocaleString()}`;
      row.append(detail, meta);
      historyList.appendChild(row);
    });
  }

  function updateAnnouncementPreview() {
    announcementPreview.dataset.style = announcementStyle.value;
    announcementPreview.querySelector('strong').textContent = announcementTitleInput.value.trim() || 'Service Update';
    announcementPreview.querySelector('span').textContent = announcementMessageInput.value.trim() || 'Your announcement preview appears here.';
  }

  async function loadAnnouncement() {
    if (!can('announcements')) return;
    const { data, error } = await db.from('site_announcement').select('*').eq('id', 1).maybeSingle();
    if (error) {
      showMessage(announcementMessageStatus, `Could not load announcement: ${error.message}`, true);
      return;
    }
    if (!data) return;
    announcementEnabled.checked = data.enabled;
    announcementTitleInput.value = data.title || '';
    announcementMessageInput.value = data.message || '';
    announcementStyle.value = data.style || 'info';
    announcementButtonText.value = data.button_text || '';
    announcementButtonUrl.value = data.button_url || '';
    updateAnnouncementPreview();
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const title = announcementTitleInput.value.trim();
    const message = announcementMessageInput.value.trim();
    if (announcementEnabled.checked && (!title || !message)) {
      showMessage(announcementMessageStatus, 'Add both a title and message before turning the announcement on.', true);
      return;
    }
    saveAnnouncementButton.disabled = true;
    showMessage(announcementMessageStatus, 'Publishing…');
    const { data: savedAnnouncement, error } = await db.from('site_announcement').update({
      enabled: announcementEnabled.checked,
      title,
      message,
      style: announcementStyle.value,
      button_text: announcementButtonText.value.trim(),
      button_url: announcementButtonUrl.value.trim()
    }).eq('id', 1).select('id').maybeSingle();
    saveAnnouncementButton.disabled = false;
    const saveError = error || (!savedAnnouncement ? new Error('Supabase did not update the announcement. Refresh your permissions or run ADMIN-ACCESS.sql.') : null);
    showMessage(announcementMessageStatus, saveError ? `Could not publish: ${saveError.message}` : 'Published. Refresh the public website to see it.', Boolean(saveError));
  }

  async function updateStatus(productId, status, row) {
    row.querySelectorAll('button').forEach(button => button.disabled = true);
    const { data: savedProduct, error } = await db.from('product_controls').update({ status }).eq('product_id', productId).select('product_id').maybeSingle();
    const saveError = error || (!savedProduct ? new Error('Supabase did not update this product. Refresh your permissions or run ADMIN-ACCESS.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save: ${saveError.message}`, true);
      row.querySelectorAll('button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, 'Saved. The public store will use the new status on refresh.');
    await loadDashboard();
  }

  async function updateOptionStatus(optionId, status, row) {
    row.querySelectorAll('button').forEach(button => button.disabled = true);
    const { data: savedOption, error } = await db.from('product_option_controls').update({ status }).eq('id', optionId).select('id').maybeSingle();
    const saveError = error || (!savedOption ? new Error('Supabase did not update this option. Refresh your permissions or run ADMIN-ACCESS.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save option: ${saveError.message}`, true);
      row.querySelectorAll('button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, 'Option saved. Refresh the public store to see the change.');
    await loadDashboard();
  }

  async function updateSale(table, idColumn, idValue, payload, row) {
    row.querySelectorAll('.sale-form button').forEach(button => button.disabled = true);
    const { data, error } = await db.from(table).update(payload).eq(idColumn, idValue).select(idColumn).maybeSingle();
    const saveError = error || (!data ? new Error('Supabase did not update this sale. Refresh your permissions or run ADMIN-ACCESS.sql.') : null);
    if (saveError) {
      showMessage(dashboardMessage, `Could not save sale: ${saveError.message}`, true);
      row.querySelectorAll('.sale-form button').forEach(button => button.disabled = false);
      return;
    }
    showMessage(dashboardMessage, payload.sale_enabled === false ? 'Sale ended. The regular price and link are restored.' : 'Sale is live. Refresh the public store to see it.');
    await loadDashboard();
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const email = loginForm.email.value.trim().toLowerCase();
    showMessage(loginMessage, 'Sending secure login link…');
    const redirectTo = new URL('admin.html', window.location.href).href.split('#')[0].split('?')[0];
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    showMessage(loginMessage, error ? error.message : 'Check your email and click the secure login link.', Boolean(error));
  });

  signOutButton.addEventListener('click', async () => { await db.auth.signOut(); });
  refreshButton.addEventListener('click', () => { void refreshAccess(true); });
  announcementForm.addEventListener('submit', saveAnnouncement);
  [announcementTitleInput, announcementMessageInput, announcementStyle].forEach(input => input.addEventListener('input', updateAnnouncementPreview));
  db.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (access && session && ['TOKEN_REFRESHED','SIGNED_IN'].includes(event)) void refreshAccess();
      else void renderDashboard(session);
    }, 0);
  });
  db.auth.getSession().then(({ data }) => renderDashboard(data.session));
  async function refreshAccess(force = false) {
    const { data, error } = await db.auth.getSession();
    if (error || !data?.session || !access) { await renderDashboard(error ? null : data?.session); return; }
    const current = accessGeneration;
    const refresh = ++accessRefreshGeneration;
    const { data: fresh, error: accessError } = await db.rpc('liquidlab_my_admin_access');
    if (current !== accessGeneration || refresh !== accessRefreshGeneration) return;
    if (accessError) {
      showMessage(dashboardMessage, 'Could not refresh permissions. Try again shortly.', true);
      return;
    }
    if (JSON.stringify(fresh) !== JSON.stringify(access)) { await renderDashboard(data.session); return; }
    if (force) await Promise.all([loadDashboard(), access.role === 'owner' ? loadAdminList() : Promise.resolve()]);
  }
  window.addEventListener('focus', () => { void refreshAccess(); });
  setInterval(() => { if (!document.hidden && access) void refreshAccess(); }, 60000);

  function resetAdminForm() {
    editingAdmin = '';
    accessForm.reset();
    accessEmail.readOnly = false;
    saveAccess.textContent = 'Add Admin';
    cancelEdit.hidden = true;
  }
  function editAdmin(row) {
    editingAdmin = row.email;
    accessEmail.value = row.email;
    accessEmail.readOnly = true;
    for (const input of accessForm.querySelectorAll('[name="permission"]')) input.checked = row.permissions.includes(input.value);
    saveAccess.textContent = 'Save permissions';
    cancelEdit.hidden = false;
    showMessage(accessMessage, `Editing permissions for ${row.email}`);
    accessForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function loadAdminList() {
    const current = ++accessListGeneration;
    if (access?.role !== 'owner') return;
    accessList.textContent = 'Loading admin access…';
    const { data, error } = await db.from('liquidlab_admin_access')
      .select('email,role,permissions,added_by,added_at,updated_by,updated_at').order('added_at');
    if (current !== accessListGeneration || access?.role !== 'owner') return;
    accessList.replaceChildren();
    if (error) { showMessage(accessMessage, `Could not load admin access: ${error.message}`, true); return; }
    accessRows = data || [];
    const ownerCount = accessRows.filter(row => row.role === 'owner').length;
    const adminCount = accessRows.filter(row => row.role === 'admin').length;
    document.getElementById('adminAccessCount').textContent = `${ownerCount} owner${ownerCount === 1 ? '' : 's'} · ${adminCount} admin${adminCount === 1 ? '' : 's'}`;
    for (const record of accessRows) {
      const row = document.createElement('article'); row.className = 'admin-access-row';
      const info = document.createElement('div'); info.className = 'admin-access-info';
      const email = document.createElement('strong'); email.textContent = record.email;
      const role = document.createElement('span'); role.className = 'admin-role'; role.textContent = record.role;
      const permissions = document.createElement('p'); permissions.textContent = record.role === 'owner'
        ? 'Full access · Manages admin access' : record.permissions.map(key => permissionLabels[key]).filter(Boolean).join(' · ') || 'View-only store panel';
      const meta = document.createElement('small'); meta.textContent = `Added ${new Date(record.added_at).toLocaleDateString()}${record.added_by !== 'SQL setup' ? ` by ${record.added_by}` : ''}`;
      info.append(email, role, permissions, meta); row.append(info);
      if (record.role === 'admin') {
        const actions = document.createElement('div'); actions.className = 'admin-access-row-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'ghost-button'; edit.textContent = 'Edit permissions'; edit.addEventListener('click', () => editAdmin(record));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ghost-button admin-access-remove'; remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
          if (!confirm(`Remove admin access for ${record.email}?`)) return;
          remove.disabled = true;
          try {
            const { data, error } = await db.rpc('liquidlab_remove_admin', { target_email: record.email });
            if (error) throw error;
            if (!data) throw new Error('This admin was already removed.');
            if (editingAdmin === record.email) resetAdminForm();
            showMessage(accessMessage, `Removed access for ${record.email}.`);
            await loadAdminList();
          } catch (error) { showMessage(accessMessage, error.message || 'Could not remove admin access.', true); remove.disabled = false; }
        });
        actions.append(edit, remove); row.append(actions);
      }
      accessList.append(row);
    }
  }
  cancelEdit.addEventListener('click', () => { resetAdminForm(); showMessage(accessMessage, ''); });
  accessForm.addEventListener('change', event => {
    const view = accessForm.querySelector('[value="view_orders"]');
    const update = accessForm.querySelector('[value="update_orders"]');
    if (event.target === update && update.checked) view.checked = true;
    if (event.target === view && !view.checked) update.checked = false;
  });
  accessForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (access?.role !== 'owner') return;
    const email = accessEmail.value.trim().toLowerCase();
    if (!editingAdmin && accessRows.some(row => row.email === email)) { showMessage(accessMessage, 'This email already has access. Use Edit permissions.', true); return; }
    const permissions = [...accessForm.querySelectorAll('[name="permission"]:checked')].map(input => input.value);
    saveAccess.disabled = true; cancelEdit.disabled = true;
    showMessage(accessMessage, 'Saving admin access…');
    try {
      const { error } = await db.rpc('liquidlab_save_admin', { target_email: email, requested_permissions: permissions, replace_existing: Boolean(editingAdmin) });
      if (error) throw error;
      resetAdminForm();
      showMessage(accessMessage, `Saved access for ${email}. They can sign in using the existing email login.`);
      await loadAdminList();
    } catch (error) { showMessage(accessMessage, error.message || 'Could not save admin access.', true); }
    finally { saveAccess.disabled = false; cancelEdit.disabled = false; }
  });
})();
