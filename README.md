# Clínica SaaS

Sistema + site para clínicas de **odontologia, estética e beleza**, vendido pela WoodTec.
HTML + Bootstrap 5 + JavaScript puro (ES Modules) + Supabase. Sem etapa de build (mesma base do CRM WoodTec).

> **Projeto separado do CRM WoodTec.** Repositório, projeto Supabase e projeto Vercel próprios.
> Os dados das clínicas clientes nunca passam pelo banco do CRM.

## O que já tem (fase 1)

| Módulo | Conteúdo |
|---|---|
| Multi-clínica | Cada clínica só enxerga os próprios dados (RLS por `clinica_id` + chaves estrangeiras compostas) |
| Onboarding | Usuário sem clínica cadastra a sua; serviços comuns do segmento já vêm criados |
| Agenda | Visão do dia por profissional, clique no horário para agendar, situação (agendado → confirmado → atendido/faltou/cancelado), bloqueios, confirmação pelo WhatsApp em 1 clique, conflito de horário barrado no banco |
| Pacientes | Busca por nome/telefone/CPF, cadastro, histórico de atendimentos |
| Equipe e serviços | Profissionais com grade semanal (com pausa) e serviços que atendem; serviços com duração e preço |
| Clínica e site | Dados, cor do site, regras do agendamento online, link do site |
| Site público | `site/?c=<slug>`: vitrine (serviços, equipe, contato, WhatsApp) + agendamento online em 4 passos ligado direto na agenda |

## Próximas fases

| Fase | Conteúdo |
|---|---|
| 2 | Odontograma e plano de tratamento por dente; orçamento com aceite do paciente |
| 3 | Estética: fotos antes/depois, termos de consentimento, pacotes de sessões |
| 4 | Financeiro: recebimentos, parcelas, comissão por profissional |
| 5 | WhatsApp automático (lembrete na véspera), equipe com convites e papéis, domínio próprio por clínica |

---

## 1. Criar o projeto no Supabase (NOVO, não o do CRM)

1. Em <https://supabase.com>, **New project** com um nome como `clinica-saas`, região **South America (São Paulo)**.
2. **SQL Editor** → **New query** → cole todo o [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Pode rodar de novo sem erro quando o arquivo for atualizado.
3. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.
   Quem cria os acessos é a WoodTec (passo 4); assim ninguém cria conta por fora.

## 2. Configurar o `config.js`

1. Copie `js/config.example.js` para `js/config.js` (está no `.gitignore`).
2. Preencha com **Project URL** e a chave **anon/publishable** do projeto **clinica-saas**.
   Nunca use a `service_role`/`secret` no front.

## 3. Rodar localmente

Precisa de um servidor estático (ES Modules não funcionam via `file://`):

- **VS Code:** extensão **Live Server** → botão direito no `index.html` → **Open with Live Server**.
- **Windows sem Node/Python:** `powershell -ExecutionPolicy Bypass -File scripts/servidor-local.ps1` e abra <http://localhost:5500/>.
- **Com Node:** `npx serve .`

## 4. Implantar uma clínica nova (venda fechada)

1. No Supabase: **Authentication → Users → Add user**, e-mail do dono da clínica, senha provisória, **Auto Confirm User**.
2. Entre no sistema com esse usuário: aparece o cadastro da clínica (nome, endereço do site, segmento).
3. Em **Equipe e serviços**, cadastre os profissionais e horários; ajuste os serviços e preços.
4. Em **Clínica e site**, preencha WhatsApp, endereço, cor e texto "sobre". Copie o link do site e entregue ao cliente.
5. Passe o acesso ao cliente e peça para trocar a senha.

## 5. Testes

Cobrem as funções puras (validações, regras da agenda e do site). Não acessam o banco.

- **No navegador:** com o servidor local rodando, abra `tests/run.html`.
- **No Node (18+):** `node tests/run.mjs`

## 6. Publicar na Vercel

Igual ao CRM, mas num **projeto Vercel separado**:

1. Suba este repositório no GitHub e importe em <https://vercel.com/new>.
2. Em **Environment Variables**: `SUPABASE_URL` e `SUPABASE_ANON_KEY` do projeto **clinica-saas**.
3. **Deploy.** O `scripts/build-vercel.sh` copia `index.html`, `app.html`, `css`, `js` e `site` para `public/` e gera o `config.js`.
4. No Supabase, **Authentication → URL Configuration → Site URL** = endereço da Vercel.

O site de cada clínica fica em `https://SEU-APP.vercel.app/site/?c=<slug>`.

---

## Estrutura

```
index.html               login
app.html                 sistema (agenda, pacientes, equipe e serviços, clínica e site)
site/                    site público da clínica + agendamento online
css/styles.css           visual do sistema
js/config.example.js     modelo de credenciais (copie para config.js)
js/constants.js          listas fixas (segmentos, status, origens...)
js/validators.js         CPF, telefone, slug, datas, validação das entidades (puro)
js/agenda-regras.js      cálculos da grade da agenda (puro)
js/site-regras.js        fuso, dias, agrupamento de horários do site (puro)
js/db.js                 consultas ao Supabase do sistema
js/estado.js             clínica atual, serviços e profissionais em memória
js/app.js                entrada do app.html: sessão, onboarding, menu
js/agenda.js · pacientes.js · cadastros.js · config-clinica.js   telas
js/supabase.js · auth.js · ui.js                                 trazidos do CRM
supabase/schema.sql      tabelas, RLS, funções do sistema e do site
scripts/                 build da Vercel e servidor local
tests/                   testes das funções puras
```

## Segurança e regras de dados

- **Isolamento:** toda tabela tem `clinica_id`; o RLS libera só clínicas em que o usuário está em `membros`.
  As FKs compostas `(clinica_id, id)` impedem apontar para paciente/profissional de outra clínica.
- **Site público:** o visitante (anon) não lê nenhuma tabela. Só chama 3 funções:
  `site_clinica` (vitrine), `horarios_livres` e `agendar_online`. Nenhuma devolve dados de pacientes.
- **Conflito de horário:** constraint `agendamentos_sem_conflito` (exclusion) impede dois atendimentos
  do mesmo profissional no mesmo horário, inclusive em agendamentos simultâneos pelo site.
- **LGPD:** o agendamento online exige consentimento e grava `consentimento_lgpd_em` no paciente.
- **Telefone:** `55` + DDD + número (validação igual à do CRM). Não é único: famílias dividem número.
- **Pendente antes de escalar:** limitar tentativas do `agendar_online` (anti-spam/captcha) e log de acesso a dados sensíveis.
