// ═══════════════════════════════════════════════════════════════════════════
// model.js — état de l'application + géométrie + topologie ferroviaire.
// Aucune dépendance au DOM : tout ce qui est ici est calculable "à froid".
// ═══════════════════════════════════════════════════════════════════════════

// ── Constantes ─────────────────────────────────────────────────────────────
export const COL = '#111';
export const COL_SEG = '#534AB7';
export const COL_SW = '#B85C00';
export const RAIL_W = 2.5;
export const SNAP_D = 12;
export const CONN_D = 3;
export const EP_R = 6;
export const CB_HANDLE_R = 4;   // rayon des poignées de croisement bon (px canvas)
// Décalage perpendiculaire (unités monde) entre la position sur voie d'un marqueur
// et son symbole dessiné. Les signaux liés à un joint sont écartés pour que leur
// zone cliquable ne recouvre pas celle du joint.
export const SIGNAL_PERP_OFFSET = 18;

// ── État mutable ───────────────────────────────────────────────────────────
// Regroupé dans un objet unique : les modules ES interdisent de réassigner un
// binding importé, mais muter une propriété de S est vu par tous les modules.
export const S = {
  tool: 'select',
  elemType: null,

  tracks: [],
  markers: [],
  zones: [],
  switches: [],
  routes: [],

  routeBuild: null,    // { start, tracks: [...], state: { track, t, towards } }
  couplingMode: null,  // aiguille en attente de couplage
  flankMode: null,     // { route, phase: 'switch'|'heel', sw }
  approachMode: null,  // { route, selection: [idCdV, ...] } — sélection en cours

  selected: null,
  epDrag: null,        // { track, end:'start'|'end' }
  mDrag: null,
  mDragOff: { x: 0, y: 0 },
  cbDrag: null,        // { sw, leg:'left'|'right', origCbLeft, origCbRight }
  labelDrag: null,     // { obj, startOff, startMouse }
  drawing: false,
  drawStart: null,

  idTrk: 1, idMrk: 1, idZone: 1, idSw: 1, idRoute: 1,

  pan: { x: 0, y: 0 },
  zoom: 1,
  panning: false,
  panStart: { x: 0, y: 0 },
  panOrigin: { x: 0, y: 0 },
  spaceDown: false,
  mouseWorld: { x: 0, y: 0 }
};

// ── Transformations de coordonnées ─────────────────────────────────────────
export function toWorld(cx, cy) { return { x: (cx - S.pan.x) / S.zoom, y: (cy - S.pan.y) / S.zoom }; }
export function toCanvas(wx, wy) { return { x: wx * S.zoom + S.pan.x, y: wy * S.zoom + S.pan.y }; }

