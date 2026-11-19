import "dotenv/config";
import mysql from "mysql2/promise";

function lerEnv(nome: string): string {
    const valor = process.env[nome];
    if (valor === undefined) {
        throw new Error(`Variável de ambiente ausente: ${nome}`);
    }
    return valor;
}

export const pool = mysql.createPool({
    host: lerEnv("DB_HOST"),
    user: lerEnv("DB_USER"),
    password: lerEnv("DB_PASSWORD"),
    database: lerEnv("DB_NAME"),
});