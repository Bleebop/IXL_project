// ═══════════════════════════════════════════════════════════════════════════
// view.js — tout ce qui touche à l'affichage : canvas, rendu, panneau de
// propriétés, listes "Réseau", menu contextuel, barre de statut.
// Dépend de model.js, jamais de controller.js.
// ═══════════════════════════════════════════════════════════════════════════

import {
  S, COL, COL_SEG, COL_SW, RAIL_W, EP_R, CB_HANDLE_R, MARKER_LABELS,
  toWorld, toCanvas, ptEq, ptOnTrack, connectedLegs, labelCanvasPos,
  isSignalMarker, isJointBoundSignal, markerVisualOffset,
  snapEndpointW, tracedSegments, computeRouteSwitches, routeConflicts,
  elementsAt
} from './model.js';

// ── Références DOM ─────────────────────────────────────────────────────────
export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');
export const wrap = document.getElementById('cwrap');
export const ctxMenu = document.getElementById('ctx-menu');

// ── Barre de statut / zoom ─────────────────────────────────────────────────
export function status(m) { document.getElementById('status').textContent = m; }
export function updateZoomLabel() {
  const t = Math.round(S.zoom * 100) + '%';
  document.getElementById('zoom-info').textContent = t;
  document.getElementById('zoom-info-bar').textContent = t;
}

// ── Viewport ───────────────────────────────────────────────────────────────
export function resize() {
  const r = wrap.getBoundingClientRect();
  canvas.width = r.width;
  canvas.height = r.height;
  draw();
}
export function zoomAt(cx, cy, f) {
  const b = toWorld(cx, cy);
  S.zoom = Math.max(0.1, Math.min(8, S.zoom * f));
  S.pan.x = cx - b.x * S.zoom; S.pan.y = cy - b.y * S.zoom;
  updateZoomLabel();
  draw();
}
export function zoomBtn(f) { const r = wrap.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
export function resetView() { S.pan = { x: 0, y: 0 }; S.zoom = 1; updateZoomLabel(); draw(); }

// ── Sélection ──────────────────────────────────────────────────────────────
export function selectObj(obj) {
  S.selected = obj;
  showProps(obj);
  refreshNetworkLists();
  draw();
}

// ── Menu contextuel ────────────────────────────────────────────────────────
export function showCtxMenu(clientX, clientY, wx, wy) {
  const items = elementsAt(wx, wy);
  if (items.length === 0) { hideCtxMenu(); return; }
  ctxMenu.innerHTML = '<div class="ctx-label">Éléments ici</div>';
  items.forEach(({ obj, label, icon }) => {
    const div = document.createElement('div');
    div.className = 'ctx-item';
    div.innerHTML = `<span style="font-size:14px;width:16px;text-align:center">${icon}</span> ${label}`;
    div.onclick = () => { selectObj(obj); hideCtxMenu(); };
    ctxMenu.appendChild(div);
  });
  ctxMenu.style.display = 'block';
  const mw = 180, mh = items.length * 26 + 30;
  ctxMenu.style.left = Math.min(clientX, window.innerWidth - mw - 8) + 'px';
  ctxMenu.style.top = Math.min(clientY, window.innerHeight - mh - 8) + 'px';
}
export function hideCtxMenu() { ctxMenu.style.display = 'none'; }

// ── Listes "Réseau" (accordions) ───────────────────────────────────────────
export function toggleAcc(key) {
  const body = document.getElementById('acc-body-' + key);
  const arr = document.getElementById('acc-arr-' + key);
  if (!body || !arr) return;
  const open = body.classList.toggle('open');
  arr.textContent = open ? '▾' : '▸';
}
function populateAcc(key, items) {
  const cntEl = document.getElementById('cnt-' + key);
  if (cntEl) cntEl.textContent = items.length;
  const body = document.getElementById('acc-body-' + key);
  if (!body) return;
  body.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'lst-item' + (item === S.selected ? ' sel' : '');
    div.textContent = item.name ? `${item.name} (${item.id})` : item.id;
    div.onclick = () => selectObj(item);
    body.appendChild(div);
  });
}
export function refreshNetworkLists() {
  populateAcc('trk', S.tracks);
  populateAcc('sw', S.switches);
  populateAcc('seg', S.zones.filter(z => z.markerType === 'seg_limit'));
  populateAcc('cdv', S.zones.filter(z => z.markerType === 'joint'));
  populateAcc('sig', S.markers.filter(m => isSignalMarker(m.type)));
  populateAcc('rt', S.routes);
}

