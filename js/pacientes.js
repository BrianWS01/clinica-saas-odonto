// Lista, busca e cadastro de pacientes.
import { ORIGENS_PACIENTE, INDICE_CPF } from './constants.js';
import {
  validarPaciente, formatarTelefone, formatarCpf, idade, linkWhatsapp, campoDoErro,
} from './validators.js';
import { mensagemDeErro } from './supabase.js';
import { toast, confirmar, estadoVazio, mostrarErros, limparValidacao, marcarInvalido, carregando, escapeHtml } from './ui.js';
import * as db from './db.js';
import { estado, ehAdmin } from './estado.js';

const BUSCA_ESPERA_MS = 300;

let el;
let modal;
let editando = null;
let aoSalvar = null;
let iniciado = false;

export function iniciarPacientes() {
  if (iniciado) return;
  iniciado = true;
  el = {
    busca: document.getElementById('pac-busca'),
    lista: document.getElementById('pac-lista'),
    form: document.getElementById('form-paciente'),
    excluir: document.getElementById('pac-excluir'),
  };
  modal = new bootstrap.Modal('#modal-paciente');
  el.form.origem.innerHTML = ORIGENS_PACIENTE.map((o) => `<option>${o}</option>`).join('');

  let timer;
  el.busca.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(carregar, BUSCA_ESPERA_MS);
  });
  document.getElementById('pac-novo').addEventListener('click', () => editarPaciente(null));
  el.form.addEventListener('submit', salvar);
  el.excluir.addEventListener('click', excluir);
}

export function mostrarPacientes() {
  carregar();
}

let ultimaBusca = 0;
async function carregar() {
  const minha = ++ultimaBusca;
  const termo = el.busca.value;
  try {
    const lista = await db.buscarPacientes(estado.clinica.id, termo);
    if (minha !== ultimaBusca) return;
    render(lista, termo);
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Carregar pacientes'), 'erro');
  }
}

function render(lista, termo) {
  if (!lista.length) {
    estadoVazio(el.lista, termo.trim()
      ? { icone: 'bi-search', titulo: 'Nenhum paciente encontrado', texto: 'Confira o nome ou busque pelo telefone.' }
      : { icone: 'bi-people', titulo: 'Nenhum paciente ainda',
          texto: 'Cadastre aqui ou deixe que eles mesmos se cadastrem ao agendar pelo site.',
          acoes: [{ texto: 'Novo paciente', icone: 'bi-plus-lg', onClick: () => editarPaciente(null) }] });
    return;
  }
  el.lista.innerHTML = `
    <div class="table-responsive card">
      <table class="table table-hover align-middle mb-0">
        <thead><tr>
          <th scope="col">Nome</th><th scope="col">Telefone</th>
          <th scope="col" class="d-none d-md-table-cell">CPF</th>
          <th scope="col" class="d-none d-md-table-cell">Idade</th>
          <th scope="col" class="d-none d-lg-table-cell">Origem</th>
          <th scope="col"><span class="visually-hidden">Ações</span></th>
        </tr></thead>
        <tbody>${lista.map((p) => `
          <tr data-id="${p.id}" class="linha-clicavel">
            <td class="fw-semibold">${escapeHtml(p.nome)}</td>
            <td class="text-nowrap">${formatarTelefone(p.telefone)}</td>
            <td class="d-none d-md-table-cell text-nowrap">${p.cpf ? formatarCpf(p.cpf) : ''}</td>
            <td class="d-none d-md-table-cell">${idade(p.data_nascimento) ?? ''}</td>
            <td class="d-none d-lg-table-cell"><span class="badge text-bg-light border">${escapeHtml(p.origem)}</span></td>
            <td class="text-end">${linkWhatsapp(p.telefone) ? `
              <a class="btn btn-sm btn-outline-success" href="${linkWhatsapp(p.telefone)}" target="_blank" rel="noopener"
                 title="Abrir conversa no WhatsApp" aria-label="WhatsApp de ${escapeHtml(p.nome)}"><i class="bi bi-whatsapp" aria-hidden="true"></i></a>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${lista.length >= 200 ? '<p class="small text-body-secondary mt-2">Mostrando os 200 primeiros. Use a busca para encontrar outros.</p>' : ''}`;

  el.lista.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    location.hash = `#paciente/${tr.dataset.id}`;
  }));
}

/** Abre o cadastro (novo ou edição). aoSalvarFn(salvo) é chamado depois de gravar. */
export function editarPaciente(paciente, aoSalvarFn = null) {
  const f = el.form;
  editando = paciente;
  aoSalvar = aoSalvarFn;
  f.reset();
  limparValidacao(f);
  document.getElementById('modal-paciente-titulo').textContent = paciente ? paciente.nome : 'Novo paciente';
  el.excluir.classList.toggle('d-none', !paciente || !ehAdmin());

  if (paciente) {
    f.nome.value = paciente.nome;
    f.telefone.value = formatarTelefone(paciente.telefone);
    f.cpf.value = paciente.cpf ? formatarCpf(paciente.cpf) : '';
    f.data_nascimento.value = paciente.data_nascimento ?? '';
    f.origem.value = paciente.origem;
    f.email.value = paciente.email ?? '';
    f.observacoes.value = paciente.observacoes ?? '';
  }
  modal.show();
}

async function salvar(ev) {
  ev.preventDefault();
  const f = el.form;
  const { valido, erros, dados } = validarPaciente({
    nome: f.nome.value, telefone: f.telefone.value, cpf: f.cpf.value, email: f.email.value,
    data_nascimento: f.data_nascimento.value, origem: f.origem.value, observacoes: f.observacoes.value,
  });
  if (!valido) return mostrarErros(f, erros);

  const restaurar = carregando(f.querySelector('button[type="submit"]'));
  try {
    const salvo = await db.salvarPaciente(estado.clinica.id, editando?.id ?? null, dados);
    modal.hide();
    toast(editando ? 'Paciente atualizado.' : 'Paciente cadastrado.', 'sucesso');
    if (aoSalvar) aoSalvar(salvo);
    else if (!editando) location.hash = `#paciente/${salvo.id}`;
    else carregar();
  } catch (erro) {
    if (campoDoErro(erro, { [INDICE_CPF]: 'cpf' })) marcarInvalido(f, 'cpf', 'Já existe um paciente com esse CPF.');
    else toast(mensagemDeErro(erro, 'Salvar paciente'), 'erro');
  } finally {
    restaurar();
  }
}

async function excluir() {
  if (!editando) return;
  const ok = await confirmar({
    titulo: 'Excluir paciente',
    mensagem: `Excluir ${editando.nome} e todo o histórico de agendamentos? Isso não pode ser desfeito.`,
    textoBotao: 'Excluir', perigo: true,
  });
  if (!ok) return;
  try {
    await db.excluirPaciente(estado.clinica.id, editando.id);
    modal.hide();
    toast('Paciente excluído.', 'sucesso');
    if (location.hash !== '#pacientes') location.hash = '#pacientes';
    else carregar();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Excluir paciente'), 'erro');
  }
}
