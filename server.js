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

/* =========================
MIDDLEWARES
========================= */
app.use(cors());
app.use(express.json());
app.use("/api", audioEvalRouter);
/* =========================
UPLOAD DE ARQUIVO
========================= */

app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  try {

    if (!req.file) {
      return res.json({ success: false });
    }

    const fileName = req.file.originalname;

    res.json({
      success: true,
      reply: `Recebi seu arquivo "${fileName}". Posso analisar ele para você.`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});
app.use(express.static("public"));

/* =========================
NOVAS ROTAS (PASSO 3)
========================= */
// Ler conteúdo do arquivo enviado
app.post("/api/read-file", upload.single("file"), async (req,res)=>{

  try{

    if(!req.file){
      return res.status(400).json({error:"Arquivo não enviado"});
    }

    const filePath = req.file.path;

    // lê conteúdo do arquivo
    const content = fs.readFileSync(filePath,"utf-8");

    const completion = await openai.chat.completions.create({
      model:"gpt-4.1-mini",
      messages:[
        {
          role:"system",
          content:"Você é Ária. Leia o conteúdo enviado e explique para o aluno de forma clara."
        },
        {
          role:"user",
          content:content
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });

    fs.unlinkSync(filePath);

  }catch(err){
    console.error(err);
    res.status(500).json({error:"erro ler arquivo"});
  }

});
// Upload de arquivo
app.post("/api/upload-file", upload.single("file"), async (req,res)=>{
  if(!req.file) return res.status(400).json({error:"Arquivo não enviado"});
  res.json({ success:true, name:req.file.originalname, path:req.file.path, reply:"Arquivo recebido!" });
});

// Análise profunda de texto
app.post("/api/deep-analyze", async (req,res)=>{
  const { message } = req.body;
  const completion = await openai.chat.completions.create({
    model:"gpt-4.1-mini",
    messages:[{ role:"user", content: message }]
  });
  const reply = completion.choices[0].message.content;
  res.json({ reply });
});

// Gerar imagem
app.post("/api/generate-image", async (req,res)=>{
  const { prompt } = req.body;
  const image = await openai.images.generate({
    model:"gpt-image-1",
    prompt,
    size:"1024x1024"
  });
  const url = image.data[0].url;
  res.json({ url });
});

/* =========================
ROTAS EXISTENTES
========================= */
app.get("/", (req,res)=> res.send("HeyAria online"));

app.post("/chat", async (req,res)=>{ /* ... sua lógica atual ... */ });
app.post("/speak", async (req,res)=>{ /* ... */ });
app.post("/upgrade", async (req,res)=>{ /* ... */ });
app.post("/create-checkout-session", async (req,res)=>{ /* ... */ });

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
let deepMode = false;

if(message.startsWith("INVESTIGUE PROFUNDAMENTE")){
  deepMode = true;
}

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
      messages: [
  {
    role:"system",
    content: deepMode
      ? "Você está no modo investigação profunda. Analise detalhadamente, quebre em partes, explique passo a passo, forneça conclusão, exemplos e seja extremamente detalhada."
      : SYSTEM_PROMPT
  },
  ...conversations[userId]
],
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
VOZ
========================= */
app.post("/speak", async (req,res)=>{
  try{

    const { text } = req.body;

    const mp3 = await openai.audio.speech.create({
      model:"gpt-4o-mini-tts",
      voice:"nova",
      input: `
Fale de forma gentil, suave e feminina.
Tom de professora paciente e acolhedora.
Velocidade levemente mais lenta.
Entonação natural e amigável.

Texto:
${text}
`
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.writeHead(200,{
      "Content-Type":"audio/mpeg",
      "Content-Length":buffer.length,
      "Cache-Control":"no-cache"
    });

    res.end(buffer);

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

app.listen(PORT, () => {
  console.log("HeyAria online na porta " + PORT);
});