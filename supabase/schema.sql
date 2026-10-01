-- =====================================================================
-- Clínica SaaS — schema Supabase (multi-clínica)
-- Rodar inteiro no SQL Editor de um projeto Supabase PRÓPRIO do SaaS
-- (nunca no projeto do CRM WoodTec). Pode ser rodado de novo sem erro.
-- NÃO contém dados de exemplo: o banco começa vazio.
--
-- Isolamento: toda tabela tem clinica_id. O RLS só libera linhas das
-- clínicas em que o usuário é membro (tabela membros). As chaves
-- estrangeiras compostas (clinica_id, id) impedem que um registro aponte
-- para profissional/paciente/serviço de OUTRA clínica.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Funções de trigger
-- ---------------------------------------------------------------------
create or replace function public.tg_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- clinicas
-- ---------------------------------------------------------------------
create table if not exists public.clinicas (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null,
  slug                    text not null,
  segmento                text not null,
  telefone                text,
  whatsapp                text,
  email                   text,
  endereco                text,
  cidade                  text,
  uf                      text,
  sobre                   text,
  cor_primaria            text not null default '#0d9488',
  fuso                    text not null default 'America/Sao_Paulo',
  intervalo_agenda_min    int  not null default 30,
  antecedencia_min_horas  int  not null default 2,
  dias_agenda_online      int  not null default 60,
  agendamento_online      boolean not null default true,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),

  constraint clinicas_nome_preenchido check (length(btrim(nome)) > 0),
  constraint clinicas_slug_formato    check (slug ~ '^[a-z0-9](-?[a-z0-9])+$' and length(slug) between 3 and 40),
  constraint clinicas_segmento_valido check (segmento in ('Odontologia','Estética','Beleza')),
  constraint clinicas_telefone_formato check (telefone ~ '^55[1-9][1-9][0-9]{8,9}$'),
  constraint clinicas_whatsapp_formato check (whatsapp ~ '^55[1-9][1-9][0-9]{8,9}$'),
  constraint clinicas_uf_formato      check (uf ~ '^[A-Z]{2}$'),
  constraint clinicas_cor_formato     check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  constraint clinicas_intervalo_valido check (intervalo_agenda_min in (5,10,15,20,30,45,60)),
  constraint clinicas_antecedencia_valida check (antecedencia_min_horas between 0 and 168),
  constraint clinicas_dias_online_validos check (dias_agenda_online between 1 and 180)
);

create unique index if not exists clinicas_slug_uniq on public.clinicas (slug);

drop trigger if exists clinicas_atualizado_em on public.clinicas;
create trigger clinicas_atualizado_em before update on public.clinicas
  for each row execute function public.tg_set_atualizado_em();

-- ---------------------------------------------------------------------
-- membros: quem acessa cada clínica e com qual papel
-- ---------------------------------------------------------------------
create table if not exists public.membros (
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  papel      text not null default 'recepcao',
  criado_em  timestamptz not null default now(),
  primary key (clinica_id, user_id),
  constraint membros_papel_valido check (papel in ('dono','admin','recepcao','profissional'))
);

create index if not exists membros_user_idx on public.membros (user_id);

-- Helpers de permissão. SECURITY DEFINER para poderem ler "membros"
-- sem cair em recursão de RLS; só respondem sobre o próprio usuário.
create or replace function public.eh_membro(p_clinica uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros
     where clinica_id = p_clinica and user_id = (select auth.uid())
  );
$$;

create or replace function public.eh_admin(p_clinica uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros
     where clinica_id = p_clinica and user_id = (select auth.uid())
       and papel in ('dono','admin')
  );
$$;

-- ---------------------------------------------------------------------
-- profissionais
-- ---------------------------------------------------------------------
create table if not exists public.profissionais (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas (id) on delete cascade,
  nome            text not null,
  especialidade   text,
  registro        text,            -- CRO, etc.
  cor             text not null default '#3b82f6',
  user_id         uuid references auth.users (id) on delete set null,
  ativo           boolean not null default true,
  aparece_no_site boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint profissionais_nome_preenchido check (length(btrim(nome)) > 0),
  constraint profissionais_cor_formato     check (cor ~ '^#[0-9a-fA-F]{6}$'),
  constraint profissionais_clinica_id_uniq unique (clinica_id, id)
);

