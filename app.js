(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const cfg = window.REGISTRY_CONFIG;
  let records = [];
  let trash = [];
  let history = [];
  let tab = 'active';
  let filtersOpen = false;
  let editing = null;
  let busy = false;
  const selectedYears = new Set();
  const selectedFriendCategories = new Set();
  const selectedFriendLinks = new Set();
  const defaultFriendCategories = ['Zephry', 'Arthur', 'Eirlys', 'Willhelm'];
  const configured = cfg.SUPABASE_URL.startsWith('https://')
    && !cfg.SUPABASE_URL.includes('YOUR-PROJECT')
    && !cfg.SUPABASE_ANON_KEY.includes('YOUR_');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
  const date = (s) => s
    ? new Date(s).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const availableYears = () => {
    const savedYear = records.reduce((max, record) => Math.max(max, Number(record.year) || 0), 0);
    return Array.from(
      { length: Math.max(new Date().getFullYear(), 2015, savedYear) - 2001 + 1 },
      (_, index) => 2001 + index,
    );
  };

  function message(text, error = false) {
    $('message').textContent = text;
    $('message').className = error ? 'error' : '';
  }

  function connection(ok) {
    $('connection').textContent = ok ? '● เชื่อมต่อแล้ว' : '● ยังไม่เชื่อมต่อ';
    $('connection').className = `status ${ok ? 'online' : 'offline'}`;
  }

  async function api(action, payload = {}) {
    if (!configured) {
      throw Error('กรุณาตั้งค่า Supabase ในไฟล์ config.js ก่อนใช้งาน');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/registry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) {
        throw Error(body.error || 'การเชื่อมต่อล้มเหลว');
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function load() {
    if (busy) return;
    try {
      const data = await api('list');
      records = data.records || [];
      trash = data.trash || [];
      history = data.history || [];
      connection(true);
      render();
      message('');
    } catch (error) {
      connection(false);
      message(error.message, true);
      render();
    }
  }

  function renderCheckboxes(container, values, selected, group) {
    container.replaceChildren();
    values.forEach((value) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(value);
      checkbox.checked = selected.has(String(value));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(checkbox.value);
        else selected.delete(checkbox.value);
        render();
      });
      label.append(checkbox, document.createTextNode(String(value)));
      container.append(label);
    });
    if (!values.length) {
      const empty = document.createElement('span');
      empty.className = 'filter-empty';
      empty.textContent = group === 'owners' ? 'ยังไม่มีชื่อเพื่อนในทะเบียน' : 'ไม่มีปีให้เลือก';
      container.append(empty);
    }
  }

  function getFriendCategories() {
    const categories = new Set(defaultFriendCategories);
    [...records, ...trash].forEach((record) => {
      (record.friend_of || []).forEach((name) => categories.add(name));
    });
    history.forEach((entry) => {
      (entry.snapshot?.friend_of || []).forEach((name) => categories.add(name));
    });
    selectedFriendLinks.forEach((name) => categories.add(name));
    return [...categories].sort((a, b) => a.localeCompare(b, 'en'));
  }

  function renderFriendCategories() {
    const categories = getFriendCategories();
    const container = $('friendCategoryFilters');
    container.replaceChildren();
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = `friend-category${selectedFriendCategories.size ? '' : ' selected'}`;
    allButton.setAttribute('aria-pressed', String(selectedFriendCategories.size === 0));
    allButton.append(document.createTextNode('ทุกหมวด'));
    const allCount = document.createElement('span');
    allCount.className = 'category-count';
    allCount.textContent = records.length;
    allButton.append(allCount);
    allButton.addEventListener('click', () => {
      selectedFriendCategories.clear();
      render();
    });
    container.append(allButton);

    categories.forEach((category) => {
      const button = document.createElement('button');
      const count = records.filter((record) => (record.friend_of || []).includes(category)).length;
      const isSelected = selectedFriendCategories.has(category);
      button.type = 'button';
      button.className = `friend-category${isSelected ? ' selected' : ''}`;
      button.setAttribute('aria-pressed', String(isSelected));
      button.append(document.createTextNode(category));
      const badge = document.createElement('span');
      badge.className = 'category-count';
      badge.textContent = count;
      button.append(badge);
      button.addEventListener('click', () => {
        if (isSelected) selectedFriendCategories.delete(category);
        else selectedFriendCategories.add(category);
        render();
      });
      container.append(button);
    });
  }

  function renderFilters() {
    const active = tab === 'active';
    $('filters').hidden = !active;
    $('toggleFilters').hidden = !active;
    if (!active) return;

    const activeCount = selectedYears.size + selectedFriendCategories.size;
    $('toggleFilters').setAttribute('aria-expanded', String(filtersOpen));
    $('toggleFilters').classList.toggle('is-open', filtersOpen);
    $('filters').hidden = !filtersOpen;
    $('filterCount').hidden = activeCount === 0;
    $('filterCount').textContent = activeCount;
    $('clearFilters').hidden = activeCount === 0;

    renderCheckboxes($('yearFilters'), availableYears(), selectedYears, 'years');
    renderFriendCategories();
  }

  function render() {
    const query = $('search').value.trim().toLowerCase();
    $('total').textContent = records.length;
    $('deletedCount').textContent = trash.length;
    $('updated').textContent = date(records.reduce(
      (latest, record) => (record.updated_at > latest ? record.updated_at : latest),
      '',
    ) || null);
    document.querySelectorAll('.tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
    $('add').hidden = tab !== 'active';
    $('export').hidden = tab !== 'active';
    renderFilters();

    const container = $('records');
    container.replaceChildren();
    let list = tab === 'active' ? records : tab === 'trash' ? trash : history;
    list = list.filter((record) => {
      const searchable = JSON.stringify([
        record.number_display,
        record.owner,
        record.friend_of,
        record.note,
        record.year,
        record.action,
        record.snapshot,
      ]).toLowerCase();
      const matchesSearch = searchable.includes(query);
      if (tab !== 'active') return matchesSearch;

      const matchesYear = !selectedYears.size || selectedYears.has(String(record.year || ''));
      const friendLinks = record.friend_of || [];
      const matchesFriend = !selectedFriendCategories.size
        || [...selectedFriendCategories].some((category) => friendLinks.includes(category));
      return matchesSearch && matchesYear && matchesFriend;
    });
    if (tab === 'history') {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      list.sort((a, b) => Number(BigInt(a.number_key) - BigInt(b.number_key)));
    }
    $('empty').hidden = list.length !== 0;
    for (const record of list) {
      const item = document.createElement('div');
      item.className = 'record';
      const body = document.createElement('div');
      body.className = 'record-body';
      if (tab === 'history') {
        const snapshot = record.snapshot || {};
        const year = snapshot.year ? ` · ปี ${snapshot.year}` : '';
        const friends = snapshot.friend_of?.length ? ` · เพื่อนของ ${snapshot.friend_of.map(esc).join(', ')}` : '';
        body.innerHTML = `<div><span class="number">${esc(record.action)}</span> <span class="owner">${esc(snapshot.number_display || '')} · ${esc(snapshot.owner || '')}${esc(year)}</span></div><span class="note">${esc(date(record.created_at))} · เวอร์ชัน ${esc(record.version || '—')}${esc(friends)}</span>`;
      } else {
        const year = record.year ? ` · ปี ${record.year}` : '';
        const friends = record.friend_of?.length ? ` · เพื่อนของ ${record.friend_of.map(esc).join(', ')}` : '';
        body.innerHTML = `<div><span class="number">#${esc(record.number_display)}</span><span class="owner">${esc(record.owner)}</span></div><span class="note">${esc(record.note || 'ไม่มีหมายเหตุ')}${esc(year)}${esc(friends)} · แก้ไขล่าสุด ${esc(date(record.updated_at))}</span>`;
      }
      item.append(body);

      if (tab !== 'history') {
        const actions = document.createElement('div');
        actions.className = 'record-actions';
        const options = tab === 'active'
          ? [['คัดลอกเลข', 'copy'], ['แก้ไข', 'edit'], ['ลบ', 'delete']]
          : [['คัดลอกเลข', 'copy'], ['กู้คืน', 'restore']];
        for (const [label, action] of options) {
          const button = document.createElement('button');
          button.className = action === 'delete' ? 'danger' : 'secondary';
          button.textContent = label;
          button.addEventListener('click', () => {
            if (action === 'copy') copyNumber(record.number_display);
            else if (action === 'edit') openEdit(record);
            else confirmAction(action, record);
          });
          actions.append(button);
        }
        item.append(actions);
      }
      container.append(item);
    }
  }

  function populateYearChoices() {
    const select = $('year');
    const currentValue = select.value;
    select.replaceChildren(new Option('ไม่ระบุปี', ''));
    availableYears().forEach((year) => select.add(new Option(String(year), String(year))));
    select.value = currentValue;
  }

  function openEdit(record) {
    editing = record || null;
    populateYearChoices();
    $('modalTitle').textContent = record ? 'แก้ไขทะเบียนจดหมาย' : 'เพิ่มทะเบียนจดหมาย';
    $('number').value = record?.number_display || '';
    $('owner').value = record?.owner || '';
    $('year').value = record?.year ? String(record.year) : '';
    $('note').value = record?.note || '';
    selectedFriendLinks.clear();
    (record?.friend_of || []).forEach((name) => selectedFriendLinks.add(name));
    $('newFriendName').value = '';
    renderFriendChoices();
    $('formError').textContent = '';
    $('editor').showModal();
  }

  function renderFriendChoices() {
    const container = $('friendChoices');
    container.replaceChildren();
    getFriendCategories().forEach((name) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = name;
      checkbox.checked = selectedFriendLinks.has(name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedFriendLinks.add(name);
        else selectedFriendLinks.delete(name);
      });
      label.append(checkbox, document.createTextNode(name));
      container.append(label);
    });
  }

  $('add').onclick = () => openEdit(null);
  $('cancel').onclick = () => $('editor').close();
  $('refresh').onclick = load;
  $('search').oninput = render;
  $('toggleFilters').onclick = () => {
    filtersOpen = !filtersOpen;
    render();
  };
  $('clearFilters').onclick = () => {
    selectedYears.clear();
    selectedFriendCategories.clear();
    render();
  };
  $('addFriendName').onclick = () => {
    const name = $('newFriendName').value.trim();
    if (!name) {
      $('formError').textContent = 'กรอกชื่อเพื่อนที่ต้องการเพิ่ม';
      return;
    }
    if (name.length > 100) {
      $('formError').textContent = 'ชื่อเพื่อนต้องไม่เกิน 100 ตัวอักษร';
      return;
    }
    selectedFriendLinks.add(name);
    $('newFriendName').value = '';
    $('formError').textContent = '';
    renderFriendChoices();
  };
  document.querySelectorAll('.tab').forEach((button) => {
    button.onclick = () => {
      tab = button.dataset.tab;
      render();
    };
  });

  $('form').onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const number = $('number').value.trim();
    const owner = $('owner').value.trim();
    const year = $('year').value ? Number($('year').value) : null;
    const friend_of = [...selectedFriendLinks];
    const note = $('note').value.trim();
    if (!/^\d{1,8}$/.test(number) || !owner) {
      $('formError').textContent = 'กรอกเลข 1–8 หลักและชื่อเจ้าของ';
      return;
    }

    busy = true;
    $('save').disabled = true;
    try {
      await api(editing ? 'update' : 'create', {
        id: editing?.id,
        expectedVersion: editing?.version,
        number,
        owner,
        year,
        friend_of,
        note,
      });
      $('editor').close();
      await load();
    } catch (error) {
      $('formError').textContent = error.message;
    } finally {
      busy = false;
      $('save').disabled = false;
    }
  };

  async function copyNumber(number) {
    try {
      await navigator.clipboard.writeText(number);
      message(`คัดลอกเลขจดหมาย #${number} แล้ว`);
    } catch (error) {
      message(`คัดลอกเลขจดหมายไม่สำเร็จ: ${error.message || 'Clipboard access denied'}`, true);
    }
  }

  function confirmAction(action, record) {
    $('confirmTitle').textContent = action === 'delete' ? 'ยืนยันย้ายเข้าถังขยะ' : 'ยืนยันกู้คืน';
    $('confirmText').textContent = `หมายเลข #${record.number_display} · ${record.owner}${action === 'delete' ? ' จะถูกเก็บไว้ในถังขยะ' : ' จะกลับไปยังทะเบียนหลัก'}`;
    $('confirm').showModal();
    $('confirmGo').onclick = async () => {
      if (busy) return;
      busy = true;
      $('confirmGo').disabled = true;
      try {
        await api(action, { id: record.id, expectedVersion: record.version });
        $('confirm').close();
        await load();
      } catch (error) {
        $('confirm').close();
        message(error.message, true);
      } finally {
        busy = false;
        $('confirmGo').disabled = false;
      }
    };
  }

  $('confirmCancel').onclick = () => $('confirm').close();
  $('export').onclick = () => {
    const data = [
      ['number', 'owner', 'year', 'friend_of', 'note', 'updated_at'],
      ...records.map((record) => [
        record.number_display,
        record.owner,
        record.year ?? '',
        (record.friend_of || []).join('; '),
        record.note,
        record.updated_at,
      ]),
    ];
    const csv = '\ufeff' + data.map((row) => row
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ilverwiz-letters-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!configured) {
    connection(false);
    message('ยังไม่ได้ตั้งค่า Supabase: เปิด config.js แล้วใส่ Project URL และ public key', true);
  } else {
    populateYearChoices();
    load();
  }
  setInterval(() => {
    if (configured && !document.querySelector('dialog[open]')) load();
  }, Math.max(5000, cfg.POLL_INTERVAL_MS || 15000));
})();
