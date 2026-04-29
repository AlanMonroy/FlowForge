/* ============================================================
   FlowCraft — Extras Module
   Minimap, Search, Stats, Templates, Presentation, Context Menu
   ============================================================ */

/* ─────────────────────── MINIMAP ─────────────────────── */
class Minimap {
  constructor(model, controller) {
    this.model      = model;
    this.controller = controller;
    this.canvas     = document.getElementById('minimap-canvas');
    this.ctx        = this.canvas.getContext('2d');
    this.viewport   = document.getElementById('minimap-viewport');
    this.W = 160; this.H = 110;
    this._dragging  = false;

    this.canvas.parentElement.addEventListener('mousedown', e => {
      this._dragging = true;
      this._jumpTo(e);
    });
    window.addEventListener('mousemove', e => { if (this._dragging) this._jumpTo(e); });
    window.addEventListener('mouseup', () => { this._dragging = false; });

    this.draw();
  }

  draw() {
    const f = this.model.getActiveFlow();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Background
    ctx.fillStyle = '#13161e';
    ctx.fillRect(0, 0, this.W, this.H);

    if (!f || !f.nodes.length) { this._updateViewport(); return; }

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    f.nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 160); maxY = Math.max(maxY, n.y + 70);
    });
    const pad = 20;
    const fw = (maxX - minX) + pad * 2;
    const fh = (maxY - minY) + pad * 2;
    const scaleX = this.W / fw;
    const scaleY = this.H / fh;
    const scale  = Math.min(scaleX, scaleY, 0.06);
    const offX   = (this.W - fw * scale) / 2 - (minX - pad) * scale;
    const offY   = (this.H - fh * scale) / 2 - (minY - pad) * scale;

    this._scale = scale; this._offX = offX; this._offY = offY;
    this._minX = minX - pad; this._minY = minY - pad;

    // Draw connections
    ctx.strokeStyle = '#00d4ff44';
    ctx.lineWidth = 1;
    f.connections.forEach(c => {
      const from = f.nodes.find(n => n.id === c.from);
      const to   = f.nodes.find(n => n.id === c.to);
      if (!from || !to) return;
      const x1 = from.x * scale + offX + 80 * scale;
      const y1 = from.y * scale + offY + 60 * scale;
      const x2 = to.x   * scale + offX + 80 * scale;
      const y2 = to.y   * scale + offY;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // Draw nodes
    const typeColors = {
      start:'#22c55e', end:'#ef4444', process:'#3b82f6', decision:'#f59e0b',
      io:'#8b5cf6', subprocess:'#06b6d4', delay:'#ec4899', note:'#6b7280'
    };
    f.nodes.forEach(n => {
      const nx = n.x * scale + offX;
      const ny = n.y * scale + offY;
      const nw = 160 * scale;
      const nh = 60  * scale;
      ctx.fillStyle = (typeColors[n.type] || '#6b7280') + '88';
      ctx.strokeStyle = typeColors[n.type] || '#6b7280';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(nx, ny, nw, nh, 2) : ctx.rect(nx, ny, nw, nh);
      ctx.fill(); ctx.stroke();
    });

    this._updateViewport(scale, offX, offY, minX - pad, minY - pad);
  }

  _updateViewport(scale, offX, offY, minX, minY) {
    if (!scale) { this.viewport.style.display = 'none'; return; }
    const ctrl = this.controller;
    const container = ctrl.view.container;
    const rect = container.getBoundingClientRect();

    const vx = (-ctrl.panX / ctrl.zoom - minX) * scale + offX;
    const vy = (-ctrl.panY / ctrl.zoom - minY) * scale + offY;
    const vw = (rect.width  / ctrl.zoom) * scale;
    const vh = (rect.height / ctrl.zoom) * scale;

    this.viewport.style.display = 'block';
    this.viewport.style.left   = Math.max(0, vx) + 'px';
    this.viewport.style.top    = Math.max(0, vy) + 'px';
    this.viewport.style.width  = Math.min(this.W, vw) + 'px';
    this.viewport.style.height = Math.min(this.H, vh) + 'px';
  }

  _jumpTo(e) {
    if (!this._scale) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasX = (mx - this._offX) / this._scale + this._minX;
    const canvasY = (my - this._offY) / this._scale + this._minY;
    const container = this.controller.view.container;
    const cr = container.getBoundingClientRect();
    this.controller.panX = cr.width  / 2 - canvasX * this.controller.zoom;
    this.controller.panY = cr.height / 2 - canvasY * this.controller.zoom;
    this.controller._applyTransform();
    this.draw();
  }

  refresh() { this.draw(); }
}