create index if not exists profissionais_clinica_idx on public.profissionais (clinica_id);

drop trigger if exists profissionais_atualizado_em on public.profissionais;
create trigger profissionais_atualizado_em before update on public.profissionais
  for each row execute function public.tg_set_atualizado_em();

-- ---------------------------------------------------------------------
-- servicos (procedimentos)
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id                 uuid primary key default gen_random_uuid(),
  clinica_id         uuid not null references public.clinicas (id) on delete cascade,
  nome               text not null,
  descricao          text,
  duracao_min        int  not null default 30,
  preco              numeric(10,2),
  ativo              boolean not null default true,
  agendamento_online boolean not null default true,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint servicos_nome_preenchido check (length(btrim(nome)) > 0),
  constraint servicos_duracao_valida  check (duracao_min between 5 and 600),
  constraint servicos_preco_valido    check (preco >= 0),
  constraint servicos_clinica_id_uniq unique (clinica_id, id)
);

create index if not exists servicos_clinica_idx on public.servicos (clinica_id);

drop trigger if exists servicos_atualizado_em on public.servicos;
create trigger servicos_atualizado_em before update on public.servicos
  for each row execute function public.tg_set_atualizado_em();

-- Quais serviços cada profissional atende
create table if not exists public.profissional_servicos (
  clinica_id      uuid not null,
  profissional_id uuid not null,
  servico_id      uuid not null,
  primary key (profissional_id, servico_id),
  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id) on delete cascade,
  foreign key (clinica_id, servico_id)      references public.servicos (clinica_id, id)      on delete cascade
);

create index if not exists prof_servicos_servico_idx on public.profissional_servicos (servico_id);

-- ---------------------------------------------------------------------
-- horarios_trabalho: grade semanal de cada profissional
-- dia_semana: 0 = domingo ... 6 = sábado (igual ao extract(dow) e ao Date.getDay())
-- ---------------------------------------------------------------------
create table if not exists public.horarios_trabalho (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null,
  profissional_id uuid not null,
  dia_semana      int  not null,
  inicio          time not null,
  fim             time not null,
  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id) on delete cascade,
  constraint horarios_dia_valido   check (dia_semana between 0 and 6),
  constraint horarios_ordem_valida check (fim > inicio)
);

create index if not exists horarios_prof_dia_idx on public.horarios_trabalho (profissional_id, dia_semana);

-- ---------------------------------------------------------------------
-- bloqueios: férias, feriado, reunião... (profissional nulo = clínica toda)
-- ---------------------------------------------------------------------
create table if not exists public.bloqueios (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas (id) on delete cascade,
  profissional_id uuid,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  motivo          text,
  criado_em       timestamptz not null default now(),
  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id) on delete cascade,
  constraint bloqueios_ordem_valida check (fim > inicio)
);

create index if not exists bloqueios_clinica_periodo_idx on public.bloqueios (clinica_id, inicio);

-- ---------------------------------------------------------------------
-- pacientes (clientes)
-- ---------------------------------------------------------------------
create table if not exists public.pacientes (
  id                     uuid primary key default gen_random_uuid(),
  clinica_id             uuid not null references public.clinicas (id) on delete cascade,
  nome                   text not null,
  telefone               text not null,
  cpf                    text,
  email                  text,
  data_nascimento        date,
  observacoes            text,
  origem                 text not null default 'Recepção',
  consentimento_lgpd_em  timestamptz,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  constraint pacientes_nome_preenchido check (length(btrim(nome)) > 0),
  constraint pacientes_telefone_formato check (telefone ~ '^55[1-9][1-9][0-9]{8,9}$'),
  constraint pacientes_cpf_formato     check (cpf ~ '^[0-9]{11}$'),
  constraint pacientes_origem_valida   check (origem in ('Recepção','Site','WhatsApp','Indicação','Instagram','Outro')),
  constraint pacientes_clinica_id_uniq unique (clinica_id, id)
);

-- Telefone NÃO é único: mãe e filhos costumam usar o mesmo número.
create unique index if not exists pacientes_clinica_cpf_uniq
  on public.pacientes (clinica_id, cpf) where cpf is not null;
create index if not exists pacientes_clinica_nome_idx on public.pacientes (clinica_id, nome);
create index if not exists pacientes_clinica_tel_idx  on public.pacientes (clinica_id, telefone);

