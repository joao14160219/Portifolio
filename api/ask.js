import fs from "fs";
import path from "path";

function loadMe() {
  const p = path.join(process.cwd(), "me.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function looksAboutMe(q) {
  const s = (q || "").toLowerCase();

  const allow = [
    "joão", "milhomens", "você", "seu", "sua", "sobre você",
    "experiência", "formação", "faculdade", "skills", "habilidades",
    "projeto", "projetos", "contato", "email", "telefone", "linkedin",
    "python", "sql", "react", "node", "vba", "power bi", "monday", "ia",
    "trajetória", "carreira", "objetivo", "meta", "pontos fortes", "fraqueza",
    "por que", "me conte", "fale sobre", "desafio", "resultado", "impacto"
  ];

  const block = [
    "notícia", "bitcoin", "política", "clima", "tempo", "jogo", "filme", "série",
    "receita", "remédio", "celebridade"
  ];

  if (block.some(w => s.includes(w))) return false;
  return allow.some(w => s.includes(w));
}

function refuse() {
  return {
    answer:
      "Eu só respondo perguntas sobre o João Pedro (trajetória, experiências, projetos, habilidades, formação e contato)."
  };
}

function safeText(s) {
  return (s || "").toString().slice(0, 6000);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ answer: "Use POST." });

    const { question } = req.body || {};
    const q = (question || "").trim();
    if (!q) return res.status(400).json({ answer: "Manda uma pergunta sobre o João Pedro." });

    if (!looksAboutMe(q)) return res.status(200).json(refuse());

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ answer: "Faltou configurar GEMINI_API_KEY no Vercel." });

    const me = loadMe();

    const system = [
      "Você é o João Pedro Milhomens respondendo em uma entrevista.",
      "Responda em PRIMEIRA PESSOA (Eu...).",
      "Use SOMENTE as informações do JSON fornecido, sem inventar.",
      "Se a pergunta pedir algo fora do JSON: diga 'Não tenho essa informação registrada' e redirecione para temas que você pode responder.",
      "Estilo: profissional, direto, sem emojis.",
      "Quando fizer sentido, use: resposta curta + evidência/impacto + fechamento."
    ].join(" ");

    const prompt = [
      system,
      "",
      "JSON do João Pedro:",
      JSON.stringify(me, null, 2),
      "",
      "Pergunta do entrevistador:",
      q
    ].join("\n");

    const payload = {
      contents: [{ parts: [{ text: safeText(prompt) }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 450 }
    };

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=" +
      encodeURIComponent(key);

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) return res.status(500).json({ answer: `Erro Gemini: ${JSON.stringify(data)}` });

    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("")?.trim() ||
      "Sem resposta.";

    return res.status(200).json({ answer: text });
  } catch (e) {
    return res.status(500).json({ answer: `Erro interno: ${e?.message || e}` });
  }
}


