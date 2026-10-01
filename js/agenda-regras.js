// Regras da agenda. Módulo puro (sem DOM, sem Supabase): testado em tests/agenda-regras.test.js.

/** "HH:MM" ou "HH:MM:SS" -> minutos desde 00:00 */
export function paraMinutos(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + m;
}

/** minutos -> "HH:MM" */
export function deMinutos(min) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
}

/** Minutos desde a meia-noite (horário local) de um timestamp. */
export function minutosDoDia(timestamp) {
  const d = new Date(timestamp);
  return d.getHours() * 60 + d.getMinutes();
}

/** Soma dias a "AAAA-MM-DD". */
export function somarDias(dataIso, dias) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(dataIso) {
  const [a, m, d] = dataIso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Início e fim (ISO) do dia local, para filtrar agendamentos no banco. */
export function limitesDoDia(dataIso) {
  const [a, m, d] = dataIso.split('-').map(Number);
  return {
    de: new Date(a, m - 1, d).toISOString(),
    ate: new Date(a, m - 1, d + 1).toISOString(),
  };
}

/**
 * Faixa de horas exibida na agenda do dia: do menor início ao maior fim
 * entre as grades dos profissionais e os agendamentos. Padrão 08:00–18:00.
 * Arredonda para horas cheias.
 */
export function janelaDoDia(horarios, agendamentos, padrao = { inicio: 8 * 60, fim: 18 * 60 }) {
  let inicio = Infinity;
  let fim = -Infinity;
  for (const h of horarios) {
    inicio = Math.min(inicio, paraMinutos(h.inicio));
    fim = Math.max(fim, paraMinutos(h.fim));
  }
  for (const a of agendamentos) {
    inicio = Math.min(inicio, minutosDoDia(a.inicio));
    const f = minutosDoDia(a.fim);
    fim = Math.max(fim, f === 0 ? 24 * 60 : f);
  }
  if (!Number.isFinite(inicio)) return { ...padrao };
  return {
    inicio: Math.floor(inicio / 60) * 60,
    fim: Math.min(24 * 60, Math.ceil(fim / 60) * 60),
  };
}

/** Linhas da grade: [inicio, inicio+passo, ...) até fim. */
export function linhasDaGrade(janela, passo) {
  const linhas = [];
  for (let m = janela.inicio; m < janela.fim; m += passo) linhas.push(m);
  return linhas;
}

/** Profissional trabalha nesse minuto (segundo a grade semanal do dia)? */
export function dentroDoExpediente(horariosDoProfissional, minuto) {
  return horariosDoProfissional.some((h) => minuto >= paraMinutos(h.inicio) && minuto < paraMinutos(h.fim));
}

/**
 * Posição vertical de um agendamento na grade (em "linhas" de `passo` minutos).
 * Retorna { topo, altura } em unidades de linha, recortado à janela.
 */
export function posicaoNaGrade(agendamento, janela, passo) {
  const ini = Math.max(minutosDoDia(agendamento.inicio), janela.inicio);
  let fimMin = minutosDoDia(agendamento.fim);
  if (fimMin === 0) fimMin = 24 * 60;
  const fim = Math.min(fimMin, janela.fim);
  return {
    topo: (ini - janela.inicio) / passo,
    altura: Math.max((fim - ini) / passo, 0.5),
  };
}

/**
 * Agendamentos que se sobrepõem na mesma coluna ficam lado a lado.
 * Recebe agendamentos de UM profissional; devolve [{ ...ag, coluna, colunas }].
 * (Cancelados podem coincidir com ativos, por isso o layout precisa disso.)
 */
export function distribuirSobrepostos(agendamentos) {
  const ord = [...agendamentos].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const resultado = [];
  let grupo = [];
  let fimGrupo = -Infinity;

  const fecharGrupo = () => {
    const colunasFim = [];
    const itens = grupo.map((ag) => {
      const ini = new Date(ag.inicio).getTime();
      let c = colunasFim.findIndex((f) => f <= ini);
      if (c === -1) c = colunasFim.length;
      colunasFim[c] = new Date(ag.fim).getTime();
      return { ...ag, coluna: c };
    });
    itens.forEach((i) => resultado.push({ ...i, colunas: colunasFim.length }));
    grupo = [];
    fimGrupo = -Infinity;
  };

  for (const ag of ord) {
    const ini = new Date(ag.inicio).getTime();
    if (grupo.length && ini >= fimGrupo) fecharGrupo();
    grupo.push(ag);
    fimGrupo = Math.max(fimGrupo, new Date(ag.fim).getTime());
  }
  if (grupo.length) fecharGrupo();
  return resultado;
}

/** Resumo do dia: total ativo e contagem por status. */
export function resumoDoDia(agendamentos) {
  const porStatus = {};
  for (const a of agendamentos) porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;
  const ativos = agendamentos.filter((a) => a.status !== 'cancelado').length;
  return { ativos, porStatus };
}

/** Mensagem de confirmação para o WhatsApp. */
export function mensagemConfirmacao({ paciente, clinica, profissional, servico, inicio }) {
  const d = new Date(inicio);
  const p = (n) => String(n).padStart(2, '0');
  const data = `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const primeiroNome = String(paciente ?? '').trim().split(/\s+/)[0] || '';
  const oQue = servico ? `${servico} ` : 'atendimento ';
  return `Olá, ${primeiroNome}! Passando para confirmar seu ${oQue}na ${clinica} ` +
    `no dia ${data} às ${hora}${profissional ? ` com ${profissional}` : ''}. ` +
    'Podemos confirmar? Responda SIM para confirmar ou nos avise se precisar remarcar.';
}
