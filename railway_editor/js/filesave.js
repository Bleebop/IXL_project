// ═══════════════════════════════════════════════════════════════════════════
// filesave.js — enregistrement d'un fichier texte avec choix du dossier et du
// nom. Utilise la boîte de dialogue native (File System Access API, Chrome /
// Edge) ; sinon (Firefox, Safari) demande seulement le nom et laisse le
// navigateur télécharger le fichier dans son dossier habituel.
// ═══════════════════════════════════════════════════════════════════════════

// Renvoie le nom du fichier enregistré, ou null si l'utilisateur a annulé.
export async function saveTextFile(text, { suggestedName, mime, description, extensions }) {
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mime]: extensions } }]
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    const writable = await handle.createWritable();
    await writable.write(new Blob([text], { type: mime }));
    await writable.close();
    return handle.name;
  }

  const name = window.prompt('Nom du fichier :', suggestedName);
  if (!name) return null;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
  return name;
}
