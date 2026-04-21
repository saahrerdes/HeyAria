import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import multer from "multer";
import fs from "fs";
import Stripe from "stripe";
import audioEvalRouter from "./routes/audio-eval.js";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use("/api", audioEvalRouter);
app.use(express.static("public"));
app.use('/uploads', express.static('uploads'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_KEY, { apiVersion: "2022-11-15" });

/* =========================
MEMÓRIA
========================= */
const conversations = {};
const users = {};

function createUser(userId) {
  if (!users[userId]) {
    users[userId] = {
      plan: "free",
      messagesToday: 0,
      lastReset: new Date().toDateString()
    };
  }
}

function resetDaily(user) {
  const today = new Date().toDateString();
  if (user.lastReset !== today) {
    user.messagesToday = 0;
    user.lastReset = today;
  }
}

/* =========================
DETECÇÃO REAL DE IDIOMA (IA)
========================= */
async function detectLanguageAI(text) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Detecte o idioma do texto e responda APENAS com o nome do idioma (ex: Português, Inglês, Espanhol, Japonês, etc)."
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0
    });

    return res.choices[0].message.content.trim();
  } catch {
    return "Auto";
  }
}

/* =========================
SYSTEM PROMPT POLIGLOTA
========================= */
const SYSTEM_PROMPT = `
Você é Ária, uma inteligência artificial avançada e professora poliglota.

Você fala mais de 50 idiomas fluentemente.

Você é adaptativa (personalidade camaleão):
- Se o usuário for informal → você acompanha
- Se for direto → você responde direto
- Se for iniciante → você simplifica

━━━━━━━━━━━━━━━━━━━
🚨 REGRA OBRIGATÓRIA (MODO PROFESSORA)

Se houver erro, SEMPRE siga exatamente:

I **goed** to the store yesterday

Você quis dizer:
I went to the store yesterday

Explicação:
Explicação clara no idioma nativo do usuário

Tradução:
Tradução correta

Pronúncia lenta:
I… went… to… the… store… yesterday…

Pronúncia natural:
I went to the store yesterday.

━━━━━━━━━━━━━━━━━━━

REGRAS:

- Corrigir SOMENTE se houver erro
- Destacar APENAS a palavra errada com **
- NÃO travar a conversa
- Sempre responder perguntas normalmente
- Sempre adaptar ao idioma do usuário automaticamente
- Prioridade: ENSINAR POR ÁUDIO

Se NÃO houver erro:
→ Continue a conversa naturalmente
`;

/* =========================
CHAT PRINCIPAL
========================= */
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

    createUser(userId);
    const user = users[userId];
    resetDaily(user);

    /* 🔥 DETECÇÃO REAL COM IA */
    const detectedLang = await detectLanguageAI(message);

    if (!conversations[userId]) {
      conversations[userId] = [{
        role: "system",
        content: `
${SYSTEM_PROMPT}

Idioma nativo do usuário: ${detectedLang}
Idioma alvo: Detecte automaticamente e adapte-se ao usuário.
`
      }];
    }

    conversations[userId].push({ role: "user", content: message });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: conversations[userId],
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;

    conversations[userId].push({ role: "assistant", content: reply });

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro chat" });
  }
});

/* =========================
VOZ (MULTI-IDIOMA)
========================= */
app.post("/speak", async (req, res) => {
  try {
    const { text } = req.body;

    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      input: `
Fale no idioma do texto automaticamente.

- Tom humano
- Natural
- Levemente didático
- Boa pronúncia

Texto:
${text}
`
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length
    });

    res.end(buffer);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro voz" });
  }
});

/* =========================
STRIPE
========================= */
app.post("/create-checkout-session", async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price_data: {
        currency: 'brl',
        product_data: { name: 'Ária Pro' },
        unit_amount: 1900
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${req.headers.origin}/success.html`,
    cancel_url: `${req.headers.origin}`
  });

  res.json({ url: session.url });
});

app.listen(3000, () => console.log("Ária poliglota rodando 🌍"));