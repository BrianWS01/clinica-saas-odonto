// Equipe (profissionais + grade semanal + serviços) e serviços/procedimentos.
import { DIAS_SEMANA, CORES_PROFISSIONAL } from './constants.js';
import { validarServico, validarProfissional, formatarMoeda } from './validators.js';
import { mensagemDeErro } from './supabase.js';
import { toast, confirmar, estadoVazio, mostrarErros, limparValidacao, carregando, escapeHtml } from './ui.js';
import * as db from './db.js';
import { estado, aoMudarCadastros, recarregarCadastros } from './estado.js';

// Grade sugerida para profissional novo: seg–sex 08–12 e 13–18
const GRADE_PADRAO = [1, 2, 3, 4, 5].map((dia) => ({ dia, inicio: '08:00', fim: '18:00', pausaDe: '12:00', pausaAte: '13:00' }));

let el;
let modalServ;
let modalProf;
let servEditando = null;
let profEditando = null;
let iniciado = false;

export function iniciarCadastros() {
  if (iniciado) return;
  iniciado = true;
  el = {
    profLista: document.getElementById('prof-lista'),
    servLista: document.getElementById('serv-lista'),
    formServ: document.getElementById('form-servico'),
    formProf: document.getElementById('form-profissional'),
    grade: document.getElementById('prof-grade'),
    profServicos: document.getElementById('prof-servicos'),
  };
  modalServ = new bootstrap.Modal('#modal-servico');
  modalProf = new bootstrap.Modal('#modal-profissional');

  document.getElementById('serv-novo').addEventListener('click', () => abrirServico(null));
  document.getElementById('prof-novo').addEventListener('click', () => abrirProfissional(null));
  document.getElementById('serv-excluir').addEventListener('click', excluirServico);
  el.formServ.addEventListener('submit', salvarServico);
  el.formProf.addEventListener('submit', salvarProfissional);
  el.grade.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-dia-ativo]')) atualizarLinhaGrade(ev.target.closest('tr'));
  });

  aoMudarCadastros(render);
  render();
}

function render() {
  if (!el) return;
  renderProfissionais();
  renderServicos();
}

function renderProfissionais() {
  if (!estado.profissionais.length) {
    estadoVazio(el.profLista, {
      icone: 'bi-person-badge', titulo: 'Nenhum profissional',
      texto: 'Cadastre quem atende, com os dias e horários de cada um.',
      acoes: [{ texto: 'Cadastrar profissional', icone: 'bi-plus-lg', onClick: () => abrirProfissional(null) }],
    });
    return;
  }
  el.profLista.innerHTML = estado.profissionais.map((p) => `
    <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2" data-id="${p.id}">
      <span class="agenda-bolinha" style="--prof:${p.cor}" aria-hidden="true"></span>
      <span class="me-auto">
        <span class="fw-semibold">${escapeHtml(p.nome)}</span>
        ${p.especialidade ? `<span class="text-body-secondary small"> · ${escapeHtml(p.especialidade)}</span>` : ''}
        <span class="d-block small text-body-secondary">${resumoGrade(p.horarios)}</span>
      </span>
      ${p.ativo ? '' : '<span class="badge text-bg-secondary">inativo</span>'}
      ${p.servicos.length ? '' : '<span class="badge text-bg-warning" title="Sem serviços, não aparece no agendamento online">sem serviços</span>'}
    </button>`).join('');
  el.profLista.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () =>
    abrirProfissional(estado.profissionais.find((p) => p.id === b.dataset.id))));
}

function resumoGrade(horarios = []) {
  if (!horarios.length) return 'Sem horário de atendimento';
  const dias = [...new Set(horarios.map((h) => h.dia_semana))].sort();
  return dias.map((d) => DIAS_SEMANA[d].slice(0, 3)).join(', ');
}

function renderServicos() {
  if (!estado.servicos.length) {
    estadoVazio(el.servLista, {
      icone: 'bi-clipboard2-pulse', titulo: 'Nenhum serviço',
      acoes: [{ texto: 'Cadastrar serviço', icone: 'bi-plus-lg', onClick: () => abrirServico(null) }],
    });
    return;
  }
  el.servLista.innerHTML = estado.servicos.map((s) => `
    <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2" data-id="${s.id}">
      <span class="me-auto">
        <span class="fw-semibold">${escapeHtml(s.nome)}</span>
        <span class="d-block small text-body-secondary">${s.duracao_min} min${s.preco !== null ? ` · ${formatarMoeda(s.preco)}` : ''}</span>
      </span>
      ${s.agendamento_online && s.ativo ? '<i class="bi bi-globe2 text-body-secondary" title="Agendável pelo site" aria-label="Agendável pelo site"></i>' : ''}
      ${s.ativo ? '' : '<span class="badge text-bg-secondary">inativo</span>'}
    </button>`).join('');
  el.servLista.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () =>
    abrirServico(estado.servicos.find((s) => s.id === b.dataset.id))));
}

