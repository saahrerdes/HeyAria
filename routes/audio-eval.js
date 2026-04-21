import express from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/audio-eval", upload.single("audio"), async (req, res) => {

  try {

    let filePath = req.file.path;
    const mp3Path = filePath + ".mp3";

    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .toFormat("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(mp3Path);
    });

    /* 🔥 TRANSCRIÇÃO */
    const whisper = await openai.audio.transcriptions.create({
      file: fs.createReadStream(mp3Path),
      model: "gpt-4o-transcribe"
    });

    const transcript = whisper.text;

    /* 🔥 RESPOSTA INTELIGENTE */
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
Você é Ária, professora poliglota especialista em pronúncia.

- Detecte o idioma automaticamente
- Corrija se houver erro
- Explique no idioma do usuário

Se houver erro, siga:

I **goed**

Você quis dizer:
I went

Explicação:
Curta

Tradução:
Tradução

Pronúncia lenta:
I… went…

Pronúncia natural:
I went
`
        },
        { role: "user", content: transcript }
      ]
    });

    const reply = completion.choices[0].message.content;

    const audioUrl = `/uploads/${mp3Path.split("/").pop()}`;

    res.json({
      text: transcript,
      reply,
      audioUrl
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro áudio" });
  }

});

export default router;