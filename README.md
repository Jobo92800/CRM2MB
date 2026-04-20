# MaBeauty+ CRM

CRM visuel pour les centres MaBeauty+. Interface connectée à Airtable en temps réel.

## Fonctionnalités

- **Pipeline Kanban** : 10 colonnes (Nouveau → R2 → R3 → Converti/Perdu)
- **Fiche prospect** : édition inline avec sync Airtable
- **Agenda** : vue liste + vue journée style Google Agenda par commercial
- **Dashboard** : stats par commercial, centre, soin, thérapeute + filtre par période
- **Filtres** : par centre, commercial, soin + recherche texte
- **Automations** : cases Email Relance, Brevo, Rappel Calendly → déclenchent les automatisations Airtable

## Déploiement Netlify

### 1. Pousser sur GitHub
Upload les fichiers sur un repo GitHub (public ou privé).

### 2. Connecter Netlify
- https://app.netlify.com → Add new site → Import from GitHub
- Branch : `main`
- Build command : *(vide)*
- Publish directory : `.`

### 3. Ajouter la variable d'environnement (IMPORTANT)
Dans Netlify → **Site configuration** → **Environment variables** → **Add a variable** :
- Key : `AIRTABLE_PAT`
- Value : votre Personal Access Token Airtable (commence par `pat...`)

### 4. Redéployer
Après avoir ajouté la variable : **Deploys** → **Trigger deploy** → **Deploy site**

C'est tout ! Vos commerciales ouvrent l'URL et le CRM se charge directement, sans login.