// ---------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------
function abrirServico(s) {
  const f = el.formServ;
  servEditando = s;
  f.reset();
  limparValidacao(f);
  document.getElementById('modal-servico-titulo').textContent = s ? 'Editar serviço' : 'Novo serviço';
  document.getElementById('serv-excluir').classList.toggle('d-none', !s);
  f.nome.value = s?.nome ?? '';
  f.duracao_min.value = s?.duracao_min ?? 30;
  f.preco.value = s?.preco != null ? String(s.preco).replace('.', ',') : '';
  f.descricao.value = s?.descricao ?? '';
  f.ativo.checked = s?.ativo ?? true;
  f.agendamento_online.checked = s?.agendamento_online ?? true;
  modalServ.show();
}

async function salvarServico(ev) {
  ev.preventDefault();
  const f = el.formServ;
  const { valido, erros, dados } = validarServico({
    nome: f.nome.value, duracao_min: f.duracao_min.value, preco: f.preco.value, descricao: f.descricao.value,
    ativo: f.ativo.checked, agendamento_online: f.agendamento_online.checked,
  });
  if (!valido) return mostrarErros(f, erros);
  const restaurar = carregando(f.querySelector('button[type="submit"]'));
  try {
    const salvo = await db.salvarServico(estado.clinica.id, servEditando?.id ?? null, dados);
    // Serviço novo: já fica disponível para todos os profissionais ativos (dá para tirar depois)
    if (!servEditando) await liberarParaTodos(salvo.id);
    modalServ.hide();
    toast('Serviço salvo.', 'sucesso');
    await recarregarCadastros();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Salvar serviço'), 'erro');
  } finally {
    restaurar();
  }
}

async function liberarParaTodos(servicoId) {
  const ativos = estado.profissionais.filter((p) => p.ativo).map((p) => p.id);
  await db.vincularServico(estado.clinica.id, servicoId, ativos);
}

async function excluirServico() {
  if (!servEditando) return;
  const ok = await confirmar({
    titulo: 'Excluir serviço',
    mensagem: `Excluir "${servEditando.nome}"? Se já houver agendamentos com ele, prefira desmarcar "Ativo".`,
    textoBotao: 'Excluir', perigo: true,
  });
  if (!ok) return;
  try {
    await db.excluirServico(estado.clinica.id, servEditando.id);
    modalServ.hide();
    toast('Serviço excluído.', 'sucesso');
    await recarregarCadastros();
  } catch (erro) {
    toast(erro?.code === '23503'
      ? 'Esse serviço já foi usado em agendamentos. Desmarque "Ativo" em vez de excluir.'
      : mensagemDeErro(erro, 'Excluir serviço'), 'erro');
  }
}

// ---------------------------------------------------------------------
// Profissional
// ---------------------------------------------------------------------

/** Converte as faixas do banco em linhas da tela (início/fim + pausa opcional). */
function gradeParaTela(horarios) {
  const porDia = {};
  for (const h of horarios) (porDia[h.dia_semana] ??= []).push({ inicio: h.inicio.slice(0, 5), fim: h.fim.slice(0, 5) });
  return Object.entries(porDia).map(([dia, faixas]) => {
    faixas.sort((a, b) => a.inicio.localeCompare(b.inicio));
    const primeira = faixas[0];
    const ultima = faixas[faixas.length - 1];
    return {
      dia: Number(dia), inicio: primeira.inicio, fim: ultima.fim,
      pausaDe: faixas.length > 1 ? primeira.fim : '', pausaAte: faixas.length > 1 ? faixas[1].inicio : '',
    };
  });
}

/** Linhas da tela -> faixas para o banco. */
function telaParaGrade() {
  const faixas = [];
  el.grade.querySelectorAll('tr').forEach((tr) => {
    if (!tr.querySelector('[data-dia-ativo]').checked) return;
    const dia = Number(tr.dataset.dia);
    const v = (n) => tr.querySelector(`[name="${n}-${dia}"]`).value;
    const [inicio, fim, pausaDe, pausaAte] = [v('inicio'), v('fim'), v('pausaDe'), v('pausaAte')];
    if (pausaDe && pausaAte) {
      faixas.push({ dia_semana: dia, inicio, fim: pausaDe }, { dia_semana: dia, inicio: pausaAte, fim });
    } else {
      faixas.push({ dia_semana: dia, inicio, fim });
    }
  });
  return faixas;
}

