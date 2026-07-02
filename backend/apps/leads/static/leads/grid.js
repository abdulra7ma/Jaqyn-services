/* Leads grid (AG Grid Community, quartz theme).
   - Client-side sort / filter / search / pagination.
   - Each column header carries a switch (design-system §5) toggling that column's
     per-column search box (floating filter) on or off.
   - Inline cell edits + status changes + add-row persist to the staff JSON API. */
const U = window.LEADS_URLS;
const csrf = document.querySelector('[name=csrfmiddlewaretoken]').value;

const api_json = (method, url, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

// Per-column search-box enabled state, keyed by colId. Survives header rebuilds.
const filterEnabled = {};

// One stylesheet drives which columns' floating-filter (search) cells are hidden.
// Hiding via CSS (not by mutating columnDefs) avoids AG Grid reordering columns.
const ffStyle = document.createElement('style');
document.head.appendChild(ffStyle);
function applyFilterVisibility() {
  ffStyle.textContent = Object.entries(filterEnabled)
    .filter(([, on]) => !on)
    .map(([id]) => `.ag-floating-filter[col-id="${id}"]{visibility:hidden}`)
    .join('');
}

/* ---- Modal (design-system §10) + form-field helpers ---------------------- */
const INPUT_CSS = 'border:1.5px solid #EFE3D1;border-radius:15px;padding:12px 14px;font-size:14px;font-weight:500;color:#2E241D;background:#fff;width:100%;box-sizing:border-box;';
const FIELD_LABEL_CSS = 'font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8C7A6A;margin-bottom:6px;display:block;';

function field(labelText, control) {
  const wrap = document.createElement('div');
  const l = document.createElement('label');
  l.textContent = labelText;
  l.style.cssText = FIELD_LABEL_CSS;
  wrap.append(l, control);
  return wrap;
}
function textInput(type = 'text', value = '') {
  const i = document.createElement('input');
  i.type = type; i.value = value; i.style.cssText = INPUT_CSS;
  return i;
}
function selectInput(options, value = '', allowBlank = true) {
  const s = document.createElement('select');
  s.style.cssText = INPUT_CSS;
  if (allowBlank) { const b = document.createElement('option'); b.value = ''; b.textContent = '—'; s.appendChild(b); }
  options.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    if (String(o) === String(value)) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}
function inputForColumn(col) {
  switch (col.type) {
    case 'number': return textInput('number');
    case 'date': return textInput('date');
    case 'boolean': return selectInput(['true', 'false']);
    case 'select':
    case 'multiselect': return selectInput(col.choices || []);
    default: return textInput('text');
  }
}

// Design-system switch (§5), scaled down: track 34x20, knob 16, on #C25E3C.
function makeSwitch(initialOn, onToggle, title = '') {
  const sw = document.createElement('button');
  sw.type = 'button';
  if (title) sw.title = title;
  sw.style.cssText = 'flex:0 0 auto;position:relative;width:34px;height:20px;border:0;border-radius:99px;cursor:pointer;transition:background .15s;padding:0;';
  const knob = document.createElement('span');
  knob.style.cssText = 'position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.25);';
  sw.appendChild(knob);
  let on = initialOn;
  const paint = () => {
    sw.style.background = on ? '#C25E3C' : '#E0D3BF';
    knob.style.transform = on ? 'translateX(14px)' : 'translateX(0)';
  };
  paint();
  sw.addEventListener('click', (e) => { e.stopPropagation(); on = !on; paint(); onToggle(on); });
  return sw;
}

// Open the shared modal. buildBody(bodyEl) fills the form; onSave() returns
// false to keep it open (validation fail), anything else closes it.
function openModal(title, buildBody, onSave) {
  const backdrop = document.getElementById('modal-backdrop');
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = '';
  buildBody(body);
  backdrop.style.display = 'flex';
  const saveBtn = document.getElementById('modal-save');
  const cancelBtn = document.getElementById('modal-cancel');
  function cleanup() {
    backdrop.style.display = 'none';
    saveBtn.removeEventListener('click', onSaveClick);
    cancelBtn.removeEventListener('click', cleanup);
    backdrop.removeEventListener('mousedown', onBackdrop);
    document.removeEventListener('keydown', onKey);
  }
  async function onSaveClick() {
    saveBtn.disabled = true;
    try { if ((await onSave()) !== false) cleanup(); } finally { saveBtn.disabled = false; }
  }
  const onBackdrop = (e) => { if (e.target === backdrop) cleanup(); };
  const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
  saveBtn.addEventListener('click', onSaveClick);
  cancelBtn.addEventListener('click', cleanup);
  backdrop.addEventListener('mousedown', onBackdrop);
  document.addEventListener('keydown', onKey);
}

/* Custom header: clickable label (sort) + sort arrow + on/off search switch. */
class ToggleHeader {
  init(params) {
    this.params = params;
    const colId = params.column.getColId();
    if (filterEnabled[colId] === undefined) filterEnabled[colId] = true;

    this.eGui = document.createElement('div');
    this.eGui.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;';

    const label = document.createElement('span');
    label.textContent = params.displayName;
    label.style.cssText = 'font-weight:600;cursor:pointer;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.addEventListener('click', (e) => params.progressSort(e.shiftKey));

    this.arrow = document.createElement('span');
    this.arrow.style.cssText = 'font-size:10px;color:#8C7A6A;width:8px;';

    const sw = makeSwitch(filterEnabled[colId], (on) => {
      filterEnabled[colId] = on;
      params.context.toggleFilter(colId, on);
    }, 'Toggle search on this column');

    this.eGui.append(label, this.arrow, sw);
    this.onSort = () => this.refreshArrow();
    params.column.addEventListener('sortChanged', this.onSort);
    this.refreshArrow();
  }
  refreshArrow() {
    const s = this.params.column.getSort();
    this.arrow.textContent = s === 'asc' ? '▲' : s === 'desc' ? '▼' : '';
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
  destroy() { if (this.onSort) this.params.column.removeEventListener('sortChanged', this.onSort); }
}

function editorFor(col) {
  switch (col.type) {
    case 'number': return { cellEditor: 'agNumberCellEditor', filter: 'agNumberColumnFilter' };
    case 'boolean': return { cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['true', 'false'] } };
    case 'select': return { cellEditor: 'agSelectCellEditor', cellEditorParams: { values: col.choices } };
    case 'url': return { cellRenderer: (p) => (p.value ? `<a href="${p.value}" target="_blank" rel="noopener" style="color:#A2492A">link</a>` : '') };
    default: return { cellEditor: 'agTextCellEditor' };
  }
}

async function init() {
  const data = await api_json('GET', U.table);
  const statuses = data.statuses;
  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const statusByName = Object.fromEntries(statuses.map((s) => [s.name, s]));
  const statusName = (id) => (statusById[id] ? statusById[id].name : '');

  const columnDefs = [
    {
      colId: 'status', headerName: 'Status', editable: true, width: 170,
      valueGetter: (p) => statusName(p.data.status_id),
      valueSetter: (p) => { const s = statusByName[p.newValue]; p.data.status_id = s ? s.id : null; return true; },
      cellEditor: 'agSelectCellEditor', cellEditorParams: { values: statuses.map((s) => s.name) },
      cellRenderer: (p) => {
        const s = statusByName[p.value];
        return s ? `<span style="background:${s.color};color:#fff;padding:2px 11px;border-radius:99px;font-size:11.5px;font-weight:600">${s.name}</span>` : '';
      },
    },
    { colId: 'created_by', headerName: 'Created by', field: 'created_by', editable: false, width: 150 },
  ];
  // Include every column; hidden ones start collapsed but stay toggleable
  // from the Columns panel (filtering them out would make them unrecoverable).
  data.columns.forEach((c) => {
    columnDefs.push({
      colId: `data.${c.key}`, headerName: c.label, field: `data.${c.key}`,
      editable: !!c.editable, hide: !c.is_visible, ...editorFor(c),
    });
  });

  const gridDiv = document.getElementById('leads-table');
  const setCount = () => {
    document.getElementById('row-count').textContent = `${gridApi.getDisplayedRowCount()} leads`;
  };

  const gridOptions = {
    columnDefs,
    rowData: data.rows,
    headerHeight: 46,
    defaultColDef: {
      sortable: true, resizable: true, filter: true, floatingFilter: true,
      minWidth: 140, headerComponent: ToggleHeader,
    },
    pagination: true,
    paginationPageSize: 25,
    paginationPageSizeSelector: [25, 50, 100, 200],
    animateRows: true,
    context: {
      // Show/hide a single column's search box (its floating-filter cell) via CSS,
      // and clear any active filter on that column when switched off.
      toggleFilter(colId, on) {
        applyFilterVisibility();
        if (!on) gridApi.setColumnFilterModel(colId, null).then(() => gridApi.onFilterChanged());
      },
    },
    onModelUpdated: setCount,
    onCellValueChanged: (e) => {
      const colId = e.column.getColId();
      const revert = () => e.node.setDataValue(colId, e.oldValue);
      if (colId === 'status') {
        api_json('PATCH', U.row(e.data.id), { status_id: e.data.status_id })
          .then((r) => { if (r.error) { revert(); alert(r.error); } });
        return;
      }
      const key = colId.replace('data.', '');
      let value = e.newValue;
      if (e.colDef.cellEditor === 'agSelectCellEditor' && String(value) === 'true') value = true;
      else if (e.colDef.cellEditor === 'agSelectCellEditor' && String(value) === 'false') value = false;
      api_json('PATCH', U.row(e.data.id), { data: { [key]: value } })
        .then((r) => { if (r.error) { revert(); alert(r.error); } });
    },
  };

  const gridApi = agGrid.createGrid(gridDiv, gridOptions);

  document.getElementById('search').addEventListener('input', (e) => {
    gridApi.setGridOption('quickFilterText', e.target.value);
  });

  document.getElementById('add-row').addEventListener('click', () => {
    const inputs = {};
    let statusEl;
    openModal('Add lead', (body) => {
      const dflt = statuses.find((s) => s.is_default);
      statusEl = selectInput(statuses.map((s) => s.name), dflt ? dflt.name : '');
      body.appendChild(field('Status', statusEl));
      data.columns.filter((c) => c.is_visible).forEach((c) => {
        const el = inputForColumn(c);
        inputs[c.key] = el;
        body.appendChild(field(c.label, el));
      });
    }, async () => {
      const payload = {};
      Object.entries(inputs).forEach(([k, el]) => { if (el.value !== '') payload[k] = el.value; });
      const s = statusByName[statusEl.value];
      const res = await api_json('POST', U.rows, { data: payload, status_id: s ? s.id : null });
      if (res.error) { alert(res.error); return false; }
      gridApi.applyTransaction({ add: [res], addIndex: 0 });
    });
  });

  document.getElementById('add-column').addEventListener('click', () => {
    let labelEl, typeEl, choicesEl, choicesWrap;
    openModal('Add column', (body) => {
      labelEl = textInput('text');
      typeEl = selectInput(['text', 'number', 'date', 'boolean', 'url', 'select', 'multiselect'], 'text', false);
      choicesEl = textInput('text');
      choicesEl.placeholder = 'High, Medium, Low';
      choicesWrap = field('Choices (comma-separated)', choicesEl);
      const syncChoices = () => {
        choicesWrap.style.display = (typeEl.value === 'select' || typeEl.value === 'multiselect') ? 'block' : 'none';
      };
      typeEl.addEventListener('change', syncChoices);
      body.append(field('Label', labelEl), field('Type', typeEl), choicesWrap);
      syncChoices();
    }, async () => {
      const label = labelEl.value.trim();
      if (!label) { labelEl.focus(); return false; }
      const type = typeEl.value;
      const choices = (type === 'select' || type === 'multiselect')
        ? choicesEl.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const res = await api_json('POST', U.columns, { key: label, label, type, choices });
      if (res.error) { alert(res.error); return false; }
      location.reload();
    });
  });

  document.getElementById('columns').addEventListener('click', () => {
    openModal('Show / hide columns', (body) => {
      data.columns.forEach((c) => {
        const colId = `data.${c.key}`;
        const col = gridApi.getColumn(colId);
        const sw = makeSwitch(col ? col.isVisible() : c.is_visible, (visible) => {
          gridApi.setColumnsVisible([colId], visible);
          api_json('PATCH', U.column(c.id), { is_visible: visible });
        });
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0;';
        const name = document.createElement('span');
        name.textContent = c.label;
        name.style.cssText = 'font-size:14px;color:#2E241D;';
        rowEl.append(name, sw);
        body.appendChild(rowEl);
      });
    }, () => true);  // toggles apply live; Save just closes.
  });

  document.getElementById('upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = JSON.parse(await file.text());
    const res = await api_json('POST', U.upload, rows);
    alert(res.error ? res.error : `Created ${res.created}, new columns: ${res.new_columns.join(', ') || 'none'}`);
    location.reload();
  });
}
init();
