// Orçamentos do paciente: editor, envio por WhatsApp com link de aprovação e plano de tratamento.
import {
  STATUS_ORCAMENTO, totaisOrcamento, progressoTratamento, validarItemOrcamento, validarOrcamento,
  localDoItem, formatarFaces, mensagemOrcamento,
} from './odonto-regras.js';
import { formatarMoeda, formatarDataBr, hojeIso, linkWhatsapp, lerValorMonetario } from './validators.js';
import { somarDias } from './agenda-regras.js';
import { mensagemDeErro } from './supabase.js';
import { toast, confirmar, estadoVazio, mostrarErros, limparValidacao, carregando, escapeHtml } from './ui.js';
import * as db from './db.js';
import { estado, profissionalPorId } from './estado.js';

const VALIDADE_PADRAO_DIAS = 30;

let el;
let modal;
let paciente = null;
let lista = [];
let editando = null;
let iniciado = false;

const ehOdonto = () => estado.clinica?.segmento === 'Odontologia';

/** Link público do orçamento (página site/orcamento.html). */
export function linkDoOrcamento(token) {
  return new URL(`site/orcamento.html?t=${encodeURIComponent(token)}`, location.href).href;
}

export function iniciarOrcamentos() {
  if (iniciado) return;
  iniciado = true;
  el = {
    lista: document.getElementById('orc-lista'),
    contador: document.getElementById('orc-contador'),
    form: document.getElementById('form-orcamento'),
    itens: document.getElementById('orc-itens'),
    excluir: document.getElementById('orc-excluir'),
  };
  modal = new bootstrap.Modal('#modal-orcamento');

  document.getElementById('orc-novo').addEventListener('click', () => abrirEditor(null));
  document.getElementById('orc-add-item').addEventListener('click', () => {
    el.itens.appendChild(linhaItem({}));
    el.itens.lastElementChild.querySelector('select').focus();
  });
  el.itens.addEventListener('input', recalcular);
  el.itens.addEventListener('change', (ev) => {
    if (ev.target.name === 'servico_id') preencherPeloServico(ev.target.closest('tr'), ev.target.value);
    recalcular();
  });
  el.itens.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-remover]');
    if (!b) return;
    b.closest('tr').remove();
    recalcular();
  });
  el.form.desconto.addEventListener('input', recalcular);
  el.form.addEventListener('submit', salvar);
  el.excluir.addEventListener('click', excluir);
}

export async function carregarOrcamentos(p) {
  paciente = p;
  el.lista.innerHTML = '<div class="text-body-secondary small">Carregando...</div>';
  try {
    lista = await db.listarOrcamentos(estado.clinica.id, paciente.id);
    render();
  } catch (erro) {
    el.lista.textContent = mensagemDeErro(erro, 'Carregar orçamentos');
  }
}

/** Usado pelo odontograma: acrescenta no rascunho mais recente (ou cria um). */
export async function adicionarAoRascunho(item) {
  const { valido, erros, dados } = validarItemOrcamento(item);
  if (!valido) {
    toast(Object.values(erros)[0], 'aviso');
    return false;
  }
  try {
    const rascunho = lista.find((o) => o.status === 'rascunho');
    if (rascunho) {
      await db.adicionarItemOrcamento(estado.clinica.id, rascunho.id, dados, rascunho.itens.length);
    } else {
      await db.salvarOrcamento(estado.clinica.id, paciente.id, null, {
        validade: somarDias(hojeIso(), VALIDADE_PADRAO_DIAS),
      }, [dados]);
    }
    toast(`${dados.descricao}${dados.dente ? ` (${localDoItem(dados)})` : ''} adicionado ao orçamento.`, 'sucesso');
    await carregarOrcamentos(paciente);
    return true;
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Adicionar ao orçamento'), 'erro');
    return false;
  }
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------
function render() {
  const abertos = lista.filter((o) => o.status === 'rascunho' || o.status === 'enviado').length;
  el.contador.textContent = abertos;
  el.contador.classList.toggle('d-none', !abertos);

  if (!lista.length) {
    estadoVazio(el.lista, {
      icone: 'bi-receipt',
      titulo: 'Nenhum orçamento',
      texto: ehOdonto()
        ? 'Monte pelo odontograma (Adicionar ao orçamento) ou crie aqui.'
        : 'Crie um orçamento com os procedimentos e envie pelo WhatsApp.',
      acoes: [{ texto: 'Novo orçamento', icone: 'bi-plus-lg', onClick: () => abrirEditor(null) }],
    });
    return;
  }

  el.lista.innerHTML = lista.map(cartao).join('');
  el.lista.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', () =>
    acao(b.dataset.acao, lista.find((o) => o.id === b.closest('[data-orcamento]').dataset.orcamento))));
  el.lista.querySelectorAll('[data-item]').forEach((c) => c.addEventListener('change', () =>
    concluirItem(c.closest('[data-orcamento]').dataset.orcamento, c.dataset.item, c.checked, c)));
}

