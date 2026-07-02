/* Leads grid: client-side sort/filter/search/pagination via Tabulator.
   Cell edits and status changes persist to the staff-only JSON endpoints. */
const U = window.LEADS_URLS;
const csrf = document.querySelector('[name=csrfmiddlewaretoken]').value;

const json = (method, url, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

// Map a LeadColumn type → a Tabulator editor + header filter.
function editorFor(col, statuses) {
  switch (col.type) {
    case 'number': return { editor: 'number', sorter: 'number', headerFilter: 'input' };
    case 'boolean': return { editor: 'tickCross', formatter: 'tickCross', headerFilter: 'tickCross' };
    case 'select':
    case 'multiselect':
      return { editor: 'list', editorParams: { values: col.choices, multiselect: col.type === 'multiselect' }, headerFilter: 'list', headerFilterParams: { values: col.choices, clearable: true } };
    case 'url': return { formatter: 'link', formatterParams: { target: '_blank' }, headerFilter: 'input' };
    default: return { editor: 'input', headerFilter: 'input' };
  }
}

async function init() {
  const data = await json('GET', U.table);
  const statuses = data.statuses;

  const columns = [
    { title: 'Status', field: 'status_id', editor: 'list',
      editorParams: { values: Object.fromEntries(statuses.map((s) => [s.id, s.name])) },
      formatter: (cell) => {
        const s = statuses.find((x) => x.id === cell.getValue());
        return s ? `<span style="background:${s.color};color:#fff;padding:2px 10px;border-radius:99px;font-size:11.5px">${s.name}</span>` : '';
      },
      headerFilter: 'list',
      headerFilterParams: { values: Object.fromEntries(statuses.map((s) => [s.id, s.name])), clearable: true } },
    { title: 'Created by', field: 'created_by', headerFilter: 'input', editor: false },
  ];
  data.columns.filter((c) => c.is_visible).forEach((c) => {
    columns.push({ title: c.label, field: `data.${c.key}`, editable: () => c.editable, ...editorFor(c, statuses) });
  });

  const table = new Tabulator('#leads-table', {
    data: data.rows,
    columns,
    layout: 'fitDataStretch',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    movableColumns: true,
    height: '75vh',
  });

  // Persist inline edits. Status edits patch status_id; data edits patch data.<key>.
  table.on('cellEdited', (cell) => {
    const row = cell.getRow().getData();
    const field = cell.getField();
    if (field === 'status_id') {
      json('PATCH', U.row(row.id), { status_id: cell.getValue() });
    } else {
      const key = field.replace('data.', '');
      json('PATCH', U.row(row.id), { data: { [key]: cell.getValue() } })
        .then((res) => { if (res.error) { cell.restoreOldValue(); alert(res.error); } });
    }
  });

  document.getElementById('search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    table.setFilter((rowData) => JSON.stringify(rowData).toLowerCase().includes(term));
  });

  document.getElementById('add-row').addEventListener('click', async () => {
    const row = await json('POST', U.rows);
    table.addRow(row, true);
  });

  document.getElementById('add-column').addEventListener('click', async () => {
    const label = prompt('Column label?');
    if (!label) return;
    const type = prompt('Type? text/number/date/boolean/url/select/multiselect', 'text') || 'text';
    const res = await json('POST', U.columns, { key: label, label, type });
    if (res.error) return alert(res.error);
    location.reload();
  });

  document.getElementById('upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = JSON.parse(await file.text());
    const res = await json('POST', U.upload, rows);
    alert(res.error ? res.error : `Created ${res.created}, new columns: ${res.new_columns.join(', ') || 'none'}`);
    location.reload();
  });
}
init();
