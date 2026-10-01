// Orçamento público: site/orcamento.html?t=<token>. O paciente vê, imprime e aprova/recusa.
import { supabase } from '../js/supabase.js';
import { escapeHtml } from '../js/ui.js';
import { formatarMoeda, formatarDataBr, linkWhatsapp } from '../js/validators.js';
import { totaisOrcamento, localDoItem } from '../js/odonto-regras.js';
import { iniciais } from '../js/site-regras.js';

const token = new URLSearchParams(location.search).get('t') ?? '';
const $ = (id) => document.getElementById(id);
const STATUS = {
  enviado:  { rotulo: 'Aguardando sua resposta', classe: 'text-bg-warning' },
  aprovado: { rotulo: 'Aprovado', classe: 'text-bg-success' },
  recusado: { rotulo: 'Recusado', classe: 'text-bg-secondary' },
};

let orc;

async function carregar() {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return falhar();
  const { data, error } = await supabase.rpc('orcamento_publico', { p_token: token });
  if (error || !data) return falhar();
  orc = data;
  render();
}

function falhar() {
  $('carregando').classList.add('d-none');
  $('erro').classList.remove('d-none');
}

function render() {
  const c = orc.clinica;
  document.documentElement.style.setProperty('--marca', c.cor_primaria);
  document.title = `Orçamento — ${c.nome}`;
  $('clinica-iniciais').textContent = iniciais(c.nome);
  $('clinica-nome').textContent = c.nome;
  $('clinica-local').textContent = c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '';

  const st = orc.vencido ? { rotulo: 'Vencido', classe: 'text-bg-danger' } : STATUS[orc.status];
  $('status').textContent = st.rotulo;
  $('status').className = `badge rounded-pill ${st.classe}`;
  $('subtitulo').textContent = `Para ${orc.paciente}${orc.profissional ? ` · ${orc.profissional}` : ''} · emitido em ${formatarDataBr(orc.criado_em)}`;

  $('itens').innerHTML = orc.itens.map((i) => {
    const local = localDoItem(i);
    return `<tr>
      <td>${escapeHtml(i.descricao)}${local ? `<div class="small text-body-secondary">${escapeHtml(local)}</div>` : ''}</td>
      <td class="text-center">${i.quantidade}</td>
      <td class="text-end text-nowrap">${formatarMoeda(i.valor * i.quantidade)}</td>
    </tr>`;
  }).join('');

  const t = totaisOrcamento(orc.itens, orc.desconto);
  $('totais').innerHTML = `
    ${t.desconto ? `<tr><td colspan="2">Subtotal</td><td class="text-end">${formatarMoeda(t.subtotal)}</td></tr>
      <tr><td colspan="2">Desconto</td><td class="text-end text-success">− ${formatarMoeda(t.desconto)}</td></tr>` : ''}
    <tr class="fs-5 fw-bold"><td colspan="2">Total</td><td class="text-end text-nowrap">${formatarMoeda(t.total)}</td></tr>`;

  const detalhes = [];
  if (orc.forma_pagamento) detalhes.push(['Pagamento', escapeHtml(orc.forma_pagamento)]);
  if (orc.validade) detalhes.push(['Válido até', formatarDataBr(orc.validade)]);
  if (orc.observacoes) detalhes.push(['Observações', escapeHtml(orc.observacoes).replace(/\n/g, '<br>')]);
  $('detalhes').innerHTML = detalhes.map(([k, v]) =>
    `<dt class="col-sm-3 text-body-secondary fw-normal">${k}</dt><dd class="col-sm-9">${v}</dd>`).join('');

  const zap = linkWhatsapp(c.whatsapp, `Olá! Tenho uma dúvida sobre o meu orçamento.`);
  if (zap) {
    $('falar').href = zap;
    $('falar').classList.remove('d-none');
  }

  renderResposta();
  $('carregando').classList.add('d-none');
  $('orcamento').classList.remove('d-none');
}

function renderResposta() {
  const box = $('resposta');
  if (orc.status === 'aprovado') {
    box.innerHTML = `<div class="alert alert-success mb-0"><i class="bi bi-check2-circle me-1" aria-hidden="true"></i>
      Aprovado${orc.aprovado_nome ? ` por <strong>${escapeHtml(orc.aprovado_nome)}</strong>` : ''}
      ${orc.respondido_em ? ` em ${formatarDataBr(orc.respondido_em)}` : ''}. A clínica vai entrar em contato para agendar.</div>`;
    return;
  }
  if (orc.status === 'recusado') {
    box.innerHTML = '<div class="alert alert-secondary mb-0">Este orçamento foi recusado. Se mudar de ideia, fale com a clínica.</div>';
    return;
  }
  if (orc.vencido) {
    box.innerHTML = '<div class="alert alert-warning mb-0">Este orçamento venceu. Fale com a clínica para receber uma versão atualizada.</div>';
    return;
  }

  box.innerHTML = `
    <form id="form-resposta" class="resumo-escolha" novalidate>
      <label for="nome" class="form-label fw-semibold">Para aprovar, digite seu nome completo</label>
      <input type="text" class="form-control mb-2" id="nome" name="nome" autocomplete="name" maxlength="150" required>
      <div class="form-check mb-3">
        <input class="form-check-input" type="checkbox" id="concordo" required>
        <label class="form-check-label small" for="concordo">Li o orçamento e concordo com os procedimentos e valores.</label>
      </div>
      <div class="alert alert-danger py-2 d-none" id="resposta-erro" role="alert"></div>
      <div class="d-flex flex-wrap gap-2">
        <button type="submit" class="btn btn-marca flex-fill" id="btn-aprovar"><i class="bi bi-check2 me-1" aria-hidden="true"></i>Aprovar orçamento</button>
        <button type="button" class="btn btn-outline-secondary" id="btn-recusar">Recusar</button>
      </div>
    </form>`;

  const form = $('form-resposta');
  const erro = $('resposta-erro');
  const mostrarErro = (msg) => { erro.textContent = msg; erro.classList.remove('d-none'); };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.classList.add('d-none');
    const nome = form.nome.value.trim().replace(/\s+/g, ' ');
    if (nome.split(' ').length < 2) return mostrarErro('Digite nome e sobrenome.');
    if (!$('concordo').checked) return mostrarErro('Marque que leu e concorda para aprovar.');
    await responder(true, nome, mostrarErro);
  });
  $('btn-recusar').addEventListener('click', async () => {
    if (!window.confirm('Recusar este orçamento?')) return;
    await responder(false, '', mostrarErro);
  });
}

async function responder(aprovar, nome, mostrarErro) {
  const botoes = document.querySelectorAll('#form-resposta button');
  botoes.forEach((b) => { b.disabled = true; });
  const { error } = await supabase.rpc('responder_orcamento', { p_token: token, p_aprovar: aprovar, p_nome: nome });
  if (error) {
    botoes.forEach((b) => { b.disabled = false; });
    mostrarErro(error.message || 'Não foi possível registrar. Tente de novo.');
    return;
  }
  await carregar();
}

carregar();
