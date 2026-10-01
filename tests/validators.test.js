// Testes de js/validators.js. Valores definidos aqui mesmo; nada é gravado no banco.
import { teste, igual, igualProfundo, verdadeiro, falso } from './harness.js';
import {
  validarCpf, formatarCpf, mascaraCpf, gerarSlug, slugValido,
  normalizarTelefone, formatarTelefone, mascaraTelefone, linkWhatsapp,
  idade, lerValorMonetario, horaValida, dataIsoValida,
  validarNovaClinica, validarClinica, validarPaciente, validarServico,
  validarProfissional, validarAgendamento, campoDoErro,
} from '../js/validators.js';

// --- CPF --------------------------------------------------------------
teste('CPF: aceita válidos com e sem máscara', () => {
  verdadeiro(validarCpf('529.982.247-25'), 'com máscara');
  verdadeiro(validarCpf('52998224725'), 'sem máscara');
  verdadeiro(validarCpf('11144477735'), 'outro válido');
});

teste('CPF: recusa DV errado, repetidos e tamanho errado', () => {
  falso(validarCpf('52998224724'), 'DV errado');
  falso(validarCpf('11111111111'), 'repetidos');
  falso(validarCpf('5299822472'), '10 dígitos');
  falso(validarCpf(''), 'vazio');
});

teste('CPF: formatação e máscara', () => {
  igual(formatarCpf('52998224725'), '529.982.247-25');
  igual(mascaraCpf('529'), '529');
  igual(mascaraCpf('5299822'), '529.982.2');
  igual(mascaraCpf('529982247259999'), '529.982.247-25', 'corta excesso');
});

// --- Slug -------------------------------------------------------------
teste('Slug: gera a partir do nome', () => {
  igual(gerarSlug('Clínica Sorriso & Cia'), 'clinica-sorriso-cia');
  igual(gerarSlug('  Studio  Bela  Pele!! '), 'studio-bela-pele');
  igual(gerarSlug('Odonto'.repeat(10)).length <= 40, true, 'máximo 40');
});

teste('Slug: valida formato', () => {
  verdadeiro(slugValido('clinica-sorriso'));
  verdadeiro(slugValido('abc'));
  falso(slugValido('ab'), 'curto');
  falso(slugValido('-abc'), 'hífen no início');
  falso(slugValido('abc-'), 'hífen no fim');
  falso(slugValido('ab--c'), 'hífen duplo');
  falso(slugValido('Clinica'), 'maiúscula');
});

// --- Telefone ---------------------------------------------------------
teste('Telefone: normaliza, formata e mascara (igual ao CRM)', () => {
  igual(normalizarTelefone('(11) 91234-5678'), '5511912345678');
  igual(normalizarTelefone('+55 11 3123-4567'), '551131234567');
  igual(normalizarTelefone('(11) 81234-5678'), null, 'celular sem 9');
  igual(normalizarTelefone('(20) 91234-5678'), null, 'DDD inexistente');
  igual(formatarTelefone('5511912345678'), '(11) 91234-5678');
  igual(mascaraTelefone('11912345678'), '(11) 91234-5678');
});