/* ─────────────────────── SEARCH ─────────────────────── */
class FlowSearch {
  constructor(model, controller) {
    this.model      = model;
    this.controller = controller;
    this.results    = [];
    this.currentIdx = -1;

    this._bar     = document.getElementById('search-bar');
    this._input   = document.getElementById('search-input');
    this._count   = document.getElementById('search-results-count');

    document.getElementById('btn-search').addEventListener('click', () => this.open());
    document.getElementById('search-close-btn').addEventListener('click', () => this.close());
    document.getElementById('search-next-btn').addEventListener('click', () => this.next());
    document.getElementById('search-prev-btn').addEventListener('click', () => this.prev());
    this._input.addEventListener('input', () => this.search(this._input.value));
    this._input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.shiftKey ? this.prev() : this.next(); }
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    this._bar.classList.remove('hidden');
    this._input.focus();
    this._input.select();
  }

  close() {
    this._bar.classList.add('hidden');
    this._clearHighlights();
    this.results = [];
    this.currentIdx = -1;
    this._count.textContent = '';
  }

  search(query) {
    this._clearHighlights();
    this.results = [];
    this.currentIdx = -1;

    if (!query.trim()) { this._count.textContent = ''; return; }

    const f = this.model.getActiveFlow();
    if (!f) return;

    const q = query.toLowerCase();
    this.results = f.nodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.desc  && n.desc.toLowerCase().includes(q)) ||
      (n.owner && n.owner.toLowerCase().includes(q)) ||
      n.type.toLowerCase().includes(q)
    );

    this.results.forEach(n => {
      const el = document.getElementById('node-' + n.id);
      if (el) el.classList.add('search-match');
    });

    this._count.textContent = this.results.length
      ? `${this.results.length} resultado${this.results.length > 1 ? 's' : ''}`
      : 'Sin resultados';

    if (this.results.length) this.next();
  }

  next() {
    if (!this.results.length) return;
    if (this.currentIdx >= 0) {
      const el = document.getElementById('node-' + this.results[this.currentIdx].id);
      if (el) el.classList.remove('search-current');
    }
    this.currentIdx = (this.currentIdx + 1) % this.results.length;
    this._focusCurrent();
  }

  prev() {
    if (!this.results.length) return;
    if (this.currentIdx >= 0) {
      const el = document.getElementById('node-' + this.results[this.currentIdx].id);
      if (el) el.classList.remove('search-current');
    }
    this.currentIdx = (this.currentIdx - 1 + this.results.length) % this.results.length;
    this._focusCurrent();
  }

  _focusCurrent() {
    const node = this.results[this.currentIdx];
    if (!node) return;
    const el = document.getElementById('node-' + node.id);
    if (el) el.classList.add('search-current');
    this._count.textContent = `${this.currentIdx + 1} / ${this.results.length}`;
    // Pan to node
    const ctrl = this.controller;
    const container = ctrl.view.container;
    const rect = container.getBoundingClientRect();
    ctrl.panX = rect.width  / 2 - (node.x + 75) * ctrl.zoom;
    ctrl.panY = rect.height / 2 - (node.y + 35) * ctrl.zoom;
    ctrl._applyTransform();
  }

  _clearHighlights() {
    document.querySelectorAll('.search-match, .search-current').forEach(el => {
      el.classList.remove('search-match', 'search-current');
    });
  }
}


/* ─────────────────────── STATS ─────────────────────── */
class FlowStats {
  constructor(model) {
    this.model = model;
    document.getElementById('btn-stats').addEventListener('click', () => this.show());
    document.getElementById('modal-stats-close').addEventListener('click', () => {
      document.getElementById('modal-stats').classList.add('hidden');
    });
  }