// ── Helpers géométriques ───────────────────────────────────────────────────
export function ptEq(a, b, th) { return Math.hypot(a.x - b.x, a.y - b.y) < (th ?? CONN_D); }
export function trackEndPt(tr, end) { return end === 'start' ? { x: tr.x1, y: tr.y1 } : { x: tr.x2, y: tr.y2 }; }
export function trackDir(tr, end) {
  const dx = end === 'start' ? tr.x2 - tr.x1 : tr.x1 - tr.x2;
  const dy = end === 'start' ? tr.y2 - tr.y1 : tr.y1 - tr.y2;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
export function angleBetween(d1, d2) { return Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y))); }
export function projOnTrack(tr, wx, wy) {
  const dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1, len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return { t: 0, x: tr.x1, y: tr.y1, dist: Math.hypot(wx - tr.x1, wy - tr.y1) };
  const t = Math.max(0, Math.min(1, ((wx - tr.x1) * dx + (wy - tr.y1) * dy) / len2));
  const px = tr.x1 + t * dx, py = tr.y1 + t * dy;
  return { t, x: px, y: py, dist: Math.hypot(wx - px, wy - py) };
}
export function ptOnTrack(tr, t) {
  return { x: tr.x1 + (tr.x2 - tr.x1) * t, y: tr.y1 + (tr.y2 - tr.y1) * t };
}
export function snapEndpointW(wx, wy, excl) {
  let best = null, bestD = Infinity;
  const th = SNAP_D / S.zoom;
  S.tracks.forEach(t => {
    if (t === excl) return;
    [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }].forEach(pt => {
      const d = Math.hypot(wx - pt.x, wy - pt.y);
      if (d < bestD && d < th) { bestD = d; best = pt; }
    });
  });
  return best ?? { x: wx, y: wy };
}
export function snapToTrackW(wx, wy) {
  let best = null, bestD = Infinity;
  const th = SNAP_D / S.zoom;
  S.tracks.forEach(tr => {
    const p = projOnTrack(tr, wx, wy);
    if (p.dist < bestD && p.dist < th) { bestD = p.dist; best = { track: tr, ...p }; }
  });
  return best;
}
export function nearestJoint(wx, wy) {
  let best = null, bestD = Infinity;
  S.markers.forEach(m => {
    if (m.type !== 'joint') return;
    const d = Math.hypot(wx - m.x, wy - m.y);
    if (d < bestD) { bestD = d; best = m; }
  });
  return best;
}
export function isJointBoundSignal(type) { return type === 'signal_man' || type === 'signal_esp'; }
export function isSignalMarker(type) { return type === 'signal_stop' || isJointBoundSignal(type); }
export function markerVisualOffset(m) {
  if (!isJointBoundSignal(m.type)) return { x: 0, y: 0 };
  const tr = m.track;
  const dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1, len = Math.hypot(dx, dy) || 1;
  return { x: SIGNAL_PERP_OFFSET * dy / len, y: -SIGNAL_PERP_OFFSET * dx / len };
}
export function markerVisualPos(m) {
  const off = markerVisualOffset(m);
  return { x: m.x + off.x, y: m.y + off.y };
}
export function updMXY(m) {
  const tr = m.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1;
  m.x = tr.x1 + dx * m.t; m.y = tr.y1 + dy * m.t;
}
export function setTrackEnd(tr, end, x, y) {
  if (end === 'start') {
    const ol = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    tr.x1 = x; tr.y1 = y;
    const nl = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    if (ol > 0.001 && nl > 0.001)
      S.markers.filter(m => m.track === tr).forEach(m => { const d = ol * (1 - m.t); m.t = Math.max(0, Math.min(1, 1 - d / nl)); updMXY(m); });
  } else {
    const ol = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    tr.x2 = x; tr.y2 = y;
    const nl = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
    if (ol > 0.001 && nl > 0.001)
      S.markers.filter(m => m.track === tr).forEach(m => { const d = ol * m.t; m.t = Math.max(0, Math.min(1, d / nl)); updMXY(m); });
  }
}
// Pattes de voie raccordées à une extrémité donnée (hors le trait lui-même).
export function connectedLegs(tr, end) {
  const pt = trackEndPt(tr, end), r = [];
  S.tracks.forEach(t => {
    if (t === tr) return;
    if (ptEq({ x: t.x1, y: t.y1 }, pt)) r.push({ track: t, end: 'start' });
    else if (ptEq({ x: t.x2, y: t.y2 }, pt)) r.push({ track: t, end: 'end' });
  });
  return r;
}