// ── Panneau de propriétés ──────────────────────────────────────────────────
// Les onclick/onchange générés ici appellent des fonctions exposées sur window
// par controller.js (voir la section "Handlers inline" en fin de ce fichier-là).
export function showProps(obj) {
  const b = document.getElementById('props-body');
  if (!obj) {
    b.innerHTML = '<p style="color:#888;line-height:1.6;font-size:11px">Clic gauche = sélectionner trait.<br><br>Clic droit = menu contextuel.<br><br>Trait sélectionné → cliquer sur cercle d\'extrémité pour la déplacer.</p>';
    return;
  }
  if (obj.kind === 'track') {
    const len = Math.round(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1));
    const swRoles = [];
    S.switches.forEach(sw => {
      if (sw.tip.track === obj) swRoles.push('Pointe de ' + (sw.name || sw.id));
      if (sw.heelLeft.track === obj) swRoles.push('Talon G de ' + (sw.name || sw.id));
      if (sw.heelRight.track === obj) swRoles.push('Talon D de ' + (sw.name || sw.id));
    });
    b.innerHTML = `<div class="prow">Type <span class="pval">Trait de voie</span></div>
<div class="prow">ID <span class="pval">${obj.id}</span></div>
<div class="prow">Long. <span class="pval">${len} u</span></div>
${swRoles.length ? `<div style="font-size:10px;color:${COL_SW};margin:4px 0">${swRoles.join('<br>')}</div>` : ''}
<hr class="psep"><label style="color:#888">Nom</label>
<input type="text" value="${obj.name || ''}" onchange="renameById('${obj.id}','track',this.value)" placeholder="ex: V1">`;
    return;
  }
  if (obj.kind === 'switch') {
    const coupleBtn = obj.coupledWith
      ? `<button class="tbtn" style="width:100%;margin:4px 0;font-size:11px" onclick="uncoupleSwitches('${obj.id}')">⇔ Découpler de ${obj.coupledWith.name || obj.coupledWith.id}</button>`
      : `<button class="tbtn" style="width:100%;margin:4px 0;font-size:11px" onclick="startCouplingMode('${obj.id}')">⇔ Coupler avec…</button>`;
    b.innerHTML = `<div style="font-weight:600;margin-bottom:6px;color:${COL_SW}">Aiguille</div>
<div class="prow">ID <span class="pval">${obj.id}</span></div>
<div style="margin:5px 0 3px;font-size:10px;color:#888">Rôles :</div>
<div style="margin-bottom:3px;font-size:11px"><span class="role-badge" style="background:#e8f3ff;color:#185fa5">Pointe</span>${obj.tip.track.id} (${obj.tip.end})</div>
<div style="margin-bottom:3px;font-size:11px"><span class="role-badge" style="background:#fff3e0;color:${COL_SW}">Talon G</span>${obj.heelLeft.track.id} (${obj.heelLeft.end})</div>
<div style="margin-bottom:6px;font-size:11px"><span class="role-badge" style="background:#fff3e0;color:${COL_SW}">Talon D</span>${obj.heelRight.track.id} (${obj.heelRight.end})</div>
<hr class="psep"><label style="color:#888">Nom / numéro</label>
<input type="text" value="${obj.name || ''}" onchange="renameSw('${obj.id}',this.value)" placeholder="ex: 1213">
${coupleBtn}
<p style="margin-top:8px;font-size:10px;color:#888;line-height:1.4">Glissez les poignées du croisement bon sur les traits des talons.</p>`;
    return;
  }
  if (obj.kind === 'route') {
    const derivedSw = computeRouteSwitches(obj.tracks || []);
    const conflicts = routeConflicts(obj);
    const trList = (obj.tracks || []).map(t => `<div style="margin:1px 0;font-size:11px;color:#333">${t.name || t.id}</div>`).join('');
    const swList = derivedSw.map(s => `<div style="margin:2px 0;font-size:11px">→ ${s.sw.name || s.sw.id} <span style="color:#888;font-size:10px">(${s.position === 'left' ? 'gauche' : 'droite'})</span></div>`).join('');
    const conflictList = conflicts.map(c => `<div style="margin:2px 0;font-size:11px;color:#a32d2d">⚠ ${c.name || c.id}</div>`).join('');
    const flankList = (obj.flankProtection || []).map(fp => `<div style="margin:2px 0;font-size:11px;display:flex;align-items:center;gap:4px"><span style="flex:1">🛡 ${fp.sw.name || fp.sw.id} <span style="color:#888;font-size:10px">(${fp.position === 'left' ? 'gauche' : 'droite'})</span></span><button class="tbtn danger" style="padding:1px 5px;font-size:10px" onclick="removeFlankProtection('${obj.id}','${fp.sw.id}')" title="Retirer">×</button></div>`).join('');
    // En mode sélection on affiche la sélection en cours, sinon la liste enregistrée.
    const inApproach = !!(S.approachMode && S.approachMode.route === obj);
    const approachIds = inApproach ? S.approachMode.selection : (obj.approachZone || []);
    const approachList = approachIds.map(id => {
      const z = S.zones.find(x => x.id === id);
      return `<div style="margin:2px 0;font-size:11px;display:flex;align-items:center;gap:4px"><span style="flex:1;color:#1A9E5C">▬ ${z ? (z.name || z.id) : id}</span><button class="tbtn danger" style="padding:1px 5px;font-size:10px" onclick="removeApproachZone('${obj.id}','${id}')" title="Retirer">×</button></div>`;
    }).join('');
    const approachBtns = inApproach
      ? `<div style="font-size:10px;color:#1A9E5C;margin:3px 0;line-height:1.4">Cliquez les CdV pour les (dé)sélectionner.</div>
<button class="tbtn" style="width:100%;margin:2px 0;font-size:11px" onclick="confirmApproachMode()">✓ Valider (${approachIds.length})</button>
<button class="tbtn" style="width:100%;margin:0 0 4px;font-size:11px" onclick="cancelApproachMode()">Annuler</button>`
      : `<button class="tbtn" style="width:100%;margin:2px 0 4px;font-size:11px" onclick="startApproachMode('${obj.id}')">▬ Ajouter zone d'approche</button>`;
    b.innerHTML = `<div style="font-weight:600;margin-bottom:6px;color:#E74C3C">Itinéraire</div>
<div class="prow">ID <span class="pval">${obj.id}</span></div>
<div class="prow">Départ <span class="pval">${obj.start.name || obj.start.id}</span></div>
<div class="prow">Arrivée <span class="pval">${obj.end.name || obj.end.id}</span></div>
<div style="margin:6px 0 2px;font-size:10px;color:#888">Traits (${(obj.tracks || []).length}) :</div>
${trList || '<div style="font-size:10px;color:#888">Aucun</div>'}
<div style="margin:6px 0 2px;font-size:10px;color:#888">Aiguilles (${derivedSw.length}) :</div>
${swList || '<div style="font-size:10px;color:#888">Aucune</div>'}
<div style="margin:6px 0 2px;font-size:10px;color:#888">Incompatibles (${conflicts.length}) :</div>
${conflictList || '<div style="font-size:10px;color:#888">Aucun</div>'}
<div style="margin:6px 0 2px;font-size:10px;color:#888">Aiguilles en protection (${(obj.flankProtection || []).length}) :</div>
${flankList || '<div style="font-size:10px;color:#888">Aucune</div>'}
<button class="tbtn" style="width:100%;margin:2px 0 4px;font-size:11px" onclick="startFlankMode('${obj.id}')">🛡 Ajouter aiguille en protection</button>
<div style="margin:6px 0 2px;font-size:10px;color:#888">Zone d'approche (${approachIds.length}) :</div>
${approachList || '<div style="font-size:10px;color:#888">Aucun CdV</div>'}
${approachBtns}
<hr class="psep"><label style="color:#888">Nom</label>
<input type="text" value="${obj.name || ''}" onchange="renameRoute('${obj.id}',this.value)" placeholder="ex: I_V2A_V1P">
<label style="color:#888;display:block;margin-top:4px">Délai destruction (s)</label>
<input type="number" min="0" step="1" value="${obj.releaseDelay ?? 45}" onchange="setRouteReleaseDelay('${obj.id}',this.value)">`;
    return;
  }
  if (obj.markerType) {
    const isSeg = obj.markerType === 'seg_limit';
    const totalLen = Math.round(obj.spans.reduce((s, sp) => s + Math.hypot(sp.track.x2 - sp.track.x1, sp.track.y2 - sp.track.y1) * (sp.t2 - sp.t1), 0));
    const trackIds = [...new Set(obj.spans.map(s => s.track.id))].join(', ');
    b.innerHTML = `<div style="font-weight:600;margin-bottom:6px;color:${isSeg ? COL_SEG : COL}">${isSeg ? 'Segment railML' : 'Circuit de voie'}</div>
<div class="prow">ID <span class="pval">${obj.id}</span></div>
<div class="prow">Traits <span class="pval" style="font-size:10px">${trackIds}</span></div>
<div class="prow">Long. <span class="pval">${totalLen} u</span></div>
<hr class="psep"><label style="color:#888">Nom</label>
<input type="text" value="${obj.name || ''}" onchange="renameZone('${obj.id}',this.value)" placeholder="${isSeg ? 'ex: S1' : 'ex: cdv 78A'}">`;
    return;
  }
  const orientRow = isSignalMarker(obj.type)
    ? `<div class="prow">Sens <span class="pval">${(obj.orient || 1) > 0 ? '+ (depuis origine)' : '− (vers origine)'}</span></div>
<button class="tbtn" style="width:100%;margin:2px 0 6px;font-size:11px" onclick="flipMarkerOrient('${obj.id}')">⇄ Inverser le sens</button>`
    : '';
  b.innerHTML = `<div class="prow">Type <span class="pval">${MARKER_LABELS[obj.type] || obj.type}</span></div>
<div class="prow">ID <span class="pval">${obj.id}</span></div>
<div class="prow">Trait <span class="pval">${obj.track.id}</span></div>
<div class="prow">Position <span class="pval">${(obj.t * 100).toFixed(1)}%</span></div>
${orientRow}<hr class="psep"><label style="color:#888">Nom</label>
<input type="text" value="${obj.name || ''}" onchange="renameById('${obj.id}','marker',this.value)" placeholder="ex: JI_78A">`;
}

