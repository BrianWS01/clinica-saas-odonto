// Agenda do dia: uma coluna por profissional, clique no horário vazio para agendar.
import { STATUS_AGENDAMENTO, DIAS_SEMANA, CONSTRAINT_CONFLITO_AGENDA } from './constants.js';
import {
  hojeIso, formatarTelefone, linkWhatsapp, validarAgendamento, validarPaciente, campoDoErro, textoOuNull,
} from './validators.js';
import {
  deMinutos, minutosDoDia, somarDias, diaDaSemana, limitesDoDia, janelaDoDia,
  linhasDaGrade, dentroDoExpediente, posicaoNaGrade, distribuirSobrepostos, resumoDoDia, mensagemConfirmacao,
} from './agenda-regras.js';
import { mensagemDeErro } from './supabase.js';
import {
  toast, confirmar, estadoVazio, mostrarErros, limparValidacao, marcarInvalido, carregando, escapeHtml,
} from './ui.js';
import * as db from './db.js';
import { estado, aoMudarCadastros, profissionalPorId, servicoPorId } from './estado.js';

const PASSO_GRADE = 30;    // minutos por linha desenhada
const ALTURA_LINHA = 48;   // px por linha (manter igual ao --agenda-linha do CSS)
const BUSCA_ESPERA_MS = 250;

const ag = {
  data: hojeIso(),
  filtroProf: '',
  agendamentos: [],
  bloqueios: [],
  carregando: false,
  editando: null,
};

let el;
let modalAg;
let modalBlq;
let iniciado = false;

export function iniciarAgenda() {
  if (iniciado) return;
  iniciado = true;
  el = {
    titulo: document.getElementById('ag-titulo'),
    data: document.getElementById('ag-data'),
    filtro: document.getElementById('ag-profissional'),
    resumo: document.getElementById('ag-resumo'),
    grade: document.getElementById('ag-grade'),
    form: document.getElementById('form-agendamento'),
    formBlq: document.getElementById('form-bloqueio'),
  };
  modalAg = new bootstrap.Modal('#modal-agendamento');
  modalBlq = new bootstrap.Modal('#modal-bloqueio');

  document.getElementById('ag-anterior').addEventListener('click', () => irPara(somarDias(ag.data, -1)));
  document.getElementById('ag-proximo').addEventListener('click', () => irPara(somarDias(ag.data, 1)));
  document.getElementById('ag-hoje').addEventListener('click', () => irPara(hojeIso()));
  el.data.addEventListener('change', () => el.data.value && irPara(el.data.value));
  el.filtro.addEventListener('change', () => { ag.filtroProf = el.filtro.value; render(); });
  document.getElementById('ag-novo').addEventListener('click', () => abrirAgendamento(null, { data: ag.data }));
  document.getElementById('ag-bloquear').addEventListener('click', abrirBloqueio);

  prepararFormAgendamento();
  prepararFormBloqueio();
  aoMudarCadastros(() => { preencherFiltro(); render(); });
  preencherFiltro();
}

export function mostrarAgenda() {
  carregar();
}

function irPara(data) {
  ag.data = data;
  carregar();
}

async function carregar() {
  el.data.value = ag.data;
  const [a, m, d] = ag.data.split('-');
  const hoje = ag.data === hojeIso() ? ' · hoje' : '';
  el.titulo.textContent = `${DIAS_SEMANA[diaDaSemana(ag.data)]}, ${d}/${m}/${a}${hoje}`;

  const { de, ate } = limitesDoDia(ag.data);
  ag.carregando = true;
  try {
    const [agendamentos, bloqueios] = await Promise.all([
      db.agendamentosDoPeriodo(estado.clinica.id, de, ate),
      db.bloqueiosDoPeriodo(estado.clinica.id, de, ate),
    ]);
    ag.agendamentos = agendamentos;
    ag.bloqueios = bloqueios;
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Carregar agenda'), 'erro');
  } finally {
    ag.carregando = false;
  }
  render();
}

function preencherFiltro() {
  const atual = el.filtro.value;
  el.filtro.innerHTML = '<option value="">Todos os profissionais</option>' +
    estado.profissionais.filter((p) => p.ativo)
      .map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
  el.filtro.value = estado.profissionais.some((p) => p.id === atual) ? atual : '';
  ag.filtroProf = el.filtro.value;
}