  show() {
    const f = this.model.getActiveFlow();
    if (!f) return;

    const nodes = f.nodes;
    const conns  = f.connections;

    const typeCounts = {};
    nodes.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
    const typeColors = {
      start:'#22c55e', end:'#ef4444', process:'#3b82f6', decision:'#f59e0b',
      io:'#8b5cf6', subprocess:'#06b6d4', delay:'#ec4899', note:'#6b7280'
    };
    const typeLabels = {
      start:'Inicio', end:'Fin', process:'Proceso', decision:'Decisión',
      io:'Entrada/Salida', subprocess:'Subproceso', delay:'Espera', note:'Nota'
    };

    // Complexity score
    const complexity = conns.length - nodes.length + 2;
    const complexLabel = complexity <= 1 ? 'Simple' : complexity <= 5 ? 'Moderado' : 'Complejo';
    const complexColor = complexity <= 1 ? '#22c55e' : complexity <= 5 ? '#f59e0b' : '#ef4444';

    // Nodes with most connections
    const connCount = {};
    conns.forEach(c => {
      connCount[c.from] = (connCount[c.from] || 0) + 1;
      connCount[c.to]   = (connCount[c.to]   || 0) + 1;
    });
    const topNode = nodes.reduce((best, n) => {
      return (connCount[n.id] || 0) > (connCount[best?.id] || 0) ? n : best;
    }, nodes[0]);

    // Coverage: nodes with owner
    const withOwner = nodes.filter(n => n.owner).length;

    const content = document.getElementById('stats-content');
    content.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${nodes.length}</div>
        <div class="stat-label">Total Nodos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${conns.length}</div>
        <div class="stat-label">Conexiones</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${complexColor};font-size:18px">${complexLabel}</div>
        <div class="stat-label">Complejidad (M=${complexity})</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${withOwner}</div>
        <div class="stat-label">Con Responsable</div>
      </div>
      <div class="stats-full-width">
        <div class="section-title" style="margin-bottom:10px">Distribución por tipo</div>
        ${Object.entries(typeCounts).map(([type, count]) => `
          <div class="stat-bar-row">
            <span class="stat-bar-label">${typeLabels[type] || type}</span>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" style="width:${(count/nodes.length)*100}%;background:${typeColors[type]}"></div>
            </div>
            <span class="stat-bar-num">${count}</span>
          </div>`).join('')}
      </div>
      ${topNode ? `
      <div class="stats-full-width">
        <div class="section-title" style="margin-bottom:10px">Nodo más conectado</div>
        <div class="stat-row">
          <span class="stat-row-label">Nombre</span>
          <span class="stat-row-val">${topNode.label}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row-label">Tipo</span>
          <span class="stat-row-val">${typeLabels[topNode.type] || topNode.type}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row-label">Conexiones</span>
          <span class="stat-row-val">${connCount[topNode.id] || 0}</span>
        </div>
        ${topNode.owner ? `
        <div class="stat-row">
          <span class="stat-row-label">Responsable</span>
          <span class="stat-row-val">${topNode.owner}</span>
        </div>` : ''}
      </div>` : ''}`;

    document.getElementById('modal-stats').classList.remove('hidden');
  }
}


/* ─────────────────────── TEMPLATES ─────────────────────── */
class TemplateLibrary {
  constructor(model, controller) {
    this.model      = model;
    this.controller = controller;
    this._templates = this._defineTemplates();

    document.getElementById('btn-templates').addEventListener('click', () => this.show());
    document.getElementById('modal-templates-close').addEventListener('click', () =>
      document.getElementById('modal-templates').classList.add('hidden'));

    this._buildGrid();
  }

  _defineTemplates() {
    return [
      {
        id: 'onboarding',
        icon: '👤',
        name: 'Onboarding de Cliente',
        desc: 'Proceso de alta y bienvenida a nuevos clientes',
        tag: 'Ventas',
        nodes: [
          { type: 'start',    label: 'Inicio',                x: 200, y: 60  },
          { type: 'io',       label: 'Recibir solicitud',     x: 200, y: 180, owner: 'Ventas' },
          { type: 'decision', label: '¿Documentos completos?',x: 200, y: 310 },
          { type: 'process',  label: 'Solicitar documentos',  x: 60,  y: 440, owner: 'Admin' },
          { type: 'process',  label: 'Validar información',   x: 380, y: 440, owner: 'Crédito' },
          { type: 'process',  label: 'Crear cuenta cliente',  x: 200, y: 560, owner: 'Admin' },
          { type: 'subprocess', label: 'Enviar bienvenida',   x: 200, y: 670, owner: 'Mkt' },
          { type: 'end',      label: 'Cliente Activo',        x: 200, y: 780 },
        ],
        connections: [
          [0,1],[1,2],[2,3,'No'],[2,4,'Sí'],[3,2],[4,5],[5,6],[6,7]
        ]
      },
      {
        id: 'purchase',
        icon: '🛒',
        name: 'Orden de Compra',
        desc: 'Flujo de aprobación y procesamiento de compras',
        tag: 'Compras',
        nodes: [
          { type: 'start',    label: 'Inicio',                x: 200, y: 60  },
          { type: 'io',       label: 'Recibir requisición',   x: 200, y: 180, owner: 'Solicitante' },
          { type: 'decision', label: '¿Monto > $10,000?',     x: 200, y: 300 },
          { type: 'process',  label: 'Aprobación Gerente',    x: 60,  y: 420, owner: 'Gerencia' },
          { type: 'process',  label: 'Cotizar proveedor',     x: 380, y: 420, owner: 'Compras' },
          { type: 'decision', label: '¿Aprobado?',            x: 200, y: 540 },
          { type: 'process',  label: 'Emitir orden de compra',x: 200, y: 660, owner: 'Compras' },
          { type: 'process',  label: 'Rechazar y notificar',  x: 420, y: 660, owner: 'Compras' },
          { type: 'delay',    label: 'Esperar entrega',       x: 200, y: 770, owner: 'Almacén' },
          { type: 'end',      label: 'Fin',                   x: 200, y: 880 },
        ],
        connections: [
          [0,1],[1,2],[2,3,'Sí'],[2,4,'No'],[3,5],[4,5],[5,6,'Sí'],[5,7,'No'],[6,8],[8,9],[7,9]
        ]
      },
      {
        id: 'support',
        icon: '🎧',
        name: 'Atención a Clientes',
        desc: 'Proceso de gestión de tickets y soporte',
        tag: 'Servicio',
        nodes: [
          { type: 'start',    label: 'Ticket recibido',       x: 200, y: 60  },
          { type: 'decision', label: '¿Urgencia Alta?',       x: 200, y: 180 },
          { type: 'process',  label: 'Escalar a N2',          x: 60,  y: 300, owner: 'Soporte N2' },
          { type: 'process',  label: 'Asignar agente',        x: 380, y: 300, owner: 'Soporte N1' },
          { type: 'subprocess', label: 'Diagnóstico',         x: 200, y: 420, owner: 'Soporte' },
          { type: 'decision', label: '¿Resuelto?',            x: 200, y: 540 },
          { type: 'process',  label: 'Cerrar ticket',         x: 200, y: 660, owner: 'Soporte' },
          { type: 'process',  label: 'Escalar a desarrollo',  x: 400, y: 660, owner: 'Dev' },
          { type: 'io',       label: 'Encuesta satisfacción', x: 200, y: 760 },
          { type: 'end',      label: 'Fin',                   x: 200, y: 860 },
        ],
        connections: [
          [0,1],[1,2,'Sí'],[1,3,'No'],[2,4],[3,4],[4,5],[5,6,'Sí'],[5,7,'No'],[6,8],[8,9],[7,4]
        ]
      },
      {
        id: 'invoice',
        icon: '📄',
        name: 'Facturación',
        desc: 'Emisión y seguimiento de facturas y pagos',
        tag: 'Finanzas',
        nodes: [
          { type: 'start',    label: 'Inicio',                x: 200, y: 60  },
          { type: 'io',       label: 'Recibir pedido',        x: 200, y: 160, owner: 'Ventas' },
          { type: 'process',  label: 'Generar factura',       x: 200, y: 270, owner: 'Admin' },
          { type: 'io',       label: 'Enviar al cliente',     x: 200, y: 380, owner: 'Admin' },
          { type: 'delay',    label: 'Esperar pago (30 días)',x: 200, y: 490 },
          { type: 'decision', label: '¿Pago recibido?',       x: 200, y: 610 },
          { type: 'process',  label: 'Registrar pago',        x: 60,  y: 730, owner: 'Contab.' },
          { type: 'process',  label: 'Enviar recordatorio',   x: 380, y: 730, owner: 'Admin' },
          { type: 'end',      label: 'Fin',                   x: 200, y: 840 },
        ],
        connections: [
          [0,1],[1,2],[2,3],[3,4],[4,5],[5,6,'Sí'],[5,7,'No'],[6,8],[7,4]
        ]
      },
      {
        id: 'hr',
        icon: '🧑‍💼',
        name: 'Reclutamiento',
        desc: 'Proceso de selección y contratación de personal',
        tag: 'RRHH',
        nodes: [
          { type: 'start',    label: 'Vacante abierta',       x: 200, y: 60  },
          { type: 'process',  label: 'Publicar oferta',       x: 200, y: 170, owner: 'RRHH' },
          { type: 'io',       label: 'Recibir CVs',           x: 200, y: 280 },
          { type: 'process',  label: 'Filtro inicial',        x: 200, y: 390, owner: 'RRHH' },
          { type: 'decision', label: '¿Cumple perfil?',       x: 200, y: 500 },
          { type: 'process',  label: 'Entrevista RH',         x: 60,  y: 620, owner: 'RRHH' },
          { type: 'process',  label: 'Descartar candidato',   x: 380, y: 620 },
          { type: 'process',  label: 'Entrevista técnica',    x: 60,  y: 730, owner: 'Área' },
          { type: 'decision', label: '¿Seleccionado?',        x: 200, y: 840 },
          { type: 'process',  label: 'Generar oferta laboral',x: 60,  y: 960, owner: 'RRHH' },
          { type: 'end',      label: 'Contratado',            x: 200, y: 1060 },
        ],
        connections: [
          [0,1],[1,2],[2,3],[3,4],[4,5,'Sí'],[4,6,'No'],[5,7],[7,8],[8,9,'Sí'],[8,6,'No'],[9,10]
        ]
      },
      {
        id: 'deployment',
        icon: '🚀',
        name: 'Despliegue de Software',
        desc: 'Pipeline de CI/CD y pase a producción',
        tag: 'TI',
        nodes: [
          { type: 'start',    label: 'Inicio',                x: 200, y: 60  },
          { type: 'subprocess', label: 'Build & Tests',       x: 200, y: 170, owner: 'DevOps' },
          { type: 'decision', label: '¿Tests pasan?',         x: 200, y: 300 },
          { type: 'process',  label: 'Notificar error',       x: 400, y: 420, owner: 'Dev' },
          { type: 'process',  label: 'Deploy a Staging',      x: 60,  y: 420, owner: 'DevOps' },
          { type: 'subprocess', label: 'QA Manual',           x: 60,  y: 530, owner: 'QA' },
          { type: 'decision', label: '¿QA aprueba?',          x: 200, y: 640 },
          { type: 'process',  label: 'Deploy a Producción',   x: 60,  y: 760, owner: 'DevOps' },
          { type: 'process',  label: 'Reporte de bugs',       x: 380, y: 760, owner: 'QA' },
          { type: 'subprocess', label: 'Monitoreo 24h',       x: 60,  y: 870, owner: 'Ops' },
          { type: 'end',      label: 'Release exitoso',       x: 200, y: 980 },
        ],
        connections: [
          [0,1],[1,2],[2,3,'No'],[2,4,'Sí'],[4,5],[5,6],[6,7,'Sí'],[6,8,'No'],[7,9],[9,10],[8,1],[3,1]
        ]
      },
    ];
  }

  _buildGrid() {
    const grid = document.getElementById('templates-grid');
    grid.innerHTML = '';
    this._templates.forEach(t => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-icon">${t.icon}</div>
        <div class="template-name">${t.name}</div>
        <div class="template-desc">${t.desc}</div>
        <span class="template-tag">${t.tag}</span>`;
      card.addEventListener('click', () => this._applyTemplate(t));
      grid.appendChild(card);
    });
  }

  show() {
    document.getElementById('modal-templates').classList.remove('hidden');
  }

  _applyTemplate(tpl) {
    const flowId = this.model.createFlow(tpl.name);
    this.model.setActiveFlow(flowId);
    const f = this.model.getFlow(flowId);

    // Create nodes and get id mapping
    const idMap = {};
    tpl.nodes.forEach((n, i) => {
      const id = this.model.addNode(flowId, n);
      idMap[i] = id;
    });

    // Create connections
    tpl.connections.forEach(([fromIdx, toIdx, label]) => {
      this.model.addConnection(flowId, {
        from: idMap[fromIdx], to: idMap[toIdx], label: label || ''
      });
    });

    this.model.saveToStorage();
    document.getElementById('modal-templates').classList.add('hidden');
    this.controller._renderAll();
    setTimeout(() => this.controller._fitToScreen(), 100);
    toast(`Plantilla "${tpl.name}" cargada`, 'success');
  }
}


