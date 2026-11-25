import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { v2 as cloudinary } from "cloudinary";
import type { RowDataPacket } from "mysql2";
import { pool } from "./database/db.js";

/* ---------- Constantes ---------- */

const TIPOS = ["achado", "perdido"];
const CATEGORIAS = ["documento", "chaves", "celular", "carteira", "pet", "outros"];
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];

const SENHA_MINIMA = 6;
const SENHA_MAXIMA_BYTES = 72; // limite do bcrypt

// Erro com mensagem segura para mostrar à pessoa
class ErroUsuario extends Error {}

/* ---------- Validação ---------- */

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function senhaValida(senha: unknown): senha is string {
  return (
    typeof senha === "string" &&
    senha.length >= SENHA_MINIMA &&
    Buffer.byteLength(senha, "utf8") <= SENHA_MAXIMA_BYTES
  );
}

type Dados = {
  titulo: string;
  descricao: string | null;
  local: string;
  tipo: string;
  categoria: string;
  contato: string;
  dataPerdidoAchado: string | null;
};

type Leitura = { ok: true; dados: Dados } | { ok: false; erro: string };

function lerDados(corpo: unknown): Leitura {
  const c = (typeof corpo === "object" && corpo !== null ? corpo : {}) as Record<string, unknown>;

  const titulo = texto(c.titulo);
  const descricao = texto(c.descricao);
  const local = texto(c.local);
  const tipo = texto(c.tipo);
  const categoria = texto(c.categoria) || "outros";
  const contato = texto(c.contato);
  const data = texto(c.data_perdido_achado);

  if (!titulo || !local || !contato) {
    return { ok: false, erro: "Preencha título, local e contato." };
  }
  if (titulo.length > 50 || local.length > 50) {
    return { ok: false, erro: "Título e local podem ter no máximo 50 caracteres." };
  }
  if (contato.length > 20) {
    return { ok: false, erro: "O contato pode ter no máximo 20 caracteres." };
  }
  if (descricao.length > 1000) {
    return { ok: false, erro: "A descrição pode ter no máximo 1000 caracteres." };
  }
  if (!TIPOS.includes(tipo)) {
    return { ok: false, erro: "Tipo inválido." };
  }
  if (!CATEGORIAS.includes(categoria)) {
    return { ok: false, erro: "Categoria inválida." };
  }
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data)))) {
    return { ok: false, erro: "Data inválida." };
  }

  return {
    ok: true,
    dados: {
      titulo,
      descricao: descricao || null,
      local,
      tipo,
      categoria,
      contato,
      dataPerdidoAchado: data || null,
    },
  };
}

/* ---------- Upload e Cloudinary ---------- */

// A imagem fica só na memória até ser enviada ao Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_IMAGEM.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ErroUsuario("Apenas imagens JPG, PNG ou WEBP são permitidas."));
    }
  },
});

type FotoNuvem = { url: string; publicId: string };

function enviarParaCloudinary(arquivo: Express.Multer.File): Promise<FotoNuvem> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        asset_folder: "achados-perdidos",
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

/* ---------- Limites de uso ---------- */

// Limita tentativas de senha: só conta as que falharam
const limiteSenha = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente novamente em alguns minutos." },
});

// Limita cadastros por pessoa para conter spam
const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitos cadastros em pouco tempo. Tente novamente mais tarde." },
});

/* ---------- Senha da postagem ---------- */

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

/* ---------- App ---------- */

const app = express();

// Em produção o servidor fica atrás de um proxy (Render, etc.):
// sem isso, o limite de tentativas veria o mesmo IP para todo mundo
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// FRONTEND_URL: endereço(s) do site, separados por vírgula, sem "/" no final.
// Se não estiver definida (no seu computador), qualquer origem é aceita.
const origensPermitidas = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origem) => origem.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: origensPermitidas.length > 0 ? origensPermitidas : true }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/saude", (req, res) => {
  res.json({ ok: true });
});

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

  // Limite temporário até a paginação ficar pronta
  sql += " ORDER BY data_poste DESC, id_mural DESC LIMIT 100";

  try {
    const [linhas] = await pool.query(sql, valores);
    res.json(linhas);
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Erro ao consultar os itens." });
  }
});

app.post("/api/itens", limiteCadastro, upload.single("foto"), async (req, res) => {
  const leitura = lerDados(req.body);
  const senha: unknown = req.body?.senha;

  if (!leitura.ok) {
    res.status(400).json({ erro: leitura.erro });
    return;
  }

  if (!senhaValida(senha)) {
    res.status(400).json({
      erro: `A senha deve ter entre ${SENHA_MINIMA} e ${SENHA_MAXIMA_BYTES} caracteres.`,
    });
    return;
  }

  const { dados } = leitura;
  let foto: FotoNuvem | null = null;

  try {
    if (req.file) {
      try {
        foto = await enviarParaCloudinary(req.file);
      } catch (erro) {
        console.error(erro);
        res.status(400).json({
          erro: "Não foi possível processar a imagem. Envie um arquivo JPG, PNG ou WEBP válido.",
        });
        return;
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      "INSERT INTO mural (titulo, descricao, foto, foto_public_id, local, tipo, categoria, contato, data_perdido_achado, senha_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        dados.titulo,
        dados.descricao,
        foto?.url ?? null,
        foto?.publicId ?? null,
        dados.local,
        dados.tipo,
        dados.categoria,
        dados.contato,
        dados.dataPerdidoAchado,
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
  const senha: unknown = req.body?.senha;

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
  const senha: unknown = req.body?.senha;

  if (!Number.isInteger(id) || typeof senha !== "string" || !senha) {
    res.status(400).json({ erro: "Informe a senha da postagem." });
    return;
  }

  const leitura = lerDados(req.body);

  if (!leitura.ok) {
    res.status(400).json({ erro: leitura.erro });
    return;
  }

  const { dados } = leitura;

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
        dados.titulo,
        dados.descricao,
        dados.local,
        dados.tipo,
        dados.categoria,
        dados.contato,
        dados.dataPerdidoAchado,
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
  const senha: unknown = req.body?.senha;

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
  const senha: unknown = req.body?.senha;

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

/* ---------- Tratamento de erros ---------- */

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const erro =
      err.code === "LIMIT_FILE_SIZE"
        ? "A imagem deve ter no máximo 5 MB."
        : "Envio de arquivo inválido.";
    res.status(400).json({ erro });
    return;
  }

  if (err instanceof ErroUsuario) {
    res.status(400).json({ erro: err.message });
    return;
  }

  const tipoErro = (err as { type?: string }).type;

  if (tipoErro === "entity.too.large") {
    res.status(413).json({ erro: "Requisição grande demais." });
    return;
  }

  if (tipoErro === "entity.parse.failed") {
    res.status(400).json({ erro: "Requisição inválida." });
    return;
  }

  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});