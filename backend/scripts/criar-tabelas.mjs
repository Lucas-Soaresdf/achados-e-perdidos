
import mysql from "mysql2/promise";

const obrigatorias = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const faltando = obrigatorias.filter((nome) => process.env[nome] === undefined);

if (faltando.length > 0) {
  console.error(`Variáveis ausentes: ${faltando.join(", ")}`);
  process.exit(1);
}

const usarSsl = process.env.DB_SSL === "true";

const conexao = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ...(usarSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
});

try {
  await conexao.query(`
    CREATE TABLE IF NOT EXISTS mural (
      id_mural INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(50) NOT NULL,
      descricao TEXT,
      foto VARCHAR(255),
      foto_public_id VARCHAR(255),
      \`local\` VARCHAR(50) NOT NULL,
      tipo ENUM('achado', 'perdido') NOT NULL,
      categoria ENUM('documento', 'chaves', 'celular', 'carteira', 'pet', 'outros') NOT NULL DEFAULT 'outros',
      contato VARCHAR(20) NOT NULL,
      data_poste DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_perdido_achado DATETIME,
      resolvido ENUM('sim', 'nao') NOT NULL DEFAULT 'nao',
      senha_hash VARCHAR(255),
      INDEX idx_data_poste (data_poste)
    )
  `);

  const [colunas] = await conexao.query("SHOW COLUMNS FROM mural");
  console.log("Tabela mural pronta. Colunas:");
  console.table(colunas.map((c) => ({ coluna: c.Field, tipo: c.Type })));
} catch (erro) {
  console.error("Não foi possível criar a tabela:", erro.message);
  process.exitCode = 1;
} finally {
  await conexao.end();
}