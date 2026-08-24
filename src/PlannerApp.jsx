import React, { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, Trash2, Loader2, X } from 'lucide-react';
import * as chrono from 'chrono-node';

const API_URL = import.meta.env.VITE_API_URL || '';

const COLORS = {
  bg: '#0B0D11',
  surface: '#14171D',
  surfaceAlt: '#1B1F27',
  border: '#262B34',
  textPrimary: '#F3F4F6',
  textSecondary: '#868C97',
  textFaint: '#4B5058',
  accent: '#FF9D42',
  accentSoft: 'rgba(255, 157, 66, 0.25)',
  dawn: '#4FA8FF',
  day: '#FF9D42',
  dusk: '#C77DFF',
};

function timeColor(time) {
  if (!time) return COLORS.textFaint;
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return COLORS.dawn;
  if (hour < 18) return COLORS.day;
  return COLORS.dusk;
}

function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

function splitSegments(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/\s*(?:,|;|\bet\b|\bpuis\b)\s*/i))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseActivity(text, refDate) {
  const results = chrono.fr.parse(text, refDate, { forwardDate: true });
  let date = formatDateKey(refDate);
  let time = null;
  let title = text.trim();

  if (results.length > 0) {
    const result = results[0];
    const parsedDate = result.start.date();
    date = formatDateKey(parsedDate);
    if (result.start.isCertain('hour')) {
      const hh = String(parsedDate.getHours()).padStart(2, '0');
      const mm = String(parsedDate.getMinutes()).padStart(2, '0');
      time = `${hh}:${mm}`;
    }
    title = (text.slice(0, result.index) + text.slice(result.index + result.text.length)).trim();
    title = title.replace(/^[-,\s]+|[-,\s]+$/g, '');
    title = title.replace(/\b(le|la|les|du|de|au|aux|à|ce|cet|cette)\s*$/i, '').trim();
    title = title.replace(/^[-,\s]+|[-,\s]+$/g, '');
  }

  return { title: title || text.trim(), date, time };
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');";
const displayFont = { fontFamily: "'Space Grotesk', sans-serif" };

export default function PlannerApp() {
  const [view, setView] = useState('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Charge les activités au démarrage (pas de connexion nécessaire)
  useEffect(() => {
    fetch(`${API_URL}/api/activities`)
      .then((r) => r.json())
      .then((data) => setActivities(data.activities || []))
      .catch(() => setError('Impossible de charger les activités.'))
      .finally(() => setLoading(false));
  }, []);

  const addActivity = async () => {
    if (!inputText.trim()) return;
    setError('');
    setIsProcessing(true);
    const today = formatDateKey(new Date());
    let candidates;

    try {
      const response = await fetch(`${API_URL}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, today }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.activities)) {
        throw new Error(data.error || 'Réponse invalide');
      }
      candidates = data.activities.map((a) => ({
        title: a.title || inputText,
        date: a.date || today,
        time: a.time || null,
      }));
    } catch (e) {
      // Secours local si l'IA est indisponible (pas de clé, quota, réseau...)
      const segments = splitSegments(inputText);
      const now = new Date();
      candidates = segments.map((seg) => parseActivity(seg, now));
      setError('Résumé IA indisponible, découpe simple utilisée à la place.');
    }

    try {
      const saveRes = await fetch(`${API_URL}/api/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: candidates }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Sauvegarde échouée');
      setActivities((prev) => [...prev, ...saveData.activities]);
    } catch (e) {
      setError("Impossible de sauvegarder sur ton compte, réessaie.");
    } finally {
      setInputText('');
      setShowAdd(false);
      setIsProcessing(false);
    }
  };

  const deleteActivity = async (id) => {
    const previous = activities;
    setActivities((prev) => prev.filter((a) => a.id !== id));
    try {
      const r = await fetch(`${API_URL}/api/activities/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
    } catch (e) {
      setActivities(previous);
      setError('Suppression impossible, réessaie.');
    }
  };

  const goPrev = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - (view === 'day' ? 1 : 7));
    setCurrentDate(d);
  };
  const goNext = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (view === 'day' ? 1 : 7));
    setCurrentDate(d);
  };

  const weekdayLabel = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const monthLabel = (d) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const ActivityRow = ({ a, compact }) => (
    <div
      className={`flex items-center justify-between gap-3 ${compact ? 'py-1.5' : 'py-3'}`}
      style={{
        borderLeft: `3px solid ${timeColor(a.time)}`,
        borderBottom: compact ? 'none' : `1px solid ${COLORS.border}`,
        paddingLeft: 12,
      }}
    >
      <div className="min-w-0">
        <div
          className="tracking-wide"
          style={{ ...displayFont, color: timeColor(a.time), fontSize: compact ? 10 : 12 }}
        >
          {a.time || '—'}
        </div>
        <div
          className={`truncate ${compact ? 'text-xs' : 'text-sm'}`}
          style={{ color: COLORS.textPrimary }}
        >
          {a.title}
        </div>
      </div>
      <button
        onClick={() => deleteActivity(a.id)}
        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
      >
        <Trash2 size={compact ? 13 : 15} style={{ color: COLORS.textSecondary }} />
      </button>
    </div>
  );

  const renderDay = () => {
    const key = formatDateKey(currentDate);
    const dayActivities = activities
      .filter((a) => a.date === key)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    if (dayActivities.length === 0) {
      return (
        <p className="text-sm py-8 text-center" style={{ color: COLORS.textFaint }}>
          Rien de prévu.
        </p>
      );
    }
    return (
      <div>
        {dayActivities.map((a) => (
          <ActivityRow key={a.id} a={a} />
        ))}
      </div>
    );
  };

  const renderWeek = () => {
    const start = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    const todayKey = formatDateKey(new Date());
    return (
      <div className="space-y-1">
        {days.map((d) => {
          const key = formatDateKey(d);
          const dayActivities = activities
            .filter((a) => a.date === key)
            .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className="rounded-xl px-3 py-2.5"
              style={{ background: isToday ? COLORS.surfaceAlt : 'transparent' }}
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ ...displayFont, color: isToday ? COLORS.accent : COLORS.textSecondary }}
                >
                  {d.toLocaleDateString('fr-FR', { weekday: 'short' })}
                </span>
                <span className="text-xs" style={{ color: COLORS.textFaint }}>
                  {d.getDate()}
                </span>
              </div>
              {dayActivities.length === 0 ? (
                <p className="text-xs pl-1" style={{ color: COLORS.textFaint }}>
                  —
                </p>
              ) : (
                dayActivities.map((a) => <ActivityRow key={a.id} a={a} compact />)
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const weekStart = startOfWeek(currentDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekRangeLabel = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('fr-FR', { month: 'long' })}`
    : `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: COLORS.bg }}>
        <Loader2 size={24} className="animate-spin" style={{ color: COLORS.textSecondary }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: COLORS.bg }}>
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-md px-5 pt-6 pb-24" style={{ color: COLORS.textPrimary }}>
        <div
          className="flex p-1 rounded-full mb-6"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          {['day', 'week'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="flex-1 py-2 rounded-full text-xs uppercase tracking-widest transition-all duration-200"
              style={{
                ...displayFont,
                background: view === v ? COLORS.accent : 'transparent',
                color: view === v ? '#101114' : COLORS.textSecondary,
              }}
            >
              {v === 'day' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-6">
          <button onClick={goPrev} className="p-2 -ml-2" style={{ color: COLORS.textSecondary }}>
            <ChevronLeft size={20} />
          </button>

          {view === 'day' ? (
            <button onClick={() => setCurrentDate(new Date())} className="text-center">
              <div className="flex items-end justify-center gap-2">
                <span className="text-5xl font-semibold leading-none" style={displayFont}>
                  {currentDate.getDate()}
                </span>
                <span
                  className="text-xs uppercase tracking-widest pb-1 capitalize"
                  style={{ color: COLORS.textSecondary }}
                >
                  {weekdayLabel(currentDate)}
                </span>
              </div>
              <div className="text-xs mt-1 capitalize" style={{ color: COLORS.textFaint }}>
                {monthLabel(currentDate)}
              </div>
            </button>
          ) : (
            <button onClick={() => setCurrentDate(new Date())} className="text-center">
              <div className="text-lg font-semibold capitalize" style={displayFont}>
                {weekRangeLabel}
              </div>
            </button>
          )}

          <button onClick={goNext} className="p-2 -mr-2" style={{ color: COLORS.textSecondary }}>
            <ChevronRight size={20} />
          </button>
        </div>

        {view === 'day' ? renderDay() : renderWeek()}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 rounded-full p-4 shadow-lg transition-transform active:scale-95"
        style={{ background: COLORS.accent, color: '#101114', boxShadow: `0 8px 24px ${COLORS.accentSoft}` }}
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      {showAdd && (
        <div
          className="fixed inset-0 flex items-end justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="w-full max-w-md p-5 rounded-t-3xl"
            style={{ background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm uppercase tracking-widest" style={displayFont}>
                Nouvelle activité
              </h3>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setInputText('');
                  setError('');
                }}
                style={{ color: COLORS.textSecondary }}
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ex : RDV dentiste demain à 15h"
              className="w-full rounded-xl p-3 mb-3 text-sm outline-none"
              style={{
                background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.border}`,
                color: COLORS.textPrimary,
              }}
              rows={3}
              autoFocus
            />
            {error && (
              <p className="text-xs mb-3" style={{ color: '#FF6B6B' }}>
                {error}
              </p>
            )}
            <button
              onClick={addActivity}
              disabled={isProcessing || !inputText.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: COLORS.accent, color: '#101114' }}
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
