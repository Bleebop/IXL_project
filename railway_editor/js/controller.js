// ═══════════════════════════════════════════════════════════════════════════
// controller.js — point d'entrée. Câble les événements souris/clavier, gère
// les outils et les flux d'interaction (tracé, itinéraire, couplage,
// protection), et expose les handlers inline sur `window`.
// ═══════════════════════════════════════════════════════════════════════════

import {
  S, COL, COL_SEG, RAIL_W,
  toWorld, toCanvas, projOnTrack, snapEndpointW, snapToTrackW, nearestJoint,
  setTrackEnd, isSignalMarker, isJointBoundSignal,
  rebuildSwitches, buildZonesOfType, canTraverseSeg, canTraverseCdv,
  tryReachTarget, cleanupOrphanRoutes, cleanupOrphanSignals, findLegKeysForCb,
  cleanupOrphanApproachZones,
  hitTrackW, hitMarkerW, hitSwitchW, hitEndpoint, hitCbHandle, hitCdvZoneW,
  hitLabelCanvas, labelCanvasPos, labelAnchor
} from './model.js';

import {
  canvas, ctx, ctxMenu, draw, status, showProps, refreshNetworkLists,
  showCtxMenu, hideCtxMenu, selectObj, resize, updateZoomLabel,
  zoomAt, zoomBtn, resetView, toggleAcc
} from './view.js';

import { exportRailML } from './export.js';
import { saveProject, readProjectFile } from './persistence.js';

// ── Reconstruction complète (aiguilles + zones) ────────────────────────────
function rebuildAll() {
  rebuildSwitches();
  const prev = S.zones.slice();
  const segZ = buildZonesOfType('seg_limit', 'SEG', COL_SEG, canTraverseSeg, prev.filter(z => z.markerType === 'seg_limit'));
  const cdvZ = buildZonesOfType('joint', 'CDV', COL, canTraverseCdv, prev.filter(z => z.markerType === 'joint'));
  S.zones = [...segZ, ...cdvZ];
  cleanupOrphanApproachZones();
  refreshNetworkLists();
}

// ── Outils ─────────────────────────────────────────────────────────────────
function setTool(t) {
  S.tool = t; S.elemType = null; S.drawing = false; S.drawStart = null;
  S.epDrag = null; S.mDrag = null; S.cbDrag = null;
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + t)?.classList.add('active');
  document.querySelectorAll('.pitem').forEach(p => p.classList.remove('active'));
  canvas.style.cursor = (t === 'track' || t === 'route') ? 'crosshair' : 'default';
  status({
    select: 'Clic gauche = sélectionner trait. Clic droit = menu contextuel.',
    track: 'Cliquez pour débuter un trait, recliquez pour le terminer.',
    route: 'Itinéraire : cliquez un signal de départ, puis les traits/signal de fin.'
  }[t] || '');
  if (t !== 'route') S.routeBuild = null;
  S.couplingMode = null;
  S.flankMode = null;
  S.approachMode = null;
  draw();
}
function selectElem(type) {
  S.elemType = type; S.tool = 'elem'; S.epDrag = null; S.mDrag = null; S.cbDrag = null;
  document.querySelectorAll('.pitem').forEach(p => p.classList.remove('active'));
  document.getElementById('pe-' + type)?.classList.add('active');
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  canvas.style.cursor = 'crosshair';
  status('Cliquez sur un trait de voie pour poser l\'élément.');
  draw();
}

