# Novo cliente — checklist de implantação

Tempo estimado: 2–3h para demo personalizada, 48h para produção.

---

## 1. Criar branch

```bash
git checkout main
git checkout -b demo/nome-do-cliente
```

---

## 2. Configurar identidade (frontend)

Copie o preset mais próximo do nicho:

| Nicho | Preset |
|---|---|
| Barbearia | `frontend/src/config/tenant.js` (main já tem Studio Cut) |
| Salão | `frontend/src/config/presets/salao.tenant.js` |
| Clínica estética | `demo/lumiere` — tenant.js já configurado |
| Petshop | `frontend/src/config/presets/petshop.tenant.js` |

Copie para `frontend/src/config/tenant.js` e edite:

```js
name:        // nome real do negócio
city:        // bairro + cidade
hero.stats:  // remova ou deixe em branco se não tiver dados reais
hero.image:  // busque no Unsplash uma foto que combine
contact.whatsapp: // número do cliente (só dígitos com DDD): "27999999999"
```

---

## 3. Configurar dados (backend)

Copie o seed do nicho:

```bash
cp backend/prisma/seeds/salao.seed.js backend/prisma/seed.js
```

Edite `backend/prisma/seed.js`:
- Troque os nomes dos serviços pelos serviços reais do cliente
- Troque os preços pelos preços reais
- Troque os nomes dos profissionais pelos nomes reais
- Ajuste os horários de funcionamento

---

## 4. Rodar o seed localmente

```bash
cd backend
npm run db:seed
```

---

## 5. Ajustar metadados

`frontend/index.html`:
```html
<title>Nome do Cliente · Agendamento Online</title>
<meta name="description" content="Agende online com o Nome do Cliente..." />
```

---

## 6. Testar o fluxo completo

- [ ] Landing carrega com identidade do cliente
- [ ] Serviços e profissionais corretos
- [ ] Agendamento completo funciona (sem erro)
- [ ] Conflito de horário bloqueado
- [ ] Painel admin abre na tela de login
- [ ] Status muda corretamente
- [ ] Mobile e desktop OK

---

## 7. Deploy da demo

### Frontend (Vercel)
1. Push da branch: `git push origin demo/nome-cliente`
2. Vercel → New Deployment → selecionar a branch
3. Variável: `VITE_API_URL` = URL do backend

### Backend (Render)
1. Render → New Web Service → branch `demo/nome-cliente`
2. Variáveis:
   - `DATABASE_URL` = nova URL do banco (Supabase ou Render Postgres)
   - `ADMIN_SECRET` = senha do painel (anote e entregue ao cliente)
   - `FRONTEND_URL` = URL da Vercel
   - `NODE_ENV` = production

---

## 8. Entregar ao cliente

- URL pública da landing
- URL do painel: `[url]/admin`
- Senha do painel
- Orientação de 30 minutos (pessoalmente ou vídeo)

---

## 9. Pós-entrega (semana 1)

- [ ] Ligar ou mandar mensagem no dia seguinte
- [ ] Confirmar que está usando o painel
- [ ] Coletar feedback do primeiro agendamento real
- [ ] Apresentar upsell do Nível 2 no mês 2
