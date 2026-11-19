import express from "express";

import cors from "cors";

import { pool } from "./database/db.js";

import multer from "multer";

import path from "node:path";

import type { Request, Response, NextFunction } from "express";

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + path.extname(file.originalname);
    cb(null, nomeUnico)
  },
});

const tiposDeImagens = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (tiposDeImagens.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Apenas imagens JPG< PNG ou WEBP são permitidas."));
    }
  },
});

const app = express();

app.use("/uploads", express.static("uploads"));
app.use(express.json());
app.use(cors());

app.get('/api/itens', async (req, res) => {
  try {
    const [linhas] = await pool.query("SELECT * FROM mural;");
    res.json(linhas);

  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro ao consultar os itens.' });
  }
});

app.post("/api/itens", upload.single("foto"), async (req, res) => {
  const { titulo, descricao, local, tipo, categoria, contato, data_perdido_achado } = req.body;
  const foto = req.file?.filename ?? null;

  if (!titulo || !local || !tipo || !contato) {
    return res.status(400).json({ erro: "Preencha os campos corretamente." });
  }

  try {
    await pool.query(
      "INSERT INTO mural (titulo, descricao, foto, local, tipo, categoria, contato, data_perdido_achado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        titulo,
        descricao || null,
        foto,
        local,
        tipo,
        categoria || "outros",
        contato,
        data_perdido_achado || null,
      ]
    );

    res.status(201).json({ mensagem: "Item cadastrado com sucesso!" });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao cadastrar o item." });
  }
});

const PORT = 3000;

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ erro: "A imagem deve ter no máximo 5 MB."});
  }

  res.status(400).json({ erro: err.message});
});


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});