// ── Rendu canvas ───────────────────────────────────────────────────────────
function drawGrid() {
  const step = 40 * S.zoom;
  const ox = ((S.pan.x % step) + step) % step, oy = ((S.pan.y % step) + step) % step;
  ctx.save(); ctx.strokeStyle = '#ECEAE4'; ctx.lineWidth = .5;
  for (let x = ox; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = oy; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  ctx.restore();
}

function drawZoneHighlights() {
  S.zones.forEach(z => {
    if (z !== S.selected) return;
    ctx.save(); ctx.globalAlpha = .15; ctx.strokeStyle = z.col; ctx.lineWidth = RAIL_W + 6; ctx.lineCap = 'round';
    z.spans.forEach(sp => {
      const tr = sp.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1;
      const c1 = toCanvas(tr.x1 + dx * sp.t1, tr.y1 + dy * sp.t1);
      const c2 = toCanvas(tr.x1 + dx * sp.t2, tr.y1 + dy * sp.t2);
      ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    });
    ctx.restore();
  });
}

// Pendant le mode "zone d'approche" : tous les CdV sont soulignés en pointillés
// (= cliquables), ceux retenus dans la sélection en trait plein.
function drawApproachSelection() {
  const sel = new Set(S.approachMode.selection);
  S.zones.forEach(z => {
    if (z.markerType !== 'joint') return;
    const chosen = sel.has(z.id);
    ctx.save();
    ctx.strokeStyle = '#1A9E5C';
    ctx.globalAlpha = chosen ? 0.5 : 0.18;
    ctx.lineWidth = RAIL_W + (chosen ? 8 : 5);
    ctx.lineCap = 'round';
    if (!chosen) ctx.setLineDash([6, 5]);
    z.spans.forEach(sp => {
      const tr = sp.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1;
      const c1 = toCanvas(tr.x1 + dx * sp.t1, tr.y1 + dy * sp.t1);
      const c2 = toCanvas(tr.x1 + dx * sp.t2, tr.y1 + dy * sp.t2);
      ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    });
    ctx.restore();
  });
}

function drawZoneLabels() {
  S.zones.forEach(z => {
    if (!z.name) return;
    const lp = labelCanvasPos(z);
    ctx.save(); ctx.fillStyle = z === S.selected ? '#378ADD' : z.col;
    ctx.font = `${Math.max(9, 10 * S.zoom)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(z.name, lp.x, lp.y);
    ctx.restore();
  });
}

function drawTrack(tr) {
  const c1 = toCanvas(tr.x1, tr.y1), c2 = toCanvas(tr.x2, tr.y2);
  const isSel = tr === S.selected;
  ctx.save();
  ctx.strokeStyle = isSel ? '#378ADD' : COL; ctx.lineWidth = isSel ? RAIL_W + 1 : RAIL_W; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
  if (tr.name) {
    const lp = labelCanvasPos(tr);
    ctx.fillStyle = isSel ? '#378ADD' : COL;
    ctx.font = `${Math.max(9, 11 * S.zoom)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tr.name, lp.x, lp.y);
    ctx.textBaseline = 'alphabetic';
  }
  // Poignées d'extrémité (uniquement sur le trait sélectionné)
  [{ x: tr.x1, y: tr.y1, end: 'start' }, { x: tr.x2, y: tr.y2, end: 'end' }].forEach(ep => {
    const cp = toCanvas(ep.x, ep.y);
    const hasSw = S.switches.some(sw => ptEq(sw.pt, ep, 1));
    if (isSel) {
      const isDragging = S.epDrag && S.epDrag.track === tr && S.epDrag.end === ep.end;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, EP_R, 0, Math.PI * 2);
      ctx.fillStyle = isDragging ? '#378ADD' : 'white'; ctx.fill();
      ctx.strokeStyle = '#378ADD'; ctx.lineWidth = 1.5; ctx.stroke();
      if (hasSw) { ctx.beginPath(); ctx.arc(cp.x, cp.y, 3, 0, Math.PI * 2); ctx.fillStyle = COL_SW; ctx.fill(); }
    } else {
      const legs = connectedLegs(tr, ep.end);
      if (legs.length > 0 && !hasSw) { ctx.beginPath(); ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = COL; ctx.fill(); }
    }
  });
  ctx.restore();
}

function drawSwitch(sw) {
  // Les points de croisement bon sont libres : { track, t } sur n'importe quel trait.
  const jPt = sw.pt;
  const lPt = ptOnTrack(sw.cbLeft.track, sw.cbLeft.t);
  const rPt = ptOnTrack(sw.cbRight.track, sw.cbRight.t);
  const lC = toCanvas(lPt.x, lPt.y);
  const rC = toCanvas(rPt.x, rPt.y);
  const jC = toCanvas(jPt.x, jPt.y);

  const isSel = sw === S.selected;
  const col = isSel ? '#378ADD' : COL;

  // Croisement bon : deux traits parallèles entre lPt et rPt
  const dx = rC.x - lC.x, dy = rC.y - lC.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const off = 3;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(lC.x + nx * off, lC.y + ny * off);
  ctx.lineTo(rC.x + nx * off, rC.y + ny * off);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lC.x - nx * off, lC.y - ny * off);
  ctx.lineTo(rC.x - nx * off, rC.y - ny * off);
  ctx.stroke();
  // Petits traits perpendiculaires aux extrémités (complètent le symbole)
  ctx.beginPath(); ctx.moveTo(lC.x + nx * off, lC.y + ny * off); ctx.lineTo(lC.x - nx * off, lC.y - ny * off); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rC.x + nx * off, rC.y + ny * off); ctx.lineTo(rC.x - nx * off, rC.y - ny * off); ctx.stroke();

  // Poignées de glissement
  ctx.fillStyle = isSel ? '#378ADD' : COL_SW;
  ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
  [lC, rC].forEach(c => {
    ctx.beginPath(); ctx.arc(c.x, c.y, CB_HANDLE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });

  // Point de jonction
  ctx.beginPath(); ctx.arc(jC.x, jC.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = isSel ? '#378ADD' : COL_SW; ctx.fill();

  if (sw.name && S.zoom > 0.4) {
    const lp = labelCanvasPos(sw);
    ctx.fillStyle = isSel ? '#378ADD' : COL_SW;
    ctx.font = `bold ${Math.max(9, 10 * S.zoom)}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sw.name, lp.x, lp.y);
  }
  ctx.restore();
}

// Petite flèche au-dessus du signal indiquant le sens des trains concernés.
// orient > 0 : trains venant de l'origine du trait (flèche vers +x du repère tourné).
// orient < 0 : trains allant vers l'origine du trait (flèche vers −x).
function drawSignalOrient(orient, y, sc) {
  const o = (orient || 1) > 0 ? 1 : -1;
  const half = 5 * sc, head = 3 * sc, wing = 2.2 * sc;
  const tip = o * half, back = tip - o * head;
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-tip, y); ctx.lineTo(tip, y);
  ctx.moveTo(tip, y); ctx.lineTo(back, y - wing);
  ctx.moveTo(tip, y); ctx.lineTo(back, y + wing);
  ctx.stroke();
  ctx.restore();
}

function drawMarker(m, opts) {
  const ghost = !!opts?.ghost;
  const x = opts?.x ?? m.x;
  const y = opts?.y ?? m.y;
  const c = toCanvas(x, y);
  const isSel = m === S.selected && !ghost;
  const col = isSel ? '#378ADD' : m.type === 'seg_limit' ? COL_SEG : COL;
  const tr = m.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1, angle = Math.atan2(dy, dx), sc = S.zoom;
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.4;
  ctx.translate(c.x, c.y); ctx.rotate(angle);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
  const T = 10 * sc;
  if (m.type === 'seg_limit') {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -T); ctx.lineTo(0, T); ctx.stroke();
    ctx.globalAlpha = .5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3 * sc, -T * .6); ctx.lineTo(-3 * sc, T * .6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 * sc, -T * .6); ctx.lineTo(3 * sc, T * .6); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (m.type === 'joint') {
    ctx.beginPath(); ctx.moveTo(-3 * sc, -T); ctx.lineTo(-3 * sc, T); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 * sc, -T); ctx.lineTo(3 * sc, T); ctx.stroke();
  } else if (m.type === 'signal_stop') {
    ctx.fillRect(-5 * sc, -14 * sc, 10 * sc, 12 * sc);
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -2 * sc); ctx.stroke();
    drawSignalOrient(m.orient, -19 * sc, sc);
  } else if (m.type === 'signal_man') {
    // Long montant pour dégager les joints sur la voie
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14 * sc); ctx.stroke();
    // Corps landscape (parallèle à la voie), centré à y_r = -18
    ctx.fillRect(-9 * sc, -22 * sc, 18 * sc, 8 * sc);
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-3.5 * sc, -18 * sc, 1.7 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5 * sc, -18 * sc, 1.7 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    drawSignalOrient(m.orient, -27 * sc, sc);
  } else if (m.type === 'signal_esp') {
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15 * sc); ctx.stroke();
    ctx.beginPath(); ctx.arc(-3 * sc, -18 * sc, 2 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 * sc, -18 * sc, 3 * sc, 0, Math.PI * 2); ctx.stroke();
    drawSignalOrient(m.orient, -26 * sc, sc);
  } else if (m.type === 'motor') {
    ctx.fillRect(-5 * sc, -13 * sc, 10 * sc, 10 * sc);
    ctx.fillStyle = 'white'; ctx.font = `bold ${7 * sc}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', 0, -8 * sc);
  }
  ctx.restore();
  if (m.name && !ghost) {
    const lp = labelCanvasPos(m);
    ctx.save(); ctx.fillStyle = col; ctx.font = `${Math.max(9, 10 * S.zoom)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.name, lp.x, lp.y); ctx.restore();
  }
}

function drawRoutePath(start, routeTracks, end, color, alpha) {
  const segments = tracedSegments(start, routeTracks, end);
  if (segments.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = RAIL_W + 5; ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;

  // Décalage latéral du tracé pour qu'il reste lisible à côté de la voie
  const offset_dist = 14;
  const seg_s = segments[0];
  const seg_e = segments[segments.length - 1];
  const tr_s = seg_s.track, dx_s = tr_s.x2 - tr_s.x1, dy_s = tr_s.y2 - tr_s.y1;
  const c_s_x = tr_s.x1 + dx_s * seg_s.t1, c_s_y = tr_s.y1 + dy_s * seg_s.t1;
  const tr_e = seg_e.track, dx_e = tr_e.x2 - tr_e.x1, dy_e = tr_e.y2 - tr_e.y1;
  const c_e_x1 = tr_e.x1 + dx_e * seg_e.t1, c_e_y1 = tr_e.y1 + dy_e * seg_e.t1;
  const c_e_x2 = tr_e.x1 + dx_e * seg_e.t2, c_e_y2 = tr_e.y1 + dy_e * seg_e.t2;
  const d_seg_e_x = c_e_x2 - c_e_x1, d_seg_e_y = c_e_y2 - c_e_y1;
  const vec_route_norm = Math.sqrt((c_e_x2 - c_s_x) ** 2 + (c_e_y2 - c_s_y) ** 2);
  let offset_x = 0, offset_y = 0;
  if (vec_route_norm != 0) {
    const vec_route_x = (c_e_x2 - c_s_x) / vec_route_norm, vec_route_y = (c_e_y2 - c_s_y) / vec_route_norm;
    offset_x = -offset_dist * vec_route_y;
    offset_y = offset_dist * vec_route_x;
  }

  segments.forEach(sp => {
    const tr = sp.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1;
    const c1 = toCanvas(tr.x1 + dx * sp.t1 + offset_x, tr.y1 + dy * sp.t1 + offset_y);
    const c2 = toCanvas(tr.x1 + dx * sp.t2 + offset_x, tr.y1 + dy * sp.t2 + offset_y);
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
  });

  // Pointe de flèche marquant la fin du tracé
  const norm_e = Math.hypot(d_seg_e_x, d_seg_e_y) || 1;
  const perp_ex = -d_seg_e_y / norm_e, perp_ey = d_seg_e_x / norm_e;
  const ex_v = d_seg_e_x / norm_e, ey_v = d_seg_e_y / norm_e;
  const end_wx = c_e_x2 + offset_x;
  const end_wy = c_e_y2 + offset_y;
  const arrow_size = 10;
  const c2_e = toCanvas(end_wx, end_wy);
  const tk1 = toCanvas(end_wx + perp_ex * arrow_size - ex_v * arrow_size * 1.5,
                       end_wy + perp_ey * arrow_size - ey_v * arrow_size * 1.5);
  const tk2 = toCanvas(end_wx - perp_ex * arrow_size - ex_v * arrow_size * 1.5,
                       end_wy - perp_ey * arrow_size - ey_v * arrow_size * 1.5);
  ctx.beginPath();
  ctx.moveTo(c2_e.x, c2_e.y); ctx.lineTo(tk1.x, tk1.y);
  ctx.moveTo(c2_e.x, c2_e.y); ctx.lineTo(tk2.x, tk2.y);
  ctx.stroke();

  ctx.restore();
}

export function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawZoneHighlights();
  if (S.approachMode) drawApproachSelection();
  // Tracés d'itinéraire sous les voies pour que les symboles restent lisibles
  if (S.selected && S.selected.kind === 'route') {
    drawRoutePath(S.selected.start, S.selected.tracks, S.selected.end, '#E74C3C', 0.4);
  }
  if (S.routeBuild) {
    drawRoutePath(S.routeBuild.start, S.routeBuild.tracks, null, '#FFA000', 0.5);
  }
  S.tracks.forEach(drawTrack);
  S.markers.forEach(m => drawMarker(m));
  S.switches.forEach(drawSwitch);
  drawZoneLabels();

  // Fantôme : aperçu du signal lié à un joint pendant son déplacement.
  // L'origine est décalée de -visualOffset pour que le corps du symbole tombe sous le curseur.
  if (S.mDrag && isJointBoundSignal(S.mDrag.type)) {
    const off = markerVisualOffset(S.mDrag);
    drawMarker(S.mDrag, { x: S.mouseWorld.x - off.x, y: S.mouseWorld.y - off.y, ghost: true });
  }

  // Aperçu du trait en cours de tracé
  if (S.tool === 'track' && S.drawing && S.drawStart) {
    const ep = snapEndpointW(S.mouseWorld.x, S.mouseWorld.y, null);
    const c1 = toCanvas(S.drawStart.x, S.drawStart.y), c2 = toCanvas(ep.x, ep.y);
    ctx.save(); ctx.strokeStyle = COL; ctx.lineWidth = RAIL_W; ctx.globalAlpha = .3; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
}
