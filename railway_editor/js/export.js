// ═══════════════════════════════════════════════════════════════════════════
// export.js — génération du fichier railML 3.3 (infrastructure + interlocking).
// ═══════════════════════════════════════════════════════════════════════════

import {
  S, isSignalMarker, trackEndPt, ptEq, connectedLegs,
  routeConflicts, routeTvdSections, computeRouteSwitches, approachZonesOf
} from './model.js';
import { status } from './view.js';
import { saveTextFile } from './filesave.js';

export function exportRailML() {
  if (S.tracks.length === 0) { status('Tracez des traits de voie avant d\'exporter.'); return; }

  // netElements : un par trait (id seulement pour l'instant)
  const netElems = S.tracks.map(t => `        <netElement id="${t.id}"/>`).join('\n');

  // Helpers d'identifiants / positions de netRelation
  const numOf = tr => tr.id.replace(/[^0-9]/g, '') || tr.id;
  const posOf = end => end === 'start' ? '0' : '1';
  const relIdFor = (legA, legB) => `nr_${numOf(legA.track)}_${posOf(legA.end)}_${numOf(legB.track)}_${posOf(legB.end)}`;
  const relations = [];
  const addRelation = (legA, legB, nav) => {
    const posA = posOf(legA.end), posB = posOf(legB.end);
    relations.push(`        <netRelation id="${relIdFor(legA, legB)}" navigability="${nav}" positionOnA="${posA}" positionOnB="${posB}">
          <elementA ref="${legA.track.id}"/>
          <elementB ref="${legB.track.id}"/>
        </netRelation>`);
  };

  // 3 relations par aiguille : pointe↔talon G, pointe↔talon D (Both), talon↔talon (None)
  S.switches.forEach(sw => {
    addRelation(sw.tip, sw.heelLeft, 'Both');
    addRelation(sw.tip, sw.heelRight, 'Both');
    addRelation(sw.heelLeft, sw.heelRight, 'None');
  });

  // 1 relation par jonction simple à deux traits (hors aiguille)
  const seen = new Set();
  S.tracks.forEach(tr => {
    for (const end of ['start', 'end']) {
      const pt = trackEndPt(tr, end);
      if (S.switches.some(s => ptEq(s.pt, pt, 1))) continue;
      const conn = connectedLegs(tr, end);
      if (conn.length !== 1) continue;
      const other = conn[0];
      const key = [`${tr.id}|${end}`, `${other.track.id}|${other.end}`].sort().join('||');
      if (seen.has(key)) continue;
      seen.add(key);
      addRelation({ track: tr, end }, other, 'Both');
    }
  });

  // signalsIS : un <signalIS> par signal (arrêt / manœuvre / espacement)
  const signalsXml = S.markers.filter(m => isSignalMarker(m.type)).map(m => {
    const isSwitchable = m.type !== 'signal_stop';
    const appDir = (m.orient || 1) > 0 ? 'normal' : 'reverse';
    const name = m.name || '';
    const coord = +m.t.toFixed(4);
    return `        <signalIS id="${m.id}" isSwitchable="${isSwitchable}">
          <name language="no" name="${name}"/>
          <spotLocation applicationDirection="${appDir}" id="${m.id}_sloc01" netElementRef="${m.track.id}" intrinsicCoord="${coord}"/>
          <isTrainMovementSignal/>
        </signalIS>`;
  }).join('\n');

  // switchesIS : un <switchIS> par aiguille, référençant les netRelations pointe↔talon
  const switchesXml = S.switches.map(sw => {
    const tipCoord = sw.tip.end === 'start' ? '0.0' : '1.0';
    const name = sw.name || '';
    return `        <switchIS id="${sw.id}" type="ordinarySwitch">
          <name language="no" name="${name}"/>
          <spotLocation id="${sw.id}_sloc01" intrinsicCoord="${tipCoord}" netElementRef="${sw.tip.track.id}"/>
          <leftBranch netRelationRef="${relIdFor(sw.tip, sw.heelLeft)}"/>
          <rightBranch netRelationRef="${relIdFor(sw.tip, sw.heelRight)}"/>
        </switchIS>`;
  }).join('\n');

  // trainDetectionElements : un par joint de CdV + 2 par aiguille (points de croisement bon)
  const jointTdesXml = S.markers.filter(m => m.type === 'joint').map(m => {
    const coord = +m.t.toFixed(4);
    return `        <trainDetectionElement id="${m.id}">
          <spotLocation applicationDirection="both" id="${m.id}_sloc01" netElementRef="${m.track.id}" intrinsicCoord="${coord}"/>
        </trainDetectionElement>`;
  }).join('\n');
  const cbTdesXml = S.switches.flatMap(sw => [
    { id: `${sw.id}_cl_l`, cb: sw.cbLeft },
    { id: `${sw.id}_cl_r`, cb: sw.cbRight }
  ].map(({ id, cb }) => {
    const coord = +cb.t.toFixed(4);
    return `        <trainDetectionElement id="${id}" type="virtualClearancePoint">
          <spotLocation id="${id}_sloc01" netElementRef="${cb.track.id}" intrinsicCoord="${coord}"/>
        </trainDetectionElement>`;
  })).join('\n');
  const tdesXml = [jointTdesXml, cbTdesXml].filter(x => x).join('\n');

  // switchesIL : vue interlocking de chaque aiguille
  const switchesILXml = S.switches.map(sw => {
    const rme = sw.coupledWith ? `\n            <relatedMovableElement ref="${sw.coupledWith.id}_IL"/>` : '';
    return `          <switchIL id="${sw.id}_IL">
            <refersTo ref="${sw.id}"/>
            <hasGaugeClearanceMarker ref="${sw.id}_cl_l"/>
            <hasGaugeClearanceMarker ref="${sw.id}_cl_r"/>
            <branchLeft ref="${sw.heelLeft.track.id}"/>
            <branchRight ref="${sw.heelRight.track.id}"/>
            <branchTip ref="${sw.tip.track.id}"/>${rme}
          </switchIL>`;
  }).join('\n');

  // signalsIL : vue interlocking de chaque signal
  const signalFunctionMap = { signal_stop: 'trackEnd', signal_man: 'main', signal_esp: 'block' };
  const signalsILXml = S.markers.filter(m => isSignalMarker(m.type)).map(m => {
    const func = signalFunctionMap[m.type];
    return `          <signalIL function="${func}" id="${m.id}_IL">
            <refersTo ref="${m.id}"/>
          </signalIL>`;
  }).join('\n');

  // conflictingRoutes : 2 <conflictingRoute> par paire (relation symétrique)
  const conflictsXml = S.routes.flatMap(rA =>
    routeConflicts(rA).map(rB => `          <conflictingRoute id="${rA.id}_conf_${rB.id}">
            <refersToRoute ref="${rA.id}"/>
            <conflictsWithRoute ref="${rB.id}"/>
          </conflictingRoute>`)
  ).join('\n');

  // routes : CdV traversés, positions d'aiguilles, signaux d'entrée/sortie
  const routesXml = S.routes.map(r => {
    const tvds = routeTvdSections(r);
    const rSwitches = computeRouteSwitches(r.tracks);
    const parts = [`            <objectName language="no" name="${r.name || ''}"/>`];
    tvds.forEach(z => parts.push(`            <hasTvdSection ref="${z.id}"/>`));
    rSwitches.forEach((s, i) => {
      parts.push(`            <facingSwitchInPosition id="${r.id}_fsip_${i}" inPosition="${s.position}">
              <refersToSwitch ref="${s.sw.id}_IL"/>
            </facingSwitchInPosition>`);
    });
    parts.push(`            <routeEntry id="${r.id}_entry">
              <refersTo ref="${r.start.id}_IL"/>
            </routeEntry>`);
    parts.push(`            <routeExit id="${r.id}_exit">
              <refersTo ref="${r.end.id}_IL"/>
            </routeExit>`);
    // Zone d'approche : les refs pointent vers les <tvdSection> des CdV retenus.
    const approach = approachZonesOf(r);
    if (approach.length) {
      const sections = approach.map(z => `              <activationSection ref="${z.id}"/>`).join('\n');
      parts.push(`            <routeActivationSection id="${r.id}_ras">
${sections}
            </routeActivationSection>`);
    }
    (r.flankProtection || []).forEach(fp => {
      parts.push(`            <additionalRelation ref="${r.id}_rr_${fp.sw.id}"/>`);
    });
    const delay = r.releaseDelay ?? 45;
    return `          <route id="${r.id}" approachReleaseDelay="PT${delay}S">
${parts.join('\n')}
          </route>`;
  }).join('\n');

  // routeRelations : une par couple (itinéraire, aiguille en protection)
  const routeRelationsXml = S.routes.flatMap(r =>
    (r.flankProtection || []).map(fp => `          <routeRelation id="${r.id}_rr_${fp.sw.id}">
            <requiredSwitchPosition>
              <relatedSwitchAndPosition inPosition="${fp.position}">
                <refersToSwitch ref="${fp.sw.id}_IL"/>
              </relatedSwitchAndPosition>
            </requiredSwitchPosition>
          </routeRelation>`)
  ).join('\n');

  // tvdSections : une par CdV, listant les joints qui la délimitent
  const tvdSectionsXml = S.zones.filter(z => z.markerType === 'joint').map(z => {
    const boundaryJoints = new Set();
    z.spans.forEach(sp => {
      S.markers.filter(m => m.type === 'joint' && m.track === sp.track).forEach(j => {
        if (Math.abs(j.t - sp.t1) < 0.001 || Math.abs(j.t - sp.t2) < 0.001) boundaryJoints.add(j);
      });
    });
    const detectors = [...boundaryJoints].map(j => `            <hasDemarcatingTraindetector ref="${j.id}"/>`).join('\n');
    const name = z.name || '';
    return `          <tvdSection id="${z.id}">
            <assetName language="no" name="${name}"/>
${detectors}
          </tvdSection>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<railML version="3.3">
  <infrastructure id="IS_main">
    <topology>
      <netElements>
${netElems}
      </netElements>
      <netRelations>
${relations.join('\n') || '        <!-- aucune connexion -->'}
      </netRelations>
    </topology>
    <functionalInfrastructure>
      <signalsIS>
${signalsXml || '        <!-- aucun signal -->'}
      </signalsIS>
      <switchesIS>
${switchesXml || '        <!-- aucune aiguille -->'}
      </switchesIS>
      <trainDetectionElements>
${tdesXml || '        <!-- aucun joint de CdV -->'}
      </trainDetectionElements>
    </functionalInfrastructure>
  </infrastructure>
  <interlocking>
    <assetsForInterlockings>
      <assetsForInterlocking id="afi_01">
        <tvdSections>
${tvdSectionsXml || '          <!-- aucun CdV -->'}
        </tvdSections>
        <switchesIL>
${switchesILXml || '          <!-- aucune aiguille -->'}
        </switchesIL>
        <signalsIL>
${signalsILXml || '          <!-- aucun signal -->'}
        </signalsIL>
        <routes>
${routesXml || '          <!-- aucun itinéraire -->'}
        </routes>
        <conflictingRoutes>
${conflictsXml || '          <!-- aucun conflit -->'}
        </conflictingRoutes>
        <routeRelations>
${routeRelationsXml || '          <!-- aucune aiguille en protection -->'}
        </routeRelations>
      </assetsForInterlocking>
    </assetsForInterlockings>
  </interlocking>
</railML>`;

  saveTextFile(xml, {
    suggestedName: 'plan_voie.railml.xml', mime: 'application/xml',
    description: 'railML', extensions: ['.xml']
  })
    .then(name => status(name ? 'Export railML enregistré dans « ' + name + ' ».' : 'Export annulé.'))
    .catch(err => status('Export impossible : ' + err.message + '.'));
}
