import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import multer from "multer";
import fs from "fs";
import Stripe from "stripe";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* =========================
OPENAI
========================= */
if (!process.env.OPENAI_API_KEY) {
  console.error("ERRO: OPENAI_API_KEY não encontrada");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
STRIPE
========================= */
if (!process.env.STRIPE_KEY) {
  console.error("ERRO: STRIPE_KEY não encontrada");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_KEY, { apiVersion: "2022-11-15" });

/* =========================
UPLOAD
========================= */
const upload = multer({ dest: "uploads/" });

/* =========================
MEMÓRIA
========================= */
const conversations = {};
const users = {};
const userMode = {};

/* =========================
USER
========================= */
function generateUserId() {
  return crypto.randomBytes(16).toString("hex");
}

function createUser(userId){
  if(!users[userId]){
    users[userId] = {
      plan: "free",
      messagesToday: 0,
      lastReset: new Date().toDateString(),
      userErrors: [],
      performance: { nivel: "iniciante", acertos: 0, erros: 0 },
      objective: "aprendizado geral"
    };
  }
}

function resetDaily(user){
  const today = new Date().toDateString();
  if(user.lastReset !== today){
    user.messagesToday = 0;
    user.lastReset = today;
  }
}

/* =========================
PERSONALIDADE ÁRIA
========================= */
const SYSTEM_PROMPT = `
Você é Ária, uma inteligência artificial completa e professora poliglota especialista em pronúncia e fonética.
Você fala mais de 50 idiomas.
Você conversa naturalmente.
Só corrige quando houver erro.
Pode ensinar para TOEFL, conversação, provas ou estudo geral.
REGRAS:
- Corrija apenas erros gramaticais, fonéticos, de pronúncia ou conjugação
- Destaque erros com **palavra**
- Explique no idioma materno do usuário
- Seja adaptável e sincera
- Continue conversa normalmente após correção
`;

/* =========================
ROTAS PRINCIPAIS
========================= */
app.get("/", (req,res)=> res.send("HeyAria online"));

/* CHAT */
app.post("/chat", async (req,res)=>{
  try{
    const {message, userId, nativeLang, learningLang, objective} = req.body;
    createUser(userId);
    const user = users[userId];
    user.objective = objective || user.objective;
    resetDaily(user);

    if(!conversations[userId]){
      conversations[userId] = [
        { role:"system", content:`${SYSTEM_PROMPT}\nIdioma materno: ${nativeLang}\nIdioma estudado: ${learningLang}\nObjetivo: ${user.objective}` }
      ];
      return res.json({
        reply:`Olá, sou Ária, tua parceira poliglota.
Vou conversar naturalmente e corrigir apenas quando houver erros.
Podemos começar seu aprendizado, inclusive preparando para TOEFL se desejar.`
      });
    }

    // Modo
    if(message==="professora"){ userMode[userId]="professora"; return res.json({ reply:"Modo professora ativado. Vou te corrigir quando houver erros e continuar conversando naturalmente." }); }
    if(message==="casual"){ userMode[userId]="casual"; return res.json({ reply:"Modo casual ativado. Vamos conversar normalmente." }); }

    // Limite Free
    if(user.plan==="free"){
      if(user.messagesToday >= 50) return res.json({ reply:"Você atingiu o limite diário de 50 mensagens do plano Free. Torne-se Pro para mensagens ilimitadas!" });
      user.messagesToday++;
    }

    conversations[userId].push({ role:"user", content:message });

    const completion = await openai.chat.completions.create({
      model:"gpt-4.1-mini",
      messages: conversations[userId]
    });

    const reply = completion.choices[0].message.content;
    conversations[userId].push({ role:"assistant", content:reply });

    // Atualiza performance
    if(reply.includes("**")) user.performance.erros++; else user.performance.acertos++;

    res.json({ reply, performance: user.performance });

  }catch(err){
    console.error(err);
    res.status(500).json({error:"erro chat"});
  }
});

/* ÁUDIO */
app.post("/audio", upload.single("audio"), async (req,res)=>{
  try{
    const { userId, nativeLang, learningLang, objective } = req.body;
    createUser(userId);
    const user = users[userId];
    user.objective = objective || user.objective;

    const audioFile = fs.createReadStream(req.file.path);
    const response = await openai.audio.transcriptions.create({ file: audioFile, model: "gpt-4o-transcribe" });
    const text = response.text;

    if(!conversations[userId]) conversations[userId] = [{ role:"system", content:`${SYSTEM_PROMPT}\nIdioma materno: ${nativeLang}\nIdioma estudado: ${learningLang}\nObjetivo: ${user.objective}` }];

    conversations[userId].push({ role:"user", content:text });
    const completion = await openai.chat.completions.create({ model:"gpt-4.1-mini", messages: conversations[userId] });
    const reply = completion.choices[0].message.content;
    conversations[userId].push({ role:"assistant", content:reply });

    if(reply.includes("**")) user.performance.erros++; else user.performance.acertos++;

    res.json({ text, reply, performance: user.performance });
  }catch(e){ console.error(e); res.status(500).json({error:"erro audio"}); }
});

/* VOZ */
app.post("/speak", async (req,res)=>{
  try{
    const { text } = req.body;
    const mp3 = await openai.audio.speech.create({ model:"gpt-4o-mini-tts", voice: "alloy", input: text });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader("Content-Type","audio/mpeg");
    res.send(buffer);
  }catch(e){ console.error(e); res.status(500).json({error:"erro voz"}); }
});

/* UPGRADE PRO */
app.post("/upgrade", async (req,res)=>{
  try{
    const { userId, paymentSuccess } = req.body;
    if(paymentSuccess && users[userId]){
      users[userId].plan = "pro";
      users[userId].messagesToday = 0;
      res.json({ success:true, message:"Plano Pro ativado! Mensagens ilimitadas desbloqueadas." });
    } else res.json({ success:false });
  }catch(e){ console.error(e); res.status(500).json({error:"erro upgrade"}); }
});

/* STRIPE CHECKOUT */
app.post("/create-checkout-session", async (req,res)=>{
  const session = await stripe.checkout.sessions.create({
    line_items:[{
      price_data:{
        currency:'brl',
        product_data:{ name:'Ária Pro' },
        unit_amount: 1900
      },
      quantity:1
    }],
    mode:'subscription',
    success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.headers.origin}/?canceled=true`
  });
  res.json({ url: session.url });
});

/* START */
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{ console.log("HeyAria online na porta " + PORT) });