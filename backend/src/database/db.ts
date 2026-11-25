import "dotenv/config";
import mysql from "mysql2/promise";

function lerEnv(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined) {
    throw new Error(`Variável de ambiente ausente: ${nome}`);
  }
  return valor;
}


const usarSsl = process.env.DB_SSL === "true";

export const pool = mysql.createPool({
  host: lerEnv("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 3306),
  user: lerEnv("DB_USER"),
  password: lerEnv("DB_PASSWORD"),
  database: lerEnv("DB_NAME"),
  connectionLimit: 5,
  
  dateStrings: true,
  ...(usarSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
});