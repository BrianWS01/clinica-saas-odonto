// Site público da clínica: vitrine + agendamento online. Endereço: site/?c=<slug>
// Usa só as funções públicas do banco (site_clinica, horarios_livres, agendar_online).
import { supabase } from '../js/supabase.js';
import { escapeHtml } from '../js/ui.js';
import { normalizarTelefone, mascaraTelefone, linkWhatsapp, formatarTelefone, formatarMoeda } from '../js/validators.js';
import { DIAS_SEMANA_CURTO, DIAS_SEMANA } from '../js/constants.js';
import {
  proximosDias, agruparHorarios, porTurno, escolherProfissional, horaNoFuso, dataNoFuso, iniciais,
} from '../js/site-regras.js';

const DIAS_VISIVEIS = 14;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TEXTO_SEGMENTO = {
  Odontologia: 'Cuidado completo com o seu sorriso, do check-up aos tratamentos estéticos.',
  'Estética': 'Tratamentos estéticos com segurança, avaliação individual e resultados naturais.',
  Beleza: 'Cabelo, unhas e beleza com profissionais que cuidam de cada detalhe.',
};

const slug = new URLSearchParams(location.search).get('c')?.trim().toLowerCase() ?? '';
const $ = (id) => document.getElementById(id);

const escolha = { servico: null, profissional: null, data: null, inicio: null, profissionalReal: null };
let clinica;
let livresDoDia = [];

async function iniciar() {
  if (!slug) return falhar('Clínica não informada', 'O endereço precisa terminar com ?c=nome-da-clinica.');
  const { data, error } = await supabase.rpc('site_clinica', { p_slug: slug });
  if (error) return falhar('Não foi possível carregar', 'Tente de novo em alguns instantes.');
  if (!data) return falhar('Página não encontrada', 'Confira o endereço digitado.');
  clinica = data;

  aplicarMarca();
  renderVitrine();
  prepararAgendador();
  $('carregando').classList.add('d-none');
  $('site').classList.remove('d-none');
}

function falhar(titulo, texto) {
  $('carregando').classList.add('d-none');
  $('erro-titulo').textContent = titulo;
  $('erro-texto').textContent = texto;
  $('erro').classList.replace('d-none', 'd-flex');
}

// ---------------------------------------------------------------------
// Vitrine
// ---------------------------------------------------------------------
function aplicarMarca() {
  document.documentElement.style.setProperty('--marca', clinica.cor_primaria);
  document.title = `${clinica.nome}${clinica.cidade ? ` — ${clinica.cidade}` : ''}`;
  document.querySelector('meta[name="description"]').content =
    `${clinica.nome}: ${clinica.segmento.toLowerCase()}${clinica.cidade ? ` em ${clinica.cidade}` : ''}. Agende online.`;
}

