// Testes de js/odonto-regras.js.
import { teste, igual, igualProfundo, verdadeiro, falso } from './harness.js';
import {
  ARCADAS, denteValido, nomeDente, regioesDoDente, formatarFaces, lerFaces, estadoDosDentes,
  validarMarcacao, resumoOdontograma, localDoItem, totaisOrcamento, progressoTratamento,
  validarItemOrcamento, validarOrcamento, mensagemOrcamento,
} from '../js/odonto-regras.js';

teste('Arcadas: 32 permanentes e 20 decíduos, todos válidos', () => {
  const perm = [...ARCADAS.permanentes.superior, ...ARCADAS.permanentes.inferior];
  const dec = [...ARCADAS.deciduos.superior, ...ARCADAS.deciduos.inferior];
  igual(new Set(perm).size, 32);
  igual(new Set(dec).size, 20);
  verdadeiro([...perm, ...dec].every(denteValido));
});

teste('Dente válido (FDI)', () => {
  verdadeiro(denteValido(11));
  verdadeiro(denteValido('48'));
  verdadeiro(denteValido(85));
  falso(denteValido(19), 'posição 9');
  falso(denteValido(56), 'decíduo só vai até 5');
  falso(denteValido(10));
  falso(denteValido(91));
  falso(denteValido('abc'));
});

teste('Nome do dente', () => {
  igual(nomeDente(36), '1º molar inferior esquerdo');
  igual(nomeDente(11), 'incisivo central superior direito');
  igual(nomeDente(48), '3º molar (siso) inferior direito');
  igual(nomeDente(54), '1º molar superior direito (decíduo)');
  igual(nomeDente(99), '');
});

teste('Regiões: vestibular para fora, mesial para o centro', () => {
  igualProfundo(regioesDoDente(16), { cima: 'V', baixo: 'L', esquerda: 'D', direita: 'M', centro: 'O' });
  igualProfundo(regioesDoDente(26), { cima: 'V', baixo: 'L', esquerda: 'M', direita: 'D', centro: 'O' });
  igualProfundo(regioesDoDente(36), { cima: 'L', baixo: 'V', esquerda: 'M', direita: 'D', centro: 'O' });
  igualProfundo(regioesDoDente(46), { cima: 'L', baixo: 'V', esquerda: 'D', direita: 'M', centro: 'O' });
  igualProfundo(regioesDoDente(85), regioesDoDente(45), 'decíduo segue o permanente');
});

teste('Faces: formatação clínica e leitura', () => {
  igual(formatarFaces(['D', 'O', 'M']), 'MOD');
  igual(formatarFaces(['L', 'V', 'O', 'O']), 'OVL');
  igual(formatarFaces([]), '');
  igualProfundo(lerFaces('mod'), ['M', 'O', 'D']);
  igualProfundo(lerFaces('M, O x'), ['M', 'O']);
  igualProfundo(lerFaces(''), []);
});

teste('Estado dos dentes: marcação mais recente vence na face', () => {
  const estado = estadoDosDentes([
    { dente: 36, faces: ['O', 'M'], condicao: 'carie', criado_em: '2026-01-01' },
    { dente: 36, faces: ['O'], condicao: 'restauracao', criado_em: '2026-02-01' },
    { dente: 36, faces: [], condicao: 'canal_tratado', criado_em: '2026-02-01' },
    { dente: 18, faces: [], condicao: 'ausente', criado_em: '2026-01-01' },
    { dente: 18, faces: [], condicao: 'ausente', criado_em: '2026-03-01' },
  ]);
  igualProfundo(estado.get(36).faces, { O: 'restauracao', M: 'carie' });
  igualProfundo(estado.get(36).inteiro, ['canal_tratado']);
  igualProfundo(estado.get(18).inteiro, ['ausente'], 'não repete');
  igualProfundo(resumoOdontograma(estado), { dentesMarcados: 2, dentesATratar: 1 });
});