/* ─────────────────────── PRESENTATION MODE ─────────────────────── */
class PresentationMode {
  constructor(model, controller) {
    this.model      = model;
    this.controller = controller;
    this.active     = false;
    this.steps      = [];
    this.stepIdx    = 0;

    document.getElementById('btn-present').addEventListener('click', () => this.enter());
    document.getElementById('pres-exit').addEventListener('click',   () => this.exit());
    document.getElementById('pres-next').addEventListener('click',   () => this.next());
    document.getElementById('pres-prev').addEventListener('click',   () => this.prev());

    window.addEventListener('keydown', e => {
      if (!this.active) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.next();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this.prev();
      if (e.key === 'Escape') this.exit();
    });
  }

  enter() {
    const f = this.model.getActiveFlow();
    if (!f || !f.nodes.length) { toast('No hay nodos para presentar', 'error'); return; }

    // Build ordered step list (same logic as simulation)
    const startNode = f.nodes.find(n => n.type === 'start');
    const queue = [startNode ? startNode.id : f.nodes[0].id];
    const visited = new Set();
    this.steps = [];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const node = f.nodes.find(n => n.id === id);
      if (node) this.steps.push(node);
      f.connections.filter(c => c.from === id).forEach(c => {
        if (!visited.has(c.to)) queue.push(c.to);
      });
    }