function renderVitrine() {
  const c = clinica;
  $('marca').innerHTML = `<span class="marca-icone">${escapeHtml(iniciais(c.nome))}</span>${escapeHtml(c.nome)}`;
  $('hero-segmento').textContent = c.segmento + (c.cidade ? ` · ${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '');
  $('hero-titulo').textContent = c.nome;
  $('hero-texto').textContent = c.sobre || TEXTO_SEGMENTO[c.segmento] || '';
  $('rodape-nome').textContent = `© ${new Date().getFullYear()} ${c.nome}`;

  const zap = linkWhatsapp(c.whatsapp, `Olá! Vim pelo site da ${c.nome}.`);
  if (zap) {
    for (const id of ['hero-whatsapp', 'whatsapp-flutuante']) {
      $(id).href = zap;
      $(id).classList.remove('d-none');
    }
  }

  const podeOnline = c.agendamento_online && c.servicos.some((s) => s.online) && c.profissionais.length;
  document.querySelectorAll('[data-so-online]').forEach((e) => e.classList.toggle('d-none', !podeOnline));

  $('lista-servicos').innerHTML = c.servicos.length
    ? c.servicos.map((s) => `
        <div class="col-sm-6 col-lg-4">
          <article class="cartao h-100">
            <h3 class="h6 fw-bold mb-1">${escapeHtml(s.nome)}</h3>
            ${s.descricao ? `<p class="small text-body-secondary mb-2">${escapeHtml(s.descricao)}</p>` : ''}
            <div class="small d-flex gap-3 text-body-secondary mt-auto">
              <span><i class="bi bi-clock me-1" aria-hidden="true"></i>${s.duracao_min} min</span>
              ${s.preco !== null ? `<span><i class="bi bi-tag me-1" aria-hidden="true"></i>${formatarMoeda(s.preco)}</span>` : ''}
            </div>
          </article>
        </div>`).join('')
    : '<p class="text-body-secondary">Em breve.</p>';

  if (!c.profissionais.length) {
    $('equipe').classList.add('d-none');
    $('link-equipe').classList.add('d-none');
  }
  $('lista-equipe').innerHTML = c.profissionais.map((p) => `
    <div class="col-sm-6 col-lg-3">
      <article class="cartao text-center h-100">
        <span class="avatar mx-auto mb-2">${escapeHtml(iniciais(p.nome))}</span>
        <h3 class="h6 fw-bold mb-0">${escapeHtml(p.nome)}</h3>
        ${p.especialidade ? `<p class="small text-body-secondary mb-0">${escapeHtml(p.especialidade)}</p>` : ''}
        ${p.registro ? `<p class="small text-body-secondary mb-0">${escapeHtml(p.registro)}</p>` : ''}
      </article>
    </div>`).join('');

  const contato = [];
  if (c.endereco || c.cidade) {
    const endereco = [c.endereco, c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ''}`].filter(Boolean).join(' — ');
    const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    contato.push(itemContato('bi-geo-alt', 'Endereço', `<a href="${mapa}" target="_blank" rel="noopener">${escapeHtml(endereco)}</a>`));
  }
  if (c.telefone) contato.push(itemContato('bi-telephone', 'Telefone', `<a href="tel:+${c.telefone}">${formatarTelefone(c.telefone)}</a>`));
  if (zap) contato.push(itemContato('bi-whatsapp', 'WhatsApp', `<a href="${zap}" target="_blank" rel="noopener">${formatarTelefone(c.whatsapp)}</a>`));
  if (c.email) contato.push(itemContato('bi-envelope', 'E-mail', `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`));
  $('contato-itens').innerHTML = contato.join('') || '<p class="text-body-secondary">Fale com a gente pelo agendamento online.</p>';
}

function itemContato(icone, titulo, conteudo) {
  return `<div class="col-md-6 col-lg-3"><div class="cartao h-100">
    <i class="bi ${icone} fs-4 cor-marca" aria-hidden="true"></i>
    <div class="small text-body-secondary mt-2">${titulo}</div>
    <div class="fw-semibold text-break">${conteudo}</div>
  </div></div>`;
}

// ---------------------------------------------------------------------
// Agendador em passos
// ---------------------------------------------------------------------
function prepararAgendador() {
  renderServicos();
  document.querySelectorAll('[data-voltar]').forEach((b) =>
    b.addEventListener('click', () => irPasso(Number(b.dataset.voltar))));
  $('ag-novo').addEventListener('click', () => {
    Object.assign(escolha, { servico: null, profissional: null, data: null, inicio: null, profissionalReal: null });
    $('form-dados').reset();
    irPasso(1);
  });
  $('ag-telefone').addEventListener('input', (ev) => { ev.target.value = mascaraTelefone(ev.target.value); });
  $('ag-consentimento-texto').textContent =
    `Autorizo a ${clinica.nome} a usar meu nome e telefone para agendar e confirmar meu atendimento (LGPD).`;
  $('form-dados').addEventListener('submit', confirmar);
}