// ---------------------------------------------------------------------
// Desenho da grade
// ---------------------------------------------------------------------
function colunasVisiveis() {
  const comAgenda = new Set(ag.agendamentos.map((a) => a.profissional_id));
  return estado.profissionais.filter((p) =>
    (p.ativo || comAgenda.has(p.id)) && (!ag.filtroProf || p.id === ag.filtroProf));
}

function render() {
  if (!el) return;
  renderResumo();

  const profs = colunasVisiveis();
  if (!profs.length) {
    estadoVazio(el.grade, {
      icone: 'bi-person-badge',
      titulo: 'Nenhum profissional cadastrado',
      texto: 'Cadastre os profissionais e o horário de atendimento de cada um para montar a agenda.',
      acoes: [{ texto: 'Cadastrar profissional', icone: 'bi-plus-lg', onClick: () => { location.hash = '#cadastros'; } }],
    });
    return;
  }

  const dow = diaDaSemana(ag.data);
  const gradeDoDia = (p) => (p.horarios ?? []).filter((h) => h.dia_semana === dow);
  const janela = janelaDoDia(profs.flatMap(gradeDoDia), ag.agendamentos);
  const linhas = linhasDaGrade(janela, PASSO_GRADE);

  const cabecalho = profs.map((p) => `
    <div class="agenda-cab" style="--prof:${p.cor}">
      <span class="agenda-bolinha" aria-hidden="true"></span>
      <span class="text-truncate">${escapeHtml(p.nome)}</span>
      ${p.ativo ? '' : '<span class="badge text-bg-secondary ms-1">inativo</span>'}
    </div>`).join('');

  const horas = linhas.map((m) => `<div class="agenda-hora">${m % 60 === 0 ? deMinutos(m) : ''}</div>`).join('');

  const colunas = profs.map((p) => {
    const grade = gradeDoDia(p);
    const fundo = linhas.map((m) => `
      <button type="button" class="agenda-slot ${dentroDoExpediente(grade, m) ? '' : 'fora'}"
              data-prof="${p.id}" data-min="${m}" aria-label="Agendar ${deMinutos(m)} com ${escapeHtml(p.nome)}"></button>`).join('');

    const bloqueios = ag.bloqueios
      .filter((b) => !b.profissional_id || b.profissional_id === p.id)
      .map((b) => {
        const pos = posicaoNaGrade(b, janela, PASSO_GRADE);
        return `<button type="button" class="agenda-bloqueio" data-bloqueio="${b.id}"
                  style="top:${pos.topo * ALTURA_LINHA}px;height:${pos.altura * ALTURA_LINHA}px"
                  title="Bloqueado${b.motivo ? `: ${escapeHtml(b.motivo)}` : ''} (clique para remover)">
                  <i class="bi bi-slash-circle me-1" aria-hidden="true"></i>${escapeHtml(b.motivo ?? 'Bloqueado')}
                </button>`;
      }).join('');

    const itens = distribuirSobrepostos(ag.agendamentos.filter((a) => a.profissional_id === p.id))
      .map((a) => {
        const pos = posicaoNaGrade(a, janela, PASSO_GRADE);
        const st = STATUS_AGENDAMENTO[a.status];
        const largura = 100 / a.colunas;
        return `
          <button type="button" class="agenda-item status-${a.status}${pos.altura <= 1 ? ' curto' : ''}" data-agendamento="${a.id}"
                  style="--prof:${p.cor};top:${pos.topo * ALTURA_LINHA}px;height:${pos.altura * ALTURA_LINHA - 2}px;left:${a.coluna * largura}%;width:calc(${largura}% - 4px)"
                  title="${escapeHtml(`${deMinutos(minutosDoDia(a.inicio))} ${a.paciente?.nome ?? ''} — ${st.rotulo}`)}">
            <span class="agenda-item-hora">${deMinutos(minutosDoDia(a.inicio))}
              <i class="bi ${st.icone}" aria-label="${st.rotulo}"></i>
              ${a.origem === 'site' ? '<i class="bi bi-globe2" aria-label="Agendado pelo site"></i>' : ''}
            </span>
            <span class="agenda-item-nome">${escapeHtml(a.paciente?.nome ?? '')}</span>
            ${a.servico ? `<span class="agenda-item-serv">${escapeHtml(a.servico.nome)}</span>` : ''}
          </button>`;
      }).join('');

    return `<div class="agenda-col" style="height:${linhas.length * ALTURA_LINHA}px">${fundo}${bloqueios}${itens}</div>`;
  }).join('');

  el.grade.innerHTML = `
    <div class="agenda" style="--cols:${profs.length}">
      <div class="agenda-canto"></div>${cabecalho}
      <div class="agenda-horas">${horas}</div>${colunas}
    </div>`;

  el.grade.querySelectorAll('.agenda-slot').forEach((b) => b.addEventListener('click', () =>
    abrirAgendamento(null, { profissional_id: b.dataset.prof, data: ag.data, hora: deMinutos(Number(b.dataset.min)) })));
  el.grade.querySelectorAll('.agenda-item').forEach((b) => b.addEventListener('click', () =>
    abrirAgendamento(ag.agendamentos.find((a) => a.id === b.dataset.agendamento))));
  el.grade.querySelectorAll('.agenda-bloqueio').forEach((b) => b.addEventListener('click', () =>
    removerBloqueio(b.dataset.bloqueio)));
}

