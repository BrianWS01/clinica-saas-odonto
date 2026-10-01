// Odontograma interativo (SVG) + painel do dente selecionado.
// Clique numa face para selecioná-la; escolha a condição no painel para marcar.
import {
  ARCADAS, CONDICOES, FACES, regioesDoDente, nomeDente, estadoDosDentes, resumoOdontograma,
  formatarFaces, validarMarcacao, localDoItem,
} from './odonto-regras.js';
import { formatarDataBr, formatarMoeda, lerValorMonetario } from './validators.js';
import { escapeHtml } from './ui.js';

const S = 30;        // lado do desenho do dente
const PASSO = 40;    // distância entre dentes
const MEIO = 16;     // espaço extra na linha média
const MARGEM = 12;
const LARGURA = MARGEM * 2 + 16 * PASSO + MEIO;

// Polígonos de cada região do dente (quadrado dividido em 5)
const a = S * 0.3;
const b = S * 0.7;
const POLIGONOS = {
  cima: `0,0 ${S},0 ${b},${a} ${a},${a}`,
  direita: `${S},0 ${S},${S} ${b},${b} ${b},${a}`,
  baixo: `0,${S} ${S},${S} ${b},${b} ${a},${b}`,
  esquerda: `0,0 0,${S} ${a},${b} ${a},${a}`,
  centro: `${a},${a} ${b},${a} ${b},${b} ${a},${b}`,
};

/**
 * container: onde vai o SVG; painel: card lateral; legenda; resumo: texto de contagem.
 * acoes: { onMarcar(dados), onExcluir(marcacao), onOrcar(item), servicos: () => [] }
 * Cada ação devolve uma Promise; o componente se redesenha quando render() é chamado de novo.
 */