function irPasso(n) {
  document.querySelectorAll('.passo').forEach((p) => p.classList.toggle('d-none', Number(p.dataset.passo) !== n));
  document.querySelectorAll('[data-passo-ind]').forEach((li) => {
    const i = Number(li.dataset.passoInd);
    li.classList.toggle('ativo', i === n);
    li.classList.toggle('feito', i < n);
  });
  document.querySelector('.passos').classList.toggle('d-none', n === 5);
  $('agendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function botaoOpcao({ valor, titulo, detalhe = '', icone = '' }) {
  return `<button type="button" class="opcao" data-valor="${escapeHtml(valor)}">
    ${icone}<span><span class="d-block fw-semibold">${escapeHtml(titulo)}</span>
    ${detalhe ? `<span class="d-block small text-body-secondary">${escapeHtml(detalhe)}</span>` : ''}</span>
    <i class="bi bi-chevron-right ms-auto" aria-hidden="true"></i>
  </button>`;
}

function renderServicos() {
  const servicos = clinica.servicos.filter((s) =>
    s.online && clinica.profissionais.some((p) => p.servicos.includes(s.id)));
  const box = $('op-servicos');
  box.innerHTML = servicos.map((s) => botaoOpcao({
    valor: s.id, titulo: s.nome,
    detalhe: `${s.duracao_min} min${s.preco !== null ? ` · ${formatarMoeda(s.preco)}` : ''}`,
  })).join('') || '<p class="text-body-secondary">Nenhum serviço disponível online no momento.</p>';
  box.querySelectorAll('.opcao').forEach((b) => b.addEventListener('click', () => {
    escolha.servico = clinica.servicos.find((s) => s.id === b.dataset.valor);
    renderProfissionais();
  }));
}

function renderProfissionais() {
  const profs = clinica.profissionais.filter((p) => p.servicos.includes(escolha.servico.id));
  // Só um profissional faz o serviço: pula o passo
  if (profs.length === 1) {
    escolha.profissional = profs[0].id;
    renderDias();
    return;
  }
  const box = $('op-profissionais');
  box.innerHTML = botaoOpcao({
    valor: '', titulo: 'Qualquer profissional', detalhe: 'Mostra todos os horários livres',
    icone: '<span class="avatar avatar-sm"><i class="bi bi-people" aria-hidden="true"></i></span>',
  }) + profs.map((p) => botaoOpcao({
    valor: p.id, titulo: p.nome, detalhe: p.especialidade ?? '',
    icone: `<span class="avatar avatar-sm">${escapeHtml(iniciais(p.nome))}</span>`,
  })).join('');
  box.querySelectorAll('.opcao').forEach((b) => b.addEventListener('click', () => {
    escolha.profissional = b.dataset.valor || null;
    renderDias();
  }));
  irPasso(2);
}

function renderDias() {
  const dias = proximosDias(clinica.fuso, DIAS_VISIVEIS, clinica.dias_agenda_online);
  const box = $('op-dias');
  box.innerHTML = dias.map((d) => `
    <button type="button" class="dia" role="option" data-data="${d.iso}" aria-selected="false"
            aria-label="${DIAS_SEMANA[d.semana]}, ${d.dia} de ${MESES[d.mes]}">
      <span class="small">${DIAS_SEMANA_CURTO[d.semana]}</span>
      <strong>${d.dia}</strong>
      <span class="small">${MESES[d.mes]}</span>
    </button>`).join('');
  box.querySelectorAll('.dia').forEach((b) => b.addEventListener('click', () => escolherDia(b.dataset.data)));
  $('op-horarios').innerHTML = '';
  irPasso(3);
  escolherDia(escolha.data && dias.some((d) => d.iso === escolha.data) ? escolha.data : dias[0].iso);
}

let ultimaConsulta = 0;
async function escolherDia(dataIso) {
  escolha.data = dataIso;
  document.querySelectorAll('#op-dias .dia').forEach((b) => {
    const sel = b.dataset.data === dataIso;
    b.classList.toggle('selecionado', sel);
    b.setAttribute('aria-selected', String(sel));
    if (sel) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const box = $('op-horarios');
  box.innerHTML = '<div class="text-body-secondary small"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Buscando horários...</div>';
  const minha = ++ultimaConsulta;
  const { data, error } = await supabase.rpc('horarios_livres', {
    p_slug: slug, p_servico: escolha.servico.id, p_data: dataIso, p_profissional: escolha.profissional,
  });
  if (minha !== ultimaConsulta) return;
  if (error) {
    box.innerHTML = '<div class="alert alert-warning">Não foi possível buscar os horários. Tente de novo.</div>';
    return;
  }
  livresDoDia = data ?? [];
  const turnos = porTurno(agruparHorarios(livresDoDia, clinica.fuso));
  if (!turnos.length) {
    box.innerHTML = '<p class="text-body-secondary">Nenhum horário livre neste dia. Escolha outro dia acima.</p>';
    return;
  }
  box.innerHTML = turnos.map(([turno, grupos]) => `
    <div class="mb-3">
      <div class="small fw-semibold text-body-secondary mb-2">${turno}</div>
      <div class="horarios">${grupos.map((g) => `
        <button type="button" class="horario" data-inicio="${g.inicio}" data-profs="${g.profissionais.join(',')}">${g.hora}</button>`).join('')}
      </div>
    </div>`).join('');
  box.querySelectorAll('.horario').forEach((b) => b.addEventListener('click', () => {
    escolha.inicio = b.dataset.inicio;
    escolha.profissionalReal = escolherProfissional(b.dataset.profs.split(','), livresDoDia);
    renderResumo();
    irPasso(4);
    $('ag-nome').focus({ preventScroll: true });
  }));
}

function renderResumo() {
  const prof = clinica.profissionais.find((p) => p.id === escolha.profissionalReal);
  const [a, m, d] = dataNoFuso(escolha.inicio, clinica.fuso).split('-');
  $('resumo-escolha').innerHTML = `
    <div class="fw-semibold">${escapeHtml(escolha.servico.nome)}</div>
    <div class="small text-body-secondary">
      <i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${d}/${m}/${a} às ${horaNoFuso(escolha.inicio, clinica.fuso)}
      ${prof ? ` · <i class="bi bi-person me-1" aria-hidden="true"></i>${escapeHtml(prof.nome)}` : ''}
    </div>`;
}

async function confirmar(ev) {
  ev.preventDefault();
  const f = ev.target;
  const erroBox = $('ag-erro');
  erroBox.classList.add('d-none');
  f.querySelectorAll('.is-invalid').forEach((i) => i.classList.remove('is-invalid'));

  const nome = f.nome.value.trim().replace(/\s+/g, ' ');
  const telefone = normalizarTelefone(f.telefone.value);
  const invalido = (campo, msg) => {
    f[campo].classList.add('is-invalid');
    f.querySelector(`[data-campo="${campo}"]`).textContent = msg;
  };
  if (nome.split(' ').length < 2) invalido('nome', 'Informe nome e sobrenome.');
  if (!telefone) invalido('telefone', 'Informe o WhatsApp com DDD.');
  if (!f.consentimento.checked) invalido('consentimento', 'É preciso autorizar para concluir o agendamento.');
  if (f.querySelector('.is-invalid')) return f.querySelector('.is-invalid').focus();

  const botao = $('ag-confirmar');
  botao.disabled = true;
  botao.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Agendando...';
  const { data, error } = await supabase.rpc('agendar_online', {
    p_slug: slug, p_servico: escolha.servico.id, p_profissional: escolha.profissionalReal,
    p_inicio: escolha.inicio, p_nome: nome, p_telefone: telefone, p_consentimento: true,
  });
  botao.disabled = false;
  botao.textContent = 'Confirmar agendamento';

  if (error) {
    console.error('[Agendar]', error);
    const ocupado = /disponível|ocupado/i.test(error.message ?? '');
    erroBox.innerHTML = ocupado
      ? 'Esse horário acabou de ser reservado por outra pessoa. <button type="button" class="btn btn-link p-0 align-baseline" id="ag-outro">Escolher outro horário</button>'
      : escapeHtml(error.message || 'Não foi possível agendar. Tente de novo.');
    erroBox.classList.remove('d-none');
    $('ag-outro')?.addEventListener('click', () => { irPasso(3); escolherDia(escolha.data); });
    return;
  }

  const [a, m, d] = dataNoFuso(data.inicio, clinica.fuso).split('-');
  $('sucesso-texto').innerHTML =
    `<strong>${escapeHtml(data.servico)}</strong> em ${d}/${m}/${a} às ${horaNoFuso(data.inicio, clinica.fuso)}` +
    (data.profissional ? ` com ${escapeHtml(data.profissional)}` : '') + '.';
  irPasso(5);
}

iniciar();