function cartao(o) {
  const st = STATUS_ORCAMENTO[o.status];
  const t = totaisOrcamento(o.itens, o.desconto);
  const prof = profissionalPorId(o.profissional_id);
  const editavel = o.status === 'rascunho' || o.status === 'enviado';
  const aprovado = o.status === 'aprovado';
  const prog = progressoTratamento(o.itens);
  const vencido = o.status === 'enviado' && o.validade && o.validade < hojeIso();

  const itens = o.itens.map((i) => {
    const local = localDoItem(i);
    const texto = `${escapeHtml(i.descricao)}${local ? ` <span class="text-body-secondary">· ${escapeHtml(local)}</span>` : ''}${i.quantidade > 1 ? ` <span class="text-body-secondary">× ${i.quantidade}</span>` : ''}`;
    const valor = formatarMoeda(i.valor * i.quantidade);
    if (aprovado) {
      return `<li class="list-group-item d-flex align-items-center gap-2">
        <input class="form-check-input mt-0" type="checkbox" id="item-${i.id}" data-item="${i.id}" ${i.status === 'concluido' ? 'checked' : ''}>
        <label class="form-check-label me-auto ${i.status === 'concluido' ? 'text-decoration-line-through text-body-secondary' : ''}" for="item-${i.id}">${texto}
          ${i.concluido_em ? `<span class="small text-success ms-1">feito em ${formatarDataBr(i.concluido_em)}</span>` : ''}</label>
        <span class="text-nowrap small">${valor}</span>
      </li>`;
    }
    return `<li class="list-group-item d-flex gap-2"><span class="me-auto">${texto}</span><span class="text-nowrap small">${valor}</span></li>`;
  }).join('');

  const botoes = [];
  if (editavel) botoes.push(['editar', 'bi-pencil', 'Editar', 'btn-outline-secondary']);
  if (editavel) botoes.push(['enviar', 'bi-whatsapp', o.status === 'rascunho' ? 'Enviar' : 'Reenviar', 'btn-success']);
  if (o.status !== 'rascunho') botoes.push(['copiar', 'bi-link-45deg', 'Copiar link', 'btn-outline-secondary']);
  if (o.status !== 'rascunho') botoes.push(['ver', 'bi-printer', 'Ver / imprimir', 'btn-outline-secondary']);
  if (o.status === 'enviado') botoes.push(['aprovar', 'bi-check2-circle', 'Aprovado na clínica', 'btn-outline-success']);
  if (o.status === 'enviado') botoes.push(['recusar', 'bi-x-circle', 'Recusado', 'btn-outline-danger']);

  return `<div class="card" data-orcamento="${o.id}">
    <div class="card-header d-flex flex-wrap align-items-center gap-2">
      <span class="badge text-bg-${st.cor}"><i class="bi ${st.icone} me-1" aria-hidden="true"></i>${st.rotulo}</span>
      ${vencido ? '<span class="badge text-bg-warning">Vencido</span>' : ''}
      <span class="small">Orçamento de ${formatarDataBr(o.criado_em)}${prof ? ` · ${escapeHtml(prof.nome)}` : ''}</span>
      <span class="ms-auto fw-bold">${formatarMoeda(t.total)}</span>
    </div>
    ${aprovado ? `<div class="px-3 pt-3">
      <div class="d-flex justify-content-between small mb-1"><span class="fw-semibold">Plano de tratamento</span>
        <span>${prog.concluidos} de ${prog.total} concluídos</span></div>
      <div class="progress" role="progressbar" aria-label="Progresso do tratamento" aria-valuenow="${prog.percentual}" aria-valuemin="0" aria-valuemax="100" style="height:8px">
        <div class="progress-bar bg-success" style="width:${prog.percentual}%"></div></div>
    </div>` : ''}
    <ul class="list-group list-group-flush small ${aprovado ? 'mt-2' : ''}">${itens || '<li class="list-group-item text-body-secondary">Sem itens.</li>'}</ul>
    <div class="card-body py-2 small text-body-secondary">
      ${t.desconto ? `Subtotal ${formatarMoeda(t.subtotal)} · desconto ${formatarMoeda(t.desconto)} · ` : ''}
      ${o.validade ? `Válido até ${formatarDataBr(o.validade)}` : 'Sem validade'}
      ${o.respondido_em ? ` · ${o.status === 'aprovado' ? 'Aprovado' : 'Recusado'} em ${formatarDataBr(o.respondido_em)}${o.aprovado_nome ? ` por ${escapeHtml(o.aprovado_nome)}` : (o.status === 'aprovado' ? ' na clínica' : '')}` : ''}
    </div>
    ${botoes.length ? `<div class="card-footer d-flex flex-wrap gap-2">${botoes.map(([acao, icone, texto, classe]) =>
      `<button type="button" class="btn btn-sm ${classe}" data-acao="${acao}"><i class="bi ${icone} me-1" aria-hidden="true"></i>${texto}</button>`).join('')}</div>` : ''}
  </div>`;
}

