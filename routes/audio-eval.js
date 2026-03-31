import express from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post("/audio-eval", upload.single("audio"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: "Áudio não enviado" });
    }

    const { userId, nativeLang, learningLang } = req.body;

    const filePath = req.file.path + ".webm";
    fs.renameSync(req.file.path, filePath);

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
       2. IA PROFESSORA ÁRIA
    ========================== */

    const prompt = `
Você é Ária, uma IA tutora de idiomas completa estilo ElsaSpeak + professora humana.

IMPORTANTE:
- Não interromper a conversa
- Corrigir naturalmente
- Sempre incluir tradução
- Sempre incluir fonética
- Sempre destacar erro com ** **
- Sugerir treino opcional
- Continuar conversa natural

Idioma nativo do aluno: ${nativeLang}
Idioma que ele está aprendendo: ${learningLang}

Aluno disse:
"${transcript}"

Tarefas:

1 detectar erro de pronúncia
2 detectar erro fonético
3 destacar palavra errada com **
4 mostrar frase corrigida
5 mostrar tradução
6 mostrar fonética
7 mostrar IPA
8 sugerir treino opcional
9 continuar conversa natural

Formato da resposta:

Se houver erro:

Você disse:
(frase com **erro**)

Correção:
(frase correta)

Tradução:
(tradução no idioma nativo)

Fonética:
(explicação simples)

Pronúncia:
(palavra → IPA)

Quer treinar pronúncia?
• shadowing
• speaking drill
• repetição lenta

Depois continue conversa normalmente.

Se não houver erro:
continue a conversa normalmente e incentive o aluno.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "Você é uma professora poliglota especialista em fonética e pronúncia."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    /* =========================
       3. RESPOSTA
    ========================== */

    res.json({
      text: transcript,
      reply
    });

    fs.unlinkSync(filePath);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao avaliar áudio" });
  }
});

export default router;