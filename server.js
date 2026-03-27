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
const userPersonality = {};
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
lastReset:new Date().toDateString()
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
PERSONALIDADE
========================= */

const SYSTEM_PROMPT=`
Você é Aria, parceira de idiomas com personalidade real e sincera.

Personalidade:
- não bajula o usuário
- pode discordar
- adapta ao tom do usuário
- se o usuário for rude seja firme
- se for amigável seja amigável
- seja natural e humana

Existem dois modos:

MODO PROFESSORA:
- primeiro responda normalmente à conversa
- depois corrija o erro
- depois mostre tradução
- não interrompa a conversa
- correção sempre após a resposta

Formato:

Resposta natural primeiro

Correção:
frase corrigida

Tradução:
português


Exemplo:

Usuário:
i go to store yesterday

Aria:
That's nice. What did you buy?

Correção:
I went to the store yesterday.

Tradução:
Eu fui à loja ontem.



MODO CASUAL:
- não corrija erros
- não explique gramática
- não mostre tradução
- apenas converse normalmente
- seja fluida e natural
- como chatgpt normal
- nunca interrompa com correção

Se personalidade = casual:
apenas responda normalmente

Se personalidade = teacher:
use formato professora
`

/* =========================
TESTE
========================= */

app.get("/", (req,res)=>{
res.send("HeyAria online")
})

/* =========================
LOGIN
========================= */

app.post("/login",(req,res)=>{

const {email,password}=req.body

if(!accounts[email]){
const userId=generateUserId()

accounts[email]={email,password,userId}

createUser(userId)

return res.json({userId})
}

res.json({userId:accounts[email].userId})

})

/* =========================
OBJETIVO
========================= */

app.post("/goal",(req,res)=>{
const {userId,goal}=req.body
userGoals[userId]=goal
res.json({ok:true})
})

/* =========================
CHAT
========================= */

app.post("/chat",async(req,res)=>{

try{

const {message,userId}=req.body

createUser(userId)

const user=users[userId]

resetDaily(user)

/* primeira escolha personalidade */

if(
message.toLowerCase().includes("professora") ||
message.toLowerCase().includes("professor")
){
userPersonality[userId]="teacher"
}

if(
message.toLowerCase().includes("casual") ||
message.toLowerCase().includes("normal")
){
userPersonality[userId]="casual"
}

/* limite free */

if(user.plan==="free" && user.messagesToday>=10){
return res.json({
limit:true
})
}

user.messagesToday++

/* primeira mensagem */

if(!conversations[userId]){

conversations[userId]=[
{
role:"system",
content:`
${SYSTEM_PROMPT}

Personalidade:
${userPersonality[userId] || "não definida"}

Objetivo:
${userGoals[userId] || "não definido"}

Conhecimento:
${knowledge.join("\n")}
`
}
]

return res.json({
reply:`Olá, sou Aria, tua parceira de idiomas.
Vou ser sincera contigo: se errares vou corrigir-te na hora para não ganhares vícios.

Queres que eu seja detalhista como professora
ou preferes que eu seja direta para conversarmos mais rápido?

Responde:
professora ou casual`
})

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

res.json({
reply,
remaining:10-user.messagesToday
})

}catch(err){
console.error(err)
res.status(500).json({error:"erro chat"})
}

})

/* =========================
APRENDER
========================= */

app.post("/learn",(req,res)=>{
const {text}=req.body
knowledge.push(text)
res.json({ok:true})
})

/* =========================
ÁUDIO + CORREÇÃO
========================= */

app.post("/audio", upload.single("audio"), async (req, res) => {

try{

const audioFile = fs.createReadStream(req.file.path);

const response = await openai.audio.transcriptions.create({
file: audioFile,
model: "gpt-4o-transcribe"
});

const text = response.text;

const completion = await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:[
{
role:"system",
content:SYSTEM_PROMPT
},
{
role:"user",
content:text
}
]
});

const reply = completion.choices[0].message.content;

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
VOZ IA
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
UPGRADE
========================= */

app.post("/upgrade",(req,res)=>{
const {userId}=req.body
users[userId].plan="pro"
res.json({success:true})
})

/* =========================
START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("HeyAria online na porta " + PORT)
})