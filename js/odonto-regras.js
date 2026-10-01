// Regras do odontograma e do orçamento. Módulo puro: testado em tests/odonto-regras.test.js.
// Numeração FDI: o primeiro dígito é o quadrante (1–4 permanentes, 5–8 decíduos), o segundo a posição.
import { dataIsoValida, lerValorMonetario, textoOuNull } from './validators.js';

// Ordem de exibição (visão do dentista de frente para o paciente: o lado direito do paciente fica à esquerda)
export const ARCADAS = {
  permanentes: {
    superior: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
    inferior: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
  },
  deciduos: {
    superior: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
    inferior: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
  },
};

export const FACES = {
  V: 'Vestibular',
  L: 'Lingual/Palatina',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal/Incisal',
};

// tipo 'faces': marcada em faces do dente; tipo 'dente': vale para o dente inteiro.
// categoria: 'tratar' (vermelho, precisa de tratamento) ou 'existente' (azul, já feito).
export const CONDICOES = {
  carie:                      { rotulo: 'Cárie',                       tipo: 'faces', categoria: 'tratar',    cor: '#dc2626' },
  restauracao_insatisfatoria: { rotulo: 'Restauração insatisfatória',  tipo: 'faces', categoria: 'tratar',    cor: '#ea580c' },
  restauracao:                { rotulo: 'Restauração',                 tipo: 'faces', categoria: 'existente', cor: '#2563eb' },
  selante:                    { rotulo: 'Selante',                     tipo: 'faces', categoria: 'existente', cor: '#059669' },
  fratura:                    { rotulo: 'Fratura',                     tipo: 'dente', categoria: 'tratar',    cor: '#dc2626', sigla: 'FR' },
  canal_indicado:             { rotulo: 'Canal indicado',              tipo: 'dente', categoria: 'tratar',    cor: '#dc2626', sigla: 'TC' },
  extracao_indicada:          { rotulo: 'Extração indicada',           tipo: 'dente', categoria: 'tratar',    cor: '#dc2626', sigla: 'EX' },
  canal_tratado:              { rotulo: 'Canal tratado',               tipo: 'dente', categoria: 'existente', cor: '#2563eb', sigla: 'TC' },
  coroa:                      { rotulo: 'Coroa / prótese',             tipo: 'dente', categoria: 'existente', cor: '#2563eb', sigla: 'CO' },
  implante:                   { rotulo: 'Implante',                    tipo: 'dente', categoria: 'existente', cor: '#2563eb', sigla: 'IM' },
  ausente:                    { rotulo: 'Ausente',                     tipo: 'dente', categoria: 'existente', cor: '#6b7280', sigla: 'AU' },
};

export const STATUS_ORCAMENTO = {
  rascunho: { rotulo: 'Rascunho', cor: 'secondary', icone: 'bi-pencil' },
  enviado:  { rotulo: 'Enviado',  cor: 'primary',   icone: 'bi-send' },
  aprovado: { rotulo: 'Aprovado', cor: 'success',   icone: 'bi-check2-circle' },
  recusado: { rotulo: 'Recusado', cor: 'danger',    icone: 'bi-x-circle' },
};

// ---------------------------------------------------------------------
// Dentes
// ---------------------------------------------------------------------

export function denteValido(d) {
  const n = Number(d);
  if (!Number.isInteger(n)) return false;
  const q = Math.floor(n / 10);
  const p = n % 10;
  return (q >= 1 && q <= 4 && p >= 1 && p <= 8) || (q >= 5 && q <= 8 && p >= 1 && p <= 5);
}

export const quadrante = (d) => Math.floor(d / 10);
export const ehDeciduo = (d) => quadrante(d) >= 5;
export const ehSuperior = (d) => [1, 2, 5, 6].includes(quadrante(d));
/** Lado direito do PACIENTE (aparece à esquerda na tela). */
export const ladoDireitoDoPaciente = (d) => [1, 4, 5, 8].includes(quadrante(d));

const NOMES_PERMANENTES = ['', 'incisivo central', 'incisivo lateral', 'canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar (siso)'];
const NOMES_DECIDUOS = ['', 'incisivo central', 'incisivo lateral', 'canino', '1º molar', '2º molar'];

/** 36 -> "1º molar inferior esquerdo" */
export function nomeDente(d) {
  if (!denteValido(d)) return '';
  const nome = (ehDeciduo(d) ? NOMES_DECIDUOS : NOMES_PERMANENTES)[d % 10];
  const arcada = ehSuperior(d) ? 'superior' : 'inferior';
  const lado = ladoDireitoDoPaciente(d) ? 'direito' : 'esquerdo';
  return `${nome} ${arcada} ${lado}${ehDeciduo(d) ? ' (decíduo)' : ''}`;
}

/**
 * Qual face fica em cada região do desenho do dente.
 * Superior: vestibular em cima, palatina embaixo. Inferior: lingual em cima, vestibular embaixo.
 * A mesial aponta para o meio da boca (centro da tela).
 */
export function regioesDoDente(d) {
  const mesialNaDireita = ladoDireitoDoPaciente(d);
  return {
    cima: ehSuperior(d) ? 'V' : 'L',
    baixo: ehSuperior(d) ? 'L' : 'V',
    esquerda: mesialNaDireita ? 'D' : 'M',
    direita: mesialNaDireita ? 'M' : 'D',
    centro: 'O',
  };
}

/** Ordena e junta as faces no padrão clínico: ['O','D','M'] -> "MOD" */
export function formatarFaces(faces = []) {
  const ordem = ['M', 'O', 'D', 'V', 'L'];
  return [...new Set(faces)].filter((f) => ordem.includes(f)).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)).join('');
}