    this.stepIdx = 0;
    this.active  = true;

    document.getElementById('pres-title').textContent = f.name;
    document.getElementById('presentation-mode').classList.remove('hidden');
    this._renderStep();
  }

  exit() {
    this.active = false;
    document.getElementById('presentation-mode').classList.add('hidden');
    document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('pres-highlight'));
  }

  next() {
    if (this.stepIdx < this.steps.length - 1) { this.stepIdx++; this._renderStep(); }
  }

  prev() {
    if (this.stepIdx > 0) { this.stepIdx--; this._renderStep(); }
  }

  _renderStep() {
    const node = this.steps[this.stepIdx];
    const f    = this.model.getActiveFlow();

    // Update info box
    document.getElementById('pres-node-name').textContent  = node.label;
    document.getElementById('pres-node-desc').textContent  = node.desc  || '';
    document.getElementById('pres-node-owner').textContent = node.owner ? `👤 ${node.owner}` : '';
    document.getElementById('pres-step-label').textContent =
      `Paso ${this.stepIdx + 1} / ${this.steps.length}`;

    // Re-render info box animation
    const info = document.querySelector('.pres-info');
    info.style.animation = 'none';
    void info.offsetWidth;
    info.style.animation = 'presInfoIn 0.3s ease';

    // Highlight node on canvas
    document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('sim-active', 'sim-done'));
    for (let i = 0; i < this.stepIdx; i++) {
      const el = document.getElementById('node-' + this.steps[i].id);
      if (el) el.classList.add('sim-done');
    }
    const activeEl = document.getElementById('node-' + node.id);
    if (activeEl) activeEl.classList.add('sim-active');

    // Pan to node
    const ctrl = this.controller;
    const container = ctrl.view.container;
    const rect = container.getBoundingClientRect();
    const targetX = rect.width  / 2 - (node.x + 75) * ctrl.zoom;
    const targetY = rect.height / 2 - (node.y + 35) * ctrl.zoom;
    ctrl.panX = targetX;
    ctrl.panY = targetY;
    ctrl._applyTransform();
  }
}


