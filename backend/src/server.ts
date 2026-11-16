import express from "express";

import cors from "cors";

import { pool } from "./database/db.js";


const app = express();

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

app.post('/api/itens', async (req, res) => {
  const { titulo, descricao, foto, local, tipo, categoria, contato, data_perdido_achado } = req.body;

  if (!titulo || !local || !tipo || !contato) return res.status(400).json({ erro: 'Preencha os campos corretamente.' });

  try {
     await pool.query(
      "INSERT INTO mural (titulo, descricao, foto, local, tipo, categoria, contato, data_perdido_achado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
      [
        titulo, 
        descricao ?? null, 
        foto ?? null, 
        local, 
        tipo, 
        categoria ?? "outros", 
        contato, 
        data_perdido_achado || null,
      ]
    );

    res.status(201).json({ mensagem: "Item cadastrado com sucesso!" });

  } catch (erro) {
    console.log(erro);
    res.status(500).json({ erro: 'Erro ao cadastrar itens os itens.' });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});