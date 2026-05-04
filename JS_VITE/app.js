/* ============================================================
   FlowCraft — MVC Architecture
   Model: FlowModel
   View:  FlowView
   Controller: FlowController
   ============================================================ */

/* ─────────────────────────── MODEL ─────────────────────────── */
class FlowModel {
    constructor() {
        this.flows = [];
        this.activeFlowId = null;
        this._undoStack = {};
        this._redoStack = {};
        this.loadFromStorage();
        if (!this.flows.length) this._seedDefaults();
    }

    _uuid() {
        return 'n' + Math.random().toString(36).slice(2, 10);
    }

    _seedDefaults() {
        const id = this.createFlow('Proceso de Ventas');
        const f = this.getFlow(id);
        const n1 = this.addNode(id, { type: 'start', label: 'Inicio', x: 200, y: 100 });
        const n2 = this.addNode(id, { type: 'process', label: 'Recibir solicitud', x: 200, y: 220, owner: 'Ventas' });
        const n3 = this.addNode(id, { type: 'decision', label: '¿Cliente nuevo?', x: 200, y: 360 });
        const n4 = this.addNode(id, { type: 'process', label: 'Alta de cliente', x: 80, y: 490, owner: 'Admin' });
        const n5 = this.addNode(id, { type: 'process', label: 'Cotización', x: 340, y: 490, owner: 'Ventas' });
        const n6 = this.addNode(id, { type: 'io', label: 'Enviar propuesta', x: 200, y: 620 });
        const n7 = this.addNode(id, { type: 'end', label: 'Fin', x: 200, y: 740 });
        this.addConnection(id, { from: n1, to: n2 });
        this.addConnection(id, { from: n2, to: n3 });
        this.addConnection(id, { from: n3, to: n4, label: 'Sí' });
        this.addConnection(id, { from: n3, to: n5, label: 'No' });
        this.addConnection(id, { from: n4, to: n6 });
        this.addConnection(id, { from: n5, to: n6 });
        this.addConnection(id, { from: n6, to: n7 });
        this.saveToStorage();
    }

    createFlow(name = 'Nuevo Flujo') {
        const id = 'f' + Date.now();
        this.flows.push({ id, name, nodes: [], connections: [], created: Date.now() });
        this._undoStack[id] = [];
        this._redoStack[id] = [];
        if (!this.activeFlowId) this.activeFlowId = id;
        this.saveToStorage();
        return id;
    }

    deleteFlow(id) {
        this.flows = this.flows.filter(f => f.id !== id);
        if (this.activeFlowId === id) {
            this.activeFlowId = this.flows.length ? this.flows[0].id : null;
        }
        this.saveToStorage();
    }

    getFlow(id) {
        return this.flows.find(f => f.id === id) || null;
    }

    getActiveFlow() {
        return this.getFlow(this.activeFlowId);
    }

    renameFlow(id, name) {
        const f = this.getFlow(id);
        if (f) { f.name = name; this.saveToStorage(); }
    }

    setActiveFlow(id) {
        this.activeFlowId = id;
    }

    // ── Node CRUD ──
    addNode(flowId, data) {
        const f = this.getFlow(flowId);
        if (!f) return null;
        const node = {
            id: this._uuid(),
            type: data.type || 'process',
            label: data.label || 'Proceso',
            desc: data.desc || '',
            owner: data.owner || '',
            x: data.x || 200,
            y: data.y || 200,
            color: data.color || null,
        };
        this._pushUndo(flowId);
        f.nodes.push(node);
        this.saveToStorage();
        return node.id;
    }

    updateNode(flowId, nodeId, changes) {
        const f = this.getFlow(flowId);
        if (!f) return;
        const node = f.nodes.find(n => n.id === nodeId);
        if (!node) return;
        this._pushUndo(flowId);
        Object.assign(node, changes);
        this.saveToStorage();
    }

    deleteNode(flowId, nodeId) {
        const f = this.getFlow(flowId);
        if (!f) return;
        this._pushUndo(flowId);
        f.nodes = f.nodes.filter(n => n.id !== nodeId);
        f.connections = f.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        this.saveToStorage();
    }

    moveNode(flowId, nodeId, x, y) {
        const f = this.getFlow(flowId);
        if (!f) return;
        const node = f.nodes.find(n => n.id === nodeId);
        if (node) { node.x = x; node.y = y; }
        // Debounced save — done externally
    }

    // ── Connection CRUD ──
    addConnection(flowId, data) {
        const f = this.getFlow(flowId);
        if (!f) return null;
        // Avoid duplicates
        const exists = f.connections.find(c => c.from === data.from && c.to === data.to);
        if (exists) return exists.id;
        const conn = {
            id: this._uuid(),
            from: data.from,
            to: data.to,
            label: data.label || '',
        };
        this._pushUndo(flowId);
        f.connections.push(conn);
        this.saveToStorage();
        return conn.id;
    }

    deleteConnection(flowId, connId) {
        const f = this.getFlow(flowId);
        if (!f) return;
        this._pushUndo(flowId);
        f.connections = f.connections.filter(c => c.id !== connId);
        this.saveToStorage();
    }

    updateConnection(flowId, connId, changes) {
        const f = this.getFlow(flowId);
        if (!f) return;
        const c = f.connections.find(c => c.id === connId);
        if (c) Object.assign(c, changes);
        this.saveToStorage();
    }