teste('WhatsApp: link com texto codificado', () => {
  igual(linkWhatsapp('(11) 91234-5678', 'Olá, tudo bem?'), 'https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  igual(linkWhatsapp('123'), null);
});

// --- Datas e valores --------------------------------------------------
teste('Datas e horas', () => {
  verdadeiro(dataIsoValida('2026-02-28'));
  falso(dataIsoValida('2026-02-30'));
  verdadeiro(horaValida('08:30'));
  falso(horaValida('24:00'));
  falso(horaValida('8:30'));
});

teste('Idade: conta aniversário corretamente', () => {
  igual(idade('2000-10-01', '2026-10-01'), 26, 'no dia');
  igual(idade('2000-10-02', '2026-10-01'), 25, 'véspera');
  igual(idade('', '2026-10-01'), null, 'vazio');
});

teste('Valor monetário', () => {
  igual(lerValorMonetario('150'), 150);
  igual(lerValorMonetario('150,5'), 150.5);
  igual(lerValorMonetario('R$ 1.234,56'), 1234.56);
  igual(lerValorMonetario(''), null);
  verdadeiro(Number.isNaN(lerValorMonetario('abc')));
  verdadeiro(Number.isNaN(lerValorMonetario('1,234')), 'três casas');
});

// --- Entidades --------------------------------------------------------
teste('Nova clínica: valida nome, slug e segmento', () => {
  const ok = validarNovaClinica({ nome: 'Sorriso', slug: 'sorriso', segmento: 'Odontologia' });
  verdadeiro(ok.valido);
  const ruim = validarNovaClinica({ nome: ' ', slug: 'a', segmento: 'Médico' });
  igualProfundo(Object.keys(ruim.erros).sort(), ['nome', 'segmento', 'slug']);
});

teste('Clínica: normaliza telefone, UF e números', () => {
  const r = validarClinica({
    nome: 'Sorriso', telefone: '(11) 3123-4567', whatsapp: '', uf: 'sp', cor_primaria: '#0d9488',
    intervalo_agenda_min: '30', antecedencia_min_horas: '2', dias_agenda_online: '60', agendamento_online: true,
  });
  verdadeiro(r.valido, JSON.stringify(r.erros));
  igual(r.dados.telefone, '551131234567');
  igual(r.dados.whatsapp, null);
  igual(r.dados.uf, 'SP');
  igual(r.dados.intervalo_agenda_min, 30);

  const ruim = validarClinica({ nome: 'X', uf: 'XX', cor_primaria: 'azul', intervalo_agenda_min: '7',
    antecedencia_min_horas: '-1', dias_agenda_online: '0' });
  igualProfundo(Object.keys(ruim.erros).sort(),
    ['antecedencia_min_horas', 'cor_primaria', 'dias_agenda_online', 'intervalo_agenda_min', 'uf']);
});

teste('Paciente: obrigatórios, CPF e nascimento futuro', () => {
  const ok = validarPaciente({ nome: 'Ana Souza', telefone: '11912345678', cpf: '529.982.247-25',
    data_nascimento: '1990-05-10' }, '2026-10-01');
  verdadeiro(ok.valido, JSON.stringify(ok.erros));
  igual(ok.dados.cpf, '52998224725');
  igual(ok.dados.origem, 'Recepção', 'origem padrão');

  const ruim = validarPaciente({ nome: '', telefone: '', cpf: '123', data_nascimento: '2030-01-01' }, '2026-10-01');
  igualProfundo(Object.keys(ruim.erros).sort(), ['cpf', 'data_nascimento', 'nome', 'telefone']);
});

teste('Serviço: duração e preço', () => {
  const ok = validarServico({ nome: 'Limpeza', duracao_min: '45', preco: '180,00', ativo: true, agendamento_online: true });
  verdadeiro(ok.valido);
  igual(ok.dados.preco, 180);
  const semPreco = validarServico({ nome: 'Avaliação', duracao_min: '30', preco: '' });
  igual(semPreco.dados.preco, null);
  const ruim = validarServico({ nome: 'X', duracao_min: '2', preco: 'dez' });
  igualProfundo(Object.keys(ruim.erros).sort(), ['duracao_min', 'preco']);
});

teste('Profissional: grade semanal', () => {
  const ok = validarProfissional({
    nome: 'Dra. Ana', cor: '#3b82f6', ativo: true, aparece_no_site: true,
    horarios: [{ dia_semana: 1, inicio: '08:00', fim: '12:00' }, { dia_semana: 1, inicio: '13:00', fim: '18:00' }],
    servicos: ['a', 'a', 'b'],
  });
  verdadeiro(ok.valido, JSON.stringify(ok.erros));
  igualProfundo(ok.dados.servicos, ['a', 'b'], 'remove repetidos');

  const invertido = validarProfissional({ nome: 'A', cor: '#000000', horarios: [{ dia_semana: 2, inicio: '12:00', fim: '08:00' }] });
  verdadeiro(invertido.erros.horarios, 'fim antes do início');

  const sobreposto = validarProfissional({ nome: 'A', cor: '#000000', horarios: [
    { dia_semana: 3, inicio: '08:00', fim: '12:00' }, { dia_semana: 3, inicio: '11:00', fim: '14:00' }] });
  verdadeiro(sobreposto.erros.horarios, 'sobreposição');
});

teste('Agendamento: calcula início e fim', () => {
  const r = validarAgendamento({ paciente_id: 'p', profissional_id: 'x', data: '2026-10-05', hora: '09:30', duracao_min: '45' });
  verdadeiro(r.valido, JSON.stringify(r.erros));
  igual(new Date(r.dados.fim) - new Date(r.dados.inicio), 45 * 60000);
  igual(new Date(r.dados.inicio).getHours(), 9);
  const ruim = validarAgendamento({ data: '2026-13-01', hora: '9h', duracao_min: '0' });
  igualProfundo(Object.keys(ruim.erros).sort(), ['data', 'duracao_min', 'hora', 'paciente_id', 'profissional_id']);
});

teste('campoDoErro: identifica pelo nome do índice', () => {
  const mapa = { pacientes_clinica_cpf_uniq: 'cpf' };
  igual(campoDoErro({ message: 'duplicate key value violates unique constraint "pacientes_clinica_cpf_uniq"' }, mapa), 'cpf');
  igual(campoDoErro({ message: 'outro' }, mapa), null);
  igual(campoDoErro(null, mapa), null);
});
