// Regras do site público (agendamento online). Módulo puro: testado em tests/site-regras.test.js.

/** Data "AAAA-MM-DD" de um instante no fuso da clínica. */
export function dataNoFuso(instante, fuso) {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instante));
}

/** "HH:MM" de um instante no fuso da clínica. */
export function horaNoFuso(instante, fuso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(instante));
}

/** Próximos `quantidade` dias a partir de hoje (no fuso da clínica), limitados a `maxDias`. */
export function proximosDias(fuso, quantidade, maxDias, agora = new Date()) {
  const hoje = dataNoFuso(agora, fuso);
  const [a, m, d] = hoje.split('-').map(Number);
  const dias = [];
  for (let i = 0; i < Math.min(quantidade, maxDias + 1); i++) {
    const dt = new Date(Date.UTC(a, m - 1, d + i));
    dias.push({
      iso: dt.toISOString().slice(0, 10),
      semana: dt.getUTCDay(),
      dia: dt.getUTCDate(),
      mes: dt.getUTCMonth(),
    });
  }
  return dias;
}

/**
 * Agrupa os horários livres por hora exibida.
 * livres: [{ profissional_id, inicio }] -> [{ hora, inicio, profissionais: [ids] }] em ordem.
 */
export function agruparHorarios(livres, fuso) {
  const mapa = new Map();
  for (const h of livres) {
    const chave = new Date(h.inicio).toISOString();
    if (!mapa.has(chave)) mapa.set(chave, { hora: horaNoFuso(h.inicio, fuso), inicio: h.inicio, profissionais: [] });
    mapa.get(chave).profissionais.push(h.profissional_id);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

/** Separa em turnos para exibir: manhã (<12h), tarde (<18h), noite. */
export function porTurno(grupos) {
  const turnos = { 'Manhã': [], 'Tarde': [], 'Noite': [] };
  for (const g of grupos) {
    const h = Number(g.hora.slice(0, 2));
    turnos[h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite'].push(g);
  }
  return Object.entries(turnos).filter(([, lista]) => lista.length);
}

/**
 * "Qualquer profissional": escolhe quem tem menos horários ocupados nesse dia
 * (mais horários livres), para distribuir os pacientes. Empate: ordem alfabética do id.
 */
export function escolherProfissional(candidatos, livresDoDia) {
  if (candidatos.length === 1) return candidatos[0];
  const livresPor = {};
  for (const h of livresDoDia) livresPor[h.profissional_id] = (livresPor[h.profissional_id] ?? 0) + 1;
  return [...candidatos].sort((a, b) => (livresPor[b] ?? 0) - (livresPor[a] ?? 0) || a.localeCompare(b))[0];
}

/** Iniciais para o avatar: "Dra. Ana Lima" -> "AL" */
export function iniciais(nome) {
  const partes = String(nome ?? '')
    .replace(/^(dra?|sr|sra)\.?\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
