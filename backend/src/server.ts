import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { v2 as cloudinary } from "cloudinary";
import type { RowDataPacket } from "mysql2";
import { pool } from "./database/db.js";

const TIPOS = ["achado", "perdido"];
const CATEGORIAS = ["documento", "chaves", "celular", "carteira", "pet", "outros"];

const tiposPermitidos = ["image/jpeg", "image/png", "image/webp"];

// A imagem fica só na memória até ser enviada ao Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Apenas imagens JPG, PNG ou WEBP são permitidas."));
    }
  },
});

const limiteSenha = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente novamente em alguns minutos." },
});

const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitos cadastros em pouco tempo. Tente novamente mais tarde." },
});

type FotoNuvem = { url: string; publicId: string };

function enviarParaCloudinary(arquivo: Express.Multer.File): Promise<FotoNuvem> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "achados-perdidos",
        resource_type: "image",
        transformation: [{ width: 1200, crop: "limit" }],
      },
      (erro, resultado) => {
        if (erro || !resultado) {
          reject(erro ?? new Error("Falha no envio da imagem."));
          return;
        }
        resolve({ url: resultado.secure_url, publicId: resultado.public_id });
      }
    );
    stream.end(arquivo.buffer);
  });
}

async function apagarDaNuvem(publicId?: string | null) {
  if (!publicId) return;
  await cloudinary.uploader
    .destroy(publicId)
    .catch((erro) => console.error("Falha ao apagar imagem da nuvem:", erro));
}

type Verificacao =
  | { ok: true; item: RowDataPacket }
  | { ok: false; status: number; erro: string };

async function verificarSenha(id: number, senha: string): Promise<Verificacao> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    "SELECT senha_hash, foto_public_id FROM mural WHERE id_mural = ?",
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

const app = express();

// Na hora de publicar (Render, etc.), descomente a linha abaixo para o
// limite de tentativas enxergar o IP real de cada pessoa:
// app.set("trust proxy", 1);

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

app.post("/api/itens", limiteCadastro, upload.single("foto"), async (req, res) => {
  const { titulo, descricao, local, tipo, categoria, contato, data_perdido_achado, senha } = req.body;
  const categoriaFinal = categoria || "outros";

  if (
    !titulo || !local || !contato ||
    typeof senha !== "string" || senha.length < 4 ||
    !TIPOS.includes(tipo) || !CATEGORIAS.includes(categoriaFinal)
  ) {
    res.status(400).json({ erro: "Preencha os campos e crie uma senha de pelo menos 4 caracteres." });
    return;
  }

  let foto: FotoNuvem | null = null;

  try {
    if (req.file) {
      try {
        foto = await enviarParaCloudinary(req.file);
      } catch (erro) {
        console.error(erro);
        res.status(400).json({ erro: "Não foi possível processar a imagem. Envie um arquivo JPG, PNG ou WEBP válido." });
        return;
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      "INSERT INTO mural (titulo, descricao, foto, foto_public_id, local, tipo, categoria, contato, data_perdido_achado, senha_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        titulo,
        descricao || null,
        foto?.url ?? null,
        foto?.publicId ?? null,
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
    if (foto) await apagarDaNuvem(foto.publicId);
    res.status(500).json({ erro: "Erro ao cadastrar o item." });
  }
});

app.post("/api/itens/:id/verificar", limiteSenha, async (req, res) => {
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

app.put("/api/itens/:id", limiteSenha, async (req, res) => {
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

app.patch("/api/itens/:id/resolvido", limiteSenha, async (req, res) => {
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

app.delete("/api/itens/:id", limiteSenha, async (req, res) => {
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
    await apagarDaNuvem(verificacao.item.foto_public_id);

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