// ── Construction d'itinéraire ──────────────────────────────────────────────
function routeClick(target) {
  if (!S.routeBuild) {
    if (target.type !== 'signal' || !isSignalMarker(target.marker.type)) {
      status('Cliquez d\'abord sur un signal pour démarrer l\'itinéraire.'); return;
    }
    S.routeBuild = {
      start: target.marker,
      tracks: [target.marker.track],
      state: {
        track: target.marker.track, t: target.marker.t,
        towards: (target.marker.orient || 1) > 0 ? 'end' : 'start'
      }
    };
    status('Itinéraire : départ ' + (target.marker.name || target.marker.id) + '. Cliquez sur les traits intermédiaires ou le signal de fin.');
    draw(); return;
  }
  if (target.type === 'signal' && target.marker === S.routeBuild.start) {
    status('Le signal de fin doit être différent du signal de départ.'); return;
  }
  if (target.type === 'track' && target.track === S.routeBuild.tracks[S.routeBuild.tracks.length - 1]) {
    status('Vous êtes déjà sur ce trait.'); return;
  }
  const result = tryReachTarget(S.routeBuild.state, target);
  if (!result.ok) {
    status('Étape refusée : ' + (result.reason === 'unreachable'
      ? 'inatteignable depuis l\'étape précédente'
      : 'chemin ambigu — précisez par un trait intermédiaire') + '.');
    return;
  }
  const path = result.path;
  for (const tr of path.tracks) S.routeBuild.tracks.push(tr);

  if (target.type === 'signal') {
    const route = {
      id: 'ROUTE' + (S.idRoute++), kind: 'route',
      start: S.routeBuild.start, end: target.marker,
      tracks: S.routeBuild.tracks.slice(),
      name: '',
      releaseDelay: 45
    };
    S.routes.push(route);
    S.selected = route; S.routeBuild = null;
    showProps(route); refreshNetworkLists();
    status('Itinéraire ' + route.id + ' créé.');
    draw(); return;
  }
  S.routeBuild.state = { track: target.track, t: path.endT, towards: path.endTowards };
  status('Trait ' + (target.track.name || target.track.id) + ' ajouté. Continuez.');
  draw();
}

// ── Couplage d'aiguilles ───────────────────────────────────────────────────
function startCouplingMode(id) {
  const sw = S.switches.find(s => s.id === id);
  if (!sw) return;
  S.flankMode = null;
  S.couplingMode = sw;
  status('Cliquez sur une autre aiguille pour la coupler avec ' + (sw.name || sw.id) + ' (Échap pour annuler).');
}
function completeCoupling(other) {
  if (!S.couplingMode) return;
  const first = S.couplingMode;
  S.couplingMode = null;
  if (other === first) { status('Couplage annulé.'); return; }
  // Une aiguille ne peut être couplée qu'à une seule autre : on casse les liens existants.
  if (first.coupledWith) { first.coupledWith.coupledWith = null; first.coupledWith = null; }
  if (other.coupledWith) { other.coupledWith.coupledWith = null; other.coupledWith = null; }
  first.coupledWith = other;
  other.coupledWith = first;
  status('Aiguilles ' + (first.name || first.id) + ' et ' + (other.name || other.id) + ' couplées.');
  if (S.selected && S.selected.kind === 'switch') showProps(S.selected);
  draw();
}
function uncoupleSwitches(id) {
  const sw = S.switches.find(s => s.id === id);
  if (!sw || !sw.coupledWith) return;
  const partner = sw.coupledWith;
  partner.coupledWith = null;
  sw.coupledWith = null;
  status('Aiguilles ' + (sw.name || sw.id) + ' et ' + (partner.name || partner.id) + ' découplées.');
  showProps(sw);
  draw();
}

// ── Aiguilles en protection (flank protection) ─────────────────────────────
// Deux clics : 1) l'aiguille, 2) l'un de ses talons pour fixer la position.
function startFlankMode(routeId) {
  const r = S.routes.find(x => x.id === routeId);
  if (!r) return;
  S.couplingMode = null;
  S.flankMode = { route: r, phase: 'switch', sw: null };
  status('Cliquez sur une aiguille à ajouter en protection (Échap pour annuler).');
}
function handleFlankSwitchClick(sw) {
  if (!S.flankMode || S.flankMode.phase !== 'switch') return;
  S.flankMode.sw = sw;
  S.flankMode.phase = 'heel';
  status('Cliquez sur le talon (trait) désiré de ' + (sw.name || sw.id) + '.');
}
function handleFlankHeelClick(track) {
  if (!S.flankMode || S.flankMode.phase !== 'heel') return;
  const sw = S.flankMode.sw, route = S.flankMode.route;
  let position = null;
  if (sw.heelLeft.track === track) position = 'left';
  else if (sw.heelRight.track === track) position = 'right';
  if (!position) { status('Ce trait n\'est pas un talon de ' + (sw.name || sw.id) + '.'); return; }
  if (!route.flankProtection) route.flankProtection = [];
  const existing = route.flankProtection.find(fp => fp.sw === sw);
  if (existing) existing.position = position;
  else route.flankProtection.push({ sw, position });
  status('Aiguille ' + (sw.name || sw.id) + ' en protection (' + (position === 'left' ? 'gauche' : 'droite') + ') pour ' + (route.name || route.id) + '.');
  S.flankMode = null;
  showProps(route);
  draw();
}
function removeFlankProtection(routeId, swId) {
  const r = S.routes.find(x => x.id === routeId);
  if (!r || !r.flankProtection) return;
  r.flankProtection = r.flankProtection.filter(fp => fp.sw.id !== swId);
  showProps(r);
  draw();
}

