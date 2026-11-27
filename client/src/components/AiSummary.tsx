import { useState } from 'react';

export function AiSummary({ rows }: { rows: unknown[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const r = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await r.json();
      if (!r.ok) setError(data.error ?? 'Something went wrong.');
      else if (!data.summary) setError(data.message ?? 'No answer returned.');
      else setSummary(data.summary);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={ask} disabled={loading || rows.length === 0}>
        {loading ? 'Thinking…' : 'AI summary'}
      </button>
      {summary && <p>{summary}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}