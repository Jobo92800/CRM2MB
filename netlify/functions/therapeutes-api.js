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
//   Réinscrit     le livret demande de refaire la procédure comme pour un nouveau
//   Bilan annulé  la thérapeute rappelle pour comprendre pourquoi, et reprogrammer
// « À rappeler » a été retiré le 5 nov. 2026 : il ne sert plus au process, il est
// déjà masqué du pipeline du bureau, et aucune fiche ne le portait.
// « Potentiel » a été retiré le 6 nov. 2026 : les centres n'y mettaient plus
// personne, et la pile s'en remplissait sans que rien n'en sorte. Le bouton de
// l'espace thérapeutes est devenu « Perdu », qui sort la fiche de la pile.
// La même liste existe côté CRM sous le nom GESTION_STATUTS : les deux doivent
// rester jumelles, sinon le bureau ouvre des fiches que les centres ne voient pas.
const STATUTS_A_APPELER = ['Nouveau', 'Réinscrit', 'R2', 'R3', 'Bilan annulé'];

// Le bureau décide, centre par centre, qui les thérapeutes ont le droit d'appeler
// (onglet « Gestion centre » du CRM). Sans cette case, le prospect reste invisible.
const CHAMP_DISPO = 'Dispo thérapeutes';
const CHAMP_DISPO_DEPUIS = 'Dispo thérapeutes depuis';

// Trace de l'origine : le bureau doit pouvoir distinguer, dans l'historique
// d'une fiche, un appel passé depuis un centre d'un appel passé par lui-même.
// C'est le serveur qui la pose, jamais le navigateur de la thérapeute.
const CHAMP_DEPUIS_CENTRE = {
  1: 'Appel 1 depuis centre',
  2: 'Appel 2 depuis centre',
  3: 'Appel 3 depuis centre',
};

// Qui a passé l'appel. Le prénom est saisi une fois à la connexion et renvoyé
// à chaque enregistrement : c'est une signature pour le bureau, pas une
// identification — le code est partagé par tout un centre.
const CHAMP_THERAPEUTE = {
  1: 'Appel 1 thérapeute',
  2: 'Appel 2 thérapeute',
  3: 'Appel 3 thérapeute',
};

function nettoyerPrenom(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
}

// Champs du bilan posé au centre. La thérapeute donne la date du rendez-vous,
// le serveur en déduit le statut et les dates qui vont avec.
const CHAMP_BILAN_LE = 'Bilan placé le : ';   // l'espace final fait partie du nom
const CHAMP_DATE_BILAN_PLACE = 'Date Bilan Placé';

// Date du dernier changement de statut. C'est un champ calculé par Airtable
// (« last modified time » restreint au seul champ Statut) : il se met à jour
// tout seul, d'où que vienne le changement — bureau, centre, automatisation ou
// saisie directe dans la table. Personne ne l'écrit, et personne ne le peut.
const CHAMP_STATUT_CHANGE_LE = 'Statut changé le';

// Coché par la thérapeute quand elle laisse un SMS ou un message vocal après un
// premier appel sans réponse. À ne pas confondre avec le champ « SMS », que le
// CRM range dans les automatisations.
// Le message laissé à chaque étape du process. Un champ par étape : le bureau
// doit pouvoir dire lequel est parti, pas seulement qu'il y en a eu un.
const CHAMP_MESSAGE = {
  contact: 'Note vocale envoyée',
  r2: 'SMS R2 envoyé',
  r3: 'SMS R3 envoyé',
};

// Le premier contact se fait en deux appels à 5 minutes d'écart.
const CHAMP_APPEL1_BIS = '1er Appel 2e essai';

// Ce qui conditionne un bilan, vérifié à l'ouverture de l'appel.
const CHAMP_PROXIMITE = 'Habite à proximité';
const CHAMP_VENUE_HEBDO = 'Peut venir chaque semaine';
const CHAMP_ANTECEDENTS = 'Antécédents médicaux';

// Les seules suites qu'une thérapeute peut donner à un appel. Elle envoie une
// clé de cette table, jamais un statut : c'est ici, et nulle part ailleurs,
// qu'on décide ce que la clé vaut dans Airtable.
//   r2 / r3 / injoignable  l'échelle des relances, quand elle n'a pas répondu
//   perdu                  elle ne veut pas avancer : la fiche quitte la pile
//   bilan                  elle vient au centre, à la date donnée
// `date` marque la seule suite qui réclame une date. Les clés « rappel » et
// « calendlyPris » ont été supprimées le 5 nov. 2026 avec le statut « À rappeler »,
// et « potentiel » a laissé la place à « perdu » le 6 nov. 2026.
const SUITES = {
  r2: { statut: 'R2' },
  r3: { statut: 'R3' },
  injoignable: { statut: 'Injoignable' },
  perdu: { statut: 'Perdu' },
  bilan: { statut: 'Bilan placé', date: true },
};

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
  'Prochain rappel', 'Commentaire interne', 'Bilan placé le : ', 'Statut changé le',
  'Note vocale envoyée', 'SMS R2 envoyé', 'SMS R3 envoyé', '1er Appel 2e essai',
  'Habite à proximité', 'Peut venir chaque semaine', 'Antécédents médicaux',
  'Appel 1 thérapeute', 'Appel 2 thérapeute', 'Appel 3 thérapeute',
  'Quand pouvons-nous vous appelez ? ', 'Objectif principal ?',
  'Combien de kilos souhaitez-vous perdre ?', 'Quel est votre principal problème aujourd\'hui?',
];