export function criarOdontograma({ container, painel, legenda, resumo }, acoes) {
  let marcacoes = [];
  let estado = new Map();
  let denticao = 'permanentes';
  let selecionado = null;
  let facesSel = new Set();
  let ocupado = false;

  legenda.innerHTML = Object.values(CONDICOES)
    .map((c) => `<span class="odonto-leg"><span class="odonto-cor" style="background:${c.cor}"></span>${c.rotulo}${c.sigla ? ` <span class="text-body-secondary">(${c.sigla})</span>` : ''}</span>`)
    .join('');

  container.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-dente]');
    if (!g) return;
    const dente = Number(g.dataset.dente);
    const face = ev.target.closest('[data-face]')?.dataset.face;
    if (dente !== selecionado) {
      selecionado = dente;
      facesSel = new Set();
    }
    if (face) facesSel.has(face) ? facesSel.delete(face) : facesSel.add(face);
    desenhar();
  });
  container.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-dente]')) {
      ev.preventDefault();
      selecionado = Number(ev.target.dataset.dente);
      facesSel = new Set();
      desenhar();
    }
  });

  painel.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('button');
    if (!alvo || ocupado) return;
    if (alvo.dataset.face) {
      facesSel.has(alvo.dataset.face) ? facesSel.delete(alvo.dataset.face) : facesSel.add(alvo.dataset.face);
      desenhar();
    } else if (alvo.dataset.condicao) {
      await marcar(alvo.dataset.condicao);
    } else if (alvo.dataset.excluir) {
      const m = marcacoes.find((x) => x.id === alvo.dataset.excluir);
      if (m) await executar(() => acoes.onExcluir(m));
    } else if (alvo.dataset.ir) {
      selecionado = Number(alvo.dataset.ir);
      facesSel = new Set();
      desenhar();
    } else if (alvo.dataset.acao === 'orcar') {
      await orcar();
    } else if (alvo.dataset.acao === 'fechar') {
      selecionado = null;
      facesSel = new Set();
      desenhar();
    }
  });
  painel.addEventListener('change', (ev) => {
    if (ev.target.name !== 'orc-servico') return;
    const s = acoes.servicos().find((x) => x.id === ev.target.value);
    const valor = painel.querySelector('[name="orc-valor"]');
    if (s && s.preco !== null) valor.value = String(s.preco).replace('.', ',');
  });

  async function executar(fn) {
    ocupado = true;
    painel.classList.add('opacity-75');
    try {
      await fn();
    } finally {
      ocupado = false;
      painel.classList.remove('opacity-75');
    }
  }

  async function marcar(condicao) {
    const { valido, erros, dados } = validarMarcacao({ dente: selecionado, faces: [...facesSel], condicao });
    if (!valido) {
      mostrarAviso(erros.faces ?? erros.condicao ?? erros.dente);
      return;
    }
    await executar(() => acoes.onMarcar(dados));
    facesSel = new Set();
    desenhar();
  }

  async function orcar() {
    const servicoId = painel.querySelector('[name="orc-servico"]').value;
    const servico = acoes.servicos().find((s) => s.id === servicoId);
    const valor = lerValorMonetario(painel.querySelector('[name="orc-valor"]').value);
    if (!servico) return mostrarAviso('Escolha o procedimento.');
    if (valor === null || Number.isNaN(valor)) return mostrarAviso('Informe o valor.');
    await executar(() => acoes.onOrcar({
      servico_id: servico.id, descricao: servico.nome, dente: selecionado,
      faces: [...facesSel], quantidade: 1, valor,
    }));
  }

  function mostrarAviso(texto) {
    const el = painel.querySelector('[data-aviso]');
    if (!el) return;
    el.textContent = texto;
    el.classList.remove('d-none');
  }

  // -------------------------------------------------------------------
  // Desenho
  // -------------------------------------------------------------------
  function linhas() {
    const { permanentes: p, deciduos: d } = ARCADAS;
    if (denticao === 'deciduos') return [{ dentes: d.superior, superior: true }, { dentes: d.inferior, superior: false }];
    if (denticao === 'mista') {
      return [
        { dentes: p.superior, superior: true },
        { dentes: d.superior, superior: true },
        { dentes: d.inferior, superior: false },
        { dentes: p.inferior, superior: false },
      ];
    }
    return [{ dentes: p.superior, superior: true }, { dentes: p.inferior, superior: false }];
  }

  function svgDente(dente, x, y, numeroEmCima) {
    const e = estado.get(dente) ?? { faces: {}, inteiro: [] };
    const reg = regioesDoDente(dente);
    const ausente = e.inteiro.includes('ausente');
    const sel = dente === selecionado;
    const titulo = `${dente} — ${nomeDente(dente)}`;

    const faces = Object.entries(POLIGONOS).map(([regiao, pontos]) => {
      const face = reg[regiao];
      const cond = e.faces[face];
      const cor = cond ? CONDICOES[cond].cor : null;
      const marcada = sel && facesSel.has(face);
      return `<polygon points="${pontos}" class="odonto-face${marcada ? ' selecionada' : ''}" data-face="${face}"
        ${cor ? `style="fill:${cor}"` : ''}><title>${escapeHtml(`${titulo} · ${FACES[face]}${cond ? `: ${CONDICOES[cond].rotulo}` : ''}`)}</title></polygon>`;
    }).join('');

    const extras = [];
    if (ausente) extras.push(`<path d="M2 2L${S - 2} ${S - 2}M${S - 2} 2L2 ${S - 2}" class="odonto-x" style="stroke:${CONDICOES.ausente.cor}"/>`);
    if (e.inteiro.includes('extracao_indicada')) extras.push(`<path d="M2 2L${S - 2} ${S - 2}M${S - 2} 2L2 ${S - 2}" class="odonto-x" style="stroke:${CONDICOES.extracao_indicada.cor}"/>`);
    if (e.inteiro.includes('coroa')) extras.push(`<rect x="-3" y="-3" width="${S + 6}" height="${S + 6}" rx="8" class="odonto-anel" style="stroke:${CONDICOES.coroa.cor}"/>`);
    if (e.inteiro.includes('implante')) extras.push(`<rect x="-3" y="-3" width="${S + 6}" height="${S + 6}" rx="2" class="odonto-anel" style="stroke:${CONDICOES.implante.cor};stroke-dasharray:3 2"/>`);

    const siglas = e.inteiro.filter((c) => c !== 'ausente').map((c) => CONDICOES[c]);
    const ySigla = numeroEmCima ? S + 11 : -5;
    const yNumero = numeroEmCima ? -6 : S + 13;
    const textoSiglas = siglas.length
      ? `<text x="${S / 2}" y="${ySigla}" class="odonto-sigla" style="fill:${siglas[0].cor}">${siglas.map((s) => s.sigla).join(' ')}</text>`
      : '';

    return `<g class="odonto-dente${sel ? ' ativo' : ''}${ausente ? ' ausente' : ''}" data-dente="${dente}"
        transform="translate(${x},${y})" tabindex="0" role="button" aria-pressed="${sel}"
        aria-label="${escapeHtml(titulo)}">
      ${sel ? `<rect x="-5" y="-5" width="${S + 10}" height="${S + 10}" rx="6" class="odonto-sel"/>` : ''}
      <g class="odonto-coroa">${faces}</g>${extras.join('')}
      <text x="${S / 2}" y="${yNumero}" class="odonto-num">${dente}</text>${textoSiglas}
    </g>`;
  }

  function desenharSvg() {
    const ls = linhas();
    const ALTURA_LINHA = 72;
    let y = 36;
    const partes = ls.map((linha, i) => {
      const n = linha.dentes.length;
      const desloc = ((16 - n) / 2) * PASSO; // centraliza decíduos
      const metade = n / 2;
      const g = linha.dentes.map((d, j) =>
        svgDente(d, MARGEM + desloc + j * PASSO + (j >= metade ? MEIO : 0) + (PASSO - S) / 2, y, linha.superior)).join('');
      const proximoMudaArcada = ls[i + 1] && ls[i + 1].superior !== linha.superior;
      const atual = y;
      y += ALTURA_LINHA + (proximoMudaArcada ? 14 : 0);
      return { g, atual, proximoMudaArcada };
    });
    const altura = y - ALTURA_LINHA + S + 28;
    const xMeio = MARGEM + 8 * PASSO + MEIO / 2;
    const linhaArcada = partes.find((p) => p.proximoMudaArcada);
    const yArcada = linhaArcada ? linhaArcada.atual + S + 30 : null;

    container.innerHTML = `
      <svg viewBox="0 0 ${LARGURA} ${altura}" class="odontograma" role="group" aria-label="Odontograma">
        <line x1="${xMeio}" y1="4" x2="${xMeio}" y2="${altura - 4}" class="odonto-linha"/>
        ${yArcada ? `<line x1="${MARGEM}" y1="${yArcada}" x2="${LARGURA - MARGEM}" y2="${yArcada}" class="odonto-linha"/>` : ''}
        <text x="${MARGEM}" y="12" class="odonto-rotulo">Direito do paciente</text>
        <text x="${LARGURA - MARGEM}" y="12" class="odonto-rotulo" text-anchor="end">Esquerdo</text>
        ${partes.map((p) => p.g).join('')}
      </svg>`;
  }

  function desenharPainel() {
    const servicosAtivos = acoes.servicos().filter((s) => s.ativo);
    if (!selecionado) {
      const aTratar = [...estado.entries()]
        .filter(([, e]) => [...Object.values(e.faces), ...e.inteiro].some((c) => CONDICOES[c]?.categoria === 'tratar'))
        .map(([d]) => d)
        .sort((x, y) => x - y);
      painel.innerHTML = `<div class="card-body">
        <h2 class="h6">Como usar</h2>
        <ol class="small text-body-secondary ps-3 mb-3">
          <li>Clique no dente. Para cárie e restauração, clique também nas faces (pode escolher várias).</li>
          <li>Escolha a condição no painel. <span class="text-danger">Vermelho</span> = precisa tratar, <span class="text-primary">azul</span> = já existe.</li>
          <li>Use <strong>Adicionar ao orçamento</strong> para montar o plano de tratamento.</li>
        </ol>
        ${aTratar.length ? `<h3 class="h6">Dentes a tratar</h3>
          <div class="d-flex flex-wrap gap-1">${aTratar.map((d) =>
            `<button type="button" class="btn btn-sm btn-outline-danger" data-ir="${d}">${d}</button>`).join('')}</div>` : ''}
      </div>`;
      return;
    }

    const e = estado.get(selecionado) ?? { marcacoes: [] };
    const reg = regioesDoDente(selecionado);
    const ordemFaces = [reg.cima, reg.esquerda, reg.centro, reg.direita, reg.baixo];
    const botoesCond = (tipo) => Object.entries(CONDICOES).filter(([, c]) => c.tipo === tipo).map(([k, c]) => `
      <button type="button" class="btn btn-sm btn-outline-secondary odonto-cond" data-condicao="${k}">
        <span class="odonto-cor" style="background:${c.cor}" aria-hidden="true"></span>${c.rotulo}
      </button>`).join('');

    painel.innerHTML = `<div class="card-body">
      <div class="d-flex align-items-start mb-2">
        <div class="me-auto">
          <h2 class="h5 mb-0">Dente ${selecionado}</h2>
          <div class="small text-body-secondary">${escapeHtml(nomeDente(selecionado))}</div>
        </div>
        <button type="button" class="btn-close" data-acao="fechar" aria-label="Fechar dente"></button>
      </div>

      <div class="small fw-semibold mb-1">Faces <span class="fw-normal text-body-secondary">${facesSel.size ? `· ${formatarFaces([...facesSel])}` : '(clique no desenho ou aqui)'}</span></div>
      <div class="btn-group btn-group-sm mb-3 flex-wrap" role="group" aria-label="Faces">
        ${ordemFaces.map((f) => `<button type="button" class="btn ${facesSel.has(f) ? 'btn-primary' : 'btn-outline-primary'}"
          data-face="${f}" aria-pressed="${facesSel.has(f)}" title="${FACES[f]}">${f}</button>`).join('')}
      </div>

      <div class="small fw-semibold mb-1">Marcar nas faces</div>
      <div class="d-flex flex-wrap gap-1 mb-2">${botoesCond('faces')}</div>
      <div class="small fw-semibold mb-1">Dente inteiro</div>
      <div class="d-flex flex-wrap gap-1 mb-2">${botoesCond('dente')}</div>
      <div class="alert alert-warning py-1 px-2 small d-none" data-aviso role="alert"></div>

      <div class="small fw-semibold mt-3 mb-1">Registros deste dente</div>
      ${e.marcacoes.length ? `<ul class="list-group list-group-flush small mb-2">${[...e.marcacoes].reverse().map((m) => {
        const c = CONDICOES[m.condicao];
        return `<li class="list-group-item px-0 d-flex align-items-center gap-2">
          <span class="odonto-cor" style="background:${c?.cor}" aria-hidden="true"></span>
          <span class="me-auto">${escapeHtml(c?.rotulo ?? m.condicao)}${m.faces?.length ? ` · ${formatarFaces(m.faces)}` : ''}
            <span class="text-body-secondary">· ${formatarDataBr(m.criado_em)}</span></span>
          <button type="button" class="btn btn-sm btn-link text-danger p-0" data-excluir="${m.id}" title="Remover registro" aria-label="Remover registro">
            <i class="bi bi-x-lg" aria-hidden="true"></i></button>
        </li>`;
      }).join('')}</ul>` : '<p class="small text-body-secondary">Nada registrado.</p>'}

      <div class="border-top pt-3 mt-2">
        <div class="small fw-semibold mb-1">Adicionar ao orçamento
          <span class="fw-normal text-body-secondary">· ${escapeHtml(localDoItem({ dente: selecionado, faces: [...facesSel] }))}</span></div>
        ${servicosAtivos.length ? `
        <div class="input-group input-group-sm">
          <select class="form-select" name="orc-servico" aria-label="Procedimento">
            <option value="">Procedimento...</option>
            ${servicosAtivos.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}${s.preco !== null ? ` — ${formatarMoeda(s.preco)}` : ''}</option>`).join('')}
          </select>
          <span class="input-group-text">R$</span>
          <input type="text" class="form-control orc-valor-rapido" name="orc-valor" inputmode="decimal" placeholder="0,00" aria-label="Valor">
          <button type="button" class="btn btn-primary" data-acao="orcar" title="Adicionar ao orçamento em rascunho"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>
        </div>
        <div class="form-text">Entra no orçamento em rascunho deste paciente (cria um, se não houver).</div>`
        : '<p class="small text-body-secondary mb-0">Cadastre os procedimentos em Equipe e serviços.</p>'}
      </div>
    </div>`;
  }

  function desenhar() {
    desenharSvg();
    desenharPainel();
    const r = resumoOdontograma(estado);
    resumo.textContent = r.dentesMarcados
      ? `${r.dentesMarcados} dente${r.dentesMarcados === 1 ? '' : 's'} com registro · ${r.dentesATratar} a tratar`
      : 'Nenhum registro ainda';
  }

  return {
    render(novasMarcacoes) {
      marcacoes = novasMarcacoes;
      estado = estadoDosDentes(marcacoes);
      desenhar();
    },
    setDenticao(valor) {
      denticao = valor;
      desenhar();
    },
    reiniciar() {
      selecionado = null;
      facesSel = new Set();
    },
  };
}