drop trigger if exists pacientes_atualizado_em on public.pacientes;
create trigger pacientes_atualizado_em before update on public.pacientes
  for each row execute function public.tg_set_atualizado_em();

-- ---------------------------------------------------------------------
-- agendamentos
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas (id) on delete cascade,
  profissional_id uuid not null,
  paciente_id     uuid not null,
  servico_id      uuid,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  status          text not null default 'agendado',
  origem          text not null default 'sistema',
  observacoes     text,
  criado_por      uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id),
  foreign key (clinica_id, paciente_id)     references public.pacientes (clinica_id, id) on delete cascade,
  foreign key (clinica_id, servico_id)      references public.servicos (clinica_id, id),
  constraint agendamentos_ordem_valida  check (fim > inicio),
  constraint agendamentos_status_valido check (status in ('agendado','confirmado','atendido','faltou','cancelado')),
  constraint agendamentos_origem_valida check (origem in ('sistema','site'))
);

-- Impede dois agendamentos do mesmo profissional no mesmo horário
-- (o front lê o nome desta constraint no erro 23P01).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agendamentos_sem_conflito') then
    alter table public.agendamentos
      add constraint agendamentos_sem_conflito
      exclude using gist (profissional_id with =, tstzrange(inicio, fim, '[)') with &&)
      where (status <> 'cancelado');
  end if;
end;
$$;

create index if not exists agendamentos_clinica_inicio_idx on public.agendamentos (clinica_id, inicio);
create index if not exists agendamentos_paciente_idx       on public.agendamentos (paciente_id, inicio desc);

drop trigger if exists agendamentos_atualizado_em on public.agendamentos;
create trigger agendamentos_atualizado_em before update on public.agendamentos
  for each row execute function public.tg_set_atualizado_em();

-- =====================================================================
-- FASE 2: odontograma, orçamentos e plano de tratamento
-- Dentes na numeração FDI: permanentes 11–48, decíduos 51–85.
-- Faces: V (vestibular), L (lingual/palatina), M (mesial), D (distal), O (oclusal/incisal).
-- =====================================================================

create or replace function public.dente_valido(p_dente int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_dente is null
      or (p_dente / 10 between 1 and 4 and p_dente % 10 between 1 and 8)
      or (p_dente / 10 between 5 and 8 and p_dente % 10 between 1 and 5);
$$;

-- ---------------------------------------------------------------------
-- odontograma_marcacoes: situação de cada dente/face do paciente
-- ---------------------------------------------------------------------
create table if not exists public.odontograma_marcacoes (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas (id) on delete cascade,
  paciente_id     uuid not null,
  dente           int  not null,
  faces           text[] not null default '{}',
  condicao        text not null,
  observacao      text,
  profissional_id uuid,
  registrado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now(),

  foreign key (clinica_id, paciente_id)     references public.pacientes (clinica_id, id) on delete cascade,
  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id),
  constraint odonto_dente_valido    check (public.dente_valido(dente)),
  constraint odonto_faces_validas   check (faces <@ array['V','L','M','D','O']::text[]),
  constraint odonto_condicao_valida check (condicao in (
    'carie','restauracao','restauracao_insatisfatoria','selante',
    'ausente','extracao_indicada','canal_tratado','canal_indicado','coroa','implante','fratura'
  ))
);

create index if not exists odonto_paciente_idx on public.odontograma_marcacoes (paciente_id, dente);

-- ---------------------------------------------------------------------
-- orcamentos + itens (o orçamento aprovado vira o plano de tratamento)
-- ---------------------------------------------------------------------
create table if not exists public.orcamentos (
  id              uuid primary key default gen_random_uuid(),
  clinica_id      uuid not null references public.clinicas (id) on delete cascade,
  paciente_id     uuid not null,
  profissional_id uuid,
  status          text not null default 'rascunho',
  desconto        numeric(10,2) not null default 0,
  validade        date,
  observacoes     text,
  forma_pagamento text,
  token_publico   uuid not null default gen_random_uuid(),
  enviado_em      timestamptz,
  respondido_em   timestamptz,
  aprovado_nome   text,
  criado_por      uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  foreign key (clinica_id, paciente_id)     references public.pacientes (clinica_id, id) on delete cascade,
  foreign key (clinica_id, profissional_id) references public.profissionais (clinica_id, id),
  constraint orcamentos_status_valido   check (status in ('rascunho','enviado','aprovado','recusado')),
  constraint orcamentos_desconto_valido check (desconto >= 0),
  constraint orcamentos_clinica_id_uniq unique (clinica_id, id)
);