/** "mod" / "M,O,D" / "M O" -> ['M','O','D']. Letras inválidas são descartadas. */
export function lerFaces(texto) {
  return formatarFaces(String(texto ?? '').toUpperCase().split('').filter((c) => FACES[c])).split('').filter(Boolean);
}

/**
 * Estado de cada dente a partir das marcações (as mais recentes vencem na mesma face).
 * Retorna Map dente -> { faces: { V: condicao, ... }, inteiro: [condicao...], marcacoes: [...] }
 */
export function estadoDosDentes(marcacoes) {
  const ord = [...marcacoes].sort((a, b) => String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')));
  const mapa = new Map();
  for (const m of ord) {
    if (!mapa.has(m.dente)) mapa.set(m.dente, { faces: {}, inteiro: [], marcacoes: [] });
    const e = mapa.get(m.dente);
    e.marcacoes.push(m);
    const def = CONDICOES[m.condicao];
    if (!def) continue;
    if (def.tipo === 'faces') {
      for (const f of m.faces ?? []) e.faces[f] = m.condicao;
    } else if (!e.inteiro.includes(m.condicao)) {
      e.inteiro.push(m.condicao);
    }
  }
  return mapa;
}

/** Valida uma marcação antes de gravar. */
export function validarMarcacao({ dente, faces = [], condicao }) {
  const erros = {};
  if (!denteValido(dente)) erros.dente = 'Dente inválido.';
  const def = CONDICOES[condicao];
  if (!def) erros.condicao = 'Escolha a condição.';
  const f = formatarFaces(faces).split('').filter(Boolean);
  if (def?.tipo === 'faces' && !f.length) erros.faces = 'Selecione ao menos uma face do dente.';
  return {
    valido: Object.keys(erros).length === 0,
    erros,
    dados: { dente: Number(dente), faces: def?.tipo === 'faces' ? f : [], condicao },
  };
}

/** Resumo do odontograma para a lista: quantos dentes precisam de tratamento. */
export function resumoOdontograma(estado) {
  let tratar = 0;
  for (const e of estado.values()) {
    const conds = [...Object.values(e.faces), ...e.inteiro];
    if (conds.some((c) => CONDICOES[c]?.categoria === 'tratar')) tratar++;
  }
  return { dentesMarcados: estado.size, dentesATratar: tratar };
}

// ---------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------

const arred = (n) => Math.round(n * 100) / 100;

/** Descrição do local do item: "Dente 36 (MO)" / "Dente 11" / "" */
export function localDoItem({ dente, faces }) {
  if (!dente) return '';
  const f = formatarFaces(faces);
  return `Dente ${dente}${f ? ` (${f})` : ''}`;
}

export function totaisOrcamento(itens, desconto = 0) {
  const subtotal = arred(itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade || 1), 0));
  const d = Math.min(arred(Number(desconto || 0)), subtotal);
  return { subtotal, desconto: d, total: arred(subtotal - d) };
}

export function progressoTratamento(itens) {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status === 'concluido').length;
  return { total, concluidos, percentual: total ? Math.round((concluidos / total) * 100) : 0 };
}

export function validarItemOrcamento(entrada) {
  const erros = {};
  const descricao = textoOuNull(entrada.descricao);
  if (!descricao) erros.descricao = 'Descreva o procedimento.';

  let dente = null;
  if (textoOuNull(entrada.dente)) {
    dente = Number(entrada.dente);
    if (!denteValido(dente)) erros.dente = 'Dente inválido (use 11–48 ou 51–85).';
  }

  const quantidade = Number(entrada.quantidade ?? 1);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) erros.quantidade = 'Quantidade de 1 a 99.';

  const valor = typeof entrada.valor === 'number' ? entrada.valor : lerValorMonetario(entrada.valor);
  if (valor === null || Number.isNaN(valor) || valor < 0) erros.valor = 'Valor inválido.';

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    dados: {
      servico_id: entrada.servico_id || null,
      descricao,
      dente,
      faces: dente ? (Array.isArray(entrada.faces) ? formatarFaces(entrada.faces).split('').filter(Boolean) : lerFaces(entrada.faces)) : [],
      quantidade,
      valor: Number.isNaN(valor) ? null : valor,
    },
  };
}

/** Cabeçalho do orçamento (desconto, validade...). itens já validados. */
export function validarOrcamento(entrada, itens, hoje) {
  const erros = {};
  if (!itens.length) erros.itens = 'Adicione ao menos um procedimento.';

  const desconto = lerValorMonetario(entrada.desconto) ?? 0;
  const { subtotal } = totaisOrcamento(itens);
  if (Number.isNaN(desconto) || desconto < 0) erros.desconto = 'Desconto inválido.';
  else if (desconto > subtotal) erros.desconto = 'O desconto não pode passar do subtotal.';

  const validade = textoOuNull(entrada.validade);
  if (validade && !dataIsoValida(validade)) erros.validade = 'Data inválida.';
  else if (validade && hoje && validade < hoje) erros.validade = 'A validade já passou.';

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    dados: {
      profissional_id: entrada.profissional_id || null,
      desconto: Number.isNaN(desconto) ? 0 : desconto,
      validade,
      forma_pagamento: textoOuNull(entrada.forma_pagamento),
      observacoes: textoOuNull(entrada.observacoes),
    },
  };
}

/** Mensagem para o WhatsApp com o link de aprovação. */
export function mensagemOrcamento({ paciente, clinica, link, total }) {
  const primeiroNome = String(paciente ?? '').trim().split(/\s+/)[0] || '';
  const valor = Number(total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Olá, ${primeiroNome}! Segue o seu orçamento da ${clinica} (total ${valor}). ` +
    `Você pode ver os detalhes e aprovar por este link: ${link}`;
}