    // ── Undo/Redo ──
    _snapshot(flowId) {
        const f = this.getFlow(flowId);
        if (!f) return null;
        return JSON.parse(JSON.stringify({ nodes: f.nodes, connections: f.connections }));
    }

    _pushUndo(flowId) {
        if (!this._undoStack[flowId]) this._undoStack[flowId] = [];
        if (!this._redoStack[flowId]) this._redoStack[flowId] = [];
        this._undoStack[flowId].push(this._snapshot(flowId));
        if (this._undoStack[flowId].length > 50) this._undoStack[flowId].shift();
        this._redoStack[flowId] = [];
    }

    undo(flowId) {
        const stack = this._undoStack[flowId];
        if (!stack || !stack.length) return false;
        const f = this.getFlow(flowId);
        if (!f) return false;
        this._redoStack[flowId].push(this._snapshot(flowId));
        const snap = stack.pop();
        f.nodes = snap.nodes;
        f.connections = snap.connections;
        this.saveToStorage();
        return true;
    }

    redo(flowId) {
        const stack = this._redoStack[flowId];
        if (!stack || !stack.length) return false;
        const f = this.getFlow(flowId);
        if (!f) return false;
        this._undoStack[flowId].push(this._snapshot(flowId));
        const snap = stack.pop();
        f.nodes = snap.nodes;
        f.connections = snap.connections;
        this.saveToStorage();
        return true;
    }

    // ── Persistence ──
    saveToStorage() {
        try {
            localStorage.setItem('flowcraft_v1', JSON.stringify({
                flows: this.flows,
                activeFlowId: this.activeFlowId
            }));
        } catch (e) { }
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem('flowcraft_v1');
            if (!raw) return;
            const data = JSON.parse(raw);
            this.flows = data.flows || [];
            this.activeFlowId = data.activeFlowId || null;
            this.flows.forEach(f => {
                this._undoStack[f.id] = [];
                this._redoStack[f.id] = [];
            });
        } catch (e) { }
    }

    exportFlow(flowId) {
        const f = this.getFlow(flowId);
        return f ? JSON.stringify(f, null, 2) : '';
    }

    importFlow(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data.nodes || !data.connections) return false;
            const id = 'f' + Date.now();
            data.id = id;
            data.name = data.name || 'Flujo importado';
            this.flows.push(data);
            this._undoStack[id] = [];
            this._redoStack[id] = [];
            this.activeFlowId = id;
            this.saveToStorage();
            return id;
        } catch (e) { return false; }
    }
}


/* ─────────────────────────── VIEW ─────────────────────────── */
class FlowView {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.arrowsSvg = document.getElementById('arrows-svg');
        this.flowList = document.getElementById('flow-list');
        this.propPanel = document.getElementById('properties-panel');
        this.propLabel = document.getElementById('prop-label');
        this.propDesc = document.getElementById('prop-desc');
        this.propOwner = document.getElementById('prop-owner');
        this.colorSwatches = document.getElementById('color-swatches');
        this.statusMsg = document.getElementById('status-msg');
        this.statusCoords = document.getElementById('status-coords');
        this.statusNodes = document.getElementById('status-nodes');
        this.flowTitle = document.getElementById('flow-title-display');
        this.zoomLabel = document.getElementById('zoom-label');
        this.connTooltip = document.getElementById('conn-tooltip');
        this.connLabelText = document.getElementById('conn-label-text');
        this.container = document.getElementById('canvas-container');

        this.NODE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4'];
        this._buildColorSwatches();

