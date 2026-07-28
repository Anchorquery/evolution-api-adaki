// Matching compartido del filtro de privacidad de la integración con Chatwoot
// (ignoreJids/allowedJids). Vive fuera de ChatwootService para que el import de
// historial (chatwoot-import-helper) aplique exactamente el mismo criterio que
// el flujo de eventos en vivo, en vez de su propio filtro parcial.

export function normalizeJidIdentifier(remoteJid: string): string {
  if (!remoteJid) {
    return '';
  }
  if (remoteJid.includes('@lid')) {
    return remoteJid;
  }
  return remoteJid.replace(/:\d+/, '').split('@')[0];
}

// ignoreJids/allowedJids pueden haber sido guardados por dos UIs distintas con
// formatos distintos: JID completo ("123@g.us"/"123@newsletter") desde el
// picker del Manager de Evolution, o número pelado ("123") desde el filtro de
// privacidad dentro de Chatwoot. Matchea contra ambas formas más los wildcards
// de categoría completa, así da igual cuál UI lo guardó.
//
// Limitación conocida: el matching es de texto puro y NO resuelve lid↔teléfono.
// Un chat que WhatsApp migró a "@lid" no matchea su entrada guardada por
// teléfono: en modo allow se bloquea un seleccionado, en modo block se cuela
// un excluido. Detalle y mitigación en DEPLOY-ADAKI.md ("Limitación conocida").
export function jidMatchesFilterList(list: string[], remoteJid: string): boolean {
  if (!remoteJid || !list?.length) {
    return false;
  }

  if (list.includes(remoteJid) || list.includes(normalizeJidIdentifier(remoteJid))) {
    return true;
  }

  const stripped = remoteJid.split('@')[0].replace(/:\d+/, '');
  if (list.includes(stripped)) {
    return true;
  }

  if (remoteJid.endsWith('@g.us') && list.includes('@g.us')) {
    return true;
  }

  if (remoteJid.endsWith('@newsletter') && list.includes('@newsletter')) {
    return true;
  }

  if ((remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid')) && list.includes('@s.whatsapp.net')) {
    return true;
  }

  return false;
}

// true => el filtro de privacidad manda a descartar este chat.
// 'status@broadcast' queda fuera del whitelist a propósito: no es un chat
// elegible en ningún picker y ya se descarta más adelante en el flujo normal.
export function isJidBlockedByPrivacyFilter(
  provider: { ignoreJids?: unknown; allowedJids?: unknown } | null | undefined,
  remoteJid: string,
): boolean {
  if (!remoteJid) {
    return false;
  }

  const allowed = Array.isArray(provider?.allowedJids) ? provider.allowedJids.map(String) : [];
  if (allowed.length > 0 && remoteJid !== 'status@broadcast' && !jidMatchesFilterList(allowed, remoteJid)) {
    return true;
  }

  const ignored = Array.isArray(provider?.ignoreJids) ? provider.ignoreJids.map(String) : [];
  return ignored.length > 0 && jidMatchesFilterList(ignored, remoteJid);
}