teste('Validar marcação', () => {
  verdadeiro(validarMarcacao({ dente: 36, faces: ['O'], condicao: 'carie' }).valido);
  verdadeiro(validarMarcacao({ dente: 36, faces: ['O'], condicao: 'ausente' }).valido, 'faces ignoradas');
  igualProfundo(validarMarcacao({ dente: 36, faces: ['O'], condicao: 'ausente' }).dados.faces, []);
  verdadeiro(validarMarcacao({ dente: 36, faces: [], condicao: 'carie' }).erros.faces, 'cárie precisa de face');
  verdadeiro(validarMarcacao({ dente: 19, faces: ['O'], condicao: 'xyz' }).erros.dente);
  verdadeiro(validarMarcacao({ dente: 11, condicao: 'xyz' }).erros.condicao);
});

teste('Orçamento: totais, desconto limitado e arredondamento', () => {
  const itens = [{ valor: 250, quantidade: 2 }, { valor: 180.1, quantidade: 1 }, { valor: 0.2, quantidade: 3 }];
  igualProfundo(totaisOrcamento(itens, 80), { subtotal: 680.7, desconto: 80, total: 600.7 });
  igualProfundo(totaisOrcamento(itens, 9999), { subtotal: 680.7, desconto: 680.7, total: 0 });
  igualProfundo(totaisOrcamento([], 0), { subtotal: 0, desconto: 0, total: 0 });
});

teste('Local do item e progresso', () => {
  igual(localDoItem({ dente: 36, faces: ['O', 'M'] }), 'Dente 36 (MO)');
  igual(localDoItem({ dente: 11, faces: [] }), 'Dente 11');
  igual(localDoItem({ dente: null, faces: [] }), '');
  igualProfundo(progressoTratamento([{ status: 'concluido' }, { status: 'pendente' }, { status: 'pendente' }]),
    { total: 3, concluidos: 1, percentual: 33 });
  igualProfundo(progressoTratamento([]), { total: 0, concluidos: 0, percentual: 0 });
});

teste('Validar item do orçamento', () => {
  const ok = validarItemOrcamento({ descricao: 'Restauração', dente: '36', faces: 'om', quantidade: '1', valor: '250,00' });
  verdadeiro(ok.valido, JSON.stringify(ok.erros));
  igualProfundo(ok.dados.faces, ['M', 'O']);
  igual(ok.dados.valor, 250);
  const semDente = validarItemOrcamento({ descricao: 'Limpeza', dente: '', faces: 'O', valor: 180 });
  igual(semDente.dados.dente, null);
  igualProfundo(semDente.dados.faces, [], 'sem dente não guarda face');
  const ruim = validarItemOrcamento({ descricao: '', dente: '19', quantidade: '0', valor: 'abc' });
  igualProfundo(Object.keys(ruim.erros).sort(), ['dente', 'descricao', 'quantidade', 'valor']);
  verdadeiro(validarItemOrcamento({ descricao: 'X', valor: '' }).erros.valor, 'valor obrigatório');
});

teste('Validar orçamento: itens, desconto e validade', () => {
  const itens = [{ valor: 100, quantidade: 1 }];
  const ok = validarOrcamento({ desconto: '10,00', validade: '2026-10-31' }, itens, '2026-10-01');
  verdadeiro(ok.valido, JSON.stringify(ok.erros));
  igual(ok.dados.desconto, 10);
  const ruim = validarOrcamento({ desconto: '200', validade: '2026-09-01' }, itens, '2026-10-01');
  igualProfundo(Object.keys(ruim.erros).sort(), ['desconto', 'validade']);
  verdadeiro(validarOrcamento({}, [], '2026-10-01').erros.itens);
  igual(validarOrcamento({ desconto: '' }, itens, '2026-10-01').dados.desconto, 0, 'desconto vazio = 0');
});

teste('Mensagem do orçamento', () => {
  const m = mensagemOrcamento({ paciente: 'Ana Souza', clinica: 'Clínica Sorriso', link: 'https://x/o?t=1', total: 1234.5 });
  verdadeiro(m.startsWith('Olá, Ana! Segue o seu orçamento da Clínica Sorriso (total R$'), m);
  verdadeiro(m.endsWith('https://x/o?t=1'));
});