/* ─────────────────────── CONTEXT MENU ─────────────────────── */
class ContextMenu {
  constructor(model, controller) {
    this.model      = model;
    this.controller = controller;
    this._menu      = document.getElementById('context-menu');
    this._list      = document.getElementById('context-menu-list');

    document.getElementById('canvas-container').addEventListener('contextmenu', e => {
      e.preventDefault();
      this._show(e);
    });
    document.addEventListener('click', () => this.hide());
    document.addEventListener('contextmenu', () => {}); // prevent extra triggers
  }

  _show(e) {
    const nodeEl = e.target.closest('.flow-node');
    const connEl = e.target.closest('.conn-path');

    let items = [];
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      const f = this.model.getActiveFlow();
      const node = f.nodes.find(n => n.id === nodeId);
      items = [
        { icon:'✎', label:'Editar propiedades', action: () => this.controller._selectNode(nodeId) },
        { icon:'⧉', label:'Duplicar nodo',       action: () => this._duplicateNode(nodeId) },
        { icon:'🎯', label:'Centrar en pantalla', action: () => this._centerNode(node) },
        { sep: true },
        { icon:'✕', label:'Eliminar nodo', action: () => {
          this.model.deleteNode(this.model.activeFlowId, nodeId);
          this.controller.selectedNodeId = null;
          this.controller.view.hideProperties();
          this.controller._renderAll();
        }, danger: true },
      ];
    } else if (connEl) {
      const connId = connEl.dataset.connId;
      items = [
        { icon:'✎', label:'Editar etiqueta',   action: () => {
          const rect = connEl.getBoundingClientRect();
          this.controller._selectConn(connId, e.clientX, e.clientY);
          openConnLabelModal(connId, this.model, this.controller);
        }},
        { sep: true },
        { icon:'✕', label:'Eliminar conexión', action: () => {
          this.model.deleteConnection(this.model.activeFlowId, connId);
          this.controller._renderAll();
        }, danger: true },
      ];
    } else {
      // Canvas background
      const canvasPos = this.controller._screenToCanvas(e.clientX, e.clientY);
      const types = [
        { type:'process',  label:'Agregar Proceso',   icon:'▣' },
        { type:'decision', label:'Agregar Decisión',  icon:'◆' },
        { type:'io',       label:'Agregar E/S',        icon:'⬡' },
        { type:'note',     label:'Agregar Nota',       icon:'✎' },
      ];
      items = types.map(t => ({
        icon: t.icon, label: t.label,
        action: () => {
          const defaultLabels = { process:'Proceso', decision:'¿Condición?', io:'Entrada/Salida', note:'Nota' };
          let x = canvasPos.x - 75, y = canvasPos.y - 30;
          if (this.controller.snapEnabled) {
            x = Math.round(x / 20) * 20;
            y = Math.round(y / 20) * 20;
          }
          this.model.addNode(this.model.activeFlowId, { type: t.type, label: defaultLabels[t.type], x, y });
          this.controller._renderAll();
        }
      }));
      items.push({ sep: true });
      items.push({ icon:'⊡', label:'Ajustar a pantalla', action: () => this.controller._fitToScreen() });
      items.push({ icon:'⊞', label:'Toggle cuadrícula',  action: () => document.getElementById('btn-grid').click() });
    }

