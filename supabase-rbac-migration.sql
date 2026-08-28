-- ═══════════════════════════════════════════════════════════════
-- WTA 赛事模拟网站 - 后台权限角色系统（RBAC）迁移脚本
-- 目标：Supabase / PostgreSQL
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴执行
--
-- 前置条件：
--   1. 后台要用邮箱登录，先在 Authentication → Users 里创建好登录用户
--      （把"管理员邮箱"和"编辑员邮箱"都建好）
--   2. 本脚本在下方"标记管理员"处，把对应邮箱标记为 admin 角色
-- ═══════════════════════════════════════════════════════════════

-- ── 1. profiles 表：存档每个登录用户的角色 ──────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin','editor')),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.profiles is '登录用户的角色档案（admin=超级管理员 | editor=编辑员）';

-- ── 2. user_tournaments 表：editor 与被分配赛事的关系 ────────────
create table if not exists public.user_tournaments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, tournament_id)
);

comment on table public.user_tournaments is '编辑员可管理/查看的赛事分配关系';

-- ── 3. 启用 RLS ────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_tournaments enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS 辅助函数：判断当前登录用户是否为 admin
-- 必须用 SECURITY DEFINER：函数内部以函数属主权限执行，可读取 profiles，
-- 从而避免策略子查询自引用同一张表造成的 "infinite recursion" 错误。
-- ═══════════════════════════════════════════════════════════════
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── 4. profiles 表的 RLS 策略 ───────────────────────────────────
-- 用户可读取自己的档案；admin 可读取所有人的档案
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- 登录用户可创建/更新自己的档案（首次登录自动建立档案）
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 只有 admin 能修改其他用户的角色/显示名/删除
drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. user_tournaments 表的 RLS 策略 ───────────────────────────
-- admin 可读/写全部分配关系；editor 只能读自己被分配的赛事
drop policy if exists "user_tournaments_admin_all" on public.user_tournaments;
create policy "user_tournaments_admin_all"
  on public.user_tournaments for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "user_tournaments_select_own" on public.user_tournaments;
create policy "user_tournaments_select_own"
  on public.user_tournaments for select
  using (user_id = auth.uid());

-- 注意：editor 本人不允许直接写 user_tournaments（只能由 admin 分配）

-- ── 6. 自动建档：在 Supabase 新建 auth 用户后，自动为其创建 profiles 档案（默认 editor）──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'editor',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 历史已存在的 auth 用户如果没有档案，也批量补建（角色默认 editor，admin 请手动改）
-- 注意：created_at 有默认值 now()，这里 SELECT 不能多带一个 now()，否则报 "INSERT has more expressions than target columns"
insert into public.profiles (id, role, display_name)
select au.id, 'editor', coalesce(au.raw_user_meta_data->>'display_name', split_part(coalesce(au.email, ''), '@', 1), '')
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;

-- ── 7. 标记管理员（重要：把下面邮箱改成你自己的管理员账号邮箱）───
-- 首次为已存在的登录用户创建档案并设为 admin
-- 可重复执行；已存在则更新为 admin
insert into public.profiles (id, role, display_name, created_at)
select au.id, 'admin', coalesce(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1), '管理员'), now()
from auth.users au
where au.email = '405979717@qq.com'
on conflict (id) do update set role = 'admin';