create unique index if not exists orcamentos_token_uniq on public.orcamentos (token_publico);
create index if not exists orcamentos_paciente_idx on public.orcamentos (paciente_id, criado_em desc);

drop trigger if exists orcamentos_atualizado_em on public.orcamentos;
create trigger orcamentos_atualizado_em before update on public.orcamentos
  for each row execute function public.tg_set_atualizado_em();

create table if not exists public.orcamento_itens (
  id           uuid primary key default gen_random_uuid(),
  clinica_id   uuid not null,
  orcamento_id uuid not null,
  servico_id   uuid,
  descricao    text not null,
  dente        int,
  faces        text[] not null default '{}',
  quantidade   int not null default 1,
  valor        numeric(10,2) not null default 0,  -- valor unitário
  ordem        int not null default 0,
  status       text not null default 'pendente',
  concluido_em timestamptz,
  criado_em    timestamptz not null default now(),

  foreign key (clinica_id, orcamento_id) references public.orcamentos (clinica_id, id) on delete cascade,
  foreign key (clinica_id, servico_id)   references public.servicos (clinica_id, id),
  constraint itens_descricao_preenchida check (length(btrim(descricao)) > 0),
  constraint itens_dente_valido     check (public.dente_valido(dente)),
  constraint itens_faces_validas    check (faces <@ array['V','L','M','D','O']::text[]),
  constraint itens_quantidade_valida check (quantidade between 1 and 99),
  constraint itens_valor_valido     check (valor >= 0),
  constraint itens_status_valido    check (status in ('pendente','concluido'))
);

create index if not exists itens_orcamento_idx on public.orcamento_itens (orcamento_id, ordem);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.clinicas              enable row level security;
alter table public.membros               enable row level security;
alter table public.profissionais         enable row level security;
alter table public.servicos              enable row level security;
alter table public.profissional_servicos enable row level security;
alter table public.horarios_trabalho     enable row level security;
alter table public.bloqueios             enable row level security;
alter table public.pacientes             enable row level security;
alter table public.agendamentos          enable row level security;
alter table public.odontograma_marcacoes enable row level security;
alter table public.orcamentos            enable row level security;
alter table public.orcamento_itens       enable row level security;

-- clinicas: membro vê; dono/admin altera. Criação só pela função criar_clinica.
drop policy if exists clinicas_select on public.clinicas;
drop policy if exists clinicas_update on public.clinicas;
create policy clinicas_select on public.clinicas for select to authenticated
  using (public.eh_membro(id));
create policy clinicas_update on public.clinicas for update to authenticated
  using (public.eh_admin(id)) with check (public.eh_admin(id));

-- membros: cada um vê a equipe das próprias clínicas. Alterações por função (fase futura).
drop policy if exists membros_select on public.membros;
create policy membros_select on public.membros for select to authenticated
  using (public.eh_membro(clinica_id));

-- Demais tabelas: qualquer membro da clínica lê e grava.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profissionais','servicos','profissional_servicos','horarios_trabalho',
    'bloqueios','pacientes','agendamentos',
    'odontograma_marcacoes','orcamentos','orcamento_itens'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_membro', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.eh_membro(clinica_id)) with check (public.eh_membro(clinica_id))',
      t || '_membro', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Funções RPC do sistema (usuário logado)
-- ---------------------------------------------------------------------

