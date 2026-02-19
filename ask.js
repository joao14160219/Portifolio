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
    "trajetória", "carreira", "objetivo", "meta", "pontos fortes", "fraquezas",
    "por que", "me conte", "fale sobre", "desafio", "resultado", "impacto"
  ];

  // bloqueios óbvios de temas externos
  const block = [
    "notícia", "bitcoin", "política", "clima", "tempo", "jogo", "filme", "série",
    "receita", "remédio", "celebridade", "fofoca"
  ];

  if (block.some(w => s.includes(w))) return false;
  return allow.some(w => s.includes(w));
}

function refuse() {
  return {
    answer:
      "Eu só respondo perguntas sobre o João Pedro (trajetória, experiências, projetos, habilidades, formação e contato). " +
      "Se sua pergunta não for sobre isso, eu não respondo."
  };
}

// extrai texto do Responses API
function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  try {
    const out = data?.output || [];
    for (const item of out) {
      const content = item?.content || [];
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim()) return c.text.trim();
        if (typeof c?.text === "string" && c.text.trim()) return c.text.trim();
      }
    }
  } catch {}
  return "Sem resposta.";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ answer: "Use POST." });

    const { question } = req.body || {};
    const q = (question || "").trim();
    if (!q) return res.status(400).json({ answer: "Manda uma pergunta sobre o João Pedro." });

    if (!looksAboutMe(q)) return res.status(200).json(refuse());

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ answer: "Faltou configurar OPENAI_API_KEY no Vercel." });

    const me = loadMe();

    const system = [
      "Você é o João Pedro Milhomens em uma entrevista.",
      "Você responde em PRIMEIRA PESSOA (Eu...).",
      "Você deve responder SOMENTE com base no JSON fornecido, sem inventar nada.",
      "Se a pergunta pedir algo fora do JSON, responda: 'Não tenho essa informação registrada' e redirecione para temas que você pode responder (trajetória, experiências, projetos, habilidades, formação, contato).",
      "Se a pergunta não for sobre você, recuse educadamente e mantenha o escopo.",
      "Estilo: profissional, direto, sem emojis.",
      "Estrutura sugerida (quando fizer sentido):",
      "1) resposta curta (1-2 frases) 2) evidência/impacto (bullet ou frase) 3) fechamento (próximo passo/gancho).",
      "Não mencione 'JSON', 'prompt', 'regras' ou 'OpenAI'."
    ].join(" ");

    const user = [
      "Base de dados do João Pedro:",
      JSON.stringify(me, null, 2),
      "",
      "Pergunta do entrevistador:",
      q
    ].join("\n");

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.25,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({ answer: `Erro na IA: ${JSON.stringify(data)}` });
    }

    const text = extractOutputText(data);
    return res.status(200).json({ answer: text });
  } catch (e) {
    return res.status(500).json({ answer: `Erro interno: ${e?.message || e}` });
  }
}
 