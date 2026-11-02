/* ============================================================================
 * API de l'espace thérapeutes.
 *
 * Principe : le token Airtable ne quitte jamais le serveur. La thérapeute
 * saisit le code de son centre, et c'est ce code — et lui seul — qui décide
 * des prospects qu'elle peut lire et modifier. Le centre n'est jamais envoyé
 * par le navigateur : il est déduit du code, ici.
 *
 * Variables d'environnement Netlify :
 *   AIRTABLE_PAT        le token Airtable (déjà configuré sur le site)
 *   CODES_THERAPEUTES   JSON { "code-du-centre": "Nom du centre", ... }
 * ========================================================================== */

const BASE_ID = 'appNML7rJEKiWkuVg';
const TABLE = 'Prospects Master';
const API = 'https://api.airtable.com/v0';

// Les statuts d'un prospect qui reste à appeler. Tout le reste est invisible
// depuis l'espace thérapeutes : converti, perdu, bilan déjà placé, Calendly…
const STATUTS_A_APPELER = ['Nouveau', 'À rappeler', 'Potentiel', 'R2', 'R3'];

// Le bureau décide, centre par centre, qui les thérapeutes ont le droit d'appeler
// (onglet « Gestion centre » du CRM). Sans cette case, le prospect reste invisible.
const CHAMP_DISPO = 'Dispo thérapeutes';
const CHAMP_DISPO_DEPUIS = 'Dispo thérapeutes depuis';

// Ce qu'une thérapeute a le droit de poser comme statut au terme d'un appel.
const STATUTS_AUTORISES = STATUTS_A_APPELER.concat(['Bilan placé', 'Injoignable']);

// Le centre a déménagé de Cabestany à Pollestres : un code Pollestres doit
// voir les deux libellés, sinon tout l'historique disparaît de sa liste.
const ALIAS_CENTRE = { 'Pollestres': ['Pollestres', 'Cabestany'] };

// Les seuls champs qui sortent d'Airtable. Ce qui n'est pas ici n'est jamais
// envoyé au navigateur : ni montant de cure, ni thérapeute, ni champs webinaire.
const CHAMPS_LUS = [
  'Prénom', 'Nom', 'Téléphone', 'Email',
  'Statut', 'Centre', 'Soins', 'Source', 'Commercial', 'Création',
  '1er Appel', '2ème Appel', '3ème Appel',
  'Répondu Appel 1', 'Répondu Appel 2', 'Répondu Appel 3',
  'R1 :Notes', 'R2 :Notes', 'R3 :Notes',
  'Prochain rappel', 'Commentaire interne',
  'Quand pouvons-nous vous appelez ? ', 'Objectif principal ?',
  'Combien de kilos souhaitez-vous perdre ?', 'Quel est votre principal problème aujourd\'hui?',
];