        // Empty state
        this._emptyState = document.createElement('div');
        this._emptyState.id = 'canvas-empty';
        this._emptyState.innerHTML = '<h2>Canvas vacío</h2><p>Arrastra un nodo desde la paleta para comenzar</p>';
        this.canvas.appendChild(this._emptyState);
    }

    _buildColorSwatches() {
        this.colorSwatches.innerHTML = '';
        this.NODE_COLORS.forEach((color, i) => {
            const el = document.createElement('div');
            el.className = 'color-swatch';
            el.dataset.colorIdx = i;
            el.style.background = color;
            this.colorSwatches.appendChild(el);
        });
    }

    // ── FLOW LIST ──
    renderFlowList(flows, activeId) {
        this.flowList.innerHTML = '';
        flows.forEach(f => {
            const li = document.createElement('li');
            li.className = 'flow-item' + (f.id === activeId ? ' active' : '');
            li.dataset.flowId = f.id;
            li.innerHTML = `<span class="flow-item-dot"></span>
        <span class="flow-item-name">${this._esc(f.name)}</span>
        <button class="flow-item-del" data-del="${f.id}" title="Eliminar">✕</button>`;
            this.flowList.appendChild(li);
        });
    }

    setFlowTitle(name) {
        this.flowTitle.textContent = name || 'Sin título';
        document.title = `FlowCraft — ${name}`;
    }

    // ── NODES ──
    renderNodes(nodes, selectedId) {
        this.nodesLayer.innerHTML = '';
        nodes.forEach(n => this.renderNode(n, n.id === selectedId));
        this._toggleEmpty(nodes.length === 0);
    }

    renderNode(node, selected = false) {
        let el = document.getElementById('node-' + node.id);
        if (!el) {
            el = document.createElement('div');
            el.id = 'node-' + node.id;
            el.className = 'flow-node';
            this.nodesLayer.appendChild(el);
        }

        const typeLabels = {
            start: 'Inicio', end: 'Fin', process: 'Proceso', decision: 'Decisión',
            io: 'Entrada/Salida', subprocess: 'Subproceso', delay: 'Espera', note: 'Nota'
        };
        const typeIcons = {
            start: '▶', end: '■', process: '▣', decision: '◆',
            io: '⬡', subprocess: '⊞', delay: '◷', note: '✎'
        };
        const colorClass = node.color !== null ? `node-color-${node.color}` : '';

        el.className = `flow-node node-${node.type} ${colorClass} ${selected ? 'selected' : ''}`;
        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.dataset.nodeId = node.id;

        el.innerHTML = `
      <div class="node-body">
        <div class="node-type-badge" style="color:${this._nodeColor(node.type)}">
          <span>${typeIcons[node.type] || '●'}</span>
          <span>${typeLabels[node.type] || node.type}</span>
        </div>
        <div class="node-label">${this._esc(node.label)}</div>
        ${node.owner ? `<div class="node-owner">👤 ${this._esc(node.owner)}</div>` : ''}
      </div>
      <div class="node-handles">
        <div class="conn-handle handle-top"    data-dir="top"    data-node="${node.id}"></div>
        <div class="conn-handle handle-bottom" data-dir="bottom" data-node="${node.id}"></div>
        <div class="conn-handle handle-left"   data-dir="left"   data-node="${node.id}"></div>
        <div class="conn-handle handle-right"  data-dir="right"  data-node="${node.id}"></div>
      </div>`;
    }

    _nodeColor(type) {
        const map = {
            start: '#22c55e', end: '#ef4444', process: '#3b82f6', decision: '#f59e0b',
            io: '#8b5cf6', subprocess: '#06b6d4', delay: '#ec4899', note: '#6b7280'
        };
        return map[type] || '#6b7280';
    }

    updateNodePosition(nodeId, x, y) {
        const el = document.getElementById('node-' + nodeId);
        if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    }

    removeNode(nodeId) {
        const el = document.getElementById('node-' + nodeId);
        if (el) el.remove();
    }

    // ── CONNECTIONS ──
    renderConnections(connections, nodes, selectedConnId) {
        // Remove old paths
        this.arrowsSvg.querySelectorAll('.conn-path, .conn-label-group').forEach(e => e.remove());
        // Remove temp line if present
        const tmp = document.getElementById('temp-line');
        if (tmp) tmp.remove();

        connections.forEach(conn => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return;

            const { x1, y1, x2, y2 } = this._connPoints(fromNode, toNode);
            const path = this._bezierPath(x1, y1, x2, y2);

            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', path);
            pathEl.setAttribute('marker-end', conn.id === selectedConnId ? 'url(#arrowhead-selected)' : 'url(#arrowhead)');
            pathEl.className.baseVal = `conn-path${conn.id === selectedConnId ? ' selected' : ''}`;
            pathEl.dataset.connId = conn.id;
            this.arrowsSvg.appendChild(pathEl);

            // Label
            if (conn.label) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.className.baseVal = 'conn-label-group';
                g.dataset.connId = conn.id;

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', mx - 20); rect.setAttribute('y', my - 9);
                rect.setAttribute('width', 40); rect.setAttribute('height', 16);
                rect.setAttribute('rx', 4); rect.setAttribute('ry', 4);
                rect.setAttribute('fill', 'var(--surface2)');
                rect.setAttribute('stroke', 'var(--border)');
                rect.setAttribute('stroke-width', '1');

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', mx); text.setAttribute('y', my + 3);
                text.className.baseVal = 'conn-label-text';
                text.textContent = conn.label;

                g.appendChild(rect); g.appendChild(text);
                this.arrowsSvg.appendChild(g);
            }
        });
    }

    drawTempLine(x1, y1, x2, y2) {
        let line = document.getElementById('temp-line');
        if (!line) {
            line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.id = 'temp-line';
            this.arrowsSvg.appendChild(line);
        }
        line.setAttribute('d', this._bezierPath(x1, y1, x2, y2));
    }

    removeTempLine() {
        const line = document.getElementById('temp-line');
        if (line) line.remove();
    }

    /*_connPoints(from, to) {
        const fw = 150, fh = 60;
        const x1 = from.x + fw / 2;
        const y1 = from.y + fh;
        const x2 = to.x + fw / 2;
        const y2 = to.y;
        return { x1, y1, x2, y2 };
    }*/

    _connPoints(from, to) {
        const nodeW = { decision: 180, start: 150, end: 150 };
        const nodeH = { decision: 120, start: 60, end: 60 };
        const fw = nodeW[from.type] || 150;
        const fh = nodeH[from.type] || 60;
        const tw = nodeW[to.type] || 150;
        const th = nodeH[to.type] || 60;
        const x1 = from.x + fw / 2;
        const y1 = from.y + fh;
        const x2 = to.x + tw / 2;
        const y2 = to.y;
        return { x1, y1, x2, y2 };
    }

    _bezierPath(x1, y1, x2, y2) {
        const dy = Math.abs(y2 - y1);
        const ctrl = Math.max(60, dy * 0.4);
        return `M ${x1} ${y1} C ${x1} ${y1 + ctrl}, ${x2} ${y2 - ctrl}, ${x2} ${y2}`;
    }

    // ── PROPERTIES PANEL ──
    showProperties(node) {
        this.propPanel.style.display = 'block';
        this.propLabel.value = node.label || '';
        this.propDesc.value = node.desc || '';
        this.propOwner.value = node.owner || '';
        this.colorSwatches.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', parseInt(s.dataset.colorIdx) === node.color);
        });
    }

    hideProperties() {
        this.propPanel.style.display = 'none';
    }

    // ── STATUS BAR ──
    setStatus(msg) { this.statusMsg.textContent = msg; }
    setCoords(x, y) { this.statusCoords.textContent = `x:${Math.round(x)} y:${Math.round(y)}`; }
    setNodeCount(n, c) { this.statusNodes.textContent = `${n} nodo${n !== 1 ? 's' : ''} · ${c} conexión${c !== 1 ? 'es' : ''}`; }
    setZoom(z) { this.zoomLabel.textContent = Math.round(z * 100) + '%'; }

    // ── MODALS ──
    showRenameModal(currentName) {
        document.getElementById('modal-rename-input').value = currentName;
        document.getElementById('modal-rename').classList.remove('hidden');
        setTimeout(() => document.getElementById('modal-rename-input').focus(), 50);
    }
    hideRenameModal() { document.getElementById('modal-rename').classList.add('hidden'); }

    showImportModal() {
        document.getElementById('modal-import-input').value = '';
        document.getElementById('modal-import').classList.remove('hidden');
    }
    hideImportModal() { document.getElementById('modal-import').classList.add('hidden'); }

    // ── CONNECTION TOOLTIP ──
    showConnTooltip(x, y, label, connId) {
        this.connLabelText.textContent = label || 'Conexión';
        this.connTooltip.classList.remove('hidden');
        this.connTooltip.style.left = (x + 10) + 'px';
        this.connTooltip.style.top = (y - 20) + 'px';
        this.connTooltip.dataset.connId = connId;
    }
    hideConnTooltip() { this.connTooltip.classList.add('hidden'); }

    _toggleEmpty(show) {
        this._emptyState.style.display = show ? 'block' : 'none';
    }

    _esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}