async function acao(nome, o) {
  if (!o) return;
  const link = linkDoOrcamento(o.token_publico);
  if (nome === 'editar') return abrirEditor(o);
  if (nome === 'ver') return window.open(link, '_blank', 'noopener');
  if (nome === 'copiar') {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado.', 'sucesso');
    } catch {
      toast(link, 'info');
    }
    return;
  }
  if (nome === 'enviar') {
    const janela = window.open('', '_blank'); // abre já no clique para o navegador não bloquear
    await enviar(o, janela);
    return;
  }
  if (nome === 'aprovar' || nome === 'recusar') {
    const aprovar = nome === 'aprovar';
    const ok = await confirmar({
      titulo: aprovar ? 'Marcar como aprovado' : 'Marcar como recusado',
      mensagem: aprovar
        ? 'Use quando o paciente aprovar pessoalmente ou por telefone. Os itens viram o plano de tratamento.'
        : 'O orçamento fica registrado como recusado.',
      textoBotao: aprovar ? 'Aprovado' : 'Recusado',
      perigo: !aprovar,
    });
    if (!ok) return;
    try {
      await db.atualizarOrcamento(estado.clinica.id, o.id, {
        status: aprovar ? 'aprovado' : 'recusado',
        respondido_em: new Date().toISOString(),
        aprovado_nome: null, // sem nome = aprovado pela equipe, na clínica
      });
      toast(aprovar ? 'Orçamento aprovado. Plano de tratamento liberado.' : 'Orçamento marcado como recusado.', 'sucesso');
      await carregarOrcamentos(paciente);
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Atualizar orçamento'), 'erro');
    }
  }
}

/** Marca como enviado e abre o WhatsApp com o link. `janela` foi aberta no clique. */
async function enviar(o, janela) {
  try {
    if (o.status === 'rascunho') {
      await db.atualizarOrcamento(estado.clinica.id, o.id, { status: 'enviado', enviado_em: new Date().toISOString() });
    }
    const link = linkDoOrcamento(o.token_publico);
    const zap = linkWhatsapp(paciente.telefone, mensagemOrcamento({
      paciente: paciente.nome, clinica: estado.clinica.nome, link,
      total: totaisOrcamento(o.itens, o.desconto).total,
    }));
    if (zap && janela) {
      janela.location.href = zap;
    } else {
      janela?.close();
      try { await navigator.clipboard.writeText(link); } catch { /* sem permissão */ }
      toast('Telefone do paciente inválido. O link foi copiado para enviar por outro meio.', 'aviso');
    }
    await carregarOrcamentos(paciente);
  } catch (erro) {
    janela?.close();
    toast(mensagemDeErro(erro, 'Enviar orçamento'), 'erro');
  }
}

