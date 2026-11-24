import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

const resposta = await cloudinary.api.ping();
console.log(resposta);

