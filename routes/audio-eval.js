import express from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import crypto from "crypto";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
AUDIO EVALUATION ROUTE
========================= */
router.post("/audio-eval", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Áudio não enviado" });
    }

    const { userId, nativeLang, learningLang } = req.body;

    let filePath = req.file.path;

    // Garantir extensão .webm
    if (!filePath.endsWith(".webm")) {
      const newPath = filePath + ".webm";
      fs.renameSync(filePath, newPath);
      filePath = newPath;
    }

    /* =========================
       1. TRANSCRIÇÃO (WHISPER)
    ========================== */
    const audioStream = fs.createReadStream(filePath);
    const whisper = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "gpt-4o-transcribe"
    });

    const transcript = whisper.text;

    /* =========================
       2. PROCESSAMENTO ÁRIA
    ========================== */
    const prompt = `
Você é Ária, uma IA professora avançada e poliglota. Seu foco principal é corrigir erros de pronúncia, fonética, gramática e vocabulário do aluno, sempre de forma paciente, gentil e clara.

REGRAS IMPORTANTES:
- Destacar APENAS a palavra incorreta com ** **.
- Não colocar a frase inteira em destaque.
- Nunca incluir as instruções de voz no texto enviado ao usuário.
- Sempre fornecer:
  1) Frase corrigida
  2) Tradução
  3) Pronúncia lenta
  4) Pronúncia natural
  5) IPA (se aplicável)
- Se houver erro de pronúncia, sugerir treino adequado:
  • Shadowing, Speaking drill ou Repetição lenta
- Sempre continuar a conversa normalmente.

Idioma nativo do aluno: ${nativeLang}
Idioma que ele está aprendendo: ${learningLang}

Aluno disse:
"${transcript}"

Formato de resposta esperado:
Você disse:
(frase com **erro**)

Correção:
(frase correta)

Tradução:
(tradução)

Fonética:
(explicação simples)

Pronúncia lenta:
(palavra separada bem devagar com …)

Pronúncia natural:
(palavra normal)

IPA:
(palavra → IPA)

Treino recomendado (se erro de pronúncia):
• Shadowing, Speaking drill ou Repetição lenta

Se não houver erro:
Continue a conversa normalmente, incentive o aluno e forneça dicas.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "Você é uma professora poliglota especialista em fonética, pronúncia e ensino de idiomas."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    /* =========================
       3. ATUALIZA PERFORMANCE DO USUÁRIO
    ========================== */
    // Presume-se que o server exporta `users` para atualizar performance
    if (global.users && userId && global.users[userId]) {
      const user = global.users[userId];
      if (reply.includes("**")) {
        user.performance.erros++;
        user.userErrors.push(transcript);
      } else {
        user.performance.acertos++;
      }
    }

   /* =========================
   4. RESPOSTA
========================= */
// 🔹 pega nome real do arquivo com extensão
const savedFilename = filePath.split("/").pop();

const audioUrl = `/uploads/${savedFilename}`;

res.json({
  text: transcript,
  reply,
  audioUrl
});

} catch (err) {
  console.error(err);
  res.status(500).json({ error: "Erro ao avaliar áudio" });
});

export default router;
  