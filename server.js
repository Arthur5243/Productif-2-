import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { listActivities, insertActivities, deleteActivity } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- Activités (mono-utilisateur, pas de connexion) ---
app.get('/api/activities', (req, res) => {
  res.json({ activities: listActivities() });
});

app.post('/api/activities', (req, res) => {
  const { activities } = req.body || {};
  if (!Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'activities (tableau) requis' });
  }
  const inserted = insertActivities(activities);
  res.json({ activities: inserted });
});

app.delete('/api/activities/:id', (req, res) => {
  const ok = deleteActivity(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Introuvable' });
  res.json({ ok: true });
});

// --- Résumé IA ---
function systemPrompt(today) {
  return `Tu es un assistant qui transforme des notes vocales ou textes bruts, parfois décousus avec hésitations et mots de remplissage, en activités de calendrier claires.

Règles :
- Identifie une ou plusieurs activités distinctes dans le texte.
- Pour chaque activité, écris un vrai titre : une phrase qui condense TOUT le contenu utile (quoi, avec qui, détails importants), lisible et comprise en une seconde.
  - Si le texte source est court, le titre reste court.
  - Si le texte source est un pavé long ou dense (plusieurs détails, sous-tâches, précisions), le titre peut être une phrase assez longue — ne coupe jamais une information importante juste pour faire court. Mieux vaut une phrase longue mais complète qu'un titre court qui perd du sens.
  - Regroupe les éléments similaires entre parenthèses si ça aide à la lisibilité (ex: "Muscu (traction/pompes/boxe)").
  - Supprime complètement les hésitations et mots de remplissage ("euh", "du coup", "je crois", "enfin", "voilà", "ouais") et reformule en français correct et naturel.
- Détermine la date (YYYY-MM-DD) et l'heure (HH:MM) si mentionnées. Si aucune date n'est donnée, utilise aujourd'hui. Si aucune heure n'est donnée, mets null.
- Aujourd'hui nous sommes le ${today} (YYYY-MM-DD).

Réponds UNIQUEMENT avec un JSON valide de cette forme exacte, sans texte autour, sans backticks :
{"activities": [{"title": "...", "date": "YYYY-MM-DD", "time": "HH:MM ou null"}]}`;
}

app.post('/api/summarize', async (req, res) => {
  const { text, today } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text requis' });
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY absente des variables Railway' });
  }
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt(today) },
          { role: 'user', content: text },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Erreur API Groq' });
    }
    const raw = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const activities = Array.isArray(parsed.activities) ? parsed.activities : [parsed];
    res.json({ activities });
  } catch (e) {
    res.status(500).json({ error: "Erreur lors du résumé" });
  }
});

// --- Sert le frontend buildé (dist/, généré par `vite build`) ---
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Productif API écoute sur le port ${PORT}`));