// ── Détection des aiguilles ────────────────────────────────────────────────
export function findJunctionNodes() {
  const nodes = [];
  S.tracks.forEach(tr => {
    [{ end: 'start', pt: { x: tr.x1, y: tr.y1 } }, { end: 'end', pt: { x: tr.x2, y: tr.y2 } }].forEach(({ end, pt }) => {
      let found = nodes.find(n => ptEq(n.pt, pt));
      if (!found) { found = { pt: { ...pt }, legs: [] }; nodes.push(found); }
      found.legs.push({ track: tr, end });
    });
  });
  return nodes.filter(n => n.legs.length === 3);
}
// Répartit les 3 pattes en pointe / talon gauche / talon droit.
// `tip_given` fige la pointe (une aiguille déjà créée garde sa pointe) ; sinon la
// pointe est déduite de la géométrie (les deux pattes les plus alignées = talons).
export function classifyLegs(legs, tip_given) {
  let tip, h0, h1;
  if (!tip_given) {
    let minA = Infinity, heelPair = null;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = angleBetween(trackDir(legs[i].track, legs[i].end), trackDir(legs[j].track, legs[j].end));
      if (a < minA) { minA = a; heelPair = [i, j]; }
    }
    const tipIdx = legs.findIndex((_, i) => !heelPair.includes(i));
    tip = legs[tipIdx];
    h0 = legs[heelPair[0]], h1 = legs[heelPair[1]];
  } else {
    tip = tip_given;
    const heelLegs = legs.filter(x => x.track.id != tip_given.track.id);
    h0 = heelLegs[0], h1 = heelLegs[1];
  }
  const tipDir = trackDir(tip.track, tip.end);
  const d0 = trackDir(h0.track, h0.end);
  const d1 = trackDir(h1.track, h1.end);
  const cross0 = tipDir.x * d0.y - tipDir.y * d0.x;
  const cross1 = tipDir.x * d1.y - tipDir.y * d1.x;
  const dot0 = tipDir.x * d0.x + tipDir.y * d0.y;
  const dot1 = tipDir.x * d1.x + tipDir.y * d1.y;
  if (cross0 * cross1 <= 0) {        // talons de part et d'autre de la pointe
    return { tip: tip, heelLeft: cross0 >= cross1 ? h0 : h1, heelRight: cross0 >= cross1 ? h1 : h0 };
  } else if (cross0 > 0) {           // les deux talons à gauche
    return { tip: tip, heelLeft: dot0 >= dot1 ? h0 : h1, heelRight: dot0 >= dot1 ? h1 : h0 };
  } else {                           // les deux talons à droite
    return { tip: tip, heelLeft: dot0 >= dot1 ? h1 : h0, heelRight: dot0 >= dot1 ? h0 : h1 };
  }
}
export function rebuildSwitches() {
  const prev = S.switches.slice();
  const usedPrev = new Set();
  S.switches = findJunctionNodes().map(node => {
    const ex = prev.find(s => !usedPrev.has(s) && ptEq(s.pt, node.pt, 1));
    if (ex) {
      // Mutation en place : les références externes (itinéraires, couplages…) survivent au rebuild.
      usedPrev.add(ex);
      ex.pt = { ...node.pt };
      const { heelLeft, heelRight } = classifyLegs(node.legs, ex.tip);
      if (ex.heelLeft.track.id != heelLeft.track.id) {
        [ex.cbLeft, ex.cbRight] = [ex.cbRight, ex.cbLeft];
      }
      ex.heelLeft = heelLeft;
      ex.heelRight = heelRight;
      if (!reachableTracksFromLeg(ex, ex.heelLeft).has(ex.cbLeft.track)) {
        ex.cbLeft = { track: heelLeft.track, t: heelLeft.end === 'start' ? 0.2 : 0.8 };
      }
      if (!reachableTracksFromLeg(ex, ex.heelRight).has(ex.cbRight.track)) {
        ex.cbRight = { track: heelRight.track, t: heelRight.end === 'start' ? 0.2 : 0.8 };
      }
      return ex;
    }
    const { tip, heelLeft, heelRight } = classifyLegs(node.legs, null);
    return {
      id: 'SW' + (S.idSw++),
      kind: 'switch', pt: { ...node.pt },
      tip, heelLeft, heelRight,
      name: '',
      cbLeft: { track: heelLeft.track, t: heelLeft.end === 'start' ? 0.2 : 0.8 },
      cbRight: { track: heelRight.track, t: heelRight.end === 'start' ? 0.2 : 0.8 },
      labelOff: null
    };
  });
  cleanupOrphanCouplings();
  cleanupOrphanFlankProtections();
}
// Efface les `coupledWith` dont le partenaire n'existe plus.
export function cleanupOrphanCouplings() {
  const set = new Set(S.switches);
  S.switches.forEach(sw => { if (sw.coupledWith && !set.has(sw.coupledWith)) sw.coupledWith = null; });
}
// Efface les aiguilles en protection dont l'aiguille n'existe plus.
export function cleanupOrphanFlankProtections() {
  const swSet = new Set(S.switches);
  S.routes.forEach(r => {
    if (!r.flankProtection) return;
    r.flankProtection = r.flankProtection.filter(fp => swSet.has(fp.sw));
  });
}

// ── Accessibilité depuis une patte d'aiguille ──────────────────────────────
// BFS depuis une patte de `sw`. Les autres aiguilles ne se traversent qu'en
// pointe↔talon (talon↔talon interdit, comme pour un train réel). Si le parcours
// reboucle sur l'aiguille de départ, la branche s'arrête.
export function reachableTracksFromLeg(sw, startLeg) {
  const visited = new Set([startLeg.track]);
  const queue = [{ track: startLeg.track, enterEnd: startLeg.end }];
  while (queue.length) {
    const { track, enterEnd } = queue.shift();
    const otherEnd = enterEnd === 'start' ? 'end' : 'start';
    const otherPt = trackEndPt(track, otherEnd);
    const otherSw = S.switches.find(s => ptEq(s.pt, otherPt, 1));
    if (otherSw === sw) continue;
    if (otherSw) {
      const allLegs = [otherSw.tip, otherSw.heelLeft, otherSw.heelRight];
      const inLeg = allLegs.find(l => l.track === track && l.end === otherEnd);
      if (!inLeg) continue;
      const outLegs = (inLeg === otherSw.tip) ? [otherSw.heelLeft, otherSw.heelRight] : [otherSw.tip];
      outLegs.forEach(ol => {
        if (!visited.has(ol.track)) { visited.add(ol.track); queue.push({ track: ol.track, enterEnd: ol.end }); }
      });
    } else {
      connectedLegs(track, otherEnd).forEach(({ track: nbr, end: nbrEnd }) => {
        if (!visited.has(nbr)) { visited.add(nbr); queue.push({ track: nbr, enterEnd: nbrEnd }); }
      });
    }
  }
  return visited;
}
// Vrai si le point de croisement bon gauche (resp. droit) est atteignable
// depuis le talon gauche (resp. droit) de l'aiguille.
export function findLegKeysForCb(sw) {
  return reachableTracksFromLeg(sw, sw.heelLeft).has(sw.cbLeft.track)
      && reachableTracksFromLeg(sw, sw.heelRight).has(sw.cbRight.track);
}

