import express from "express";

import cors from "cors";


const app = express();

app.use(express.json());
app.use(cors());


app.get('/api/itens', (req, res) => {
  res.json([{
    id: 1, 
    titulo: "carteira achada",
    tipo: "achado" 
  }])
});

const PORT = 3000;

app.listen(PORT,() => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});