// Ponto de entrada do app.html: sessão, escolha da clínica, onboarding, menu e máscaras.
import { exigirSessao, sair } from './auth.js';
import { SEGMENTOS, INDICE_SLUG } from './constants.js';
import { validarNovaClinica, gerarSlug, mascaraTelefone, mascaraCpf, campoDoErro } from './validators.js';
import { mensagemDeErro } from './supabase.js';
import { toast, mostrarErros, marcarInvalido, carregando } from './ui.js';
import * as db from './db.js';
import { estado, recarregarCadastros } from './estado.js';
import { iniciarAgenda, mostrarAgenda } from './agenda.js';
import { iniciarPacientes, mostrarPacientes } from './pacientes.js';
import { iniciarCadastros } from './cadastros.js';
import { iniciarConfigClinica, mostrarConfigClinica } from './config-clinica.js';

const CHAVE_TEMA = 'clinica-tema';
const CHAVE_CLINICA = 'clinica-atual';
const VIEWS = ['agenda', 'pacientes', 'cadastros', 'clinica'];

const aoMostrar = {
  agenda: mostrarAgenda,
  pacientes: mostrarPacientes,
  clinica: mostrarConfigClinica,
};

async function iniciar() {
  const usuario = await exigirSessao();
  if (!usuario) return;
  estado.usuario = usuario;

  document.getElementById('usuario-email').textContent = usuario.email;
  document.getElementById('btn-sair').addEventListener('click', sair);
  document.getElementById('btn-tema').addEventListener('click', alternarTema);
  ligarMascaras(document);

  try {
    const membros = await db.minhasClinicas();
    if (!membros.length) {
      mostrarOnboarding();
      return;
    }
    let escolhida = null;
    try { escolhida = localStorage.getItem(CHAVE_CLINICA); } catch { /* sem storage */ }
    const m = membros.find((x) => x.clinica.id === escolhida) ?? membros[0];
    await entrarNaClinica(m.clinica, m.papel);
  } catch (erro) {
    document.getElementById('carregando-app').textContent = mensagemDeErro(erro, 'Carregar clínica');
  }
}

async function entrarNaClinica(clinica, papel) {
  estado.clinica = clinica;
  estado.papel = papel;
  try { localStorage.setItem(CHAVE_CLINICA, clinica.id); } catch { /* sem storage */ }

  document.getElementById('nome-clinica').textContent = clinica.nome;
  document.title = `${clinica.nome} — Clínica SaaS`;
  await recarregarCadastros();

  iniciarAgenda();
  iniciarPacientes();
  iniciarCadastros();
  iniciarConfigClinica();

  document.getElementById('menu').classList.remove('d-none');
  window.addEventListener('hashchange', rotear);
  rotear();

  // Primeira vez: sem profissionais, a agenda fica vazia. Leva direto ao cadastro.
  if (!estado.profissionais.length && location.hash !== '#cadastros') {
    toast('Comece cadastrando os profissionais e os horários de atendimento.', 'info');
    location.hash = '#cadastros';
  }
}

function rotear() {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'agenda';
  mostrarView(view);
  document.querySelectorAll('#menu .nav-link').forEach((a) => {
    const ativo = a.dataset.view === view;
    a.classList.toggle('active', ativo);
    if (ativo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  aoMostrar[view]?.();
}

function mostrarView(nome) {
  document.getElementById('carregando-app').classList.add('d-none');
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('d-none', v.id !== `view-${nome}`));
}

// ---------------------------------------------------------------------
// Onboarding: usuário sem clínica cria a sua
// ---------------------------------------------------------------------
function mostrarOnboarding() {
  mostrarView('onboarding');
  const form = document.getElementById('form-onboarding');
  form.segmento.innerHTML += SEGMENTOS.map((s) => `<option>${s}</option>`).join('');

  let slugEditado = false;
  form.slug.addEventListener('input', () => { slugEditado = true; });
  form.nome.addEventListener('input', () => {
    if (!slugEditado) form.slug.value = gerarSlug(form.nome.value);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { valido, erros, dados } = validarNovaClinica({
      nome: form.nome.value, slug: form.slug.value, segmento: form.segmento.value,
    });
    if (!valido) return mostrarErros(form, erros);

    const restaurar = carregando(form.querySelector('button[type="submit"]'), 'Criando...');
    try {
      const clinica = await db.criarClinica(dados);
      toast('Clínica criada!', 'sucesso');
      await entrarNaClinica(clinica, 'dono');
    } catch (erro) {
      if (campoDoErro(erro, { [INDICE_SLUG]: 'slug' })) {
        marcarInvalido(form, 'slug', 'Esse endereço já está em uso. Escolha outro.');
      } else {
        toast(mensagemDeErro(erro, 'Criar clínica'), 'erro');
      }
    } finally {
      restaurar();
    }
  });
}

// ---------------------------------------------------------------------
// Utilitários de interface
// ---------------------------------------------------------------------
function ligarMascaras(raiz) {
  const mascaras = { telefone: mascaraTelefone, cpf: mascaraCpf };
  raiz.addEventListener('input', (ev) => {
    const tipo = ev.target.dataset?.mascara;
    if (tipo && mascaras[tipo]) ev.target.value = mascaras[tipo](ev.target.value);
  });
}

function alternarTema() {
  const atual = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.bsTheme = atual;
  try { localStorage.setItem(CHAVE_TEMA, atual); } catch { /* sem storage */ }
}

iniciar();