// ── Itinéraires ────────────────────────────────────────────────────────────
// Un itinéraire est une liste ordonnée de traits entre un signal de départ et un
// signal d'arrivée. Les points de passage sont des TRAITS ; les aiguilles
// traversées et leurs positions sont DÉRIVÉES via computeRouteSwitches().
// L'orientation du signal de départ donne le sens initial ; celle du signal
// d'arrivée n'a pas besoin de correspondre.
export function enumeratePaths(track, t, towards, target, encounteredTracks, visited, results, maxResults) {
  if (results.length >= maxResults) return;
  const key = track.id + '|' + towards;
  if (visited.has(key)) return;
  visited = new Set(visited); visited.add(key);

  if (target.type === 'signal' && target.marker.track === track) {
    const tS = target.marker.t;
    const onPath = (towards === 'end' && tS >= t - 1e-6) || (towards === 'start' && tS <= t + 1e-6);
    if (onPath) { results.push({ tracks: encounteredTracks.slice(), endT: tS, endTowards: towards }); return; }
  }
  if (target.type === 'track' && target.track === track && encounteredTracks.length > 0) {
    results.push({ tracks: encounteredTracks.slice(), endT: t, endTowards: towards });
    return;
  }

  const otherPt = trackEndPt(track, towards);
  const sw = S.switches.find(s => ptEq(s.pt, otherPt, 1));
  if (sw) {
    const legs = [sw.tip, sw.heelLeft, sw.heelRight];
    const entryLeg = legs.find(l => l.track === track && l.end === towards);
    if (!entryLeg) return;
    const possibleExits = entryLeg === sw.tip ? [sw.heelLeft, sw.heelRight] : [sw.tip];
    for (const exitLeg of possibleExits) {
      const newEnc = [...encounteredTracks, exitLeg.track];
      const newTowards = exitLeg.end === 'start' ? 'end' : 'start';
      const newT = exitLeg.end === 'start' ? 0 : 1;
      enumeratePaths(exitLeg.track, newT, newTowards, target, newEnc, visited, results, maxResults);
    }
    return;
  }
  const conn = connectedLegs(track, towards);
  if (conn.length !== 1) return;
  const next = conn[0];
  const newEnc = [...encounteredTracks, next.track];
  const newTowards = next.end === 'start' ? 'end' : 'start';
  const newT = next.end === 'start' ? 0 : 1;
  enumeratePaths(next.track, newT, newTowards, target, newEnc, visited, results, maxResults);
}
export function tryReachTarget(state, target) {
  const results = [];
  enumeratePaths(state.track, state.t, state.towards, target, [], new Set(), results, 2);
  if (results.length === 0) return { ok: false, reason: 'unreachable' };
  if (results.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, path: results[0] };
}
// Aiguilles traversées (et leur position) déduites des paires de traits consécutifs.
export function computeRouteSwitches(routeTracks) {
  const result = [];
  for (let i = 0; i < routeTracks.length - 1; i++) {
    const t1 = routeTracks[i], t2 = routeTracks[i + 1];
    for (const sw of S.switches) {
      const legs = [sw.tip, sw.heelLeft, sw.heelRight];
      const leg1 = legs.find(l => l.track === t1);
      const leg2 = legs.find(l => l.track === t2);
      if (leg1 && leg2) {
        const position = (leg1 === sw.heelLeft || leg2 === sw.heelLeft) ? 'left'
                       : (leg1 === sw.heelRight || leg2 === sw.heelRight) ? 'right'
                       : 'unknown';
        result.push({ sw, position });
        break;
      }
    }
  }
  return result;
}
// Rejoue le parcours d'un itinéraire en segments {track, t1, t2}.
// t1 = début dans l'ordre de parcours, t2 = fin (t1 peut donc être > t2).
export function tracedSegments(start, routeTracks, end) {
  const segments = [];
  if (routeTracks.length === 0 || routeTracks[0] !== start.track) return segments;
  let track = routeTracks[0], t = start.t;
  let towards = (start.orient || 1) > 0 ? 'end' : 'start';

  for (let i = 0; i < routeTracks.length; i++) {
    if (end && end.track === track) {
      const tE = end.t;
      if ((towards === 'end' && tE >= t - 1e-6) || (towards === 'start' && tE <= t + 1e-6)) {
        segments.push({ track, t1: t, t2: tE });
        return segments;
      }
    }
    const endT = towards === 'end' ? 1 : 0;
    if (Math.abs(t - endT) > 0.001) segments.push({ track, t1: t, t2: endT });

    if (i === routeTracks.length - 1) return segments;

    const nextTrack = routeTracks[i + 1];
    const otherPt = trackEndPt(track, towards);
    const sw = S.switches.find(s => ptEq(s.pt, otherPt, 1));
    let nextLeg = null;
    if (sw) nextLeg = [sw.tip, sw.heelLeft, sw.heelRight].find(l => l.track === nextTrack);
    else nextLeg = connectedLegs(track, towards).find(c => c.track === nextTrack);
    if (!nextLeg) return segments;
    track = nextTrack;
    towards = nextLeg.end === 'start' ? 'end' : 'start';
    t = nextLeg.end === 'start' ? 0 : 1;
  }
  return segments;
}
// Itinéraires incompatibles : même aiguille en positions différentes, ou même
// portion de voie parcourue en sens opposés.
export function routeConflicts(route) {
  const mySw = computeRouteSwitches(route.tracks);
  const mySwMap = new Map(mySw.map(s => [s.sw, s.position]));
  const mySegs = tracedSegments(route.start, route.tracks, route.end);
  const out = [];
  for (const other of S.routes) {
    if (other === route) continue;
    let conflict = false;
    const otherSw = computeRouteSwitches(other.tracks);
    for (const s of otherSw) {
      const myPos = mySwMap.get(s.sw);
      if (myPos && myPos !== s.position) { conflict = true; break; }
    }
    if (!conflict) {
      const otherSegs = tracedSegments(other.start, other.tracks, other.end);
      outer:
      for (const a of mySegs) {
        for (const b of otherSegs) {
          if (a.track !== b.track) continue;
          const aLow = Math.min(a.t1, a.t2), aHigh = Math.max(a.t1, a.t2);
          const bLow = Math.min(b.t1, b.t2), bHigh = Math.max(b.t1, b.t2);
          if (aHigh <= bLow + 0.001 || bHigh <= aLow + 0.001) continue;
          const aDir = a.t2 >= a.t1 ? 1 : -1;
          const bDir = b.t2 >= b.t1 ? 1 : -1;
          if (aDir !== bDir) { conflict = true; break outer; }
        }
      }
    }
    if (conflict) out.push(other);
  }
  return out;
}
// CdV traversés par un itinéraire, dans l'ordre de parcours, dédoublonnés.
export function routeTvdSections(route) {
  const segs = tracedSegments(route.start, route.tracks, route.end);
  const cdvZones = S.zones.filter(z => z.markerType === 'joint');
  const seen = new Set();
  const ordered = [];
  segs.forEach(seg => {
    const goingForward = seg.t2 >= seg.t1;
    const tLow = Math.min(seg.t1, seg.t2), tHigh = Math.max(seg.t1, seg.t2);
    const matches = [];
    cdvZones.forEach(z => {
      z.spans.forEach(sp => {
        if (sp.track !== seg.track) return;
        const spLow = Math.min(sp.t1, sp.t2), spHigh = Math.max(sp.t1, sp.t2);
        if (spHigh <= tLow + 0.001 || spLow >= tHigh - 0.001) return;
        matches.push({ zone: z, entryT: goingForward ? spLow : spHigh });
      });
    });
    matches.sort((a, b) => goingForward ? a.entryT - b.entryT : b.entryT - a.entryT);
    matches.forEach(({ zone }) => {
      if (!seen.has(zone)) { seen.add(zone); ordered.push(zone); }
    });
  });
  return ordered;
}
export function cleanupOrphanRoutes() {
  S.routes = S.routes.filter(r =>
    S.markers.includes(r.start) && S.markers.includes(r.end) &&
    (r.tracks || []).every(t => S.tracks.includes(t))
  );
}