    this._list.innerHTML = '';
    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('li');
        sep.className = 'ctx-sep';
        this._list.appendChild(sep);
        return;
      }
      const li = document.createElement('li');
      li.className = 'ctx-item' + (item.danger ? ' danger' : '');
      li.innerHTML = `<span class="ctx-icon">${item.icon}</span><span>${item.label}</span>`;
      li.addEventListener('click', () => { item.action(); this.hide(); });
      this._list.appendChild(li);
    });

    this._menu.style.left = e.clientX + 'px';
    this._menu.style.top  = e.clientY + 'px';
    this._menu.classList.remove('hidden');

    // Ensure menu stays in viewport
    requestAnimationFrame(() => {
      const mr = this._menu.getBoundingClientRect();
      if (mr.right > window.innerWidth)  this._menu.style.left = (e.clientX - mr.width) + 'px';
      if (mr.bottom > window.innerHeight) this._menu.style.top = (e.clientY - mr.height) + 'px';
    });
  }

  hide() { this._menu.classList.add('hidden'); }

  _duplicateNode(nodeId) {
    const f = this.model.getActiveFlow();
    const node = f.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newId = this.model.addNode(this.model.activeFlowId, {
      ...node, x: node.x + 40, y: node.y + 40, label: node.label + ' (copia)'
    });
    this.controller._renderAll();
    this.controller._selectNode(newId);
    toast('Nodo duplicado', 'info');
  }

  _centerNode(node) {
    const ctrl = this.controller;
    const container = ctrl.view.container;
    const rect = container.getBoundingClientRect();
    ctrl.panX = rect.width  / 2 - (node.x + 75) * ctrl.zoom;
    ctrl.panY = rect.height / 2 - (node.y + 35) * ctrl.zoom;
    ctrl._applyTransform();
  }
}


