import app from "./app.js";

const port = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === "production";

app.listen(port, () => {
  console.log(`API AgendaFácil rodando na porta ${port} [${isProd ? "production" : "development"}]`);
});
