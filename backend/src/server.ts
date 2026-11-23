import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2";
import { pool } from "./database/db.js";

const TIPOS = ["achado", "perdido"];
const CATEGORIAS = ["documento", "chaves", "celular", "carteira", "pet", "outros"];

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + path.extname(file.originalname);
    cb(null, nomeUnico);
  },
});

const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Apenas imagens JPG, PNG ou WEBP são permitidas."));
    }
  },
});

type Verificacao =
  | { ok: true; item: RowDataPacket }
  | { ok: false; status: number; erro: string };

async function verificarSenha(id: number, senha: string): Promise<Verificacao> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    "SELECT senha_hash, foto FROM mural WHERE id_mural = ?",
    [id]
  );
  const item = linhas[0];

  if (!item) {
    return { ok: false, status: 404, erro: "Postagem não encontrada." };
  }

  const correta = item.senha_hash
    ? await bcrypt.compare(senha, item.senha_hash)
    : false;

  if (!correta) {
    return { ok: false, status: 403, erro: "Senha incorreta." };
  }

  return { ok: true, item };
}

async function descartarUpload(arquivo?: Express.Multer.File) {
  if (arquivo) {
    await fs.unlink(arquivo.path).catch(() => {});
  }
}

const app = express();

app.use("/uploads", express.static("uploads"));
app.use(express.json());
app.use(cors());

app.get("/api/itens", async (req, res) => {
  const { tipo, categoria } = req.query;

  let sql = `SELECT id_mural, titulo, descricao, foto, local, tipo, categoria,
             contato, data_poste, data_perdido_achado, resolvido
             FROM mural WHERE 1=1`;
  const valores: string[] = [];

  if (typeof tipo === "string" && tipo) {
    sql += " AND tipo = ?";
    valores.push(tipo);
  }

  if (typeof categoria === "string" && categoria) {
    sql += " AND categoria = ?";
    valores.push(categoria);
  }

  sql += " ORDER BY data_poste DESC";

  try {
    const [linhas] = await pool.query(sql, valores);
    res.json(linhas);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao consultar os itens." });
  }
});

app.post("/api/itens", upload.single("foto"), async (req, res) => {
  const { titulo, descricao, local, tipo, categoria, contato, data_perdido_achado, senha } = req.body;
  const foto = req.file?.filename ?? null;
  const categoriaFinal = categoria || "outros";

  if (
    !titulo || !local || !contato ||
    typeof senha !== "string" || senha.length < 4 ||
    !TIPOS.includes(tipo) || !CATEGORIAS.includes(categoriaFinal)
  ) {
    await descartarUpload(req.file);
    res.status(400).json({ erro: "Preencha os campos e crie uma senha de pelo menos 4 caracteres." });
    return;
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      "INSERT INTO mural (titulo, descricao, foto, local, tipo, categoria, contato, data_perdido_achado, senha_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        titulo,
        descricao || null,
        foto,
        local,
        tipo,
        categoriaFinal,
        contato,
        data_perdido_achado || null,
        senhaHash,
      ]
    );

    res.status(201).json({ mensagem: "Item cadastrado com sucesso!" });
  } catch (erro) {
    console.error(erro);
    await descartarUpload(req.file);
    res.status(500).json({ erro: "Erro ao cadastrar o item." });
  }
});

app.post("/api/itens/:id/verificar", async (req, res) => {
  const id = Number(req.params.id);
  const senha = req.body?.senha;

  if (!Number.isInteger(id) || typeof senha !== "string" || !senha) {
    res.status(400).json({ erro: "Informe a senha da postagem." });
    return;
  }

  try {
    const verificacao = await verificarSenha(id, senha);

    if (!verificacao.ok) {
      res.status(verificacao.status).json({ erro: verificacao.erro });
      return;
    }

    res.json({ mensagem: "Senha correta." });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao verificar a senha." });
  }
});

app.put("/api/itens/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { senha, titulo, descricao, local, tipo, categoria, contato, data_perdido_achado } = req.body ?? {};
  const categoriaFinal = categoria || "outros";

  if (!Number.isInteger(id) || typeof senha !== "string" || !senha) {
    res.status(400).json({ erro: "Informe a senha da postagem." });
    return;
  }

  if (
    !titulo || !local || !contato ||
    !TIPOS.includes(tipo) || !CATEGORIAS.includes(categoriaFinal)
  ) {
    res.status(400).json({ erro: "Preencha os campos corretamente." });
    return;
  }

  try {
    const verificacao = await verificarSenha(id, senha);

    if (!verificacao.ok) {
      res.status(verificacao.status).json({ erro: verificacao.erro });
      return;
    }

    await pool.query(
      `UPDATE mural
       SET titulo = ?, descricao = ?, local = ?, tipo = ?, categoria = ?,
           contato = ?, data_perdido_achado = ?
       WHERE id_mural = ?`,
      [
        titulo,
        descricao || null,
        local,
        tipo,
        categoriaFinal,
        contato,
        data_perdido_achado || null,
        id,
      ]
    );

    res.json({ mensagem: "Postagem atualizada!" });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao atualizar a postagem." });
  }
});

app.patch("/api/itens/:id/resolvido", async (req, res) => {
  const id = Number(req.params.id);
  const senha = req.body?.senha;

  if (!Number.isInteger(id) || typeof senha !== "string" || !senha) {
    res.status(400).json({ erro: "Informe a senha da postagem." });
    return;
  }

  try {
    const verificacao = await verificarSenha(id, senha);

    if (!verificacao.ok) {
      res.status(verificacao.status).json({ erro: verificacao.erro });
      return;
    }

    await pool.query("UPDATE mural SET resolvido = 'sim' WHERE id_mural = ?", [id]);

    res.json({ mensagem: "Postagem marcada como resolvida!" });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao atualizar a postagem." });
  }
});

app.delete("/api/itens/:id", async (req, res) => {
  const id = Number(req.params.id);
  const senha = req.body?.senha;

  if (!Number.isInteger(id) || typeof senha !== "string" || !senha) {
    res.status(400).json({ erro: "Informe a senha da postagem." });
    return;
  }

  try {
    const verificacao = await verificarSenha(id, senha);

    if (!verificacao.ok) {
      res.status(verificacao.status).json({ erro: verificacao.erro });
      return;
    }

    await pool.query("DELETE FROM mural WHERE id_mural = ?", [id]);

    if (verificacao.item.foto) {
      await fs.unlink(path.join("uploads", verificacao.item.foto)).catch(() => {});
    }

    res.json({ mensagem: "Postagem apagada." });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao apagar a postagem." });
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ erro: "A imagem deve ter no máximo 5 MB." });
    return;
  }

  res.status(400).json({ erro: err.message });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});