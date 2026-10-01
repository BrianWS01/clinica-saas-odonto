// Dados da clínica, regras do agendamento online e link do site.
import { UFS, INTERVALOS_AGENDA } from './constants.js';
import { validarClinica, formatarTelefone } from './validators.js';
import { mensagemDeErro } from './supabase.js';
import { toast, mostrarErros, limparValidacao, carregando } from './ui.js';
import * as db from './db.js';
import { estado, ehAdmin, avisarMudanca } from './estado.js';

let form;
let iniciado = false;

/** Link público do site da clínica (servido junto com o sistema, em /site/). */
export function linkDoSite(slug) {
  return new URL(`site/?c=${encodeURIComponent(slug)}`, location.href).href;
}

export function iniciarConfigClinica() {
  if (iniciado) return;
  iniciado = true;
  form = document.getElementById('form-clinica');
  form.uf.innerHTML = '<option value=""></option>' + UFS.map((u) => `<option>${u}</option>`).join('');
  form.intervalo_agenda_min.innerHTML = INTERVALOS_AGENDA.map((m) => `<option value="${m}">${m} minutos</option>`).join('');
  form.addEventListener('submit', salvar);

  document.getElementById('cli-copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkDoSite(estado.clinica.slug));
      toast('Link copiado.', 'sucesso');
    } catch {
      document.getElementById('cli-link-site').select();
      toast('Selecione e copie o link (Ctrl+C).', 'info');
    }
  });
}

export function mostrarConfigClinica() {
  const c = estado.clinica;
  limparValidacao(form);
  form.nome.value = c.nome;
  form.cor_primaria.value = c.cor_primaria;
  form.telefone.value = c.telefone ? formatarTelefone(c.telefone) : '';
  form.whatsapp.value = c.whatsapp ? formatarTelefone(c.whatsapp) : '';
  form.email.value = c.email ?? '';
  form.endereco.value = c.endereco ?? '';
  form.cidade.value = c.cidade ?? '';
  form.uf.value = c.uf ?? '';
  form.sobre.value = c.sobre ?? '';
  form.intervalo_agenda_min.value = c.intervalo_agenda_min;
  form.antecedencia_min_horas.value = c.antecedencia_min_horas;
  form.dias_agenda_online.value = c.dias_agenda_online;
  form.agendamento_online.checked = c.agendamento_online;

  const somenteLeitura = !ehAdmin();
  form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach((i) => { i.disabled = somenteLeitura; });

  const link = linkDoSite(c.slug);
  document.getElementById('cli-link-site').value = link;
  document.getElementById('cli-abrir-site').href = link;
}

async function salvar(ev) {
  ev.preventDefault();
  const valores = Object.fromEntries(new FormData(form));
  valores.agendamento_online = form.agendamento_online.checked;
  const { valido, erros, dados } = validarClinica(valores);
  if (!valido) return mostrarErros(form, erros);

  const restaurar = carregando(form.querySelector('button[type="submit"]'));
  try {
    estado.clinica = await db.atualizarClinica(estado.clinica.id, dados);
    document.getElementById('nome-clinica').textContent = estado.clinica.nome;
    toast('Dados da clínica salvos.', 'sucesso');
    avisarMudanca();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Salvar clínica'), 'erro');
  } finally {
    restaurar();
  }
}