function renderResumo() {
  const r = resumoDoDia(ag.agendamentos);
  el.resumo.innerHTML = `<span class="badge rounded-pill text-bg-light border">${r.ativos} atendimento${r.ativos === 1 ? '' : 's'}</span>` +
    Object.entries(STATUS_AGENDAMENTO)
      .filter(([k]) => r.porStatus[k])
      .map(([k, s]) => `<span class="badge rounded-pill text-bg-${s.cor}"><i class="bi ${s.icone} me-1" aria-hidden="true"></i>${s.rotulo}: ${r.porStatus[k]}</span>`)
      .join('');
}

// ---------------------------------------------------------------------
// Modal de agendamento
// ---------------------------------------------------------------------
function prepararFormAgendamento() {
  const f = el.form;
  const busca = document.getElementById('agd-busca-paciente');
  const resultados = document.getElementById('agd-resultados');
  let timer;
  let ultimaBusca = 0;

  busca.addEventListener('input', () => {
    clearTimeout(timer);
    const termo = busca.value.trim();
    if (termo.length < 2) { resultados.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const minha = ++ultimaBusca;
      try {
        const lista = await db.buscarPacientes(estado.clinica.id, termo);
        if (minha !== ultimaBusca) return; // chegou uma busca mais nova
        resultados.innerHTML = lista.length
          ? lista.slice(0, 8).map((p) => `
              <button type="button" class="list-group-item list-group-item-action py-1" data-id="${p.id}" data-nome="${escapeHtml(p.nome)}">
                ${escapeHtml(p.nome)} <span class="text-body-secondary small">${formatarTelefone(p.telefone)}</span>
              </button>`).join('')
          : '<div class="list-group-item small text-body-secondary">Nenhum paciente encontrado. Use o cadastro rápido abaixo.</div>';
      } catch (erro) {
        resultados.innerHTML = '';
        toast(mensagemDeErro(erro, 'Buscar paciente'), 'erro');
      }
    }, BUSCA_ESPERA_MS);
  });

  resultados.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-id]');
    if (b) escolherPaciente({ id: b.dataset.id, nome: b.dataset.nome });
  });
  document.getElementById('agd-trocar-paciente').addEventListener('click', () => escolherPaciente(null));

  f.servico_id.addEventListener('change', () => {
    const s = servicoPorId(f.servico_id.value);
    if (s) f.duracao_min.value = s.duracao_min;
  });

  f.addEventListener('submit', salvarAgendamento);
}

function escolherPaciente(p) {
  const f = el.form;
  f.paciente_id.value = p?.id ?? '';
  document.getElementById('agd-paciente-nome').textContent = p?.nome ?? '';
  document.getElementById('agd-paciente-escolhido').classList.toggle('d-none', !p);
  document.getElementById('agd-paciente-busca').classList.toggle('d-none', Boolean(p));
  document.getElementById('agd-resultados').innerHTML = '';
  document.querySelector('.invalid-feedback[data-campo="paciente_id"]').classList.remove('d-block');
  if (!p) document.getElementById('agd-busca-paciente').focus();
}

