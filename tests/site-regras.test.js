// Testes de js/site-regras.js. Usa instantes fixos em UTC e o fuso de São Paulo (UTC-3, sem horário de verão).
import { teste, igual, igualProfundo } from './harness.js';
import {
  dataNoFuso, horaNoFuso, proximosDias, agruparHorarios, porTurno, escolherProfissional, iniciais,
} from '../js/site-regras.js';

const SP = 'America/Sao_Paulo';

teste('Data e hora no fuso da clínica', () => {
  igual(dataNoFuso('2026-10-06T01:30:00Z', SP), '2026-10-05', 'madrugada UTC ainda é dia anterior em SP');
  igual(horaNoFuso('2026-10-05T12:00:00Z', SP), '09:00');
  igual(horaNoFuso('2026-10-05T03:00:00Z', SP), '00:00');
});

teste('Próximos dias respeitam o limite da agenda online', () => {
  const dias = proximosDias(SP, 14, 60, new Date('2026-10-30T15:00:00Z'));
  igual(dias.length, 14);
  igual(dias[0].iso, '2026-10-30');
  igual(dias[2].iso, '2026-11-01', 'vira o mês');
  igual(dias[0].semana, 5, 'sexta');
  igual(proximosDias(SP, 14, 3, new Date('2026-10-30T15:00:00Z')).length, 4, 'hoje + 3 dias');
});

teste('Agrupa horários por início e ordena', () => {
  const g = agruparHorarios([
    { profissional_id: 'b', inicio: '2026-10-05T13:00:00+00:00' },
    { profissional_id: 'a', inicio: '2026-10-05T12:00:00+00:00' },
    { profissional_id: 'b', inicio: '2026-10-05T12:00:00+00:00' },
  ], SP);
  igualProfundo(g.map((x) => [x.hora, x.profissionais]), [['09:00', ['a', 'b']], ['10:00', ['b']]]);
});

teste('Separa por turno', () => {
  const t = porTurno([{ hora: '08:00' }, { hora: '11:30' }, { hora: '14:00' }, { hora: '18:30' }]);
  igualProfundo(t.map(([nome, l]) => [nome, l.length]), [['Manhã', 2], ['Tarde', 1], ['Noite', 1]]);
  igualProfundo(porTurno([{ hora: '14:00' }]).map(([n]) => n), ['Tarde'], 'omite turnos vazios');
});

teste('"Qualquer profissional" escolhe quem está mais livre', () => {
  const livres = [{ profissional_id: 'a' }, { profissional_id: 'b' }, { profissional_id: 'b' }];
  igual(escolherProfissional(['a', 'b'], livres), 'b');
  igual(escolherProfissional(['a'], livres), 'a');
  igual(escolherProfissional(['c', 'a'], []), 'a', 'empate: ordem do id');
});

teste('Iniciais do avatar', () => {
  igual(iniciais('Dra. Ana Lima'), 'AL');
  igual(iniciais('Dr João'), 'J');
  igual(iniciais('maria das graças souza'), 'MS');
  igual(iniciais(''), '?');
});
