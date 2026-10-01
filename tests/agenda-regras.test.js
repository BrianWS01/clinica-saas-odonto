// Testes de js/agenda-regras.js. Datas montadas no horário local para não depender do fuso da máquina.
import { teste, igual, igualProfundo } from './harness.js';
import {
  paraMinutos, deMinutos, somarDias, diaDaSemana, janelaDoDia, linhasDaGrade,
  dentroDoExpediente, posicaoNaGrade, distribuirSobrepostos, resumoDoDia, mensagemConfirmacao,
} from '../js/agenda-regras.js';

const em = (h, m = 0) => new Date(2026, 9, 5, h, m).toISOString(); // 05/10/2026 local

teste('Minutos <-> HH:MM', () => {
  igual(paraMinutos('08:30'), 510);
  igual(paraMinutos('08:30:00'), 510);
  igual(deMinutos(510), '08:30');
  igual(deMinutos(0), '00:00');
});

teste('Datas: somar dias e dia da semana', () => {
  igual(somarDias('2026-10-31', 1), '2026-11-01');
  igual(somarDias('2026-03-01', -1), '2026-02-28');
  igual(diaDaSemana('2026-10-04'), 0, 'domingo');
  igual(diaDaSemana('2026-10-05'), 1, 'segunda');
});

teste('Janela do dia: usa grades e agendamentos, arredonda para hora cheia', () => {
  igualProfundo(janelaDoDia([], []), { inicio: 480, fim: 1080 }, 'padrão 8–18');
  igualProfundo(janelaDoDia([{ inicio: '07:30', fim: '12:00' }, { inicio: '13:00', fim: '19:15' }], []),
    { inicio: 420, fim: 1200 });
  igualProfundo(janelaDoDia([{ inicio: '08:00', fim: '12:00' }], [{ inicio: em(19), fim: em(19, 30) }]),
    { inicio: 480, fim: 1200 }, 'agendamento fora da grade amplia a janela');
});

teste('Linhas da grade e expediente', () => {
  igualProfundo(linhasDaGrade({ inicio: 480, fim: 600 }, 30), [480, 510, 540, 570]);
  const grade = [{ inicio: '08:00', fim: '12:00' }, { inicio: '13:00', fim: '18:00' }];
  igual(dentroDoExpediente(grade, 480), true);
  igual(dentroDoExpediente(grade, 720), false, 'almoço');
  igual(dentroDoExpediente(grade, 1080), false, 'fim é exclusivo');
});

teste('Posição na grade', () => {
  const janela = { inicio: 480, fim: 1080 };
  igualProfundo(posicaoNaGrade({ inicio: em(9), fim: em(10) }, janela, 30), { topo: 2, altura: 2 });
  igualProfundo(posicaoNaGrade({ inicio: em(7), fim: em(8, 30) }, janela, 30), { topo: 0, altura: 1 }, 'recorta o início');
  igualProfundo(posicaoNaGrade({ inicio: em(9), fim: em(9, 5) }, janela, 30), { topo: 2, altura: 0.5 }, 'altura mínima');
});

teste('Sobrepostos ficam lado a lado', () => {
  const r = distribuirSobrepostos([
    { id: 'a', inicio: em(9), fim: em(10) },
    { id: 'b', inicio: em(9, 30), fim: em(10, 30) },
    { id: 'c', inicio: em(11), fim: em(12) },
  ]);
  const por = Object.fromEntries(r.map((x) => [x.id, [x.coluna, x.colunas]]));
  igualProfundo(por, { a: [0, 2], b: [1, 2], c: [0, 1] });
});

teste('Sobrepostos: reaproveita coluna livre dentro do grupo', () => {
  const r = distribuirSobrepostos([
    { id: 'a', inicio: em(9), fim: em(9, 30) },
    { id: 'b', inicio: em(9), fim: em(11) },
    { id: 'c', inicio: em(9, 30), fim: em(10) },
  ]);
  const por = Object.fromEntries(r.map((x) => [x.id, x.coluna]));
  igualProfundo(por, { a: 0, b: 1, c: 0 });
});

teste('Resumo do dia ignora cancelados no total', () => {
  const r = resumoDoDia([{ status: 'agendado' }, { status: 'confirmado' }, { status: 'cancelado' }]);
  igual(r.ativos, 2);
  igual(r.porStatus.cancelado, 1);
});

teste('Mensagem de confirmação', () => {
  const msg = mensagemConfirmacao({ paciente: 'Ana Souza', clinica: 'Clínica Sorriso', profissional: 'Dr. João',
    servico: 'Limpeza', inicio: em(14, 30) });
  igual(msg.startsWith('Olá, Ana! Passando para confirmar seu Limpeza na Clínica Sorriso no dia 05/10 às 14:30 com Dr. João.'), true, msg);
});