-- Cria a clínica, coloca quem chamou como dono e cadastra serviços iniciais do segmento.
create or replace function public.criar_clinica(p_nome text, p_slug text, p_segmento text)
returns public.clinicas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_clinica public.clinicas;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado' using errcode = '42501';
  end if;

  insert into public.clinicas (nome, slug, segmento)
  values (btrim(p_nome), lower(btrim(p_slug)), p_segmento)
  returning * into v_clinica;

  insert into public.membros (clinica_id, user_id, papel)
  values (v_clinica.id, v_uid, 'dono');

  insert into public.servicos (clinica_id, nome, duracao_min)
  select v_clinica.id, s.nome, s.duracao
    from (values
      ('Odontologia', 'Avaliação',               30),
      ('Odontologia', 'Limpeza (profilaxia)',    45),
      ('Odontologia', 'Restauração',             60),
      ('Odontologia', 'Clareamento',             60),
      ('Odontologia', 'Manutenção de aparelho',  30),
      ('Estética',    'Avaliação',               30),
      ('Estética',    'Toxina botulínica',       45),
      ('Estética',    'Preenchimento',           60),
      ('Estética',    'Limpeza de pele',         60),
      ('Estética',    'Bioestimulador',          60),
      ('Beleza',      'Corte',                   45),
      ('Beleza',      'Escova',                  45),
      ('Beleza',      'Coloração',               120),
      ('Beleza',      'Manicure',                45),
      ('Beleza',      'Design de sobrancelha',   30)
    ) as s(segmento, nome, duracao)
   where s.segmento = v_clinica.segmento;

  return v_clinica;
end;
$$;

-- ---------------------------------------------------------------------
-- Funções públicas do SITE (anon). Só expõem dados de vitrine e
-- horários livres; nunca dados de pacientes.
-- ---------------------------------------------------------------------

-- Dados públicos da clínica: vitrine + serviços + profissionais.
create or replace function public.site_clinica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nome', c.nome, 'slug', c.slug, 'segmento', c.segmento,
    'telefone', c.telefone, 'whatsapp', c.whatsapp, 'email', c.email,
    'endereco', c.endereco, 'cidade', c.cidade, 'uf', c.uf,
    'sobre', c.sobre, 'cor_primaria', c.cor_primaria,
    'agendamento_online', c.agendamento_online, 'fuso', c.fuso,
    'dias_agenda_online', c.dias_agenda_online,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'nome', s.nome, 'descricao', s.descricao,
               'duracao_min', s.duracao_min, 'preco', s.preco,
               'online', s.agendamento_online)
             order by s.nome)
        from public.servicos s
       where s.clinica_id = c.id and s.ativo), '[]'::jsonb),
    'profissionais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'especialidade', p.especialidade,
               'registro', p.registro,
               'servicos', coalesce((select jsonb_agg(ps.servico_id)
                                       from public.profissional_servicos ps
                                      where ps.profissional_id = p.id), '[]'::jsonb))
             order by p.nome)
        from public.profissionais p
       where p.clinica_id = c.id and p.ativo and p.aparece_no_site), '[]'::jsonb)
  )
  from public.clinicas c
  where c.slug = lower(p_slug);
$$;

-- Horários livres de um dia para um serviço (opcionalmente de um profissional).
create or replace function public.horarios_livres(
  p_slug text, p_servico uuid, p_data date, p_profissional uuid default null
)
returns table (profissional_id uuid, inicio timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select cl.* from public.clinicas cl
     where cl.slug = lower(p_slug) and cl.agendamento_online
  ),
  s as (
    select sv.* from public.servicos sv, c
     where sv.id = p_servico and sv.clinica_id = c.id
       and sv.ativo and sv.agendamento_online
  ),
  limites as (
    select (now() at time zone c.fuso)::date as hoje,
           now() + make_interval(hours => c.antecedencia_min_horas) as minimo,
           c.dias_agenda_online, c.fuso, c.intervalo_agenda_min
      from c
  ),
  candidatos as (
    select p.id as profissional_id,
           gs as inicio_local,
           s.duracao_min,
           l.fuso
      from c
      join s on true
      join limites l on true
      join public.profissionais p
        on p.clinica_id = c.id and p.ativo and p.aparece_no_site
       and (p_profissional is null or p.id = p_profissional)
      join public.profissional_servicos ps
        on ps.profissional_id = p.id and ps.servico_id = s.id
      join public.horarios_trabalho h
        on h.profissional_id = p.id and h.dia_semana = extract(dow from p_data)::int
      cross join lateral generate_series(
        p_data + h.inicio,
        p_data + h.fim - make_interval(mins => s.duracao_min),
        make_interval(mins => l.intervalo_agenda_min)
      ) as gs
     where p_data between l.hoje and l.hoje + l.dias_agenda_online
  )
  select cd.profissional_id, (cd.inicio_local at time zone cd.fuso) as inicio
    from candidatos cd, limites l, c
   where (cd.inicio_local at time zone cd.fuso) >= l.minimo
     and not exists (
       select 1 from public.agendamentos a
        where a.profissional_id = cd.profissional_id
          and a.status <> 'cancelado'
          and tstzrange(a.inicio, a.fim, '[)') &&
              tstzrange(cd.inicio_local at time zone cd.fuso,
                        (cd.inicio_local + make_interval(mins => cd.duracao_min)) at time zone cd.fuso, '[)')
     )
     and not exists (
       select 1 from public.bloqueios b
        where b.clinica_id = c.id
          and (b.profissional_id is null or b.profissional_id = cd.profissional_id)
          and tstzrange(b.inicio, b.fim, '[)') &&
              tstzrange(cd.inicio_local at time zone cd.fuso,
                        (cd.inicio_local + make_interval(mins => cd.duracao_min)) at time zone cd.fuso, '[)')
     )
   order by 2, 1;
