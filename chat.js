async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY belum diatur');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini gagal (${res.status})`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY belum diatur');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Groq gagal (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY belum diatur');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter gagal (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Prompt wajib diisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const providers = [
      { name: 'Gemini', fn: callGemini },
      { name: 'Groq', fn: callGroq },
      { name: 'OpenRouter', fn: callOpenRouter },
    ];

    for (const provider of providers) {
      try {
        const reply = await provider.fn(prompt);
        if (reply) {
          return new Response(JSON.stringify({ provider: provider.name, reply }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.warn(`${provider.name} error, pindah ke fallback:`, err);
      }
    }

    return new Response(
      JSON.stringify({ error: 'Semua provider AI (Gemini, Groq, OpenRouter) gagal merespons.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Permintaan tidak valid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
