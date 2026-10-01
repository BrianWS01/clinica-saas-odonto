// Acesso ao banco do sistema (usuário logado). O RLS garante que só a clínica do usuário aparece;
// mesmo assim toda consulta filtra por clinica_id, para não misturar quem participa de mais de uma.
import { supabase } from './supabase.js';

function checar({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Clínica
// ---------------------------------------------------------------------

/** Clínicas em que o usuário é membro: [{ papel, clinica: {...} }] */
export async function minhasClinicas() {
  return checar(await supabase
    .from('membros')
    .select('papel, clinica:clinicas(*)')
    .order('criado_em'));
}

export async function criarClinica({ nome, slug, segmento }) {
  return checar(await supabase.rpc('criar_clinica', { p_nome: nome, p_slug: slug, p_segmento: segmento }));
}

export async function atualizarClinica(id, dados) {
  return checar(await supabase.from('clinicas').update(dados).eq('id', id).select().single());
}

// ---------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------

export async function listarServicos(clinicaId) {
  return checar(await supabase.from('servicos').select('*').eq('clinica_id', clinicaId).order('nome'));
}

export async function salvarServico(clinicaId, id, dados) {
  const q = id
    ? supabase.from('servicos').update(dados).eq('id', id).eq('clinica_id', clinicaId)
    : supabase.from('servicos').insert({ ...dados, clinica_id: clinicaId });
  return checar(await q.select().single());
}

export async function excluirServico(clinicaId, id) {
  checar(await supabase.from('servicos').delete().eq('id', id).eq('clinica_id', clinicaId));
}

// ---------------------------------------------------------------------
// Profissionais (+ grade semanal + serviços que atende)
// ---------------------------------------------------------------------

export async function listarProfissionais(clinicaId) {
  return checar(await supabase
    .from('profissionais')
    .select('*, horarios:horarios_trabalho(dia_semana, inicio, fim), servicos:profissional_servicos(servico_id)')
    .eq('clinica_id', clinicaId)
    .order('nome'));
}

/**
 * Grava profissional, grade e serviços. A grade e os serviços são substituídos por inteiro.
 * (Sem transação no cliente: se uma etapa falhar, o erro aparece e o usuário salva de novo.)
 */
export async function salvarProfissional(clinicaId, id, { profissional, horarios, servicos }) {
  const q = id
    ? supabase.from('profissionais').update(profissional).eq('id', id).eq('clinica_id', clinicaId)
    : supabase.from('profissionais').insert({ ...profissional, clinica_id: clinicaId });
  const salvo = checar(await q.select().single());

  checar(await supabase.from('horarios_trabalho').delete().eq('profissional_id', salvo.id));
  if (horarios.length) {
    checar(await supabase.from('horarios_trabalho').insert(
      horarios.map((h) => ({ ...h, clinica_id: clinicaId, profissional_id: salvo.id }))));
  }

  checar(await supabase.from('profissional_servicos').delete().eq('profissional_id', salvo.id));
  if (servicos.length) {
    checar(await supabase.from('profissional_servicos').insert(
      servicos.map((s) => ({ clinica_id: clinicaId, profissional_id: salvo.id, servico_id: s }))));
  }
  return salvo;
}

/** Libera um serviço para vários profissionais de uma vez. */
export async function vincularServico(clinicaId, servicoId, profissionalIds) {
  if (!profissionalIds.length) return;
  checar(await supabase.from('profissional_servicos').upsert(
    profissionalIds.map((p) => ({ clinica_id: clinicaId, profissional_id: p, servico_id: servicoId })),
    { onConflict: 'profissional_id,servico_id', ignoreDuplicates: true }));
}

// ---------------------------------------------------------------------
// Pacientes
// ---------------------------------------------------------------------

const LIMITE_LISTA = 200;

/** Busca por nome, telefone ou CPF (só dígitos). Sem termo: os mais recentes. */
export async function buscarPacientes(clinicaId, termo = '') {
  let q = supabase.from('pacientes').select('*').eq('clinica_id', clinicaId);
  const t = termo.trim();
  const digitos = t.replace(/\D/g, '');
  if (t) {
    if (digitos.length >= 3 && digitos.length === t.replace(/[\s().\-+]/g, '').length) {
      q = q.or(`telefone.ilike.%${digitos}%,cpf.ilike.%${digitos}%`);
    } else {
      // Vírgulas e parênteses quebram o filtro do PostgREST
      q = q.ilike('nome', `%${t.replace(/[,()%]/g, ' ')}%`);
    }
    q = q.order('nome');
  } else {
    q = q.order('criado_em', { ascending: false });
  }
  return checar(await q.limit(LIMITE_LISTA));
}

export async function salvarPaciente(clinicaId, id, dados) {
  const q = id
    ? supabase.from('pacientes').update(dados).eq('id', id).eq('clinica_id', clinicaId)
    : supabase.from('pacientes').insert({ ...dados, clinica_id: clinicaId });
  return checar(await q.select().single());
}

export async function excluirPaciente(clinicaId, id) {
  checar(await supabase.from('pacientes').delete().eq('id', id).eq('clinica_id', clinicaId));
}

export async function historicoPaciente(clinicaId, pacienteId) {
  return checar(await supabase
    .from('agendamentos')
    .select('id, inicio, fim, status, origem, servico:servicos(nome), profissional:profissionais(nome)')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('inicio', { ascending: false })
    .limit(50));
}

// ---------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------

export async function agendamentosDoPeriodo(clinicaId, de, ate) {
  return checar(await supabase
    .from('agendamentos')
    .select('*, paciente:pacientes(id, nome, telefone), servico:servicos(id, nome)')
    .eq('clinica_id', clinicaId)
    .lt('inicio', ate)
    .gt('fim', de)
    .order('inicio'));
}

export async function bloqueiosDoPeriodo(clinicaId, de, ate) {
  return checar(await supabase
    .from('bloqueios')
    .select('*')
    .eq('clinica_id', clinicaId)
    .lt('inicio', ate)
    .gt('fim', de));
}

export async function salvarAgendamento(clinicaId, id, dados) {
  const q = id
    ? supabase.from('agendamentos').update(dados).eq('id', id).eq('clinica_id', clinicaId)
    : supabase.from('agendamentos').insert({ ...dados, clinica_id: clinicaId, origem: 'sistema' });
  return checar(await q.select().single());
}

export async function mudarStatus(clinicaId, id, status) {
  return salvarAgendamento(clinicaId, id, { status });
}

export async function salvarBloqueio(clinicaId, dados) {
  return checar(await supabase.from('bloqueios').insert({ ...dados, clinica_id: clinicaId }).select().single());
}

export async function excluirBloqueio(clinicaId, id) {
  checar(await supabase.from('bloqueios').delete().eq('id', id).eq('clinica_id', clinicaId));
}