// ── Zone d'approche ────────────────────────────────────────────────────────
// Mode de sélection multiple : on part de la liste déjà enregistrée, chaque clic
// sur un CdV l'ajoute ou le retire, et « Valider » remplace la liste de l'itinéraire.
function startApproachMode(routeId) {
  const r = S.routes.find(x => x.id === routeId);
  if (!r) return;
  S.couplingMode = null;
  S.flankMode = null;
  S.approachMode = { route: r, selection: [...(r.approachZone || [])] };
  status('Zone d\'approche : cliquez les CdV à inclure, puis validez dans le panneau (Échap pour annuler).');
  showProps(r); draw();
}
function toggleApproachZone(zone) {
  if (!S.approachMode) return;
  const sel = S.approachMode.selection;
  const i = sel.indexOf(zone.id);
  if (i >= 0) sel.splice(i, 1); else sel.push(zone.id);
  status((i >= 0 ? 'CdV retiré : ' : 'CdV ajouté : ') + (zone.name || zone.id) + ' — ' + sel.length + ' sélectionné(s).');
  showProps(S.approachMode.route); draw();
}
function confirmApproachMode() {
  if (!S.approachMode) return;
  const { route, selection } = S.approachMode;
  route.approachZone = [...selection];
  S.approachMode = null;
  status('Zone d\'approche enregistrée : ' + selection.length + ' CdV.');
  showProps(route); draw();
}
function cancelApproachMode() {
  if (!S.approachMode) return;
  const route = S.approachMode.route;
  S.approachMode = null;
  status('Sélection de zone d\'approche annulée.');
  showProps(route); draw();
}
function removeApproachZone(routeId, zoneId) {
  const r = S.routes.find(x => x.id === routeId);
  if (!r) return;
  // Pendant le mode, le × agit sur la sélection en cours ; sinon sur la liste enregistrée.
  if (S.approachMode && S.approachMode.route === r) {
    S.approachMode.selection = S.approachMode.selection.filter(id => id !== zoneId);
  } else {
    r.approachZone = (r.approachZone || []).filter(id => id !== zoneId);
  }
  showProps(r); draw();
}

// ── Renommages / propriétés éditables ──────────────────────────────────────
function renameById(id, cat, val) {
  const arr = cat === 'track' ? S.tracks : S.markers;
  const o = arr.find(x => x.id === id);
  if (o) { o.name = val; refreshNetworkLists(); draw(); }
}
function renameZone(id, val) { const z = S.zones.find(z => z.id === id); if (z) { z.name = val; refreshNetworkLists(); draw(); } }
function renameSw(id, val) { const s = S.switches.find(s => s.id === id); if (s) { s.name = val; refreshNetworkLists(); draw(); } }
function renameRoute(id, val) { const r = S.routes.find(r => r.id === id); if (r) { r.name = val; refreshNetworkLists(); draw(); } }
function flipMarkerOrient(id) {
  const m = S.markers.find(x => x.id === id);
  if (m) { m.orient = -(m.orient || 1); showProps(m); draw(); }
}
function setRouteReleaseDelay(id, val) {
  const r = S.routes.find(r => r.id === id);
  if (!r) return;
  const n = parseInt(val, 10);
  if (Number.isFinite(n) && n >= 0) r.releaseDelay = n;
}