async function concluirItem(orcamentoId, itemId, concluido, checkbox) {
  checkbox.disabled = true;
  try {
    const salvo = await db.marcarItem(estado.clinica.id, itemId, concluido);
    const o = lista.find((x) => x.id === orcamentoId);
    Object.assign(o.itens.find((i) => i.id === itemId), salvo);
    render();
    const p = progressoTratamento(o.itens);
    if (concluido && p.concluidos === p.total) toast('Tratamento concluído! 🎉', 'sucesso');
  } catch (erro) {
    checkbox.checked = !concluido;
    checkbox.disabled = false;
    toast(mensagemDeErro(erro, 'Atualizar item'), 'erro');
  }
}

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------
function linhaItem(item) {
  const tr = document.createElement('tr');
  const servicos = estado.servicos.filter((s) => s.ativo || s.id === item.servico_id);
  const odonto = ehOdonto();
  tr.innerHTML = `
    <td class="col-servico">
      <select class="form-select form-select-sm mb-1" name="servico_id" aria-label="Procedimento cadastrado">
        <option value="">— Digitar livre —</option>
        ${servicos.map((s) => `<option value="${s.id}" ${s.id === item.servico_id ? 'selected' : ''}>${escapeHtml(s.nome)}</option>`).join('')}
      </select>
      <input type="text" class="form-control form-control-sm" name="descricao" maxlength="200" placeholder="Descrição" aria-label="Descrição"
             value="${escapeHtml(item.descricao ?? '')}">
    </td>
    <td class="col-dente" ${odonto ? '' : 'hidden'}><input type="number" class="form-control form-control-sm" name="dente" min="11" max="85" aria-label="Dente" value="${item.dente ?? ''}"></td>
    <td class="col-faces" ${odonto ? '' : 'hidden'}><input type="text" class="form-control form-control-sm text-uppercase" name="faces" maxlength="5" placeholder="MOD" aria-label="Faces" value="${formatarFaces(item.faces ?? [])}"></td>
    <td class="col-qtd"><input type="number" class="form-control form-control-sm" name="quantidade" min="1" max="99" aria-label="Quantidade" value="${item.quantidade ?? 1}"></td>
    <td class="col-valor"><input type="text" class="form-control form-control-sm text-end" name="valor" inputmode="decimal" placeholder="0,00" aria-label="Valor unitário"
             value="${item.valor != null ? String(item.valor).replace('.', ',') : ''}"></td>
    <td class="col-total text-end text-nowrap" data-total></td>
    <td><button type="button" class="btn btn-sm btn-link text-danger" data-remover title="Remover" aria-label="Remover procedimento"><i class="bi bi-trash" aria-hidden="true"></i></button></td>`;
  return tr;
}

function preencherPeloServico(tr, servicoId) {
  const s = estado.servicos.find((x) => x.id === servicoId);
  if (!s) return;
  tr.querySelector('[name="descricao"]').value = s.nome;
  if (s.preco !== null) tr.querySelector('[name="valor"]').value = String(s.preco).replace('.', ',');
}

function lerLinhas() {
  return [...el.itens.querySelectorAll('tr')].map((tr) => {
    const v = (n) => tr.querySelector(`[name="${n}"]`).value;
    return { tr, entrada: {
      servico_id: v('servico_id'), descricao: v('descricao'), dente: ehOdonto() ? v('dente') : '',
      faces: ehOdonto() ? v('faces') : '', quantidade: v('quantidade'), valor: v('valor'),
    } };
  });
}

function recalcular() {
  const itens = lerLinhas().map(({ tr, entrada }) => {
    const valor = lerValorMonetario(entrada.valor);
    const qtd = Number(entrada.quantidade) || 1;
    const total = valor && !Number.isNaN(valor) ? valor * qtd : 0;
    tr.querySelector('[data-total]').textContent = formatarMoeda(total);
    return { valor: total, quantidade: 1 };
  });
  const desconto = lerValorMonetario(el.form.desconto.value);
  const t = totaisOrcamento(itens, Number.isNaN(desconto) ? 0 : desconto);
  document.getElementById('orc-subtotal').textContent = formatarMoeda(t.subtotal);
  document.getElementById('orc-total').textContent = formatarMoeda(t.total);
}

