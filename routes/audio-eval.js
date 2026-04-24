import express from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { SYSTEM_PROMPT } from "../server.js";

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =========================
AUDIO EVALUATION (ÁRIA FULL)
========================= */
router.post("/audio-eval", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Áudio não enviado" });
    }

    // 🔥 AGORA COM MODE
    const { userId, nativeLang, learningLang, mode } = req.body;

    let filePath = req.file.path;
    const mp3Path = filePath + ".mp3";

    /* =========================
    🔊 CONVERTER PARA MP3
    ========================= */
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .toFormat("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(mp3Path);
    });

    filePath = mp3Path;

    /* =========================
    🎧 TRANSCRIÇÃO (WHISPER)
    ========================= */
    const whisper = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "gpt-4o-transcribe"
    });

    const transcript = whisper.text;

    /* =========================
    🧠 MODO (NOVO)
    ========================= */
    let modeInstruction = "";

    if (mode === "casual") {
      modeInstruction = `
Modo casual:
- Conversar naturalmente
- NÃO corrigir erros
- NÃO ensinar
- Priorizar fluidez
`;
    } else {
      modeInstruction = `
Modo professora:
- Corrigir erros
- Ensinar pronúncia e gramática
- Explicar de forma clara
- Manter conversa natural
`;
    }

    /* =========================
    🧠 PROMPT COMPLETO (ÁRIA)
    ========================= */
    const dynamicPrompt = `
${SYSTEM_PROMPT}

${modeInstruction}

🎤 CONTEXTO DE ÁUDIO:
O usuário falou por voz. Priorize ensino por pronúncia, fonética e naturalidade.

📌 REGRAS PARA RESPOSTA:
- Detectar idioma automaticamente
- Responder no idioma correto
- Destacar erro com ** **
- Explicar de forma simples e natural

- Se estiver no modo professora:
  • Corrigir
  • Explicar
  • Ensinar

- Se estiver no modo casual:
  • NÃO corrigir
  • Apenas conversar naturalmente

🌍 Idioma nativo: ${nativeLang || "auto"}
🎯 Idioma de aprendizado: ${learningLang || "auto"}

🗣️ Fala do usuário:
"${transcript}"
`;

    /* =========================
    🤖 CHAMADA OPENAI
    ========================= */
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: dynamicPrompt
        },
        {
          role: "user",
          content: transcript
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    /* =========================
    📊 PERFORMANCE (OPCIONAL)
    ========================= */
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
    🔗 URL DO ÁUDIO DO USUÁRIO
    ========================= */
    const fileName = filePath.split("/").pop();
    const audioUrl = `/uploads/${fileName}`;

    /* =========================
    📤 RESPOSTA FINAL
    ========================= */
    res.json({
      text: transcript,
      reply,
      audioUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao avaliar áudio" });
  }
});

export default router;