// ── Suppression ────────────────────────────────────────────────────────────
function deleteSelected() {
  if (!S.selected) return;
  if (S.selected.kind === 'route') {
    S.routes = S.routes.filter(r => r !== S.selected);
    S.selected = null; showProps(null); refreshNetworkLists(); draw(); return;
  }
  if (S.selected.kind === 'switch') {
    status('Supprimez un des trois traits pour retirer l\'aiguille.');
    S.selected = null; refreshNetworkLists(); draw(); return;
  }
  if (S.selected.kind === 'track') {
    S.markers = S.markers.filter(m => m.track !== S.selected);
    cleanupOrphanSignals();
    S.tracks = S.tracks.filter(t => t !== S.selected);
    rebuildAll(); cleanupOrphanRoutes();
  } else if (S.selected.markerType) {
    status('Pour supprimer cette zone, supprimez ses marqueurs délimitants.');
    S.selected = null; refreshNetworkLists(); draw(); return;
  } else if (S.selected.kind === 'marker') {
    S.markers = S.markers.filter(m => m !== S.selected);
    cleanupOrphanSignals();
    rebuildAll(); cleanupOrphanRoutes();
  }
  S.selected = null; showProps(null); refreshNetworkLists(); draw();
}
function clearAll() {
  S.tracks = []; S.markers = []; S.zones = []; S.switches = []; S.routes = []; S.selected = null;
  S.drawing = false; S.drawStart = null; S.epDrag = null; S.mDrag = null; S.cbDrag = null;
  S.routeBuild = null; S.couplingMode = null; S.flankMode = null; S.approachMode = null;
  S.idTrk = 1; S.idMrk = 1; S.idZone = 1; S.idSw = 1; S.idRoute = 1;
  showProps(null);
  refreshNetworkLists();
  draw(); status('Canvas vidé.');
}

// ── Sauvegarde / chargement ────────────────────────────────────────────────
function saveFile() {
  if (S.tracks.length === 0) { status('Rien à sauvegarder.'); return; }
  saveProject()
    .then(name => status(name ? 'Sauvegardé dans « ' + name + ' ».' : 'Sauvegarde annulée.'))
    .catch(err => status('Sauvegarde impossible : ' + err.message + '.'));
}
function openFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    readProjectFile(file).then(() => {
      S.selected = null;
      S.drawing = false; S.drawStart = null; S.epDrag = null; S.mDrag = null; S.cbDrag = null; S.labelDrag = null;
      S.routeBuild = null; S.couplingMode = null; S.flankMode = null; S.approachMode = null;
      setTool('select');
      showProps(null);
      refreshNetworkLists();
      updateZoomLabel();
      draw();
      status('Fichier « ' + file.name + ' » chargé.');
    }).catch(err => status('Chargement impossible : ' + err.message + '.'));
  };
  input.click();
}

// ── Événements souris ──────────────────────────────────────────────────────
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.15 : 1 / 1.15);
}, { passive: false });

canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  const r = canvas.getBoundingClientRect();
  const w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
  showCtxMenu(ev.clientX, ev.clientY, w.x, w.y);
});

