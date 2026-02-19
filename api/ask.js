import fs from "fs";
import path from "path";

/* =========================
   Carrega me.json
========================= */
function loadMe() {
  const p = path.join(process.cwd(), "me.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

/* =========================
   Filtro de escopo
========================= */
function looksAboutMe(q) {
  const s = (q || "").toLowerCase();

  const allow = [
    "joão", "milhomens", "você", "seu", "sua", "sobre você",
    "experiência", "formação", "faculdade", "skills", "habilidades",
    "projeto", "projetos", "contato", "email", "telefone", "linkedin",
    "python", "sql", "react", "node", "vba", "power bi", "monday", "ia",
    "trajetória", "carreira", "objetivo", "meta",
    "pontos fortes", "fraqueza", "desafio", "resultado", "impacto"
  ];

  const block = [
    "notícia", "bitcoin", "política", "clima", "tempo", "jogo",
    "filme", "série", "receita", "celebridade"
  ];

  if (block.some(w => s.includes(w))) return false;
  return allow.some(w => s.includes(w));
}

function refuse() {
  return {
    answer:
      "Eu só respondo perguntas sobre minha trajetória, experiências, projetos, habilidades e formação."
  };
}

/* =========================
   Descobre modelo disponível
========================= */
async function pickModelName(key) {
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
      encodeURIComponent(key)
  );

  const data = await r.json();
  if (!r.ok) throw new Error("ListModels falhou: " + JSON.stringify(data));

  const models = data?.models || [];

  const supported = models.filter(m =>
    (m.supportedGenerationMethods || []).includes("generateContent")
  );

  const preferred = [
    "models/gemini-2.0-flash",
    "models/gemini-1.5-flash-002",
    "models/gemini-1.5-flash-001",
    "models/gemini-1.5-pro-002",
    "models/gemini-1.5-pro-001",
    "models/gemini-pro"
  ];

  const map = new Map(supported.map(m => [m.name, m]));

  for (const name of preferred) {
    if (map.has(name)) return name;
  }

  if (supported[0]?.name) return supported[0].name;

  throw new Error("Nenhum modelo Gemini disponível para generateContent.");
}

/* =========================
   Handler principal
========================= */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ answer: "Use POST." });
    }

    const { question } = req.body || {};
    const q = (question || "").trim();

    if (!q) {
      return res.status(400).json({ answer: "Faça uma pergunta sobre mim." });
    }

    if (!looksAboutMe(q)) {
      return res.status(200).json(refuse());
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res
        .status(500)
        .json({ answer: "Faltou configurar GEMINI_API_KEY no Vercel." });
    }

    const me = loadMe();

    const system = `
Você é João Pedro Milhomens respondendo em uma entrevista.
Responda em PRIMEIRA PESSOA (Eu...).
Use SOMENTE as informações do JSON fornecido.
Não invente dados.
Se não houver informação suficiente, diga: "Não tenho essa informação registrada."
Seja profissional, direto e claro.
`;

    const prompt = `
${system}

JSON:
${JSON.stringify(me, null, 2)}

Pergunta:
${q}
`;

    const modelName = await pickModelName(key);

    const url =
      "https://generativelanguage.googleapis.com/v1beta/" +
      modelName +
      ":generateContent?key=" +
      encodeURIComponent(key);

    const payload = {
      contents: [{ parts: [{ text: prompt.slice(0, 6000) }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 450
      }
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(500).json({
        answer: "Erro Gemini: " + JSON.stringify(data)
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        .join("")
        ?.trim() || "Sem resposta.";

    return res.status(200).json({ answer: text });

  } catch (e) {
    return res.status(500).json({
      answer: "Erro interno: " + (e?.message || e)
    });
  }
}
