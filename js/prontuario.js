// Ficha do paciente (#paciente/<id>): odontograma, orçamentos/tratamento e atendimentos.
import { STATUS_AGENDAMENTO } from './constants.js';
import { formatarTelefone, formatarDataBr, idade, linkWhatsapp } from './validators.js';
import { deMinutos, minutosDoDia } from './agenda-regras.js';
import { mensagemDeErro } from './supabase.js';
import { toast, estadoVazio, escapeHtml } from './ui.js';
import * as db from './db.js';
import { estado } from './estado.js';
import { criarOdontograma } from './odontograma.js';
import { iniciarOrcamentos, carregarOrcamentos, adicionarAoRascunho } from './orcamentos.js';
import { editarPaciente } from './pacientes.js';

const CHAVE_DENTICAO = 'clinica-denticao';

let paciente = null;
let odonto;
let iniciado = false;

const ehOdonto = () => estado.clinica?.segmento === 'Odontologia';

export function iniciarProntuario() {
  if (iniciado) return;
  iniciado = true;
  iniciarOrcamentos();

  odonto = criarOdontograma({
    container: document.getElementById('odontograma'),
    painel: document.getElementById('odonto-painel'),
    legenda: document.getElementById('odonto-legenda'),
    resumo: document.getElementById('odonto-resumo'),
  }, {
    servicos: () => estado.servicos,
    onMarcar: async (dados) => {
      try {
        await db.criarMarcacao(estado.clinica.id, paciente.id, dados);
        await carregarOdontograma();
      } catch (erro) {
        toast(mensagemDeErro(erro, 'Marcar dente'), 'erro');
      }
    },
    onExcluir: async (m) => {
      try {
        await db.excluirMarcacao(estado.clinica.id, m.id);
        await carregarOdontograma();
      } catch (erro) {
        toast(mensagemDeErro(erro, 'Remover registro'), 'erro');
      }
    },
    onOrcar: (item) => adicionarAoRascunho(item),
  });

  let denticao = 'permanentes';
  try { denticao = localStorage.getItem(CHAVE_DENTICAO) || denticao; } catch { /* sem storage */ }
  const radio = document.querySelector(`input[name="denticao"][value="${denticao}"]`);
  if (radio) radio.checked = true;
  odonto.setDenticao(radio ? denticao : 'permanentes');
  document.querySelectorAll('input[name="denticao"]').forEach((r) => r.addEventListener('change', () => {
    odonto.setDenticao(r.value);
    try { localStorage.setItem(CHAVE_DENTICAO, r.value); } catch { /* sem storage */ }
  }));

  document.getElementById('pront-editar').addEventListener('click', () =>
    editarPaciente(paciente, (salvo) => { paciente = salvo; renderCabecalho(); }));
  document.getElementById('aba-historico').addEventListener('shown.bs.tab', carregarHistorico);
}

export async function abrirProntuario(id) {
  if (paciente?.id !== id) {
    paciente = null;
    odonto.reiniciar();
    document.getElementById('pront-nome').textContent = 'Carregando...';
    document.getElementById('pront-info').textContent = '';
  }
  try {
    const p = await db.pacientePorId(estado.clinica.id, id);
    if (!p) {
      toast('Paciente não encontrado.', 'aviso');
      location.hash = '#pacientes';
      return;
    }
    const mesmo = paciente?.id === p.id;
    paciente = p;
    renderCabecalho();

    const odontoVisivel = ehOdonto();
    document.getElementById('aba-odonto-item').classList.toggle('d-none', !odontoVisivel);
    if (!mesmo) {
      const aba = odontoVisivel ? 'aba-odonto' : 'aba-orcamentos';
      bootstrap.Tab.getOrCreateInstance(document.getElementById(aba)).show();
    }

    await Promise.all([
      odontoVisivel ? carregarOdontograma() : null,
      carregarOrcamentos(paciente),
    ]);
    if (document.getElementById('aba-historico').classList.contains('active')) carregarHistorico();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Abrir ficha'), 'erro');
  }
}

function renderCabecalho() {
  document.getElementById('pront-nome').textContent = paciente.nome;
  const anos = idade(paciente.data_nascimento);
  document.getElementById('pront-info').textContent = [
    formatarTelefone(paciente.telefone),
    anos !== null ? `${anos} anos` : null,
    paciente.observacoes ? `Obs.: ${paciente.observacoes}` : null,
  ].filter(Boolean).join(' · ');
  const zap = linkWhatsapp(paciente.telefone);
  const btn = document.getElementById('pront-whatsapp');
  btn.classList.toggle('d-none', !zap);
  if (zap) btn.href = zap;
}

async function carregarOdontograma() {
  const marcacoes = await db.listarMarcacoes(estado.clinica.id, paciente.id);
  odonto.render(marcacoes);
}

async function carregarHistorico() {
  const box = document.getElementById('pront-historico');
  if (!paciente) return;
  box.innerHTML = '<span class="text-body-secondary small">Carregando...</span>';
  try {
    const itens = await db.historicoPaciente(estado.clinica.id, paciente.id);
    if (!itens.length) {
      estadoVazio(box, { icone: 'bi-calendar', titulo: 'Nenhum atendimento ainda' });
      return;
    }
    box.innerHTML = `<ul class="list-group">${itens.map((a) => {
      const st = STATUS_AGENDAMENTO[a.status];
      return `<li class="list-group-item d-flex flex-wrap gap-2 align-items-center">
        <span class="text-nowrap">${formatarDataBr(a.inicio)} ${deMinutos(minutosDoDia(a.inicio))}</span>
        <span class="me-auto">${escapeHtml(a.servico?.nome ?? 'Atendimento')} · ${escapeHtml(a.profissional?.nome ?? '')}</span>
        ${a.origem === 'site' ? '<i class="bi bi-globe2 text-body-secondary" title="Agendado pelo site" aria-label="Agendado pelo site"></i>' : ''}
        <span class="badge text-bg-${st.cor}">${st.rotulo}</span>
      </li>`;
    }).join('')}</ul>`;
  } catch (erro) {
    box.textContent = mensagemDeErro(erro, 'Histórico');
  }
}
