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

    let filePath = req.file.path;

// Se quiser forçar extensão .webm
if (!filePath.endsWith(".webm")) {
  const newPath = req.file.path + ".webm";
  fs.renameSync(req.file.path, newPath);
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
       2. IA PROFESSORA ÁRIA
    ========================== */

    const prompt = `
Você é Ária, uma IA professora especialista em pronúncia e fonética.

REGRAS IMPORTANTES:

- Destacar APENAS a palavra errada com ** **
- Nunca destacar a frase inteira
- Apenas a palavra incorreta deve ficar entre ** **
- Não escrever instruções de voz
- Corrigir naturalmente
- Sempre incluir tradução
- Sempre incluir fonética
- Sempre continuar conversa natural

IMPORTANTE:
Quando houver erro de PRONÚNCIA você deve:

1 mostrar palavra corrigida  
2 mostrar pronúncia lenta (bem devagar)  
3 mostrar pronúncia natural  
4 mostrar IPA  
5 sugerir treino adequado  

Idioma nativo do aluno: ${nativeLang}
Idioma que ele está aprendendo: ${learningLang}

Aluno disse:
"${transcript}"

Formato quando houver erro:

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

Se for erro de PRONÚNCIA adicionar:

Treino recomendado:

Se dificuldade em ritmo:
• Shadowing — repetir junto com a Ária

Se dificuldade em falar:
• Speaking drill — repetir várias vezes

Se palavra difícil:
• Repetição lenta — falar devagar primeiro

Depois continue a conversa normalmente.

Se não houver erro:
Continue a conversa normalmente e incentive o aluno.
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