// ── Zones d'approche ───────────────────────────────────────────────────────
// Stockées par ID de CdV (`route.approachZone = ['CDV1', ...]`) et non par
// référence : buildZonesOfType() recrée des objets zone neufs à chaque rebuild,
// seul l'id est reporté d'une reconstruction à l'autre.
export function approachZonesOf(route) {
  return (route.approachZone || [])
    .map(id => S.zones.find(z => z.id === id))
    .filter(Boolean);
}
export function cleanupOrphanApproachZones() {
  const ids = new Set(S.zones.filter(z => z.markerType === 'joint').map(z => z.id));
  S.routes.forEach(r => {
    if (!r.approachZone) return;
    r.approachZone = r.approachZone.filter(id => ids.has(id));
  });
  if (S.approachMode) S.approachMode.selection = S.approachMode.selection.filter(id => ids.has(id));
}

// ── Zones (segments railML / circuits de voie) ─────────────────────────────
export function markersOnTrack(tr, type) {
  return S.markers.filter(m => m.track === tr && m.type === type).sort((a, b) => a.t - b.t);
}
export function implicitSegLimits(tr) {
  const s = new Set();
  S.switches.forEach(sw => {
    if (sw.tip.track === tr) s.add(+(sw.tip.end === 'start' ? 0 : 1).toFixed(6));
    if (sw.heelLeft.track === tr) s.add(+(sw.heelLeft.end === 'start' ? 0 : 1).toFixed(6));
    if (sw.heelRight.track === tr) s.add(+(sw.heelRight.end === 'start' ? 0 : 1).toFixed(6));
  });
  return [...s];
}
export function getSpans(tr, markerType) {
  let pts = markersOnTrack(tr, markerType).map(m => m.t);
  if (markerType === 'seg_limit') pts = [...pts, ...implicitSegLimits(tr)];
  pts = [...new Set(pts.map(t => +t.toFixed(6)))].sort((a, b) => a - b);
  const borders = [0, ...pts, 1], spans = [];
  for (let i = 0; i < borders.length - 1; i++) {
    if (borders[i + 1] - borders[i] < 0.0001) continue;
    spans.push({ track: tr, t1: borders[i], t2: borders[i + 1] });
  }
  return spans;
}
export function spanKey(sp) { return sp.track.id + '|' + sp.t1.toFixed(6) + '|' + sp.t2.toFixed(6); }
// SEGMENTS : une aiguille est toujours une frontière — la traversée ne la franchit jamais.
export function canTraverseSeg(fromTr, fromEnd) {
  const pt = trackEndPt(fromTr, fromEnd);
  return !S.switches.some(s => ptEq(s.pt, pt, 1));
}
// CdV : les aiguilles ne bloquent pas la traversée.
export function canTraverseCdv() { return true; }