$$;

-- Agendamento feito pelo paciente no site.
-- Reaproveita o paciente se já existir um com o mesmo telefone e o mesmo nome.
create or replace function public.agendar_online(
  p_slug text, p_servico uuid, p_profissional uuid, p_inicio timestamptz,
  p_nome text, p_telefone text, p_consentimento boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinica   public.clinicas;
  v_servico   public.servicos;
  v_paciente  uuid;
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_data      date;
  v_id        uuid;
  v_prof_nome text;
begin
  select * into v_clinica from public.clinicas
   where slug = lower(p_slug) and agendamento_online;
  if not found then
    raise exception 'Agendamento online indisponível' using errcode = 'P0002';
  end if;

  if not coalesce(p_consentimento, false) then
    raise exception 'É preciso aceitar o uso dos dados para o agendamento' using errcode = '22023';
  end if;
  if length(v_nome) < 3 then
    raise exception 'Informe o nome completo' using errcode = '22023';
  end if;
  if p_telefone !~ '^55[1-9][1-9][0-9]{8,9}$' then
    raise exception 'Telefone inválido' using errcode = '22023';
  end if;

  select * into v_servico from public.servicos
   where id = p_servico and clinica_id = v_clinica.id;

  -- O horário precisa estar entre os livres (cobre grade, bloqueios, antecedência e serviço)
  v_data := (p_inicio at time zone v_clinica.fuso)::date;
  if not exists (
    select 1 from public.horarios_livres(p_slug, p_servico, v_data, p_profissional) h
     where h.profissional_id = p_profissional and h.inicio = p_inicio
  ) then
    raise exception 'Esse horário não está mais disponível' using errcode = 'P0001';
  end if;

  select id into v_paciente from public.pacientes
   where clinica_id = v_clinica.id and telefone = p_telefone
     and lower(nome) = lower(v_nome)
   limit 1;

  if v_paciente is null then
    insert into public.pacientes (clinica_id, nome, telefone, origem, consentimento_lgpd_em)
    values (v_clinica.id, v_nome, p_telefone, 'Site', now())
    returning id into v_paciente;
  else
    update public.pacientes set consentimento_lgpd_em = coalesce(consentimento_lgpd_em, now())
     where id = v_paciente;
  end if;

  begin
    insert into public.agendamentos
      (clinica_id, profissional_id, paciente_id, servico_id, inicio, fim, origem, criado_por)
    values
      (v_clinica.id, p_profissional, v_paciente, v_servico.id, p_inicio,
       p_inicio + make_interval(mins => v_servico.duracao_min), 'site', null)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado' using errcode = 'P0001';
  end;

  select nome into v_prof_nome from public.profissionais where id = p_profissional;

  return jsonb_build_object(
    'id', v_id, 'inicio', p_inicio, 'servico', v_servico.nome, 'profissional', v_prof_nome
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Orçamento pelo link (anon): o paciente vê e aprova/recusa.
-- O token é um UUID aleatório; rascunhos nunca aparecem.
-- ---------------------------------------------------------------------
create or replace function public.orcamento_publico(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', o.status,
    'criado_em', o.criado_em,
    'validade', o.validade,
    'vencido', o.status = 'enviado' and o.validade is not null
               and o.validade < (now() at time zone c.fuso)::date,
    'desconto', o.desconto,
    'observacoes', o.observacoes,
    'forma_pagamento', o.forma_pagamento,
    'aprovado_nome', o.aprovado_nome,
    'respondido_em', o.respondido_em,
    'paciente', split_part(p.nome, ' ', 1),
    'profissional', pr.nome,
    'clinica', jsonb_build_object('nome', c.nome, 'whatsapp', c.whatsapp, 'telefone', c.telefone,
                                  'cor_primaria', c.cor_primaria, 'cidade', c.cidade, 'uf', c.uf),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'descricao', i.descricao, 'dente', i.dente, 'faces', i.faces,
               'quantidade', i.quantidade, 'valor', i.valor)
             order by i.ordem, i.criado_em)
        from public.orcamento_itens i
       where i.orcamento_id = o.id), '[]'::jsonb)
  )
  from public.orcamentos o
  join public.clinicas c  on c.id = o.clinica_id
  join public.pacientes p on p.id = o.paciente_id
  left join public.profissionais pr on pr.id = o.profissional_id
  where o.token_publico = p_token
    and o.status <> 'rascunho';
