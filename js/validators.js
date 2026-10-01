// Validações e normalizações. Módulo puro (sem DOM, sem Supabase).
// Base trazida do CRM WoodTec (texto, telefone, datas) + CPF, slug e entidades da clínica.
import { SEGMENTOS, ORIGENS_PACIENTE, INTERVALOS_AGENDA, UFS } from './constants.js';

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Minúsculas, sem acento, espaços colapsados. Ex.: "  Clínica  Sorriso " -> "clinica sorriso" */
export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trim; string vazia vira null. */
export function textoOuNull(valor) {
  const t = String(valor ?? '').trim();
  return t === '' ? null : t;
}

/** Endereço do site: "Clínica Sorriso & Cia" -> "clinica-sorriso-cia" */
export function gerarSlug(valor) {
  return normalizarTexto(valor)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function slugValido(valor) {
  const s = String(valor ?? '');
  return s.length >= 3 && s.length <= 40 && /^[a-z0-9](-?[a-z0-9])+$/.test(s);
}

export function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor ?? '').trim());
}

// ---------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------

export function validarCpf(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base) => {
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = dv(d.slice(0, 9));
  const dv2 = dv(d.slice(0, 9) + dv1);
  return d.endsWith(`${dv1}${dv2}`);
}

export function formatarCpf(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return String(valor ?? '');
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

/** Máscara progressiva: 000.000.000-00 */
export function mascaraCpf(valor) {
  const d = somenteDigitos(valor).slice(0, 11);
  let r = d.slice(0, 3);
  if (d.length > 3) r += '.' + d.slice(3, 6);
  if (d.length > 6) r += '.' + d.slice(6, 9);
  if (d.length > 9) r += '-' + d.slice(9, 11);
  return r;
}

// ---------------------------------------------------------------------
// Telefone (igual ao CRM)
// ---------------------------------------------------------------------

/**
 * Normaliza para 55 + DDD + número (8 ou 9 dígitos). Retorna null se inválido.
 * Aceita: "(11) 91234-5678", "11912345678", "+55 11 91234-5678", "011 91234-5678".
 */
export function normalizarTelefone(valor) {
  let d = somenteDigitos(valor).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) {
    d = '55' + d;
  } else if (!((d.length === 12 || d.length === 13) && d.startsWith('55'))) {
    return null;
  }

  const ddd = d.slice(2, 4);
  const numero = d.slice(4);
  if (!DDDS_VALIDOS.has(ddd)) return null;
  if (numero.length === 9 && numero[0] !== '9') return null;
  if (numero.length === 8 && !/^[2-9]/.test(numero)) return null;
  return d;
}

// DDDs em uso no Brasil (Anatel)
const DDDS_VALIDOS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

/** "5511912345678" -> "(11) 91234-5678". Se não der para normalizar, devolve o original. */
export function formatarTelefone(valor) {
  const n = normalizarTelefone(valor);
  if (!n) return String(valor ?? '');
  const ddd = n.slice(2, 4);
  const numero = n.slice(4);
  const corte = numero.length - 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** Máscara progressiva para digitação: (00) 00000-0000 ou (00) 0000-0000 */
export function mascaraTelefone(valor) {
  let d = somenteDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Link wa.me para o número normalizado. */
export function linkWhatsapp(telefone, texto = '') {
  const n = normalizarTelefone(telefone);
  if (!n) return null;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// ---------------------------------------------------------------------
// Datas e horas
// ---------------------------------------------------------------------

/** "AAAA-MM-DD" existente no calendário. */
export function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '')) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "HH:MM" válido. */
export function horaValida(valor) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor ?? '');
}