export function zoneOverlap(za, zb) {
  let overlap = 0;
  za.spans.forEach(sa => {
    zb.spans.forEach(sb => {
      if (sa.track !== sb.track) return;
      const ov = Math.min(sa.t2, sb.t2) - Math.max(sa.t1, sb.t1);
      if (ov > 0) overlap += ov * Math.hypot(sa.track.x2 - sa.track.x1, sa.track.y2 - sa.track.y1);
    });
  });
  return overlap;
}
// Vrai si un span de la zone atteint une extrémité de trait sans voisin.
// Un CdV borné par un tel cul-de-sac n'est pas un circuit de voie valide.
export function zoneHasDeadEnd(zone) {
  for (const sp of zone.spans) {
    if (sp.t1 < 0.001 && connectedLegs(sp.track, 'start').length === 0) return true;
    if (sp.t2 > 0.999 && connectedLegs(sp.track, 'end').length === 0) return true;
  }
  return false;
}
export function buildZonesOfType(markerType, prefix, col, canTraverseFn, prevZones) {
  const newZones = [], visited = new Set();
  const allSpans = [];
  S.tracks.forEach(tr => allSpans.push(...getSpans(tr, markerType)));

  allSpans.forEach(startSpan => {
    const sk = spanKey(startSpan);
    if (visited.has(sk)) return;
    const zone = { id: null, markerType, col, spans: [], name: '' };
    const queue = [startSpan], seen = new Set();
    while (queue.length) {
      const sp = queue.shift(), k = spanKey(sp);
      if (seen.has(k)) continue;
      seen.add(k); visited.add(k); zone.spans.push(sp);
      if (sp.t1 < 0.001) {
        connectedLegs(sp.track, 'start').forEach(({ track: nbr, end: nbrEnd }) => {
          if (!canTraverseFn(sp.track, 'start', nbr, nbrEnd)) return;
          const nsp = getSpans(nbr, markerType);
          const touching = nbrEnd === 'start' ? nsp[0] : nsp[nsp.length - 1];
          if (touching && !seen.has(spanKey(touching))) queue.push(touching);
        });
      }
      if (sp.t2 > 0.999) {
        connectedLegs(sp.track, 'end').forEach(({ track: nbr, end: nbrEnd }) => {
          if (!canTraverseFn(sp.track, 'end', nbr, nbrEnd)) return;
          const nsp = getSpans(nbr, markerType);
          const touching = nbrEnd === 'start' ? nsp[0] : nsp[nsp.length - 1];
          if (touching && !seen.has(spanKey(touching))) queue.push(touching);
        });
      }
    }
    // Un CdV doit être encadré par des joints sur toutes ses extrémités.
    if (markerType === 'joint' && zoneHasDeadEnd(zone)) return;
    newZones.push(zone);
  });

  // Passe 1 : correspondance exacte (les zones inchangées gardent id/nom/label).
  const usedPrev = new Set();
  newZones.forEach(zone => {
    const match = prevZones.find(pz =>
      !usedPrev.has(pz.id) &&
      pz.spans.length === zone.spans.length &&
      zone.spans.every(sp => pz.spans.some(ps => ps.track === sp.track && Math.abs(ps.t1 - sp.t1) < 0.001 && Math.abs(ps.t2 - sp.t2) < 0.001))
    );
    if (match) { zone.id = match.id; zone.name = match.name; if (match.labelOff) zone.labelOff = { ...match.labelOff }; usedPrev.add(match.id); }
  });

  // Passe 2 : meilleur recouvrement pour les zones déplacées (marqueur glissé).
  const unmatched = newZones.filter(z => !z.id);
  if (unmatched.length > 0) {
    const pairs = [];
    unmatched.forEach(zone => {
      prevZones.forEach(pz => {
        if (usedPrev.has(pz.id)) return;
        const ov = zoneOverlap(zone, pz);
        if (ov > 0) pairs.push({ zone, pz, ov });
      });
    });
    pairs.sort((a, b) => b.ov - a.ov);
    pairs.forEach(({ zone, pz }) => {
      if (zone.id || usedPrev.has(pz.id)) return;
      zone.id = pz.id; zone.name = pz.name; if (pz.labelOff) zone.labelOff = { ...pz.labelOff }; usedPrev.add(pz.id);
    });
  }

  // Passe 3 : les zones réellement nouvelles reçoivent un id frais.
  newZones.forEach(zone => { if (!zone.id) zone.id = prefix + (S.idZone++); });

  return newZones;
}
export function zoneMidpoint(z) {
  let totalLen = 0, sx = 0, sy = 0;
  z.spans.forEach(sp => {
    const tr = sp.track, dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1;
    const len = Math.hypot(dx, dy) * (sp.t2 - sp.t1);
    sx += (tr.x1 + dx * (sp.t1 + sp.t2) / 2) * len;
    sy += (tr.y1 + dy * (sp.t1 + sp.t2) / 2) * len;
    totalLen += len;
  });
  return totalLen > 0 ? { x: sx / totalLen, y: sy / totalLen } : { x: 0, y: 0 };
}