function opcoes(lista, selecionado, vazio = null) {
  return (vazio ? `<option value="">${vazio}</option>` : '') +
    lista.map((x) => `<option value="${x.id}" ${x.id === selecionado ? 'selected' : ''}>${escapeHtml(x.nome)}</option>`).join('');
}

function abrirAgendamento(agendamento, padrao = {}) {
  const f = el.form;
  ag.editando = agendamento ?? null;
  f.reset();
  limparValidacao(f);
  document.getElementById('agd-busca-paciente').value = '';
  bootstrap.Collapse.getOrCreateInstance('#agd-rapido', { toggle: false }).hide();

  const profId = agendamento?.profissional_id ?? padrao.profissional_id ?? (ag.filtroProf || null);
  const servId = agendamento?.servico_id ?? null;
  const profs = estado.profissionais.filter((p) => p.ativo || p.id === profId);
  const servs = estado.servicos.filter((s) => s.ativo || s.id === servId);
  f.profissional_id.innerHTML = opcoes(profs, profId, profId ? null : 'Escolha...');
  f.servico_id.innerHTML = opcoes(servs, servId, '— Sem serviço definido —');

  const acoes = document.getElementById('agd-acoes');
  document.getElementById('modal-agendamento-titulo').textContent = agendamento ? 'Agendamento' : 'Novo agendamento';

  if (agendamento) {
    escolherPaciente(agendamento.paciente);
    f.data.value = hojeIso(new Date(agendamento.inicio));
    f.hora.value = deMinutos(minutosDoDia(agendamento.inicio));
    f.duracao_min.value = Math.round((new Date(agendamento.fim) - new Date(agendamento.inicio)) / 60000);
    f.observacoes.value = agendamento.observacoes ?? '';
    acoes.classList.remove('d-none');
    renderAcoes(agendamento);
  } else {
    escolherPaciente(null);
    f.data.value = padrao.data ?? ag.data;
    f.hora.value = padrao.hora ?? '';
    f.duracao_min.value = estado.clinica.intervalo_agenda_min;
    acoes.classList.add('d-none');
  }
  modalAg.show();
}

function renderAcoes(a) {
  const barra = document.getElementById('agd-status');
  barra.innerHTML = Object.entries(STATUS_AGENDAMENTO).map(([k, s]) => `
    <button type="button" class="btn ${a.status === k ? `btn-${s.cor}` : `btn-outline-${s.cor}`}" data-status="${k}"
            aria-pressed="${a.status === k}">
      <i class="bi ${s.icone} me-1" aria-hidden="true"></i>${s.rotulo}
    </button>`).join('');
  barra.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => mudarStatus(a, b.dataset.status)));

  const prof = profissionalPorId(a.profissional_id);
  const link = linkWhatsapp(a.paciente?.telefone, mensagemConfirmacao({
    paciente: a.paciente?.nome, clinica: estado.clinica.nome, profissional: prof?.nome,
    servico: a.servico?.nome, inicio: a.inicio,
  }));
  const zap = document.getElementById('agd-whatsapp');
  zap.classList.toggle('d-none', !link);
  if (link) zap.href = link;

  document.getElementById('agd-origem').textContent =
    a.origem === 'site' ? 'Agendado pelo paciente no site.' : '';
}

async function mudarStatus(a, status) {
  if (status === a.status) return;
  if (status === 'cancelado' && !(await confirmar({
    titulo: 'Cancelar agendamento', mensagem: 'O horário fica livre para outro paciente. Confirmar?',
    textoBotao: 'Cancelar agendamento', perigo: true,
  }))) return;
  try {
    const salvo = await db.mudarStatus(estado.clinica.id, a.id, status);
    Object.assign(a, { status: salvo.status });
    renderAcoes(a);
    render();
    toast(`Marcado como ${STATUS_AGENDAMENTO[status].rotulo.toLowerCase()}.`, 'sucesso');
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Mudar situação'), 'erro');
  }
}

