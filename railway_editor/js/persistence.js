// ═══════════════════════════════════════════════════════════════════════════
// persistence.js — sauvegarde / chargement de l'état complet de l'éditeur
// dans un fichier JSON (contrairement au railML, rien n'est perdu : noms,
// positions d'étiquettes, croisements bons, couplages, itinéraires…).
//
// Les objets du modèle se référencent entre eux (marqueur → trait, aiguille →
// pattes, itinéraire → signaux…). Dans le fichier, toute référence à une
// entité d'une collection (tracks, markers, switches, zones, routes) est
// remplacée par { "$ref": "<collection>:<id>" }, puis résolue au chargement.
// Le parcours est générique : un nouveau champ ajouté aux objets est
// sauvegardé sans modifier ce fichier.
// ═══════════════════════════════════════════════════════════════════════════

import { S } from './model.js';
import { saveTextFile } from './filesave.js';

const FORMAT = 'openixl-railway-editor';
const VERSION = 1;
const COLLECTIONS = ['tracks', 'markers', 'switches', 'zones', 'routes'];
const COUNTERS = ['idTrk', 'idMrk', 'idZone', 'idSw', 'idRoute'];

// ── Sauvegarde ─────────────────────────────────────────────────────────────
export function serializeState() {
  const keyOf = new Map();
  COLLECTIONS.forEach(c => S[c].forEach(o => keyOf.set(o, c + ':' + o.id)));

  const enc = v => {
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') {
      if (keyOf.has(v)) return { $ref: keyOf.get(v) };
      return encFields(v);
    }
    return v;
  };
  const encFields = o => {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = enc(v);
    return out;
  };

  const data = { format: FORMAT, version: VERSION, savedAt: new Date().toISOString() };
  data.counters = Object.fromEntries(COUNTERS.map(k => [k, S[k]]));
  data.view = { pan: { ...S.pan }, zoom: S.zoom };
  COLLECTIONS.forEach(c => { data[c] = S[c].map(encFields); });
  return data;
}

// Renvoie le nom du fichier enregistré, ou null si l'utilisateur a annulé.
export function saveProject() {
  const json = JSON.stringify(serializeState(), null, 2);
  return saveTextFile(json, {
    suggestedName: 'plan_voie.rwe.json', mime: 'application/json',
    description: 'Sauvegarde éditeur de voie', extensions: ['.json']
  });
}

// ── Chargement ─────────────────────────────────────────────────────────────
// Remplit S à partir des données d'un fichier. Lève une erreur si le fichier
// est invalide ; dans ce cas S n'est pas modifié.
export function deserializeState(data) {
  if (!data || data.format !== FORMAT) throw new Error('ce fichier n\'est pas une sauvegarde de l\'éditeur');
  if (data.version > VERSION) throw new Error('sauvegarde créée par une version plus récente de l\'éditeur');

  // Passe 1 : une coquille vide par entité, pour que les références puissent
  // pointer vers un objet avant qu'il soit rempli.
  const byKey = new Map();
  const shells = {};
  COLLECTIONS.forEach(c => {
    shells[c] = (data[c] || []).map(raw => {
      const o = {};
      byKey.set(c + ':' + raw.id, o);
      return o;
    });
  });

  // Passe 2 : remplissage avec résolution des références.
  const dec = v => {
    if (Array.isArray(v)) return v.map(dec);
    if (v && typeof v === 'object') {
      if (typeof v.$ref === 'string') {
        const target = byKey.get(v.$ref);
        if (!target) throw new Error('référence introuvable : ' + v.$ref);
        return target;
      }
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = dec(x);
      return out;
    }
    return v;
  };
  COLLECTIONS.forEach(c => {
    (data[c] || []).forEach((raw, i) => Object.assign(shells[c][i], dec(raw)));
  });

  COLLECTIONS.forEach(c => { S[c] = shells[c]; });
  COUNTERS.forEach(k => { if (Number.isFinite(data.counters?.[k])) S[k] = data.counters[k]; });
  if (data.view) {
    S.pan = { x: data.view.pan?.x ?? 0, y: data.view.pan?.y ?? 0 };
    S.zoom = data.view.zoom ?? 1;
  }
}

export function readProjectFile(file) {
  return file.text().then(txt => {
    let data;
    try { data = JSON.parse(txt); } catch { throw new Error('JSON invalide'); }
    deserializeState(data);
  });
}
