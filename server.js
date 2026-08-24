import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { listActivities, insertActivities, deleteActivity } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'productif-app-default-secret-2026';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  try {
    req.user = jwt.verify(token, SESSION_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session invalide' });
  }
}

// --- Connexion simple par email (pas de mot de passe, pas de vérification externe) ---
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body || {};
  const clean = (email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  const user = { sub: clean, email: clean, name: clean.split('@')[0] };
  const token = jwt.sign(user, SESSION_SECRET, { expiresIn: '365d' });
  res.json({ token, user });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- Activités (protégées, par utilisateur) ---
app.get('/api/activities', requireAuth, (req, res) => {
  res.json({ activities: listActivities(req.user.sub) });
});

app.post('/api/activities', requireAuth, (req, res) => {
  const { activities } = req.body || {};
  if (!Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'activities (tableau) requis' });
  }
  const inserted = insertActivities(req.user.sub, activities);
  res.json({ activities: inserted });
});

app.delete('/api/activities/:id', requireAuth, (req, res) => {
  const ok = deleteActivity(req.user.sub, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Introuvable' });
  res.json({ ok: true });
});

// --- Résumé IA (public, pas besoin de compte) ---
function systemPrompt(today) {
  return `Tu es un assistant qui transforme des notes vocales ou textes bruts, parfois décousus avec hésitations et mots de remplissage, en activités de calendrier claires.

Règles :
- Identifie une ou plusieurs activités distinctes dans le texte.
- Pour chaque activité, écris un titre court, clair et bien formulé (regroupe les éléments similaires entre parenthèses si utile, ex: "Muscu (traction/pompes/boxe)"), en supprimant complètement les hésitations et mots de remplissage ("euh", "du coup", "je crois", "enfin", "voilà", "ouais").
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Productif API écoute sur le port ${PORT}`));