/* ─────────────────────────── CONTROLLER ─────────────────────────── */
class FlowController {
    constructor(model, view) {
        this.model = model;
        this.view = view;

        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStart = null;

        this.selectedNodeId = null;
        this.selectedConnId = null;

        this.draggingNode = null;
        this.dragOffX = 0;
        this.dragOffY = 0;
        this.nodeMoved = false;
        this._dragUndoSnapshot = null;

        this.connectingFrom = null; // { nodeId, dir }
        this.connectingStart = null; // { x, y } in canvas coords

        this.snapGrid = 20;
        this.snapEnabled = true;
        this.gridVisible = true;

        this._saveDebounce = null;

        this._init();
    }

    _init() {
        this._renderAll();
        this._bindToolbar();
        this._bindSidebar();
        this._bindCanvas();
        this._bindModals();
        this._bindKeyboard();
        this._applyTransform();
    }

    // ═══════════════════════════════════════
    //  RENDER ORCHESTRATION
    // ═══════════════════════════════════════
    _renderAll() {
        const f = this.model.getActiveFlow();
        this.view.renderFlowList(this.model.flows, this.model.activeFlowId);
        if (f) {
            this.view.setFlowTitle(f.name);
            this.view.renderNodes(f.nodes, this.selectedNodeId);
            this.view.renderConnections(f.connections, f.nodes, this.selectedConnId);
            this.view.setNodeCount(f.nodes.length, f.connections.length);
        } else {
            this.view.setFlowTitle('Sin flujo activo');
        }
    }

    _renderConnections() {
        const f = this.model.getActiveFlow();
        if (f) this.view.renderConnections(f.connections, f.nodes, this.selectedConnId);
    }