// ── Position des étiquettes ────────────────────────────────────────────────
export function labelAnchor(obj) {
  if (obj.kind === 'track') return { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 };
  if (obj.kind === 'marker') return markerVisualPos(obj);
  if (obj.kind === 'switch') return { ...obj.pt };
  if (obj.markerType) return zoneMidpoint(obj);
  return { x: 0, y: 0 };
}
export function labelCanvasPos(obj) {
  const anchor = labelAnchor(obj);
  const ac = toCanvas(anchor.x, anchor.y);
  if (obj.labelOff) return { x: ac.x + obj.labelOff.x * S.zoom, y: ac.y + obj.labelOff.y * S.zoom };
  if (obj.kind === 'track') {
    const c1 = toCanvas(obj.x1, obj.y1), c2 = toCanvas(obj.x2, obj.y2);
    const dx = c2.x - c1.x, dy = c2.y - c1.y, len = Math.hypot(dx, dy) || 1;
    return { x: ac.x + (-dy / len) * 13, y: ac.y + (dx / len) * 13 };
  }
  if (obj.kind === 'marker') return { x: ac.x, y: ac.y + 18 * S.zoom };
  if (obj.kind === 'switch') return { x: ac.x, y: ac.y - 6 };
  if (obj.markerType) {
    const sp = obj.spans[0], tr = sp.track;
    const dx = tr.x2 - tr.x1, dy = tr.y2 - tr.y1, len = Math.hypot(dx, dy) || 1;
    return { x: ac.x + (-dy / len) * 16 * S.zoom, y: ac.y + (dx / len) * 16 * S.zoom };
  }
  return ac;
}
export function hitLabelCanvas(cx, cy) {
  const th = 14;
  const all = [...S.tracks, ...S.markers, ...S.switches, ...S.zones].filter(o => o.name);
  for (const obj of all) {
    const lp = labelCanvasPos(obj);
    if (Math.hypot(cx - lp.x, cy - lp.y) < th) return obj;
  }
  return null;
}

