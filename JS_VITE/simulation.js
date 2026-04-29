/* ============================================================
   FlowCraft — Simulation Engine
   Simulates step-by-step execution of a flow diagram
   ============================================================ */

class SimulationEngine {
  constructor(model, view, controller) {
    this.model      = model;
    this.view       = view;
    this.controller = controller;

    this.running    = false;
    this.playing    = false;
    this.steps      = [];   // ordered list of node ids to visit
    this.stepIndex  = -1;
    this.playTimer  = null;

    this._panel     = document.getElementById('sim-panel');
    this._log       = document.getElementById('sim-log');
    this._fill      = document.getElementById('sim-progress-fill');
    this._playBtn   = document.getElementById('sim-play');
    this._speedInput= document.getElementById('sim-speed');

    this._bindUI();
  }

  _bindUI() {
    document.getElementById('btn-simulate').addEventListener('click', () => this.start());
    document.getElementById('sim-close').addEventListener('click',   () => this.stop());
    document.getElementById('sim-reset').addEventListener('click',   () => this.reset());
    document.getElementById('sim-play').addEventListener('click',    () => this.togglePlay());
    document.getElementById('sim-next').addEventListener('click',    () => this.stepForward());
    document.getElementById('sim-prev').addEventListener('click',    () => this.stepBack());
  }

  // ── Build execution path (topological traversal) ──
  _buildPath(flow) {
    const nodes = flow.nodes;
    const conns  = flow.connections;

    // Find start node
    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) return null;

    const path    = [];
    const visited = new Set();
    const queue   = [startNode.id];

    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodes.find(n => n.id === id);
      if (node) path.push(node);

      // Get outgoing connections, sorted by label (so "Sí" comes before "No" etc.)
      const outgoing = conns
        .filter(c => c.from === id)
        .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