function abrirEditor(o) {
  editando = o;
  const f = el.form;
  f.reset();
  limparValidacao(f);
  document.querySelector('.invalid-feedback[data-campo="itens"]').textContent = '';
  document.querySelectorAll('[data-so-odonto]').forEach((th) => { th.hidden = !ehOdonto(); });
  document.getElementById('modal-orcamento-titulo').textContent =
    `${o ? 'Editar orçamento' : 'Novo orçamento'} · ${paciente.nome}`;
  el.excluir.classList.toggle('d-none', !o);

  const profs = estado.profissionais.filter((p) => p.ativo || p.id === o?.profissional_id);
  f.profissional_id.innerHTML = '<option value="">—</option>' +
    profs.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  f.profissional_id.value = o?.profissional_id ?? (profs.length === 1 ? profs[0].id : '');
  f.validade.value = o ? (o.validade ?? '') : somarDias(hojeIso(), VALIDADE_PADRAO_DIAS);
  f.forma_pagamento.value = o?.forma_pagamento ?? '';
  f.observacoes.value = o?.observacoes ?? '';
  f.desconto.value = o?.desconto ? String(o.desconto).replace('.', ',') : '';

  el.itens.innerHTML = '';
  (o?.itens.length ? o.itens : [{}]).forEach((i) => el.itens.appendChild(linhaItem(i)));
  recalcular();
  modal.show();
}

async function salvar(ev) {
  ev.preventDefault();
  const enviarDepois = ev.submitter?.dataset.acao === 'enviar';
  const f = el.form;
  limparValidacao(f);
  const fbItens = document.querySelector('.invalid-feedback[data-campo="itens"]');
  fbItens.textContent = '';

  // Linhas totalmente vazias são ignoradas
  const linhas = lerLinhas().filter(({ entrada }) => entrada.servico_id || entrada.descricao.trim() || entrada.valor.trim() || entrada.dente);
  const itens = [];
  let erroItem = false;
  for (const { tr, entrada } of linhas) {
    const r = validarItemOrcamento(entrada);
    tr.querySelectorAll('.is-invalid').forEach((i) => i.classList.remove('is-invalid'));
    if (!r.valido) {
      erroItem = true;
      for (const [campo, msg] of Object.entries(r.erros)) {
        const input = tr.querySelector(`[name="${campo}"]`);
        input?.classList.add('is-invalid');
        if (input) input.title = msg;
      }
      if (!fbItens.textContent) fbItens.textContent = Object.values(r.erros)[0];
    } else {
      itens.push(r.dados);
    }
  }

  const cab = validarOrcamento({
    profissional_id: f.profissional_id.value, desconto: f.desconto.value, validade: f.validade.value,
    forma_pagamento: f.forma_pagamento.value, observacoes: f.observacoes.value,
  }, itens, editando ? null : hojeIso());
  if (cab.erros.itens && !erroItem) fbItens.textContent = cab.erros.itens;
  delete cab.erros.itens;
  if (erroItem || !itens.length || Object.keys(cab.erros).length) {
    mostrarErros(f, cab.erros);
    return;
  }

  const janela = enviarDepois ? window.open('', '_blank') : null;
  const restaurar = carregando(ev.submitter ?? f.querySelector('[type="submit"]'));
  try {
    const salvo = await db.salvarOrcamento(estado.clinica.id, paciente.id, editando?.id ?? null, cab.dados, itens);
    modal.hide();
    if (enviarDepois) {
      await enviar({ ...salvo, itens }, janela);
      toast('Orçamento enviado.', 'sucesso');
    } else {
      toast('Orçamento salvo.', 'sucesso');
      await carregarOrcamentos(paciente);
    }
  } catch (erro) {
    janela?.close();
    toast(mensagemDeErro(erro, 'Salvar orçamento'), 'erro');
  } finally {
    restaurar();
  }
}

async function excluir() {
  if (!editando) return;
  const ok = await confirmar({
    titulo: 'Excluir orçamento',
    mensagem: editando.status === 'enviado'
      ? 'Este orçamento já foi enviado: o link que o paciente recebeu deixa de funcionar. Excluir?'
      : 'Excluir este orçamento?',
    textoBotao: 'Excluir', perigo: true,
  });
  if (!ok) return;
  try {
    await db.excluirOrcamento(estado.clinica.id, editando.id);
    modal.hide();
    toast('Orçamento excluído.', 'sucesso');
    await carregarOrcamentos(paciente);
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Excluir orçamento'), 'erro');
  }
}