    // ═══════════════════════════════════════
    //  TOOLBAR BINDINGS
    // ═══════════════════════════════════════
    _bindToolbar() {
        document.getElementById('btn-new-flow').addEventListener('click', () => {
            const id = this.model.createFlow('Flujo ' + (this.model.flows.length));
            this.model.setActiveFlow(id);
            this.selectedNodeId = null;
            this.view.hideProperties();
            this._renderAll();
        });

        document.getElementById('btn-rename').addEventListener('click', () => {
            const f = this.model.getActiveFlow();
            if (f) this.view.showRenameModal(f.name);
        });

        document.getElementById('btn-zoom-in').addEventListener('click', () => this._changeZoom(0.15));
        document.getElementById('btn-zoom-out').addEventListener('click', () => this._changeZoom(-0.15));
        document.getElementById('btn-fit').addEventListener('click', () => this._fitToScreen());

        document.getElementById('btn-undo').addEventListener('click', () => {
            if (this.model.undo(this.model.activeFlowId)) {
                this.selectedNodeId = null;
                this.view.hideProperties();
                this._renderAll();
                this.view.setStatus('Acción deshecha');
            }
        });

        document.getElementById('btn-redo').addEventListener('click', () => {
            if (this.model.redo(this.model.activeFlowId)) {
                this.selectedNodeId = null;
                this.view.hideProperties();
                this._renderAll();
                this.view.setStatus('Acción rehecha');
            }
        });

        document.getElementById('btn-grid').addEventListener('click', () => {
            this.gridVisible = !this.gridVisible;
            document.getElementById('grid-overlay').style.display = this.gridVisible ? '' : 'none';
            document.getElementById('btn-grid').classList.toggle('active', this.gridVisible);
        });

        document.getElementById('btn-snap').addEventListener('click', () => {
            this.snapEnabled = !this.snapEnabled;
            document.getElementById('btn-snap').classList.toggle('active', this.snapEnabled);
            this.view.setStatus(this.snapEnabled ? 'Snap activado' : 'Snap desactivado');
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            this.model.saveToStorage();
            this.view.setStatus('✓ Guardado correctamente');
        });

        document.getElementById('btn-export-json').addEventListener('click', () => {
            const f = this.model.getActiveFlow();
            if (!f) return;
            const blob = new Blob([this.model.exportFlow(f.id)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = f.name.replace(/\s+/g, '_') + '.json';
            a.click(); URL.revokeObjectURL(url);
            this.view.setStatus('Exportado como JSON');
        });

        document.getElementById('btn-export-png').addEventListener('click', () => {
            this._exportPNG();
        });

        document.getElementById('btn-import').addEventListener('click', () => {
            this.view.showImportModal();
        });
    }

    // ═══════════════════════════════════════
    //  SIDEBAR BINDINGS
    // ═══════════════════════════════════════
    _bindSidebar() {
        // Flow list clicks (delegation)
        document.getElementById('flow-list').addEventListener('click', e => {
            const delBtn = e.target.closest('[data-del]');
            if (delBtn) {
                const id = delBtn.dataset.del;
                if (this.model.flows.length <= 1) {
                    this.view.setStatus('No puedes eliminar el único flujo');
                    return;
                }
                if (confirm('¿Eliminar este flujo?')) {
                    this.model.deleteFlow(id);
                    this.selectedNodeId = null;
                    this.view.hideProperties();
                    this._renderAll();
                }
                return;
            }
            const item = e.target.closest('.flow-item');
            if (item) {
                this.model.setActiveFlow(item.dataset.flowId);
                this.selectedNodeId = null;
                this.selectedConnId = null;
                this.view.hideProperties();
                this._renderAll();
            }
        });

        // Drag from palette
        document.querySelectorAll('.palette-node').forEach(el => {
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('nodeType', el.dataset.type);
            });
        });

        // Properties panel inputs
        document.getElementById('prop-label').addEventListener('input', e => {
            if (!this.selectedNodeId) return;
            const f = this.model.getActiveFlow();
            const node = f.nodes.find(n => n.id === this.selectedNodeId);
            if (node) {
                node.label = e.target.value;
                this.view.renderNode(node, true);
                this._debouncedSave();
            }
        });

        document.getElementById('prop-desc').addEventListener('input', e => {
            if (!this.selectedNodeId) return;
            const f = this.model.getActiveFlow();
            const node = f.nodes.find(n => n.id === this.selectedNodeId);
            if (node) { node.desc = e.target.value; this._debouncedSave(); }
        });

        document.getElementById('prop-owner').addEventListener('input', e => {
            if (!this.selectedNodeId) return;
            const f = this.model.getActiveFlow();
            const node = f.nodes.find(n => n.id === this.selectedNodeId);
            if (node) {
                node.owner = e.target.value;
                this.view.renderNode(node, true);
                this._debouncedSave();
            }
        });

        document.getElementById('color-swatches').addEventListener('click', e => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch || !this.selectedNodeId) return;
            const idx = parseInt(swatch.dataset.colorIdx);
            const f = this.model.getActiveFlow();
            const node = f.nodes.find(n => n.id === this.selectedNodeId);
            if (node) {
                node.color = (node.color === idx) ? null : idx;
                document.querySelectorAll('.color-swatch').forEach(s =>
                    s.classList.toggle('selected', parseInt(s.dataset.colorIdx) === node.color)
                );
                this.view.renderNode(node, true);
                this._debouncedSave();
            }
        });

        document.getElementById('btn-delete-node').addEventListener('click', () => {
            if (!this.selectedNodeId) return;
            this.model.deleteNode(this.model.activeFlowId, this.selectedNodeId);
            this.selectedNodeId = null;
            this.view.hideProperties();
            this._renderAll();
            this.view.setStatus('Nodo eliminado');
        });
    }

    // ═══════════════════════════════════════
    //  CANVAS BINDINGS
    // ═══════════════════════════════════════
    _bindCanvas() {
        const container = this.view.container;
        const canvas = this.view.canvas;

        // Drop from palette
        canvas.addEventListener('dragover', e => e.preventDefault());
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            const type = e.dataTransfer.getData('nodeType');
            if (!type || !this.model.activeFlowId) return;
            const rect = canvas.getBoundingClientRect();
            let x = (e.clientX - rect.left) / this.zoom - this.panX / this.zoom;
            let y = (e.clientY - rect.top) / this.zoom - this.panY / this.zoom;
            if (this.snapEnabled) { x = Math.round(x / this.snapGrid) * this.snapGrid; y = Math.round(y / this.snapGrid) * this.snapGrid; }
            const defaultLabels = { start: 'Inicio', end: 'Fin', process: 'Proceso', decision: '¿Condición?', io: 'Entrada/Salida', subprocess: 'Subproceso', delay: 'Espera', note: 'Nota' };
            this.model.addNode(this.model.activeFlowId, { type, label: defaultLabels[type] || type, x, y });
            this._renderAll();
            this.view.setStatus(`Nodo '${type}' añadido`);
        });

        // Mouse down on canvas
        container.addEventListener('mousedown', e => {
            // Middle button OR left click on empty canvas = pan
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                e.preventDefault();
                this.isPanning = true;
                this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
                container.style.cursor = 'grabbing';
                return;
            }
            if (e.button !== 0) return;

            const handle = e.target.closest('.conn-handle');
            if (handle) {
                e.stopPropagation();
                const nodeId = handle.dataset.node;
                const dir = handle.dataset.dir;
                this.connectingFrom = { nodeId, dir };
                const nodeEl = document.getElementById('node-' + nodeId);
                const nr = nodeEl.getBoundingClientRect();
                const cr = container.getBoundingClientRect();
                this.connectingStart = this._screenToCanvas(nr.left + nr.width / 2, nr.top + nr.height / 2);
                this.view.setStatus('Arrastra hasta otro nodo para conectar');
                return;
            }

            const nodeEl = e.target.closest('.flow-node');
            if (nodeEl) {
                const nodeId = nodeEl.dataset.nodeId;
                this._selectNode(nodeId);

                const f = this.model.getActiveFlow();
                const node = f.nodes.find(n => n.id === nodeId);
                const canvasClick = this._screenToCanvas(e.clientX, e.clientY);
                this.draggingNode = nodeId;
                this.dragOffX = canvasClick.x - node.x;
                this.dragOffY = canvasClick.y - node.y;
                this.nodeMoved = false;
                this._dragUndoSnapshot = this.model._snapshot(this.model.activeFlowId);
                return;
            }

            const connPath = e.target.closest('.conn-path');
            if (connPath) {
                this._selectConn(connPath.dataset.connId, e.clientX, e.clientY);
                return;
            }

            // Left click on empty canvas = pan
            this._deselect();
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            container.style.cursor = 'grabbing';
        });

        // Mouse move
        window.addEventListener('mousemove', e => {
            const canvasPos = this._screenToCanvas(e.clientX, e.clientY);
            this.view.setCoords(canvasPos.x, canvasPos.y);

            if (this.isPanning) {
                this.panX = e.clientX - this.panStart.x;
                this.panY = e.clientY - this.panStart.y;
                this._applyTransform();
                return;
            }

            if (this.connectingFrom) {
                const to = this._screenToCanvas(e.clientX, e.clientY);
                this.view.drawTempLine(
                    this.connectingStart.x, this.connectingStart.y,
                    to.x, to.y
                );
                return;
            }

            if (this.draggingNode) {
                const canvasPos = this._screenToCanvas(e.clientX, e.clientY);
                let x = canvasPos.x - this.dragOffX;
                let y = canvasPos.y - this.dragOffY;
                if (this.snapEnabled) { x = Math.round(x / this.snapGrid) * this.snapGrid; y = Math.round(y / this.snapGrid) * this.snapGrid; }
                //x = Math.max(0, x); y = Math.max(0, y); // LIMITANTE DE -X, -Y 
                this.model.moveNode(this.model.activeFlowId, this.draggingNode, x, y);
                this.view.updateNodePosition(this.draggingNode, x, y);
                this._renderConnections();
                this.nodeMoved = true;
            }
        });

        // Mouse up
        window.addEventListener('mouseup', e => {
            if (this.isPanning) {
                this.isPanning = false;
                container.style.cursor = '';
                return;
            }

            if (this.connectingFrom) {
                const target = document.elementFromPoint(e.clientX, e.clientY);
                const targetHandle = target && target.closest('.conn-handle');
                const targetNode = target && target.closest('.flow-node');
                let toId = null;
                if (targetHandle) toId = targetHandle.dataset.node;
                else if (targetNode) toId = targetNode.dataset.nodeId;

                if (toId && toId !== this.connectingFrom.nodeId) {
                    this.model.addConnection(this.model.activeFlowId, {
                        from: this.connectingFrom.nodeId, to: toId
                    });
                    this._renderAll();
                    this.view.setStatus('Conexión creada');
                }
                this.connectingFrom = null;
                this.connectingStart = null;
                this.view.removeTempLine();
                return;
            }

            if (this.draggingNode) {
                if (this.nodeMoved) {
                    const flowId = this.model.activeFlowId;
                    if (this._dragUndoSnapshot && this.model._undoStack[flowId]) {
                        this.model._undoStack[flowId].push(this._dragUndoSnapshot);
                        if (this.model._undoStack[flowId].length > 50)
                            this.model._undoStack[flowId].shift();
                        this.model._redoStack[flowId] = [];
                    }
                    this.model.saveToStorage();
                }
                this._dragUndoSnapshot = null;
                this.draggingNode = null;
                this.nodeMoved = false;
            }
        });

        // Wheel = zoom
        container.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            this._changeZoom(delta, e.clientX, e.clientY);
        }, { passive: false });

        // Connection tooltip
        this.view.arrowsSvg.addEventListener('click', e => {
            const path = e.target.closest('.conn-path');
            if (path) this._selectConn(path.dataset.connId, e.clientX, e.clientY);
        });

        document.getElementById('conn-delete-btn').addEventListener('click', () => {
            if (this.selectedConnId) {
                this.model.deleteConnection(this.model.activeFlowId, this.selectedConnId);
                this.selectedConnId = null;
                this.view.hideConnTooltip();
                this._renderAll();
                this.view.setStatus('Conexión eliminada');
            }
        });

        // Double-click node to edit label inline
        canvas.addEventListener('dblclick', e => {
            const nodeEl = e.target.closest('.flow-node');
            if (!nodeEl) return;
            const nodeId = nodeEl.dataset.nodeId;
            const f = this.model.getActiveFlow();
            const node = f.nodes.find(n => n.id === nodeId);
            if (!node) return;
            const labelEl = nodeEl.querySelector('.node-label');
            if (!labelEl) return;
            labelEl.contentEditable = 'true';
            labelEl.focus();
            document.execCommand('selectAll', false, null);
            labelEl.addEventListener('blur', () => {
                labelEl.contentEditable = 'false';
                const newLabel = labelEl.textContent.trim() || node.label;
                this.model.updateNode(this.model.activeFlowId, nodeId, { label: newLabel });
                this.view.renderNode({ ...node, label: newLabel }, this.selectedNodeId === nodeId);
                if (this.selectedNodeId === nodeId) this.view.propLabel.value = newLabel;
                this._renderConnections();
            }, { once: true });
            labelEl.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { ev.preventDefault(); labelEl.blur(); }
                if (ev.key === 'Escape') { labelEl.textContent = node.label; labelEl.blur(); }
            });
        });
    }

    // ═══════════════════════════════════════
    //  MODALS
    // ═══════════════════════════════════════
    _bindModals() {
        document.getElementById('modal-rename-ok').addEventListener('click', () => {
            const name = document.getElementById('modal-rename-input').value.trim();
            if (name) {
                this.model.renameFlow(this.model.activeFlowId, name);
                this.view.setFlowTitle(name);
                this.view.renderFlowList(this.model.flows, this.model.activeFlowId);
            }
            this.view.hideRenameModal();
        });
        document.getElementById('modal-rename-cancel').addEventListener('click', () => this.view.hideRenameModal());
        document.getElementById('modal-rename-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('modal-rename-ok').click();
            if (e.key === 'Escape') this.view.hideRenameModal();
        });

        document.getElementById('modal-import-ok').addEventListener('click', () => {
            const json = document.getElementById('modal-import-input').value;
            const id = this.model.importFlow(json);
            if (id) {
                this.selectedNodeId = null;
                this.view.hideProperties();
                this.view.hideImportModal();
                this._renderAll();
                this.view.setStatus('Flujo importado correctamente');
            } else {
                alert('JSON inválido. Verifica el formato.');
            }
        });
        document.getElementById('modal-import-cancel').addEventListener('click', () => this.view.hideImportModal());
    }

    // ═══════════════════════════════════════
    //  KEYBOARD
    // ═══════════════════════════════════════
    _bindKeyboard() {
        window.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (this.model.undo(this.model.activeFlowId)) {
                    this.selectedNodeId = null; this.view.hideProperties(); this._renderAll();
                }
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                if (this.model.redo(this.model.activeFlowId)) {
                    this.selectedNodeId = null; this.view.hideProperties(); this._renderAll();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.model.saveToStorage();
                this.view.setStatus('✓ Guardado');
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedNodeId) {
                    this.model.deleteNode(this.model.activeFlowId, this.selectedNodeId);
                    this.selectedNodeId = null; this.view.hideProperties(); this._renderAll();
                } else if (this.selectedConnId) {
                    this.model.deleteConnection(this.model.activeFlowId, this.selectedConnId);
                    this.selectedConnId = null; this.view.hideConnTooltip(); this._renderAll();
                }
            }
            if (e.key === 'Escape') {
                this._deselect();
                if (this.connectingFrom) {
                    this.connectingFrom = null;
                    this.view.removeTempLine();
                }
            }
            // Arrow nudge
            const NUDGE = this.snapEnabled ? this.snapGrid : 5;
            if (this.selectedNodeId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const f = this.model.getActiveFlow();
                const node = f.nodes.find(n => n.id === this.selectedNodeId);
                if (!node) return;
                if (e.key === 'ArrowUp') node.y -= NUDGE;
                if (e.key === 'ArrowDown') node.y += NUDGE;
                if (e.key === 'ArrowLeft') node.x -= NUDGE;
                if (e.key === 'ArrowRight') node.x += NUDGE;
                this.view.updateNodePosition(node.id, node.x, node.y);
                this._renderConnections();
                this._debouncedSave();
            }
        });
    }

    // ═══════════════════════════════════════
    //  SELECTION
    // ═══════════════════════════════════════
    _selectNode(nodeId) {
        this.selectedNodeId = nodeId;
        this.selectedConnId = null;
        this.view.hideConnTooltip();
        const f = this.model.getActiveFlow();
        const node = f.nodes.find(n => n.id === nodeId);
        if (node) {
            this.view.showProperties(node);
            this.view.renderNodes(f.nodes, nodeId);
            this._renderConnections();
            this.view.setStatus(`Nodo seleccionado: ${node.label}`);
        }
    }

    _selectConn(connId, screenX, screenY) {
        this.selectedConnId = connId;
        this.selectedNodeId = null;
        this.view.hideProperties();
        const f = this.model.getActiveFlow();
        const conn = f.connections.find(c => c.id === connId);
        if (conn) {
            this.view.showConnTooltip(screenX, screenY, conn.label || 'Conexión', connId);
            this.view.renderNodes(f.nodes, null);
            this._renderConnections();
        }
    }

    _deselect() {
        this.selectedNodeId = null;
        this.selectedConnId = null;
        this.view.hideProperties();
        this.view.hideConnTooltip();
        const f = this.model.getActiveFlow();
        if (f) {
            this.view.renderNodes(f.nodes, null);
            this._renderConnections();
        }
    }

    // ═══════════════════════════════════════
    //  TRANSFORM / ZOOM
    // ═══════════════════════════════════════
    _applyTransform() {
        this.view.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        this.view.setZoom(this.zoom);

        // Sync grid to pan/zoom so it always aligns with canvas coordinates
        const gridSize = 20 * this.zoom;
        const gridX = this.panX % gridSize;
        const gridY = this.panY % gridSize;
        const container = this.view.container;
        container.style.setProperty('--grid-size', gridSize + 'px');
        container.style.setProperty('--grid-x', gridX + 'px');
        container.style.setProperty('--grid-y', gridY + 'px');
    }

    _changeZoom(delta, originX, originY) {
        const container = this.view.container;
        const rect = container.getBoundingClientRect();
        const cx = (originX || rect.left + rect.width / 2) - rect.left;
        const cy = (originY || rect.top + rect.height / 2) - rect.top;

        const prevZoom = this.zoom;
        this.zoom = Math.max(0.2, Math.min(3, this.zoom + delta));

        // Zoom toward mouse
        this.panX = cx - (cx - this.panX) * (this.zoom / prevZoom);
        this.panY = cy - (cy - this.panY) * (this.zoom / prevZoom);
        this._applyTransform();
    }

    _fitToScreen() {
        const f = this.model.getActiveFlow();
        if (!f || !f.nodes.length) return;
        const container = this.view.container;
        const rect = container.getBoundingClientRect();

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        f.nodes.forEach(n => {
            minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + 160); maxY = Math.max(maxY, n.y + 70);
        });
        const pw = rect.width - 80, ph = rect.height - 80;
        const fw = maxX - minX, fh = maxY - minY;
        const z = Math.min(pw / fw, ph / fh, 2);
        this.zoom = z;
        this.panX = (rect.width - fw * z) / 2 - minX * z;
        this.panY = (rect.height - fh * z) / 2 - minY * z;
        this._applyTransform();
    }

    _screenToCanvas(sx, sy) {
        const rect = this.view.container.getBoundingClientRect();
        return {
            x: (sx - rect.left - this.panX) / this.zoom,
            y: (sy - rect.top - this.panY) / this.zoom,
        };
    }

    // ═══════════════════════════════════════
    //  EXPORT PNG
    // ═══════════════════════════════════════
    _exportPNG() {
        const f = this.model.getActiveFlow();
        if (!f || !f.nodes.length) { this.view.setStatus('No hay nodos para exportar'); return; }

        this.view.setStatus('Generando imagen...');

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        f.nodes.forEach(n => {
            minX = Math.min(minX, n.x - 10); minY = Math.min(minY, n.y - 10);
            maxX = Math.max(maxX, n.x + 190); maxY = Math.max(maxY, n.y + 90);
        });

        const W = maxX - minX + 80, H = maxY - minY + 80;
        const canvas2d = document.createElement('canvas');
        canvas2d.width = W; canvas2d.height = H;
        const ctx = canvas2d.getContext('2d');

        ctx.fillStyle = '#0d0f14';
        ctx.fillRect(0, 0, W, H);

        // Draw connections
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        f.connections.forEach(conn => {
            const from = f.nodes.find(n => n.id === conn.from);
            const to = f.nodes.find(n => n.id === conn.to);
            if (!from || !to) return;
            const x1 = from.x + 75 - minX + 40, y1 = from.y + 55 - minY + 40;
            const x2 = to.x + 75 - minX + 40, y2 = to.y + 10 - minY + 40;
            const dy = Math.abs(y2 - y1);
            const ctrl = Math.max(40, dy * 0.4);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(x1, y1 + ctrl, x2, y2 - ctrl, x2, y2);
            ctx.stroke();
        });

        // Draw nodes
        const typeColors = { start: '#22c55e', end: '#ef4444', process: '#3b82f6', decision: '#f59e0b', io: '#8b5cf6', subprocess: '#06b6d4', delay: '#ec4899', note: '#6b7280' };
        f.nodes.forEach(n => {
            const x = n.x - minX + 40, y = n.y - minY + 40;
            const color = typeColors[n.type] || '#6b7280';
            ctx.fillStyle = color + '22';
            ctx.strokeStyle = color + '99';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (n.type === 'start' || n.type === 'end') {
                const rx = 70, ry = 20;
                ctx.ellipse(x + 75, y + 25, rx, ry, 0, 0, Math.PI * 2);
            } else if (n.type === 'decision') {
                ctx.moveTo(x + 75, y); ctx.lineTo(x + 150, y + 30);
                ctx.lineTo(x + 75, y + 60); ctx.lineTo(x, y + 30); ctx.closePath();
            } else {
                ctx.roundRect ? ctx.roundRect(x, y, 150, 50, 8) : ctx.rect(x, y, 150, 50);
            }
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = '#e8ecf4';
            ctx.font = 'bold 12px IBM Plex Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = n.label.length > 18 ? n.label.slice(0, 16) + '...' : n.label;
            ctx.fillText(label, x + 75, y + 25);
        });

        const url = canvas2d.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url; a.download = (f.name || 'flujo').replace(/\s+/g, '_') + '.png';
        a.click();
        this.view.setStatus('Imagen exportada como PNG');
    }

    // ═══════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════
    _debouncedSave() {
        clearTimeout(this._saveDebounce);
        this._saveDebounce = setTimeout(() => this.model.saveToStorage(), 600);
    }
}


/* ─────────────────────────── BOOTSTRAP ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    const model = new FlowModel();
    const view = new FlowView();
    const ctrl = new FlowController(model, view);

    // Expose globally for extras.js
    window._flowModel = model;
    window._flowView = view;
    window._flowCtrl = ctrl;

    // Fit after browser has painted and container has real dimensions
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            ctrl._fitToScreen();
        });
    });
});