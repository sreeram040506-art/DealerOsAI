import React, { useState } from 'react';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';

export default function PredictorPanel() {
  const { token, logout } = useAuth();
  const [scores, setScores] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [question, setQuestion] = useState('');
  const [assistantResp, setAssistantResp] = useState<any>(null);
  const [imgScore, setImgScore] = useState<any>(null);
  const [campaignResult, setCampaignResult] = useState<any>(null);

  async function fetchScores() {
    const res = await fetch(apiUrl('/predictor/scores'), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    setScores(data.results || []);
  }

  async function fetchModels() {
    const res = await fetch(apiUrl('/predictor/models'), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    setModels(data.versions || []);
  }

  async function runCampaign() {
    const res = await fetch(apiUrl('/predictor/campaign/run'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      setCampaignResult({ error: txt });
      return;
    }
    const data = await res.json();
    setCampaignResult(data);
  }

  async function ask() {
    const res = await fetch(apiUrl('/predictor/assistant'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    if (!res.ok) return;
    const data = await res.json();
    setAssistantResp(data);
  }

  async function scoreImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const res = await fetch(apiUrl('/predictor/condition'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      });
      if (!res.ok) return;
      const data = await res.json();
      setImgScore(data);
    };
    reader.readAsDataURL(f);
  }

  return (
    <div className="space-y-4 p-4 bg-card border border-border rounded-xl">
      <h3 className="font-bold">Predictor</h3>

      <div>
        <div className="flex gap-2 items-center">
          <button className="btn" onClick={fetchScores}>Fetch Regional Demand Scores</button>
          <button className="btn" onClick={fetchModels}>List Models</button>
          <button className="btn" onClick={runCampaign}>Run Swap Campaign</button>
        </div>
        <div className="mt-2">
          {scores.map(s => (
            <div key={`${s.make}-${s.model}`} className="py-1">
              <strong>{s.make} {s.model}</strong>: score {s.score} — sales {s.salesCount} / inventory {s.inventoryCount}
            </div>
          ))}
        </div>
        {models.length > 0 && (
          <div className="mt-3">
            <label className="block text-xs font-semibold mb-1">Saved Models</label>
            <ul className="text-xs space-y-1">
              {models.map(m => (
                <li key={m.version} className="px-2 py-1 bg-muted/30 rounded">{m.version} — {m.createdAt} — {Math.round(m.size/1024)} KB</li>
              ))}
            </ul>
          </div>
        )}
        {campaignResult && (
          <div className="mt-2 text-xs">
            <label className="block text-xs font-semibold mb-1">Campaign Result</label>
            <pre className="whitespace-pre-wrap">{JSON.stringify(campaignResult, null, 2)}</pre>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Assistant</label>
        <div className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)} className="flex-1" placeholder="Ask: which sedans are good swap candidates?" />
          <button className="btn" onClick={ask}>Ask</button>
        </div>
        {assistantResp && <pre className="mt-2 text-xs">{JSON.stringify(assistantResp, null, 2)}</pre>}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Image Condition Score</label>
        <input type="file" accept="image/*" onChange={scoreImage} />
        {imgScore && <pre className="mt-2 text-xs">{JSON.stringify(imgScore, null, 2)}</pre>}
      </div>
    </div>
  );
}