canvas.addEventListener('mousedown', ev => {
  hideCtxMenu();
  const r = canvas.getBoundingClientRect();
  const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
  const w = toWorld(cx, cy);

  if (ev.button === 2) return; // géré par contextmenu

  if (ev.button === 1 || (ev.button === 0 && S.spaceDown)) {
    S.panning = true;
    S.panStart = { x: ev.clientX, y: ev.clientY };
    S.panOrigin = { x: S.pan.x, y: S.pan.y };
    canvas.style.cursor = 'grabbing'; ev.preventDefault(); return;
  }
  if (ev.button !== 0) return;

  if (S.tool === 'select') {
    // Mode couplage : un clic sur une aiguille finalise, tout autre clic annule.
    if (S.couplingMode) {
      const swH = hitSwitchW(w.x, w.y);
      if (swH) { completeCoupling(swH); return; }
      S.couplingMode = null; status('Couplage annulé.'); return;
    }
    // Zone d'approche : chaque clic sur un CdV le bascule. On ne quitte le mode
    // que par les boutons Valider/Annuler (ou Échap) — un clic à côté ne l'annule pas.
    if (S.approachMode) {
      const z = hitCdvZoneW(w.x, w.y);
      if (z) { toggleApproachZone(z); return; }
      status('Aucun CdV ici — cliquez un CdV, ou validez dans le panneau.');
      return;
    }
    // Aiguille en protection : phase 'switch' attend une aiguille, phase 'heel' un trait.
    if (S.flankMode) {
      if (S.flankMode.phase === 'switch') {
        const swH = hitSwitchW(w.x, w.y);
        if (swH) { handleFlankSwitchClick(swH); return; }
        S.flankMode = null; status('Ajout d\'aiguille en protection annulé.'); return;
      }
      if (S.flankMode.phase === 'heel') {
        const trH = hitTrackW(w.x, w.y);
        if (trH) { handleFlankHeelClick(trH); return; }
        S.flankMode = null; status('Ajout d\'aiguille en protection annulé.'); return;
      }
    }

    // 0. Déplacement d'étiquette (priorité maximale)
    const hitL = hitLabelCanvas(cx, cy);
    if (hitL) {
      if (!hitL.labelOff) {
        const lp = labelCanvasPos(hitL);
        const anchor = labelAnchor(hitL);
        const ac = toCanvas(anchor.x, anchor.y);
        hitL.labelOff = { x: (lp.x - ac.x) / S.zoom, y: (lp.y - ac.y) / S.zoom };
      }
      S.labelDrag = { obj: hitL, startOff: { ...hitL.labelOff }, startMouse: { ...w } };
      canvas.style.cursor = 'grabbing'; return;
    }

    // 1. Poignées de croisement bon
    const cbH = hitCbHandle(w.x, w.y);
    if (cbH) {
      S.cbDrag = { ...cbH, origCbLeft: { ...cbH.sw.cbLeft }, origCbRight: { ...cbH.sw.cbRight } };
      canvas.style.cursor = 'grabbing'; return;
    }

    // 2. Extrémité du trait déjà sélectionné
    if (S.selected && S.selected.kind === 'track') {
      const ep = hitEndpoint(S.selected, w.x, w.y);
      if (ep) { S.epDrag = ep; canvas.style.cursor = 'crosshair'; status('Déplacez l\'extrémité.'); return; }
    }

    // 3. Déplacement de marqueur
    const hitM = hitMarkerW(w.x, w.y);
    if (hitM) {
      S.selected = hitM; S.mDrag = hitM; S.mDragOff = { x: w.x - hitM.x, y: w.y - hitM.y };
      showProps(hitM); refreshNetworkLists(); draw(); return;
    }

    // 4. Par défaut : sélection du trait
    const hitT = hitTrackW(w.x, w.y);
    if (hitT) {
      S.selected = hitT; S.epDrag = null; S.mDrag = null;
      showProps(hitT);
      status('Trait sélectionné — cliquez sur un cercle d\'extrémité pour la déplacer. Clic droit pour autres éléments.');
      refreshNetworkLists(); draw(); return;
    }

    // 5. Rien
    S.selected = null; S.epDrag = null; S.mDrag = null;
    showProps(null); refreshNetworkLists(); draw();
    return;
  }

  if (S.tool === 'track') {
    if (!S.drawing) {
      S.drawStart = snapEndpointW(w.x, w.y, null); S.drawing = true;
      status('Trait commencé — cliquez pour le terminer.');
    } else {
      const ep = snapEndpointW(w.x, w.y, null);
      if (Math.hypot(ep.x - S.drawStart.x, ep.y - S.drawStart.y) > 3 / S.zoom) {
        const tr = { id: 'TRK' + (S.idTrk++), kind: 'track', x1: S.drawStart.x, y1: S.drawStart.y, x2: ep.x, y2: ep.y, name: '' };
        S.tracks.push(tr); S.selected = tr; showProps(tr); rebuildAll();
      }
      S.drawing = false; S.drawStart = null; draw();
      status('Trait créé. Cliquez pour en tracer un autre.');
    }
    return;
  }

  if (S.tool === 'route') {
    const sig = hitMarkerW(w.x, w.y);
    if (sig && isSignalMarker(sig.type)) { routeClick({ type: 'signal', marker: sig }); return; }
    const hitT = hitTrackW(w.x, w.y);
    if (hitT) { routeClick({ type: 'track', track: hitT }); return; }
    status('Cliquez sur un signal ou un trait.');
    return;
  }

  if (S.tool === 'elem') {
    if (isJointBoundSignal(S.elemType)) {
      const j = nearestJoint(w.x, w.y);
      if (!j) { status('Aucun joint de CdV disponible — posez un joint d\'abord.'); return; }
      const m = {
        id: 'MRK' + (S.idMrk++), kind: 'marker', type: S.elemType,
        joint: j, track: j.track, t: j.t, x: j.x, y: j.y, name: '', orient: 1
      };
      S.markers.push(m); S.selected = m; showProps(m); rebuildAll(); draw();
      status('Signal posé sur le joint ' + (j.name || j.id) + '.');
      return;
    }
    const snap = snapToTrackW(w.x, w.y);
    if (!snap) { status('Cliquez sur un trait de voie.'); return; }
    const m = {
      id: 'MRK' + (S.idMrk++), kind: 'marker', type: S.elemType,
      track: snap.track, t: snap.t, x: snap.x, y: snap.y, name: ''
    };
    if (isSignalMarker(m.type)) m.orient = 1;
    S.markers.push(m); S.selected = m; showProps(m); rebuildAll(); draw();
    status('Élément posé.');
  }
});