      outgoing.forEach(c => {
        if (!visited.has(c.to)) queue.push(c.to);
      });
    }

    // Append any orphaned nodes not reached from start
    nodes.forEach(n => {
      if (!visited.has(n.id)) path.push(n);
    });

    return path;
  }

  // ── PUBLIC API ──
  start() {
    const flow = this.model.getActiveFlow();
    if (!flow || !flow.nodes.length) {
      toast('No hay nodos para simular', 'error');
      return;
    }

    this.steps     = this._buildPath(flow);
    this.stepIndex = -1;
    this.running   = true;

    this._panel.classList.remove('hidden');
    this._log.innerHTML = '';
    this._fill.style.width = '0%';
    this._playBtn.textContent = '▶';
    this._playBtn.classList.remove('playing');

    // Reset all node sim states
    this._clearNodeStates();

    this.controller.view.setStatus('Simulación iniciada · Usa los controles para navegar');
    toast('Simulación lista · Presiona ▶ para ejecutar', 'info');
    this.stepForward();
  }

  stop() {
    this._stopPlay();
    this.running = false;
    this.steps   = [];
    this.stepIndex = -1;
    this._clearNodeStates();
    this._clearConnStates();
    this._panel.classList.add('hidden');
    this._log.innerHTML = '';
    this.controller.view.setStatus('Simulación finalizada');
  }

  reset() {
    this._stopPlay();
    this.stepIndex = -1;
    this._clearNodeStates();
    this._clearConnStates();
    this._log.innerHTML = '';
    this._fill.style.width = '0%';
    this._playBtn.textContent = '▶';
    this._playBtn.classList.remove('playing');
    this.controller.view.setStatus('Simulación reiniciada');
  }

  togglePlay() {
    if (this.playing) {
      this._stopPlay();
    } else {
      this._startPlay();
    }
  }

  _startPlay() {
    if (!this.running) this.start();
    this.playing = true;
    this._playBtn.textContent = '⏸';
    this._playBtn.classList.add('playing');
    this._scheduleNext();
  }

  _stopPlay() {
    this.playing = false;
    clearTimeout(this.playTimer);
    this._playBtn.textContent = '▶';
    this._playBtn.classList.remove('playing');
  }

  _scheduleNext() {
    if (!this.playing) return;
    const speed = parseInt(this._speedInput.value) || 800;
    this.playTimer = setTimeout(() => {
      const advanced = this.stepForward();
      if (advanced) this._scheduleNext();
      else this._stopPlay();
    }, speed);
  }

  stepForward() {
    if (!this.running || this.stepIndex >= this.steps.length - 1) {
      if (this.stepIndex >= this.steps.length - 1) {
        this._onComplete();
      }
      return false;
    }
    this.stepIndex++;
    this._activateStep(this.stepIndex);
    return true;
  }

  stepBack() {
    if (!this.running || this.stepIndex <= 0) return false;
    this._stopPlay();

    // Deactivate current
    this._setNodeState(this.steps[this.stepIndex].id, null);
    this.stepIndex--;
    this._replayTo(this.stepIndex);
    return true;
  }

  _replayTo(targetIdx) {
    this._clearNodeStates();
    this._clearConnStates();
    // Replay all done states up to target
    for (let i = 0; i < targetIdx; i++) {
      this._setNodeState(this.steps[i].id, 'done');
    }
    // Mark current as active
    if (targetIdx >= 0) {
      this._setNodeState(this.steps[targetIdx].id, 'active');
      this._highlightIncomingConn(this.steps[targetIdx].id);
      this._updateProgress(targetIdx);
      this._focusNode(this.steps[targetIdx]);
    }
  }

  _activateStep(idx) {
    const node    = this.steps[idx];
    const prevNode = idx > 0 ? this.steps[idx - 1] : null;

    // Mark previous as done
    if (prevNode) {
      this._setNodeState(prevNode.id, 'done');
      this._clearConnState(prevNode.id);
    }

    // Highlight current
    const stateClass = node.type === 'decision' ? 'sim-decision' : 'sim-active';
    this._setNodeState(node.id, stateClass);

    // Highlight incoming connection
    this._highlightIncomingConn(node.id, prevNode ? prevNode.id : null);

    // Update progress
    this._updateProgress(idx);

    // Focus node on canvas
    this._focusNode(node);

    // Log entry
    this._addLogEntry(node, idx);

    // Update status
    this.controller.view.setStatus(
      `Paso ${idx + 1}/${this.steps.length} · ${node.label}`
    );
  }

  _onComplete() {
    this.controller.view.setStatus('✓ Simulación completada — todos los pasos ejecutados');
    this._fill.style.width = '100%';
    toast('✓ Flujo completado exitosamente', 'success');
    this._stopPlay();
  }

  _setNodeState(nodeId, state) {
    const el = document.getElementById('node-' + nodeId);
    if (!el) return;
    el.classList.remove('sim-active', 'sim-done', 'sim-decision');
    if (state) el.classList.add(state === 'done' ? 'sim-done' : state);
  }

  _clearNodeStates() {
    document.querySelectorAll('.flow-node').forEach(el => {
      el.classList.remove('sim-active', 'sim-done', 'sim-decision');
    });
  }

  _highlightIncomingConn(toId, fromId = null) {
    this._clearConnStates();
    const flow = this.model.getActiveFlow();
    if (!flow) return;
    const conn = flow.connections.find(c =>
      c.to === toId && (fromId ? c.from === fromId : true)
    );
    if (conn) {
      const pathEl = document.querySelector(`.conn-path[data-conn-id="${conn.id}"]`);
      if (pathEl) pathEl.classList.add('sim-active-conn');
    }
  }

  _clearConnStates() {
    document.querySelectorAll('.conn-path').forEach(el => el.classList.remove('sim-active-conn'));
  }

  _clearConnState(fromId) {
    const flow = this.model.getActiveFlow();
    if (!flow) return;
    flow.connections.filter(c => c.from === fromId).forEach(c => {
      const el = document.querySelector(`.conn-path[data-conn-id="${c.id}"]`);
      if (el) el.classList.remove('sim-active-conn');
    });
  }

  _updateProgress(idx) {
    const pct = ((idx + 1) / this.steps.length) * 100;
    this._fill.style.width = pct + '%';
  }

  _focusNode(node) {
    // Pan canvas so node is visible
    const container = this.controller.view.container;
    const rect = container.getBoundingClientRect();
    const z = this.controller.zoom;
    const targetX = rect.width  / 2 - (node.x + 75) * z;
    const targetY = rect.height / 2 - (node.y + 35) * z;

    // Smooth pan
    this.controller.panX += (targetX - this.controller.panX) * 0.6;
    this.controller.panY += (targetY - this.controller.panY) * 0.6;
    this.controller._applyTransform();
  }

  _addLogEntry(node, idx) {
    const typeIcons = {
      start:'▶', end:'■', process:'▣', decision:'◆',
      io:'⬡', subprocess:'⊞', delay:'◷', note:'✎'
    };
    const typeLabels = {
      start:'Inicio', end:'Fin', process:'Proceso', decision:'Decisión',
      io:'Entrada/Salida', subprocess:'Subproceso', delay:'Espera', note:'Nota'
    };

    const entry = document.createElement('div');
    const cls = node.type === 'decision' ? 'decision-entry' : (idx === this.stepIndex ? 'active' : 'done');
    entry.className = `sim-log-entry ${cls}`;
    entry.innerHTML = `
      <span class="sim-entry-icon">${typeIcons[node.type] || '●'}</span>
      <div class="sim-entry-body">
        <div class="sim-entry-type">${typeLabels[node.type] || node.type} · Paso ${idx + 1}</div>
        <div class="sim-entry-label">${node.label}</div>
        ${node.desc    ? `<div class="sim-entry-desc">📄 ${node.desc}</div>` : ''}
        ${node.owner   ? `<div class="sim-entry-desc">👤 ${node.owner}</div>` : ''}
      </div>`;

    // Previous active → done
    this._log.querySelectorAll('.sim-log-entry.active').forEach(e => {
      e.classList.remove('active');
      e.classList.add('done');
    });

    this._log.appendChild(entry);
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}


/* ============================================================
   Toast utility (shared)
   ============================================================ */
function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', info: '◆' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '◆'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ─── Bootstrap SimulationEngine after MVC is ready ─── */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const model = window._flowModel;
    const view  = window._flowView;
    const ctrl  = window._flowCtrl;
    if (!model || !view || !ctrl) return;
    window._sim = new SimulationEngine(model, view, ctrl);
  }, 100);
});
