// Estado compartilhado entre as telas do app.html.
import * as db from './db.js';

export const estado = {
  usuario: null,
  clinica: null,
  papel: null,
  servicos: [],
  profissionais: [],
};

const ouvintes = new Set();

/** Chamado quando serviços/profissionais/clínica mudam, para as telas se redesenharem. */
export function aoMudarCadastros(fn) {
  ouvintes.add(fn);
}

export async function recarregarCadastros() {
  const [servicos, profissionais] = await Promise.all([
    db.listarServicos(estado.clinica.id),
    db.listarProfissionais(estado.clinica.id),
  ]);
  estado.servicos = servicos;
  estado.profissionais = profissionais;
  ouvintes.forEach((fn) => fn());
}

export function avisarMudanca() {
  ouvintes.forEach((fn) => fn());
}

export const profissionalPorId = (id) => estado.profissionais.find((p) => p.id === id);
export const servicoPorId = (id) => estado.servicos.find((s) => s.id === id);
export const ehAdmin = () => ['dono', 'admin'].includes(estado.papel);