// Les seuls champs qu'une thérapeute peut écrire.
const CHAMPS_ECRITURE = {
  appel1: '1er Appel', appel2: '2ème Appel', appel3: '3ème Appel',
  repondu1: 'Répondu Appel 1', repondu2: 'Répondu Appel 2', repondu3: 'Répondu Appel 3',
  notes1: 'R1 :Notes', notes2: 'R2 :Notes', notes3: 'R3 :Notes',
  prochainRappel: 'Prochain rappel',
  statut: 'Statut',
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reponse(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function libellesCentre(centre) {
  return ALIAS_CENTRE[centre] || [centre];
}

function echappeFormule(v) {
  return String(v).replace(/"/g, '\\"');
}

/** Rend le centre associé au code, ou null. Le code n'est jamais renvoyé. */
function centreDuCode(code) {
  if (!code || typeof code !== 'string') return null;
  let table;
  try {
    table = JSON.parse(process.env.CODES_THERAPEUTES || '{}');
  } catch (e) {
    return null;
  }
  const centre = table[code.trim()];
  return typeof centre === 'string' && centre ? centre : null;
}

/** Normalise un enregistrement Airtable pour le navigateur. */
function versProspect(r) {
  const f = r.fields || {};
  const select = (v) => (Array.isArray(v) ? (v[0] || null) : (v || null));
  let centre = select(f['Centre']);
  if (centre === 'Cabestany') centre = 'Pollestres';
  return {
    id: r.id,
    prenom: f['Prénom'] || '',
    nom: f['Nom'] || '',
    telephone: f['Téléphone'] || '',
    email: f['Email'] || '',
    statut: select(f['Statut']),
    centre: centre,
    soin: select(f['Soins']),
    source: select(f['Source']),
    commercial: select(f['Commercial']),
    creation: f['Création'] || null,
    appel1: f['1er Appel'] || null,
    appel2: f['2ème Appel'] || null,
    appel3: f['3ème Appel'] || null,
    repondu1: !!f['Répondu Appel 1'],
    repondu2: !!f['Répondu Appel 2'],
    repondu3: !!f['Répondu Appel 3'],
    notes1: f['R1 :Notes'] || '',
    notes2: f['R2 :Notes'] || '',
    notes3: f['R3 :Notes'] || '',
    prochainRappel: f['Prochain rappel'] || null,
    commentaire: f['Commentaire interne'] || '',
    formulaire: {
      quand: f['Quand pouvons-nous vous appelez ? '] || '',
      objectif: f['Objectif principal ?'] || '',
      kilos: f['Combien de kilos souhaitez-vous perdre ?'] || '',
      probleme: f['Quel est votre principal problème aujourd\'hui?'] || '',
    },
  };
}

async function airtable(path, options) {
  const res = await fetch(API + '/' + BASE_ID + '/' + encodeURIComponent(TABLE) + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + process.env.AIRTABLE_PAT,
      ...((options && options.headers) || {}),
    },
  });
  const texte = await res.text();
  let data = null;
  try { data = JSON.parse(texte); } catch (e) { /* laissé à null */ }
  if (!res.ok) {
    const err = new Error((data && data.error && (data.error.message || data.error.type)) || 'Airtable ' + res.status);
    err.statusCode = res.status;
    throw err;
  }
  return data;
}

/** Tous les prospects à appeler du centre, paginés. */
async function listerProspects(centre) {
  const centres = libellesCentre(centre)
    .map((c) => '{Centre}="' + echappeFormule(c) + '"').join(',');
  const statuts = STATUTS_A_APPELER
    .map((s) => '{Statut}="' + echappeFormule(s) + '"').join(',');
  const formule = 'AND({' + CHAMP_DISPO + '}=1,OR(' + centres + '),OR(' + statuts + '))';

  const champs = CHAMPS_LUS
    .map((f) => 'fields%5B%5D=' + encodeURIComponent(f)).join('&');

  let tous = [];
  let offset;
  do {
    const params = 'pageSize=100&' + champs +
      '&filterByFormula=' + encodeURIComponent(formule) +
      (offset ? '&offset=' + encodeURIComponent(offset) : '');
    const data = await airtable('?' + params, { method: 'GET' });
    tous = tous.concat((data.records || []).map(versProspect));
    offset = data.offset;
    if (tous.length >= 5000) break;
  } while (offset);
  return tous;
}

/** Vérifie que l'enregistrement appartient bien au centre du code. */
async function chargerSiAutorise(recordId, centre) {
  if (!recordId || typeof recordId !== 'string' || !/^rec[A-Za-z0-9]{10,}$/.test(recordId)) {
    const err = new Error('Identifiant invalide');
    err.statusCode = 400;
    throw err;
  }
  const data = await airtable('/' + recordId, { method: 'GET' });
  const prospect = versProspect(data);
  if (libellesCentre(centre).indexOf(prospect.centre) < 0 && prospect.centre !== centre) {
    const err = new Error('Ce prospect n\'appartient pas à votre centre');
    err.statusCode = 403;
    throw err;
  }
  return prospect;
}

async function modifier(recordId, centre, modifs) {
  const avant = await chargerSiAutorise(recordId, centre);

  const fields = {};
  Object.keys(modifs || {}).forEach((cle) => {
    const champ = CHAMPS_ECRITURE[cle];
    if (!champ) return;                       // tout le reste est ignoré
    if (cle === 'statut') {
      if (STATUTS_AUTORISES.indexOf(modifs.statut) < 0) return;
    }
    fields[champ] = modifs[cle];
  });

  if (Object.keys(fields).length === 0) {
    const err = new Error('Aucune modification autorisée dans cette demande');
    err.statusCode = 400;
    throw err;
  }

  // Mêmes automatismes que le CRM du bureau quand un bilan est placé.
  if (fields['Statut'] === 'Bilan placé' && avant.statut !== 'Bilan placé') {
    fields['Date Bilan Placé'] = new Date().toISOString();
    fields['Prochain rappel'] = null;
  }

  // Le prospect quitte la pile d'appels : il sort aussi de la mise à disposition,
  // sinon il y resterait coché indéfiniment côté bureau.
  if (fields['Statut'] && STATUTS_A_APPELER.indexOf(fields['Statut']) < 0) {
    fields[CHAMP_DISPO] = false;
    fields[CHAMP_DISPO_DEPUIS] = null;
  }

  const data = await airtable('/' + recordId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  });
  return versProspect(data);
}

exports.handler = async (event) => {
  // Pas d'en-tête CORS : l'API n'est appelable que depuis les pages du site.
  if (event.httpMethod !== 'POST') {
    return reponse(405, { error: 'Méthode non autorisée' });
  }
  if (!process.env.AIRTABLE_PAT) {
    return reponse(500, { error: 'Configuration incomplète : AIRTABLE_PAT manquant' });
  }
  if (!process.env.CODES_THERAPEUTES) {
    return reponse(500, { error: 'Configuration incomplète : CODES_THERAPEUTES manquant' });
  }

  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch (e) {
    return reponse(400, { error: 'Requête illisible' });
  }

  const centre = centreDuCode(req.code);
  if (!centre) {
    return reponse(401, { error: 'Code inconnu' });
  }

  try {
    if (req.action === 'connexion') {
      return reponse(200, { centre });
    }
    if (req.action === 'liste') {
      return reponse(200, { centre, prospects: await listerProspects(centre) });
    }
    if (req.action === 'modifier') {
      return reponse(200, { prospect: await modifier(req.recordId, centre, req.modifs) });
    }
    return reponse(400, { error: 'Action inconnue' });
  } catch (e) {
    const code = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502;
    return reponse(code, { error: e.message || 'Erreur inattendue' });
  }
};
