import * as vscode from 'vscode';

export interface CoverageRow {
  name: string; // clase o archivo
  group: string; // paquete o carpeta
  pct: number;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function showCoveragePanel(title: string, rows: CoverageRow[]): void {
  const panel = vscode.window.createWebviewPanel('aemToolkitCoverage', title, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  });
  panel.webview.html = renderHtml(title, rows);
}

function renderHtml(title: string, rows: CoverageRow[]): string {
  const data = JSON.stringify(rows).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 14px; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 10px 0; }
  .toolbar { display:flex; gap:16px; align-items:center; margin-bottom:12px; flex-wrap: wrap; }
  input[type=text], input[type=number] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border:1px solid var(--vscode-input-border,transparent); padding:4px 6px; border-radius:3px; }
  table { border-collapse: collapse; width:100%; }
  th, td { text-align:left; padding:5px 10px; border-bottom:1px solid var(--vscode-editorWidget-border, #444); font-size:12px; }
  th { cursor:pointer; user-select:none; position:sticky; top:0; background: var(--vscode-editor-background); }
  th:hover { color: var(--vscode-textLink-foreground); }
  .bar-bg { background: rgba(128,128,128,0.25); border-radius:3px; width:100px; height:8px; display:inline-block; vertical-align:middle; margin-right:8px; overflow:hidden; }
  .bar-fill { height:100%; display:block; }
  .low { background:#e5534b; }
  .mid { background:#d9a441; }
  .high { background:#3fb950; }
  .pct-cell { display:flex; align-items:center; white-space:nowrap; }
  .empty { opacity:0.7; padding:24px 0; text-align:center; }
  .count { opacity:0.75; font-size:12px; }
</style>
</head>
<body>
  <h2>${escapeHtml(title)}</h2>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Filtrar por nombre... (buscador)" style="min-width:240px" />
    <label>Mostrar coverage menor a <input type="number" id="maxPct" min="0" max="100" value="100" style="width:60px" />%</label>
    <span class="count" id="count"></span>
  </div>
  <table>
    <thead><tr>
      <th data-key="group">Paquete / Carpeta ▾</th>
      <th data-key="name">Clase / Archivo</th>
      <th data-key="pct">% Líneas cubiertas</th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="emptyMsg" class="empty" style="display:none">No hay datos de coverage para mostrar.</div>
<script>
  const allRows = ${data};
  let sortKey = 'pct';
  let sortAsc = true;

  function colorClass(pct) {
    if (pct < 50) return 'low';
    if (pct < 80) return 'mid';
    return 'high';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function render() {
    const search = document.getElementById('search').value.toLowerCase();
    const maxPctRaw = document.getElementById('maxPct').value;
    const maxPct = maxPctRaw === '' ? 100 : parseFloat(maxPctRaw);
    let rows = allRows.filter(function(r) {
      return (!search || r.name.toLowerCase().indexOf(search) !== -1 || r.group.toLowerCase().indexOf(search) !== -1) &&
        (isNaN(maxPct) || r.pct <= maxPct);
    });
    rows.sort(function(a, b) {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
    document.getElementById('count').textContent = rows.length + ' de ' + allRows.length;
    const tbody = document.getElementById('rows');
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(r.group) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td><div class="pct-cell"><span class="bar-bg"><span class="bar-fill ' + colorClass(r.pct) + '" style="width:' + Math.max(0, Math.min(100, r.pct)) + '%"></span></span>' + r.pct.toFixed(1) + '%</div></td>';
      tbody.appendChild(tr);
    }
    document.getElementById('emptyMsg').style.display = allRows.length === 0 ? 'block' : 'none';
  }

  document.querySelectorAll('th[data-key]').forEach(function(th) {
    th.addEventListener('click', function() {
      const key = th.getAttribute('data-key');
      if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
      render();
    });
  });
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('maxPct').addEventListener('input', render);
  render();
</script>
</body>
</html>`;
}