async function salvarAgendamento(ev) {
  ev.preventDefault();
  const f = el.form;
  limparValidacao(f);
  const botao = document.getElementById('agd-salvar');

  // Paciente novo pelo cadastro rápido
  let pacienteId = f.paciente_id.value;
  let novoPaciente = null;
  if (!pacienteId && (textoOuNull(f.rapido_nome.value) || textoOuNull(f.rapido_telefone.value))) {
    const p = validarPaciente({ nome: f.rapido_nome.value, telefone: f.rapido_telefone.value });
    if (!p.valido) {
      bootstrap.Collapse.getOrCreateInstance('#agd-rapido').show();
      const errosRapido = {};
      if (p.erros.nome) errosRapido.rapido_nome = p.erros.nome;
      if (p.erros.telefone) errosRapido.rapido_telefone = p.erros.telefone;
      return mostrarErros(f, errosRapido);
    }
    novoPaciente = p.dados;
    pacienteId = 'novo';
  }

  const { valido, erros, dados } = validarAgendamento({
    paciente_id: pacienteId,
    profissional_id: f.profissional_id.value,
    servico_id: f.servico_id.value,
    data: f.data.value,
    hora: f.hora.value,
    duracao_min: f.duracao_min.value,
    observacoes: f.observacoes.value,
  });
  if (!valido) {
    if (erros.paciente_id) {
      const fb = document.querySelector('.invalid-feedback[data-campo="paciente_id"]');
      fb.textContent = 'Busque um paciente ou use o cadastro rápido.';
      fb.classList.add('d-block');
      delete erros.paciente_id;
    }
    return mostrarErros(f, erros);
  }

  const restaurar = carregando(botao);
  try {
    if (novoPaciente) {
      const criado = await db.salvarPaciente(estado.clinica.id, null, novoPaciente);
      dados.paciente_id = criado.id;
      escolherPaciente(criado); // se o agendamento falhar, não cria o paciente de novo
    }
    await db.salvarAgendamento(estado.clinica.id, ag.editando?.id ?? null, dados);
    modalAg.hide();
    toast(ag.editando ? 'Agendamento atualizado.' : 'Agendado!', 'sucesso');
    if (f.data.value !== ag.data) ag.data = f.data.value;
    await carregar();
  } catch (erro) {
    if (erro?.code === '23P01' || campoDoErro(erro, { [CONSTRAINT_CONFLITO_AGENDA]: 'hora' })) {
      marcarInvalido(f, 'hora', 'Esse profissional já tem atendimento nesse horário.');
      f.hora.focus();
    } else {
      toast(mensagemDeErro(erro, 'Salvar agendamento'), 'erro');
    }
  } finally {
    restaurar();
  }
}

// ---------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------
function prepararFormBloqueio() {
  el.formBlq.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = el.formBlq;
    limparValidacao(f);
    const erros = {};
    if (!f.inicio.value) erros.inicio = 'Informe o início.';
    if (!f.fim.value) erros.fim = 'Informe o fim.';
    else if (f.inicio.value && f.fim.value <= f.inicio.value) erros.fim = 'O fim precisa ser depois do início.';
    if (Object.keys(erros).length) return mostrarErros(f, erros);

    const restaurar = carregando(f.querySelector('button[type="submit"]'));
    try {
      await db.salvarBloqueio(estado.clinica.id, {
        profissional_id: f.profissional_id.value || null,
        inicio: new Date(f.inicio.value).toISOString(),
        fim: new Date(f.fim.value).toISOString(),
        motivo: textoOuNull(f.motivo.value),
      });
      modalBlq.hide();
      toast('Horário bloqueado.', 'sucesso');
      await carregar();
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Bloquear horário'), 'erro');
    } finally {
      restaurar();
    }
  });
}

function abrirBloqueio() {
  const f = el.formBlq;
  f.reset();
  limparValidacao(f);
  f.profissional_id.innerHTML = '<option value="">Toda a clínica</option>' +
    opcoes(estado.profissionais.filter((p) => p.ativo), ag.filtroProf);
  f.inicio.value = `${ag.data}T08:00`;
  f.fim.value = `${ag.data}T18:00`;
  modalBlq.show();
}

async function removerBloqueio(id) {
  const b = ag.bloqueios.find((x) => x.id === id);
  if (!b) return;
  if (!(await confirmar({
    titulo: 'Remover bloqueio',
    mensagem: `Liberar de novo este horário${b.motivo ? ` (${b.motivo})` : ''}?`,
    textoBotao: 'Remover bloqueio',
  }))) return;
  try {
    await db.excluirBloqueio(estado.clinica.id, id);
    toast('Bloqueio removido.', 'sucesso');
    await carregar();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Remover bloqueio'), 'erro');
  }
}