/** Data local em "AAAA-MM-DD". */
export function hojeIso(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** "2026-09-25" -> "25/09/2026". Aceita também timestamp ISO completo (usa a data local). */
export function formatarDataBr(valor) {
  if (!valor) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hojeIso(new Date(valor));
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Idade completa em anos numa data de referência. */
export function idade(nascimentoIso, hoje = hojeIso()) {
  if (!dataIsoValida(nascimentoIso)) return null;
  const [an, mn, dn] = nascimentoIso.split('-').map(Number);
  const [ah, mh, dh] = hoje.split('-').map(Number);
  let anos = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) anos -= 1;
  return anos;
}

/** "150" / "150,5" / "1.234,56" / "R$ 80" -> número. Vazio -> null. Inválido -> NaN. */
export function lerValorMonetario(valor) {
  const t = String(valor ?? '').replace(/R\$\s?/i, '').trim();
  if (!t) return null;
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return NaN;
  return Number(limpo);
}

export function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------

function resultado(erros, dados) {
  return { valido: Object.keys(erros).length === 0, erros, dados };
}

/** Cadastro inicial da clínica (onboarding). */
export function validarNovaClinica(entrada) {
  const erros = {};
  const nome = textoOuNull(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome da clínica.';

  const slug = String(entrada.slug ?? '').trim().toLowerCase();
  if (!slugValido(slug)) erros.slug = 'Use de 3 a 40 letras minúsculas, números e hífen. Ex.: clinica-sorriso';

  const segmento = entrada.segmento;
  if (!SEGMENTOS.includes(segmento)) erros.segmento = 'Escolha o segmento.';

  return resultado(erros, { nome, slug, segmento });
}

/** Dados editáveis da clínica (configurações). */
export function validarClinica(entrada) {
  const erros = {};
  const nome = textoOuNull(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome da clínica.';

  const telefoneOuNull = (campo) => {
    if (!textoOuNull(entrada[campo])) return null;
    const n = normalizarTelefone(entrada[campo]);
    if (!n) erros[campo] = 'Telefone inválido. Use DDD + número.';
    return n;
  };
  const telefone = telefoneOuNull('telefone');
  const whatsapp = telefoneOuNull('whatsapp');

  const email = textoOuNull(entrada.email);
  if (email && !emailValido(email)) erros.email = 'E-mail inválido.';

  const uf = textoOuNull(entrada.uf)?.toUpperCase() ?? null;
  if (uf && !UFS.includes(uf)) erros.uf = 'UF inválida.';

  const cor = String(entrada.cor_primaria ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(cor)) erros.cor_primaria = 'Cor inválida.';

  const intervalo = Number(entrada.intervalo_agenda_min);
  if (!INTERVALOS_AGENDA.includes(intervalo)) erros.intervalo_agenda_min = 'Intervalo inválido.';

  const antecedencia = Number(entrada.antecedencia_min_horas);
  if (!Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 168) {
    erros.antecedencia_min_horas = 'Use de 0 a 168 horas.';
  }

  const dias = Number(entrada.dias_agenda_online);
  if (!Number.isInteger(dias) || dias < 1 || dias > 180) erros.dias_agenda_online = 'Use de 1 a 180 dias.';

  return resultado(erros, {
    nome,
    telefone,
    whatsapp,
    email,
    endereco: textoOuNull(entrada.endereco),
    cidade: textoOuNull(entrada.cidade),
    uf,
    sobre: textoOuNull(entrada.sobre),
    cor_primaria: cor,
    intervalo_agenda_min: intervalo,
    antecedencia_min_horas: antecedencia,
    dias_agenda_online: dias,
    agendamento_online: Boolean(entrada.agendamento_online),
  });
}

export function validarPaciente(entrada, hoje = hojeIso()) {
  const erros = {};
  const nome = textoOuNull(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome.';

  let telefone = null;
  if (!textoOuNull(entrada.telefone)) erros.telefone = 'Informe o telefone com DDD.';
  else {
    telefone = normalizarTelefone(entrada.telefone);
    if (!telefone) erros.telefone = 'Telefone inválido. Use DDD + número. Ex.: (00) 00000-0000.';
  }

  let cpf = null;
  if (textoOuNull(entrada.cpf)) {
    cpf = somenteDigitos(entrada.cpf);
    if (!validarCpf(cpf)) erros.cpf = 'CPF inválido.';
  }

  const email = textoOuNull(entrada.email);
  if (email && !emailValido(email)) erros.email = 'E-mail inválido.';

  const nascimento = textoOuNull(entrada.data_nascimento);
  if (nascimento && (!dataIsoValida(nascimento) || nascimento > hoje)) {
    erros.data_nascimento = 'Data de nascimento inválida.';
  }

  const origem = textoOuNull(entrada.origem) ?? 'Recepção';
  if (!ORIGENS_PACIENTE.includes(origem)) erros.origem = 'Origem inválida.';

  return resultado(erros, {
    nome, telefone, cpf, email,
    data_nascimento: nascimento,
    origem,
    observacoes: textoOuNull(entrada.observacoes),
  });
}

export function validarServico(entrada) {
  const erros = {};
  const nome = textoOuNull(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome do serviço.';

  const duracao = Number(entrada.duracao_min);
  if (!Number.isInteger(duracao) || duracao < 5 || duracao > 600) erros.duracao_min = 'Duração de 5 a 600 minutos.';

  const preco = lerValorMonetario(entrada.preco);
  if (Number.isNaN(preco)) erros.preco = 'Valor inválido. Ex.: 150,00';

  return resultado(erros, {
    nome,
    descricao: textoOuNull(entrada.descricao),
    duracao_min: duracao,
    preco,
    ativo: Boolean(entrada.ativo),
    agendamento_online: Boolean(entrada.agendamento_online),
  });
}

/**
 * Profissional + grade semanal.
 * entrada.horarios: [{ dia_semana, inicio: 'HH:MM', fim: 'HH:MM' }]
 */
export function validarProfissional(entrada) {
  const erros = {};
  const nome = textoOuNull(entrada.nome);
  if (!nome) erros.nome = 'Informe o nome.';

  const cor = String(entrada.cor ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(cor)) erros.cor = 'Cor inválida.';

  const horarios = [];
  for (const h of entrada.horarios ?? []) {
    if (!horaValida(h.inicio) || !horaValida(h.fim) || h.fim <= h.inicio) {
      erros.horarios = 'Em cada dia, o fim precisa ser depois do início.';
      continue;
    }
    horarios.push({ dia_semana: Number(h.dia_semana), inicio: h.inicio, fim: h.fim });
  }
  if (!erros.horarios && temSobreposicao(horarios)) {
    erros.horarios = 'Há faixas de horário sobrepostas no mesmo dia.';
  }

  return resultado(erros, {
    profissional: {
      nome,
      especialidade: textoOuNull(entrada.especialidade),
      registro: textoOuNull(entrada.registro),
      cor,
      ativo: Boolean(entrada.ativo),
      aparece_no_site: Boolean(entrada.aparece_no_site),
    },
    horarios,
    servicos: [...new Set(entrada.servicos ?? [])],
  });
}

function temSobreposicao(horarios) {
  const porDia = {};
  for (const h of horarios) (porDia[h.dia_semana] ??= []).push(h);
  return Object.values(porDia).some((lista) => {
    const ord = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));
    return ord.some((h, i) => i > 0 && h.inicio < ord[i - 1].fim);
  });
}

/** Agendamento feito pela recepção. data 'AAAA-MM-DD', hora 'HH:MM'. */
export function validarAgendamento(entrada) {
  const erros = {};
  if (!entrada.paciente_id) erros.paciente_id = 'Escolha o paciente.';
  if (!entrada.profissional_id) erros.profissional_id = 'Escolha o profissional.';
  if (!dataIsoValida(entrada.data)) erros.data = 'Data inválida.';
  if (!horaValida(entrada.hora)) erros.hora = 'Hora inválida.';
  const duracao = Number(entrada.duracao_min);
  if (!Number.isInteger(duracao) || duracao < 5 || duracao > 600) erros.duracao_min = 'Duração de 5 a 600 minutos.';

  let inicio = null;
  let fim = null;
  if (!erros.data && !erros.hora && !erros.duracao_min) {
    const [a, m, d] = entrada.data.split('-').map(Number);
    const [hh, mm] = entrada.hora.split(':').map(Number);
    const ini = new Date(a, m - 1, d, hh, mm);
    inicio = ini.toISOString();
    fim = new Date(ini.getTime() + duracao * 60000).toISOString();
  }

  return resultado(erros, {
    paciente_id: entrada.paciente_id || null,
    profissional_id: entrada.profissional_id || null,
    servico_id: entrada.servico_id || null,
    inicio,
    fim,
    observacoes: textoOuNull(entrada.observacoes),
  });
}

/** Campo responsável por um erro do Postgres (23505 / 23P01), ou null. */
export function campoDoErro(erro, mapa) {
  if (!erro) return null;
  const texto = `${erro.message ?? ''} ${erro.details ?? ''}`;
  for (const [nome, campo] of Object.entries(mapa)) {
    if (texto.includes(nome)) return campo;
  }
  return null;
}
