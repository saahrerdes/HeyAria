import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import multer from "multer";
import fs from "fs";

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

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

/* =========================
UPLOAD
========================= */

const upload = multer({ dest: "uploads/" });

/* =========================
MEMÓRIA
========================= */

const conversations = {};
const users = {};
const accounts = {};
const userGoals = {};
const userMode = {};
let knowledge = [];

/* =========================
USER
========================= */

function generateUserId(){
return crypto.randomBytes(16).toString("hex")
}

function createUser(userId){
if(!users[userId]){
users[userId]={
plan:"free",
messagesToday:0,
lastReset:new Date().toDateString(),
userErrors:[]
}
}
}

function resetDaily(user){
const today=new Date().toDateString()

if(user.lastReset!==today){
user.messagesToday=0
user.lastReset=today
}
}

/* =========================
PERSONALIDADE ÁRIA
========================= */

const SYSTEM_PROMPT=`

Você é Ária, professora especialista em pronúncia e fonética.

Você é poliglota e fala mais de 50 idiomas.
Você tem personalidade camaleão e se adapta ao usuário.
Você segue o fluxo natural da conversa.
Sua função principal é corrigir pronúncia e fonética por áudio.

REGRAS PRINCIPAIS:

- Detecte automaticamente o idioma materno do usuário
- Detecte o idioma que o usuário está aprendendo
- Explique o erro no idioma materno do usuário
- Faça a correção no idioma que o usuário está aprendendo
- Detecte erros fonéticos
- Detecte erros de pronúncia
- Detecte erros gramaticais
- Detecte palavras mal pronunciadas
- Detecte troca de sons (TH, R, ED, etc)
- Corrija a frase inteira
- Priorize sempre pronúncia e fonética
- Entenda áudio
- Responda por áudio
- Corrija por áudio

FORMATO OBRIGATÓRIO:

Explique o erro primeiro no idioma materno do usuário.

Use **palavra** para destacar erros.

Depois escreva:

Correção:
(frase correta completa no idioma estudado)

Depois escreva:

Pronúncia lenta:
(repita lentamente)

Depois escreva:

Pronúncia natural:
(repita normal)

REGRAS:

- Seja clara
- Corrija tudo
- Foque em pronúncia
- Foque em fonética
- Adapte-se ao usuário
- Siga a conversa
- Destaque com ** **
`

/* =========================
TESTE
========================= */

app.get("/", (req,res)=>{
res.send("HeyAria online")
})

/* =========================
CHAT
========================= */

app.post("/chat",async(req,res)=>{

try{

const {message,userId,nativeLang,learningLang}=req.body

createUser(userId)

const user=users[userId]

resetDaily(user)

/* primeira mensagem */

if(!conversations[userId]){

conversations[userId]=[
{
role:"system",
content:`
${SYSTEM_PROMPT}

Idioma materno: ${nativeLang}
Idioma estudado: ${learningLang}
`
}
]

return res.json({
reply:`Olá, sou Ária, tua parceira de idiomas.
Vou ser sincera contigo: se errares vou corrigir-te na hora para não ganhares vícios.

Queres que eu seja detalhista como professora
ou preferes que eu seja direta para conversarmos mais rápido?

Responde:
professora ou casual`
})

}

/* detectar modo */

if(!userMode[userId]){

const lower=message.toLowerCase()

if(lower.includes("professora")){
userMode[userId]="professora"
}

if(lower.includes("casual")){
userMode[userId]="casual"
}

if(userMode[userId]){
return res.json({
reply:userMode[userId]==="professora"
? "Perfeito. Vou ser detalhista e corrigir todos os teus erros de pronúncia e fonética."
: "Perfeito. Vamos conversar de forma natural e corrijo apenas quando necessário."
})
}

}

/* conversa */

conversations[userId].push({
role:"user",
content:message
})

const completion=await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:conversations[userId]
})

const reply=completion.choices[0].message.content

conversations[userId].push({
role:"assistant",
content:reply
})

res.json({reply})

}catch(err){
console.error(err)
res.status(500).json({error:"erro chat"})
}

})

/* =========================
ÁUDIO
========================= */

app.post("/audio", upload.single("audio"), async (req, res) => {

try{

const { userId,nativeLang,learningLang } = req.body

createUser(userId)

const audioFile = fs.createReadStream(req.file.path);

const response = await openai.audio.transcriptions.create({
file: audioFile,
model: "gpt-4o-transcribe"
});

const text = response.text;

if(!conversations[userId]){
conversations[userId]=[
{
role:"system",
content:`
${SYSTEM_PROMPT}

Idioma materno: ${nativeLang}
Idioma estudado: ${learningLang}
`
}
]
}

conversations[userId].push({
role:"user",
content:text
})

const completion = await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:conversations[userId]
});

const reply = completion.choices[0].message.content;

conversations[userId].push({
role:"assistant",
content:reply
})

res.json({
text,
reply
});

}catch(e){
console.error(e)
res.status(500).json({error:"erro audio"})
}

});

/* =========================
VOZ
========================= */

app.post("/speak", async (req, res) => {

try{

const { text } = req.body;

const mp3 = await openai.audio.speech.create({
model: "gpt-4o-mini-tts",
voice: "alloy",
input: text
});

const buffer = Buffer.from(await mp3.arrayBuffer());

res.setHeader("Content-Type", "audio/mpeg");
res.send(buffer);

}catch(e){
console.error(e)
res.status(500).json({error:"erro voz"})
}

});

/* =========================
START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("HeyAria online na porta " + PORT)
})