/* ─────────────────────── CONNECTION LABEL EDITOR ─────────────────────── */
function openConnLabelModal(connId, model, controller) {
  const f    = model.getActiveFlow();
  const conn = f.connections.find(c => c.id === connId);
  if (!conn) return;

  document.getElementById('conn-label-input').value = conn.label || '';

  // Style selector
  document.querySelectorAll('.conn-style-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.style || 'solid') === (conn.style || 'solid'));
  });

  document.getElementById('modal-conn-label').classList.remove('hidden');

  const okBtn = document.getElementById('modal-conn-ok');
  const cancelBtn = document.getElementById('modal-conn-cancel');
  const onOk = () => {
    const label = document.getElementById('conn-label-input').value.trim();
    const style = document.querySelector('.conn-style-btn.active')?.dataset.style || 'solid';
    conn.label = label;
    conn.style = style;
    model.saveToStorage();
    document.getElementById('modal-conn-label').classList.add('hidden');
    controller._renderAll();
    toast('Conexión actualizada', 'success');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
  };
  const onCancel = () => {
    document.getElementById('modal-conn-label').classList.add('hidden');
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
  };
  okBtn.addEventListener('click', onOk);
  cancelBtn.addEventListener('click', onCancel);

  document.querySelectorAll('.conn-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.conn-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}


/* ─────────────────────── BOOTSTRAP EXTRAS ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Wait for main MVC to initialize first
  setTimeout(() => {
    // Access globals set by app.js bootstrap
    const ctrl  = window._flowCtrl;
    const model = window._flowModel;
    const view  = window._flowView;
    if (!ctrl) return;

    // Instantiate all extras
    const minimap     = new Minimap(model, ctrl);
    const search      = new FlowSearch(model, ctrl);
    const stats       = new FlowStats(model);
    const templates   = new TemplateLibrary(model, ctrl);
    const pres        = new PresentationMode(model, ctrl);
    const ctxMenu     = new ContextMenu(model, ctrl);

    window._minimap = minimap;

    // Hook minimap refresh into render cycle
    const origRenderAll = ctrl._renderAll.bind(ctrl);
    ctrl._renderAll = function() {
      origRenderAll();
      minimap.refresh();
    };
    const origApply = ctrl._applyTransform.bind(ctrl);
    ctrl._applyTransform = function() {
      origApply();
      minimap.refresh();
    };

    // Wire conn-edit button
    document.getElementById('conn-edit-btn').addEventListener('click', () => {
      const connId = document.getElementById('conn-tooltip').dataset.connId;
      if (connId) openConnLabelModal(connId, model, ctrl);
    });

    // Apply connection styles in render (patch view)
    const origRenderConns = view.renderConnections.bind(view);
    view.renderConnections = function(connections, nodes, selectedConnId) {
      origRenderConns(connections, nodes, selectedConnId);
      // Apply styles
      connections.forEach(c => {
        if (c.style && c.style !== 'solid') {
          const pathEl = document.querySelector(`.conn-path[data-conn-id="${c.id}"]`);
          if (pathEl) pathEl.setAttribute('data-style', c.style);
        }
      });
    };

    // Keyboard shortcut: Ctrl+F = search
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        search.open();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        pres.enter();
      }
    });

    // Initial minimap draw
    minimap.refresh();

  }, 200);
});
