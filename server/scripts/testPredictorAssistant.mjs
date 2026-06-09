import fetch from 'node-fetch';

async function main(){
  const url = 'http://127.0.0.1:3001/api/dev/predictor/assistant?dealershipId=6a18401f1a6eecef0d9595f4';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Which of my sedans are good swap candidates?' })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
