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
      objective: "aprendizado geral",
      introduced:false
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
Você é Ária, uma inteligência artificial avançada e professora poliglota.

Você fala mais de 50 idiomas.
Você tem duas personalidades:
1) Professora (principal)
2) Casual

Você é adaptativa (personalidade camaleão)
Você não é engessada
Você continua conversando normalmente

FUNÇÃO PRINCIPAL:
Ensinar idiomas principalmente por ÁUDIO

Quando houver erro você deve SEMPRE responder nesta estrutura:

1) Frase original com erro destacado com **palavra**
2) Correção
3) Explicação curta
4) Tradução
5) Pronúncia lenta
6) Pronúncia natural
7) Correção fonética se necessário

Exemplo:

I **goed** to the store yesterday

Você quis dizer:
I went to the store yesterday

Explicação:
"goed" não existe. O passado de "go" é "went".

Tradução:
Eu fui à loja ontem

Pronúncia lenta:
I… went… to… the… store… yesterday…

Pronúncia natural:
I went to the store yesterday.

REGRAS IMPORTANTES:

- Só corrigir quando houver erro
- Destacar erro com **
- Explicar no idioma materno do usuário
- Sempre continuar conversa normalmente
- Não travar conversa
- Se usuário fizer pergunta, responder normalmente
- Priorizar ensino por áudio
- Corrigir pronúncia e fonética
- Ser natural e amigável
`;

/* =========================
ROTAS
========================= */

app.get("/", (req,res)=> res.send("HeyAria online"));

/* =========================
CHAT
========================= */
app.post("/chat", async (req,res)=>{
  try{

    const {message, userId, nativeLang, learningLang, objective} = req.body;

    createUser(userId);
    const user = users[userId];

    user.objective = objective || user.objective;
    resetDaily(user);

    /* INTRODUÇÃO AUTOMÁTICA */
    if(!user.introduced){
      user.introduced = true;

      conversations[userId] = [
        {
          role:"system",
          content:`
${SYSTEM_PROMPT}

Idioma materno do usuário: ${nativeLang}
Idioma que quer aprender: ${learningLang}
Objetivo: ${user.objective}
`
        }
      ];

      return res.json({
        reply:`Olá! Eu sou Ária 🌍  
Sou uma inteligência artificial poliglota e também sua professora.

Posso falar mais de 50 idiomas.

Vou te ajudar principalmente com:
• Pronúncia  
• Fonética  
• Conversação  
• Gramática  

Primeiro me diga:

Qual idioma você quer aprender?`
      });
    }

    /* MODOS */
    if(message==="professora"){
      userMode[userId]="professora";
      return res.json({
        reply:"Modo professora ativado. Vou corrigir pronúncia, fonética, gramática e continuar conversando naturalmente."
      });
    }

    if(message==="casual"){
      userMode[userId]="casual";
      return res.json({
        reply:"Modo casual ativado. Vamos conversar normalmente."
      });
    }

    /* LIMITE FREE */
    if(user.plan==="free"){
      if(user.messagesToday >= 50){
        return res.json({
          reply:"Você atingiu o limite do plano Free. Torne-se Pro para mensagens ilimitadas e áudio avançado."
        });
      }
      user.messagesToday++;
    }

    conversations[userId].push({
      role:"user",
      content:message
    });

    const completion = await openai.chat.completions.create({
      model:"gpt-4.1-mini",
      messages: conversations[userId],
      temperature:0.7
    });

    const reply = completion.choices[0].message.content;

    conversations[userId].push({
      role:"assistant",
      content:reply
    });

    if(reply.includes("**"))
      user.performance.erros++;
    else
      user.performance.acertos++;

    res.json({
      reply,
      performance:user.performance
    });

  }catch(err){
    console.error(err);
    res.status(500).json({error:"erro chat"});
  }
});

/* =========================
ÁUDIO
========================= */
app.post("/audio", upload.single("audio"), async (req,res)=>{
  try{

    if(!req.file){
      return res.json({
        reply:"Não consegui ouvir o áudio. Tente novamente."
      });
    }

    const { userId, nativeLang, learningLang, objective } = req.body;

    createUser(userId);
    const user = users[userId];

    user.objective = objective || user.objective;

    // 👇 corrige o problema: adiciona extensão .webm ao arquivo
    const filePath = req.file.path + ".webm";
    fs.renameSync(req.file.path, filePath);

    const audioFile = fs.createReadStream(filePath);

    // transcreve áudio usando OpenAI
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-transcribe"
    });

    const text = response.text;

    if(!conversations[userId]){
      conversations[userId] = [{
        role:"system",
        content: `
${SYSTEM_PROMPT}

Idioma materno do usuário: ${nativeLang}
Idioma que quer aprender: ${learningLang}
Objetivo: ${user.objective}
`
      }];
    }

    conversations[userId].push({
      role:"user",
      content:text
    });

    const completion = await openai.chat.completions.create({
      model:"gpt-4.1-mini",
      messages: conversations[userId]
    });

    const reply = completion.choices[0].message.content;

    conversations[userId].push({
      role:"assistant",
      content:reply
    });

    if(reply.includes("**"))
      user.performance.erros++;
    else
      user.performance.acertos++;

    res.json({
      text,
      reply,
      performance:user.performance
    });

  }catch(e){
    console.error(e);
    res.status(500).json({error:"erro audio"});
  }
});
/* =========================
VOZ
========================= */
app.post("/speak", async (req,res)=>{
  try{

    const { text } = req.body;

    const mp3 = await openai.audio.speech.create({
      model:"gpt-4o-mini-tts",
      voice:"alloy",
      input:text
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.setHeader("Content-Type","audio/mpeg");
    res.send(buffer);

  }catch(e){
    console.error(e);
    res.status(500).json({error:"erro voz"});
  }
});

/* =========================
UPGRADE PRO
========================= */
app.post("/upgrade", async (req,res)=>{
  try{

    const { userId, paymentSuccess } = req.body;

    if(paymentSuccess && users[userId]){
      users[userId].plan = "pro";
      users[userId].messagesToday = 0;

      res.json({
        success:true,
        message:"Plano Pro ativado!"
      });

    }else{
      res.json({success:false});
    }

  }catch(e){
    console.error(e);
    res.status(500).json({error:"erro upgrade"});
  }
});

/* =========================
STRIPE
========================= */
app.post("/create-checkout-session", async (req,res)=>{

  const session = await stripe.checkout.sessions.create({
    line_items:[{
      price_data:{
        currency:'brl',
        product_data:{ name:'Ária Pro' },
        unit_amount:1900
      },
      quantity:1
    }],
    mode:'payment',
    success_url:`${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${req.headers.origin}/?canceled=true`
  });

  res.json({ url: session.url });
});

/* =========================
START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
  console.log("HeyAria online na porta " + PORT);
});