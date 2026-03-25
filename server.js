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
PROMPT
========================= */

const SYSTEM_PROMPT=`
Você é HeyAria, parceira de idiomas.
Corrige erros imediatamente.
Responde no mesmo idioma.
Tradução português.
Sem pedir desculpas.

Formato:

Resposta:
...

Correção:
...

Tradução:
...
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

/* limite free */

if(user.plan==="free" && user.messagesToday>=10){
return res.json({
limit:true
})
}

user.messagesToday++

/* detectar objetivo */

if(
message.toLowerCase().includes("quero") ||
message.toLowerCase().includes("objetivo")
){
userGoals[userId]=message
}

/* conversa */

if(!conversations[userId]){
conversations[userId]=[
{
role:"system",
content:`
${SYSTEM_PROMPT}

Objetivo do aluno:
${userGoals[userId] || "não definido"}

Use esse conhecimento:
${knowledge.join("\n")}
`
}
]
}

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
ÁUDIO → TEXTO
========================= */

app.post("/audio", upload.single("audio"), async (req, res) => {

try{

const audioFile = fs.createReadStream(req.file.path);

const response = await openai.audio.transcriptions.create({
file: audioFile,
model: "gpt-4o-transcribe"
});

res.json({ text: response.text });

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
START (RENDER)
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("HeyAria online na porta " + PORT)
})