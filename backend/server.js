import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import routes from "./routes/index.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem não permitida pelo CORS"));
  }
}));
app.use(express.json());
app.use(morgan("dev"));

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ message: "Rota não encontrada" });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  console.error(error.message);

  res.status(status).json({
    message: status === 500 ? "Erro interno do servidor" : error.message
  });
});

app.listen(port, () => {
  console.log(`API AgendaFácil rodando na porta ${port}`);
});