$$;

create or replace function public.responder_orcamento(p_token uuid, p_aprovar boolean, p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orc  public.orcamentos;
  v_fuso text;
  v_nome text := btrim(coalesce(p_nome, ''));
begin
  select o.* into v_orc from public.orcamentos o
   where o.token_publico = p_token for update;
  if not found or v_orc.status = 'rascunho' then
    raise exception 'Orçamento não encontrado' using errcode = 'P0002';
  end if;
  if v_orc.status <> 'enviado' then
    raise exception 'Este orçamento já foi respondido' using errcode = 'P0001';
  end if;

  select fuso into v_fuso from public.clinicas where id = v_orc.clinica_id;
  if v_orc.validade is not null and v_orc.validade < (now() at time zone v_fuso)::date then
    raise exception 'Este orçamento venceu. Fale com a clínica para atualizar.' using errcode = 'P0001';
  end if;
  if p_aprovar and length(v_nome) < 3 then
    raise exception 'Informe seu nome completo para aprovar' using errcode = '22023';
  end if;

  update public.orcamentos
     set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         respondido_em = now(),
         aprovado_nome = case when p_aprovar then v_nome else null end
   where id = v_orc.id;

  return case when p_aprovar then 'aprovado' else 'recusado' end;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on public.clinicas, public.membros, public.profissionais, public.servicos,
              public.profissional_servicos, public.horarios_trabalho, public.bloqueios,
              public.pacientes, public.agendamentos,
              public.odontograma_marcacoes, public.orcamentos, public.orcamento_itens
  from anon;

grant select, update on public.clinicas to authenticated;
grant select         on public.membros  to authenticated;
grant select, insert, update, delete
  on public.profissionais, public.servicos, public.profissional_servicos,
     public.horarios_trabalho, public.bloqueios, public.pacientes, public.agendamentos,
     public.odontograma_marcacoes, public.orcamentos, public.orcamento_itens
  to authenticated;

revoke execute on function public.eh_membro(uuid)                    from public, anon;
revoke execute on function public.eh_admin(uuid)                     from public, anon;
revoke execute on function public.criar_clinica(text, text, text)    from public, anon;
grant  execute on function public.eh_membro(uuid)                    to authenticated;
grant  execute on function public.eh_admin(uuid)                     to authenticated;
grant  execute on function public.criar_clinica(text, text, text)    to authenticated;

-- Site público
revoke execute on function public.site_clinica(text)                                   from public;
revoke execute on function public.horarios_livres(text, uuid, date, uuid)              from public;
revoke execute on function public.agendar_online(text, uuid, uuid, timestamptz, text, text, boolean) from public;
grant  execute on function public.site_clinica(text)                                   to anon, authenticated;
grant  execute on function public.horarios_livres(text, uuid, date, uuid)              to anon, authenticated;
grant  execute on function public.agendar_online(text, uuid, uuid, timestamptz, text, text, boolean) to anon, authenticated;

-- Fase 2
revoke execute on function public.dente_valido(int)                                from public, anon;
grant  execute on function public.dente_valido(int)                                to authenticated;
revoke execute on function public.orcamento_publico(uuid)                          from public;
revoke execute on function public.responder_orcamento(uuid, boolean, text)         from public;
grant  execute on function public.orcamento_publico(uuid)                          to anon, authenticated;
grant  execute on function public.responder_orcamento(uuid, boolean, text)         to anon, authenticated;