canvas.addEventListener('mousemove', ev => {
  const r = canvas.getBoundingClientRect();
  const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
  const w = toWorld(cx, cy);
  S.mouseWorld = { x: w.x, y: w.y };

  if (S.panning) {
    S.pan.x = S.panOrigin.x + (ev.clientX - S.panStart.x);
    S.pan.y = S.panOrigin.y + (ev.clientY - S.panStart.y);
    draw(); return;
  }

  // Déplacement d'étiquette
  if (S.labelDrag) {
    const { obj, startOff, startMouse } = S.labelDrag;
    obj.labelOff = { x: startOff.x + (w.x - startMouse.x), y: startOff.y + (w.y - startMouse.y) };
    draw(); return;
  }

  // Croisement bon : accroche au trait le plus proche, n'importe où sur le plan
  if (S.cbDrag) {
    const { sw, leg } = S.cbDrag;
    let bestTr = null, bestT = 0, bestDist = Infinity;
    S.tracks.forEach(tr => {
      const proj = projOnTrack(tr, w.x, w.y);
      if (proj.dist < bestDist) { bestDist = proj.dist; bestTr = tr; bestT = proj.t; }
    });
    if (bestTr) {
      bestT = Math.max(0.02, Math.min(0.98, bestT));
      sw[leg === 'left' ? 'cbLeft' : 'cbRight'] = { track: bestTr, t: bestT };
      draw();
    }
    return;
  }

  if (S.epDrag) {
    const snapped = snapEndpointW(w.x, w.y, S.epDrag.track);
    setTrackEnd(S.epDrag.track, S.epDrag.end, snapped.x, snapped.y);
    rebuildAll(); showProps(S.epDrag.track); draw(); return;
  }

  if (S.mDrag) {
    if (isJointBoundSignal(S.mDrag.type)) {
      const j = nearestJoint(w.x, w.y);
      if (j) {
        S.mDrag.joint = j; S.mDrag.track = j.track; S.mDrag.t = j.t; S.mDrag.x = j.x; S.mDrag.y = j.y;
        rebuildAll(); showProps(S.mDrag);
      }
      draw(); return;
    }
    const proj = projOnTrack(S.mDrag.track, w.x - S.mDragOff.x, w.y - S.mDragOff.y);
    S.mDrag.t = proj.t; S.mDrag.x = proj.x; S.mDrag.y = proj.y;
    // Un joint qui bouge entraîne les signaux qui lui sont liés
    if (S.mDrag.type === 'joint') {
      S.markers.forEach(m => {
        if (m.joint === S.mDrag) { m.track = S.mDrag.track; m.t = S.mDrag.t; m.x = S.mDrag.x; m.y = S.mDrag.y; }
      });
    }
    rebuildAll(); showProps(S.mDrag); draw(); return;
  }

  // Indications de curseur
  if (S.tool === 'select') {
    if (hitLabelCanvas(cx, cy)) { canvas.style.cursor = 'grab'; draw(); return; }
    if (hitCbHandle(w.x, w.y)) { canvas.style.cursor = 'grab'; draw(); return; }
    if (S.selected && S.selected.kind === 'track') {
      canvas.style.cursor = hitEndpoint(S.selected, w.x, w.y) ? 'crosshair' : 'default';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  draw();

  // Aperçu pendant le tracé
  if (S.tool === 'track' && S.drawing && S.drawStart) {
    const ep = snapEndpointW(w.x, w.y, null);
    const c1 = toCanvas(S.drawStart.x, S.drawStart.y), c2 = toCanvas(ep.x, ep.y);
    ctx.save(); ctx.strokeStyle = COL; ctx.lineWidth = RAIL_W; ctx.globalAlpha = .3; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }
});

canvas.addEventListener('mouseup', () => {
  if (S.panning) {
    S.panning = false;
    canvas.style.cursor = S.spaceDown ? 'grab' : S.tool === 'track' ? 'crosshair' : 'default';
  }
  if (S.epDrag) {
    S.epDrag = null;
    rebuildAll();
    draw();
    canvas.style.cursor = 'default';
    status('Extrémité fixée.');
  }
  if (S.mDrag) { S.mDrag = null; }
  if (S.cbDrag) {
    const sw = S.cbDrag.sw;
    if (!findLegKeysForCb(sw)) {
      sw.cbLeft = S.cbDrag.origCbLeft;
      sw.cbRight = S.cbDrag.origCbRight;
      status('Croisement bon refusé — point inatteignable depuis le talon correspondant de l\'aiguille.');
    } else if (S.selected) {
      showProps(S.selected);
    }
    S.cbDrag = null; canvas.style.cursor = 'default'; draw();
  }
  if (S.labelDrag) { S.labelDrag = null; canvas.style.cursor = 'default'; }
});

// ── Événements clavier / document ──────────────────────────────────────────
document.addEventListener('click', e => { if (!ctxMenu.contains(e.target)) hideCtxMenu(); });

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') hideCtxMenu();
  if (ev.code === 'Space' && !ev.target.matches('input')) { S.spaceDown = true; canvas.style.cursor = 'grab'; ev.preventDefault(); }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && !ev.target.matches('input')) deleteSelected();
  if (ev.key === 'Escape') {
    if (S.drawing) { S.drawing = false; S.drawStart = null; draw(); }
    else if (S.epDrag) { S.epDrag = null; draw(); }
    else if (S.couplingMode) { S.couplingMode = null; status('Couplage annulé.'); }
    else if (S.approachMode) { cancelApproachMode(); }
    else if (S.flankMode) { S.flankMode = null; status('Ajout d\'aiguille en protection annulé.'); }
    else if (S.routeBuild) { S.routeBuild = null; status('Construction d\'itinéraire annulée.'); draw(); }
    else { S.selected = null; showProps(null); refreshNetworkLists(); draw(); }
  }
});
document.addEventListener('keyup', ev => {
  if (ev.code === 'Space') { S.spaceDown = false; canvas.style.cursor = S.tool === 'track' ? 'crosshair' : 'default'; }
});

window.addEventListener('resize', resize);

// ── Handlers inline ────────────────────────────────────────────────────────
// Les attributs onclick/onchange du HTML (statique et généré par showProps)
// s'exécutent dans la portée globale : un module doit donc les y exposer.
Object.assign(window, {
  setTool, selectElem, deleteSelected, clearAll, resetView, exportRailML,
  saveFile, openFile,
  zoomBtn, toggleAcc, selectObj,
  renameById, renameZone, renameSw, renameRoute,
  flipMarkerOrient, setRouteReleaseDelay,
  startCouplingMode, uncoupleSwitches,
  startFlankMode, removeFlankProtection,
  startApproachMode, confirmApproachMode, cancelApproachMode, removeApproachZone
});

// ── Démarrage ──────────────────────────────────────────────────────────────
updateZoomLabel();
resize();