// Les seuls champs qu'une thérapeute peut écrire.
const CHAMPS_ECRITURE = {
  appel1: '1er Appel', appel2: '2ème Appel', appel3: '3ème Appel',
  repondu1: 'Répondu Appel 1', repondu2: 'Répondu Appel 2', repondu3: 'Répondu Appel 3',
  notes1: 'R1 :Notes', notes2: 'R2 :Notes', notes3: 'R3 :Notes',
  prochainRappel: 'Prochain rappel',
  appel1Bis: CHAMP_APPEL1_BIS,
  messageContact: CHAMP_MESSAGE.contact,
  messageR2: CHAMP_MESSAGE.r2,
  messageR3: CHAMP_MESSAGE.r3,
  habiteProximite: CHAMP_PROXIMITE,
  venueHebdo: CHAMP_VENUE_HEBDO,
  antecedents: CHAMP_ANTECEDENTS,
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
    therapeute1: f['Appel 1 thérapeute'] || '',
    therapeute2: f['Appel 2 thérapeute'] || '',
    therapeute3: f['Appel 3 thérapeute'] || '',
    prochainRappel: f['Prochain rappel'] || null,
    bilanLe: f[CHAMP_BILAN_LE] || null,
    statutDepuis: f[CHAMP_STATUT_CHANGE_LE] || null,
    appel1Bis: f[CHAMP_APPEL1_BIS] || null,
    messageContact: !!f[CHAMP_MESSAGE.contact],
    messageR2: !!f[CHAMP_MESSAGE.r2],
    messageR3: !!f[CHAMP_MESSAGE.r3],
    habiteProximite: !!f[CHAMP_PROXIMITE],
    venueHebdo: !!f[CHAMP_VENUE_HEBDO],
    antecedents: f[CHAMP_ANTECEDENTS] || '',
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

async function modifier(recordId, centre, modifs, therapeute) {
  const avant = await chargerSiAutorise(recordId, centre);

  const fields = {};
  Object.keys(modifs || {}).forEach((cle) => {
    const champ = CHAMPS_ECRITURE[cle];
    if (!champ) return;                       // tout le reste est ignoré
    fields[champ] = modifs[cle];
  });

  // La suite donnée à l'appel est la seule chose qui change le statut d'un
  // prospect depuis un centre. La thérapeute donne une clé et une date : le
  // statut et les dates de suivi sont décidés ici.
  const suite = modifs && modifs.suite;
  const suiteDate = modifs && modifs.suiteDate;
  if (suite) {
    const regle = SUITES[suite];
    if (!regle) {
      const err = new Error('Suite d\'appel inconnue');
      err.statusCode = 400;
      throw err;
    }
    fields['Statut'] = regle.statut;

    if (regle.date) {
      const quand = new Date(suiteDate);
      if (isNaN(quand.getTime())) {
        const err = new Error('Date illisible');
        err.statusCode = 400;
        throw err;
      }
      fields[CHAMP_BILAN_LE] = quand.toISOString();
      fields[CHAMP_DATE_BILAN_PLACE] = new Date().toISOString();
      fields['Prochain rappel'] = null;       // le rendez-vous au centre remplace le rappel
    }
  }

  if (Object.keys(fields).length === 0) {
    const err = new Error('Aucune modification autorisée dans cette demande');
    err.statusCode = 400;
    throw err;
  }

  // Un appel enregistré ici vient forcément d'un centre : on le marque, et on
  // signe du prénom donné à la connexion.
  [1, 2, 3].forEach(function (n) {
    if (!modifs || !modifs['appel' + n]) return;
    fields[CHAMP_DEPUIS_CENTRE[n]] = true;
    fields[CHAMP_THERAPEUTE[n]] = nettoyerPrenom(therapeute);
  });

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
      return reponse(200, { prospect: await modifier(req.recordId, centre, req.modifs, req.therapeute) });
    }
    return reponse(400, { error: 'Action inconnue' });
  } catch (e) {
    const code = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502;
    return reponse(code, { error: e.message || 'Erreur inattendue' });
  }
};
