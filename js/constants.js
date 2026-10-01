// Listas fixas do sistema. Módulo puro (sem DOM): usado pelo front e pelos testes.
// Os valores precisam bater com os CHECKs do supabase/schema.sql.

export const SEGMENTOS = ['Odontologia', 'Estética', 'Beleza'];

export const PAPEIS = {
  dono: 'Dono',
  admin: 'Administrador',
  recepcao: 'Recepção',
  profissional: 'Profissional',
};

export const STATUS_AGENDAMENTO = {
  agendado:   { rotulo: 'Agendado',   cor: 'secondary', icone: 'bi-calendar' },
  confirmado: { rotulo: 'Confirmado', cor: 'primary',   icone: 'bi-check2' },
  atendido:   { rotulo: 'Atendido',   cor: 'success',   icone: 'bi-check2-all' },
  faltou:     { rotulo: 'Faltou',     cor: 'warning',   icone: 'bi-person-x' },
  cancelado:  { rotulo: 'Cancelado',  cor: 'danger',    icone: 'bi-x-lg' },
};

export const ORIGENS_PACIENTE = ['Recepção', 'Site', 'WhatsApp', 'Indicação', 'Instagram', 'Outro'];

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const INTERVALOS_AGENDA = [5, 10, 15, 20, 30, 45, 60];

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

// Cores sugeridas para profissionais na agenda
export const CORES_PROFISSIONAL = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

// Nomes de constraints/índices do schema.sql (usados para traduzir erros)
export const CONSTRAINT_CONFLITO_AGENDA = 'agendamentos_sem_conflito';
export const INDICE_CPF = 'pacientes_clinica_cpf_uniq';
export const INDICE_SLUG = 'clinicas_slug_uniq';