// ── Tests de survol ────────────────────────────────────────────────────────
export function hitTrackW(wx, wy) {
  const th = 6 / S.zoom;
  let best = null, bestD = Infinity;
  S.tracks.forEach(tr => {
    const p = projOnTrack(tr, wx, wy);
    if (p.dist < bestD && p.dist < th) { bestD = p.dist; best = tr; }
  });
  return best;
}
export function hitMarkerW(wx, wy) {
  const th = 10 / S.zoom;
  return S.markers.slice().reverse().find(m => {
    const vp = markerVisualPos(m);
    return Math.hypot(wx - vp.x, wy - vp.y) < th;
  });
}
export function hitSwitchW(wx, wy) {
  const th = 10 / S.zoom;
  return S.switches.find(s => Math.hypot(wx - s.pt.x, wy - s.pt.y) < th);
}
export function hitZoneW(wx, wy) {
  const th = 12 / S.zoom;
  return S.zones.find(z => { const mp = zoneMidpoint(z); return Math.hypot(wx - mp.x, wy - mp.y) < th; });
}
export function hitEndpoint(tr, wx, wy) {
  const th = (EP_R + 3) / S.zoom;
  if (Math.hypot(wx - tr.x1, wy - tr.y1) < th) return { track: tr, end: 'start' };
  if (Math.hypot(wx - tr.x2, wy - tr.y2) < th) return { track: tr, end: 'end' };
  return null;
}
export function hitCbHandle(wx, wy) {
  const th = CB_HANDLE_R * 2 / S.zoom;
  for (const sw of S.switches) {
    const lPt = ptOnTrack(sw.cbLeft.track, sw.cbLeft.t);
    const rPt = ptOnTrack(sw.cbRight.track, sw.cbRight.t);
    if (Math.hypot(wx - lPt.x, wy - lPt.y) < th) return { sw, leg: 'left' };
    if (Math.hypot(wx - rPt.x, wy - rPt.y) < th) return { sw, leg: 'right' };
  }
  return null;
}

export const MARKER_LABELS = {
  seg_limit: 'Limite segment', joint: 'Joint CdV', signal_stop: 'Sig. arrêt',
  signal_man: 'Sig. manœuvre', signal_esp: 'Sig. espacement', motor: 'Moteur aig.'
};

// Tous les éléments proches d'un point monde (pour le menu contextuel).
export function elementsAt(wx, wy) {
  const results = [];
  const th6 = 6 / S.zoom, th10 = 10 / S.zoom, th12 = 12 / S.zoom;
  S.tracks.forEach(tr => {
    const p = projOnTrack(tr, wx, wy);
    if (p.dist < th6) results.push({ obj: tr, label: 'Trait ' + (tr.name || tr.id), icon: '━' });
  });
  S.markers.forEach(m => {
    const vp = markerVisualPos(m);
    if (Math.hypot(wx - vp.x, wy - vp.y) < th10)
      results.push({ obj: m, label: (MARKER_LABELS[m.type] || m.type) + ' ' + (m.name || m.id), icon: '◆' });
  });
  S.switches.forEach(sw => {
    if (Math.hypot(wx - sw.pt.x, wy - sw.pt.y) < th10)
      results.push({ obj: sw, label: 'Aiguille ' + (sw.name || sw.id), icon: '⑂' });
  });
  S.zones.forEach(z => {
    const mp = zoneMidpoint(z);
    let near = Math.hypot(wx - mp.x, wy - mp.y) < th12;
    if (!near) near = z.spans.some(sp => { const p = projOnTrack(sp.track, wx, wy); return p.dist < th6 && p.t >= sp.t1 - 0.001 && p.t <= sp.t2 + 0.001; });
    if (near) {
      const label = z.markerType === 'seg_limit' ? 'Segment ' : 'CdV ';
      results.push({ obj: z, label: label + (z.name || z.id), icon: z.markerType === 'seg_limit' ? '▮' : '▬' });
    }
  });
  return results;
}

// CdV sous le curseur, via la même détection que le menu contextuel.
export function hitCdvZoneW(wx, wy) {
  const hit = elementsAt(wx, wy).find(r => r.obj.markerType === 'joint');
  return hit ? hit.obj : null;
}

// ── Suppressions en cascade ────────────────────────────────────────────────
export function cleanupOrphanSignals() {
  const validJoints = new Set(S.markers.filter(m => m.type === 'joint'));
  S.markers = S.markers.filter(m => !isJointBoundSignal(m.type) || !m.joint || validJoints.has(m.joint));
}