function renderGrade(linhas) {
  const porDia = Object.fromEntries(linhas.map((l) => [l.dia, l]));
  // Segunda primeiro, domingo por último
  el.grade.innerHTML = [1, 2, 3, 4, 5, 6, 0].map((dia) => {
    const l = porDia[dia];
    const campo = (nome, valor) => `<input type="time" class="form-control form-control-sm" name="${nome}-${dia}"
      value="${valor ?? ''}" step="300" aria-label="${nome} ${DIAS_SEMANA[dia]}">`;
    return `<tr data-dia="${dia}">
      <td><div class="form-check mb-0">
        <input class="form-check-input" type="checkbox" id="dia-${dia}" data-dia-ativo ${l ? 'checked' : ''}>
        <label class="form-check-label" for="dia-${dia}">${DIAS_SEMANA[dia]}</label>
      </div></td>
      <td>${campo('inicio', l?.inicio ?? '08:00')}</td>
      <td>${campo('fim', l?.fim ?? '18:00')}</td>
      <td>${campo('pausaDe', l?.pausaDe)}</td>
      <td>${campo('pausaAte', l?.pausaAte)}</td>
    </tr>`;
  }).join('');
  el.grade.querySelectorAll('tr').forEach(atualizarLinhaGrade);
}

function atualizarLinhaGrade(tr) {
  const ativo = tr.querySelector('[data-dia-ativo]').checked;
  tr.querySelectorAll('input[type="time"]').forEach((i) => { i.disabled = !ativo; });
  tr.classList.toggle('text-body-secondary', !ativo);
}

function abrirProfissional(p) {
  const f = el.formProf;
  profEditando = p;
  f.reset();
  limparValidacao(f);
  document.querySelector('.invalid-feedback[data-campo="horarios"]').textContent = '';
  document.getElementById('modal-profissional-titulo').textContent = p ? 'Editar profissional' : 'Novo profissional';

  f.nome.value = p?.nome ?? '';
  f.especialidade.value = p?.especialidade ?? '';
  f.registro.value = p?.registro ?? '';
  f.cor.value = p?.cor ?? CORES_PROFISSIONAL[estado.profissionais.length % CORES_PROFISSIONAL.length];
  f.ativo.checked = p?.ativo ?? true;
  f.aparece_no_site.checked = p?.aparece_no_site ?? true;
  renderGrade(p ? gradeParaTela(p.horarios) : GRADE_PADRAO);

  const marcados = new Set(p ? p.servicos.map((s) => s.servico_id) : estado.servicos.map((s) => s.id));
  el.profServicos.innerHTML = estado.servicos.length
    ? estado.servicos.map((s) => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="ps-${s.id}" value="${s.id}" ${marcados.has(s.id) ? 'checked' : ''}>
          <label class="form-check-label" for="ps-${s.id}">${escapeHtml(s.nome)}${s.ativo ? '' : ' <span class="text-body-secondary">(inativo)</span>'}</label>
        </div>`).join('')
    : '<p class="small text-body-secondary mb-0">Cadastre os serviços primeiro.</p>';
  modalProf.show();
}

async function salvarProfissional(ev) {
  ev.preventDefault();
  const f = el.formProf;
  const fbHorarios = document.querySelector('.invalid-feedback[data-campo="horarios"]');
  fbHorarios.textContent = '';

  const { valido, erros, dados } = validarProfissional({
    nome: f.nome.value, especialidade: f.especialidade.value, registro: f.registro.value, cor: f.cor.value,
    ativo: f.ativo.checked, aparece_no_site: f.aparece_no_site.checked,
    horarios: telaParaGrade(),
    servicos: [...el.profServicos.querySelectorAll('input:checked')].map((i) => i.value),
  });
  if (!valido) {
    if (erros.horarios) fbHorarios.textContent = erros.horarios;
    delete erros.horarios;
    return mostrarErros(f, erros);
  }
  const restaurar = carregando(f.querySelector('button[type="submit"]'));
  try {
    await db.salvarProfissional(estado.clinica.id, profEditando?.id ?? null, dados);
    modalProf.hide();
    toast('Profissional salvo.', 'sucesso');
    await recarregarCadastros();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Salvar profissional'), 'erro');
  } finally {
    restaurar();
  }
}

