// Câmara 2026 — app de estudo (plano, questões, caderno de erros, ensaios, desempenho).
import * as fb from './fb.js';
import { EDITAL, CRONOGRAMA, CONTEUDOS, STATUS } from './edital.js';
import { PROVA, CORTES, SEMANAS, roteiro, semanaDe, ROTULO_DIA, resumoDia, MATERIAIS } from './plano.js';

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const difDias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const sinal = (n) => (n > 0 ? '+' + n : String(n));
const embaralhar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const local = {
  get: (k, d) => { try { const v = localStorage.getItem('c26:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('c26:' + k, JSON.stringify(v)); } catch {} },
};

const GRAUS = { c: 'Certeza', d: 'Dúvida', k: 'Chute' };
const MOTIVOS = { cont: 'Falta de conteúdo', leit: 'Leitura do item', peg: 'Pegadinha da banca', chute: 'Chute', aten: 'Desatenção' };
const INTERVALOS = [1, 3, 7, 15];
const BANCOS = { leg: 'Legislação e Português', ti: 'TI e Dados', da: 'Dir. Administrativo' };
const BK = Object.keys(BANCOS);

// ---------- estado ----------
const S = {
  user: null, pronto: false,
  banco: null,
  leg: { hist: [], it: {}, cal: {} },
  ti: { hist: [], it: {}, cal: {} },
  da: { hist: [], it: {}, cal: {} },
  plano: { chk: {}, dias: {}, sim: {} },
  cad: { A: {}, dom: {}, mot: {}, rev: {} },
  ensaios: [], pecas: [], peca: null,
  view: local.get('view', 'hoje'),
  foco: local.get('foco', false),
  errAss: local.get('errAss', ''),
  q: null, ens: null, filtros: local.get('filtros', { banco: 'leg', n: '', o: '', modo: 'novos', qtd: 20 }),
};
const DOCS = { leg: 'dados/leg', ti: 'dados/ti', da: 'dados/da', plano: 'dados/plano', cad: 'dados/caderno' };

const timers = {};
// base[k]: última versão do documento vinda do servidor (ou do cache). Salvar = mandar só a diferença.
const base = {};
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const ehObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function diferencas(a, b, cam = [], out = []) {
  for (const k of Object.keys(b)) {
    if (b[k] === undefined) continue;
    const p = [...cam, k];
    if (!(k in a)) out.push([p, b[k]]);
    else if (ehObj(a[k]) && ehObj(b[k])) diferencas(a[k], b[k], p, out);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      // lista que só cresceu (histórico de sessões): acrescenta sem reescrever a lista inteira
      const prefixo = Array.isArray(a[k]) && Array.isArray(b[k]) && b[k].length > a[k].length && JSON.stringify(b[k].slice(0, a[k].length)) === JSON.stringify(a[k]);
      out.push([p, prefixo ? { __uniao: b[k].slice(a[k].length) } : b[k]]);
    }
  }
  for (const k of Object.keys(a)) if (!(k in b) || b[k] === undefined) out.push([[...cam, k], { __del: true }]);
  return out;
}
function salvar(chave) {
  clearTimeout(timers[chave]);
  timers[chave] = setTimeout(() => {
    S[chave].v = Date.now();
    const novo = clone(S[chave]);
    const pr = base[chave] ? fb.atualizarCampos(DOCS[chave], diferencas(base[chave], novo)) : fb.mesclar(DOCS[chave], novo);
    base[chave] = novo;
    pr.catch((e) => aviso('Falha ao salvar: ' + e.message));
    delete timers[chave];
  }, 400);
}

function aviso(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(timers._t); timers._t = setTimeout(() => t.classList.remove('on'), 3500);
}

// ---------- banco ----------
function itemKey(b, d) { return b + ':' + d.id; }
function itens(b) { return S.banco ? S.banco[b] || [] : []; }
function acharItem(chave) {
  const [b, id] = chave.split(':');
  return itens(b).find((d) => String(d.id) === id) || (S.banco && (S.banco.cadx || []).find((d) => d.b_ === b && String(d.id) === id)) || null;
}
const origem = (d) => d.o || 'aut';
const ORIG = { aut: 'Autorais', real: 'Cebraspe (provas reais)', conv: 'FGV convertidas' };

async function carregarBanco() {
  const meta = await fb.ler('banco/meta');
  if (!meta) return null;
  const partes = await Promise.all(Array.from({ length: meta.partes }, (_, i) => fb.ler('banco/p' + i)));
  const b = { leg: [], ti: [], da: [], cadx: [], TX: {}, TXL: meta.TXL || {}, ORIG: meta.ORIG || ORIG, gerado: meta.gerado };
  partes.forEach((p) => { if (!p) return; for (const k of [...BK, 'cadx']) b[k].push(...(p[k] || [])); Object.assign(b.TX, p.TX || {}); });
  return b;
}

async function importarBanco(json) {
  const pares = [];
  const tam = (o) => JSON.stringify(o).length;
  const novo = () => ({ leg: [], ti: [], da: [], cadx: [], TX: {} });
  let atual = novo(), n = 0;
  const fechar = () => { pares.push(['banco/p' + n, atual]); n++; atual = novo(); };
  const LIM = 700000;
  for (const k of [...BK, 'cadx']) for (const d of json[k] || []) { if (tam(atual) + tam(d) > LIM) fechar(); atual[k].push(d); }
  for (const [k, v] of Object.entries(json.TX || {})) { if (tam(atual) + tam(v) > LIM) fechar(); atual.TX[k] = v; }
  fechar();
  pares.push(['banco/meta', { partes: n, gerado: json.gerado || new Date().toISOString(), TXL: json.TXL || {}, ORIG: json.ORIG || ORIG, nleg: json.leg.length, nti: json.ti.length, nda: (json.da || []).length }]);
  await fb.gravarVarios(pares);
}

// ---------- registro de respostas ----------
function registrar(b, d, resp, grau) {
  const st = S[b];
  const k = String(d.id);
  const r = st.it[k] || { s: 0, e: 0 };
  r.s++;
  const ok = resp === d.g;
  if (resp !== 'B' && !ok) r.e++;
  r.u = resp === 'B' ? 'b' : ok ? 'c' : 'e';
  r.g = grau || '';
  r.t = Date.now();
  st.it[k] = r;
  if (resp !== 'B' && grau) {
    const bl = d.n || '—';
    st.cal[bl] = st.cal[bl] || {};
    const c = st.cal[bl][grau] || [0, 0];
    c[0]++; if (ok) c[1]++;
    st.cal[bl][grau] = c;
  }
  // caderno de erros
  const ck = itemKey(b, d);
  if (resp !== 'B' && !ok) {
    const a = S.cad.A[ck] || { n: 0 };
    a.n++; a.g = d.g; a.m = resp; a.last = new Date().toISOString(); a.gr = grau || '';
    S.cad.A[ck] = a;
    S.cad.rev[ck] = { box: 0, next: somaDias(hojeISO(), 1) };
    delete S.cad.dom[ck];
  } else if (ok && S.cad.A[ck] && !S.cad.dom[ck] && S.q && S.q.revisao) {
    const rv = S.cad.rev[ck] || { box: 0 };
    rv.box = (rv.box || 0) + 1;
    if (rv.box >= INTERVALOS.length) { S.cad.dom[ck] = new Date().toISOString(); delete S.cad.rev[ck]; }
    else { rv.next = somaDias(hojeISO(), INTERVALOS[rv.box]); S.cad.rev[ck] = rv; }
  }
}

// ---------- métricas ----------
function liquidoSessoes() {
  const all = BK.flatMap((b) => S[b].hist.map((h, i) => ({ ...h, b_: b, ts: h.ts || i })));
  return all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function acertoPorFonte() {
  const out = {};
  for (const b of BK) {
    for (const d of itens(b)) {
      const r = S[b].it[d.id];
      if (!r || !r.s) continue;
      const f = out[d.n] = out[d.n] || { s: 0, e: 0 };
      f.s += r.s; f.e += r.e;
    }
  }
  return Object.entries(out).map(([n, v]) => ({ n, s: v.s, ac: (v.s - v.e) / v.s })).sort((a, b) => b.s - a.s);
}
function calibracaoTotal() {
  const t = { c: [0, 0], d: [0, 0], k: [0, 0] };
  for (const b of BK) for (const bl of Object.values(S[b].cal || {})) for (const g of Object.keys(t)) if (bl[g]) { t[g][0] += bl[g][0]; t[g][1] += bl[g][1]; }
  for (const e of S.ensaios) { const r = resultadoEnsaio(e); if (r) for (const g of Object.keys(t)) { t[g][0] += r.cal[g][0]; t[g][1] += r.cal[g][1]; } }
  return t;
}
function viesRecente() {
  const hs = liquidoSessoes().filter((h) => h.mc != null).slice(-10);
  let mc = 0, gc = 0, n = 0;
  hs.forEach((h) => { mc += h.mc; gc += h.gc; n += h.c + h.e; });
  return n ? { mc, gc, n, dif: Math.round(((mc - gc) / n) * 100) } : null;
}

// ---------- ensaios ----------
function resultadoEnsaio(e) {
  if (e.resumo) return null;
  if (!e.gab || !e.resp) return null;
  const N = e.n;
  const r = { p1: 0, p2: 0, c: 0, e: 0, b: 0, x: 0, porBloco: {}, cal: { c: [0, 0], d: [0, 0], k: [0, 0] }, mc: 0, gc: 0, resp: 0 };
  const blocoDe = (i) => (e.blocos || []).find((b) => i + 1 >= b[0] && i + 1 <= b[1]);
  for (let i = 0; i < N; i++) {
    const a = e.resp[i] || '-', g = e.gab[i] || '-', gr = (e.grau || '')[i] || '-';
    const parte = i < (e.corte || N / 2) ? 'p1' : 'p2';
    const bl = blocoDe(i); const nome = bl ? bl[2] : '—';
    const pb = r.porBloco[nome] = r.porBloco[nome] || { c: 0, e: 0, b: 0 };
    let pts = 0;
    if (g === 'X') { pts = 1; r.x++; }
    else if (a === '-') { r.b++; pb.b++; }
    else if (a === g) { pts = 1; r.c++; pb.c++; }
    else { pts = -1; r.e++; pb.e++; }
    r[parte] += pts;
    if (a !== '-' && g !== 'X' && g !== '-') {
      r.resp++; if (a === 'C') r.mc++; if (g === 'C') r.gc++;
      if (GRAUS[gr]) { r.cal[gr][0]++; if (a === g) r.cal[gr][1]++; }
    }
  }
  r.total = r.p1 + r.p2;
  return r;
}
function notaEnsaio(e) {
  if (e.resumo) return e.resumo;
  const r = resultadoEnsaio(e); return r ? { p1: r.p1, p2: r.p2, total: r.total } : null;
}

// ---------- navegação ----------
const VIEWS = {
  hoje: { t: 'Hoje', ic: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  plano: { t: 'Plano', ic: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 15l2 2 4-4"/>' },
  questoes: { t: 'Questões', ic: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>' },
  erros: { t: 'Erros', ic: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5z"/>' },
  desempenho: { t: 'Desempenho', ic: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>' },
};
const icone = (p) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

function nav() {
  const itensNav = Object.entries(VIEWS).map(([k, v]) => `<a href="#${k}" class="${S.view === k ? 'on' : ''}" data-view="${k}">${icone(v.ic)}<span>${v.t}</span></a>`).join('');
  $('#nav').innerHTML = `<p class="marca">Câmara 2026</p>${itensNav}<div class="esp"></div><a href="#ajustes" class="${S.view === 'ajustes' ? 'on' : ''}" data-view="ajustes">${icone('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')}<span>Ajustes</span></a>`;
}

function ir(view) {
  if (!VIEWS[view] && !['ajustes', 'sessao', 'ensaio', 'discursiva', 'peca', 'edital', 'materiais'].includes(view)) view = 'hoje';
  S.view = view; if (VIEWS[view] || view === 'ajustes') local.set('view', view);
  render();
  window.scrollTo(0, 0);
}

function render() {
  nav();
  const m = $('#main');
  if (!S.user) { m.innerHTML = telaLogin(); return; }
  if (!S.pronto) { m.innerHTML = '<p class="carregando">Carregando seus dados…</p>'; return; }
  const v = { hoje: vHoje, plano: vPlano, questoes: vQuestoes, sessao: vSessao, erros: vErros, desempenho: vDesempenho, ensaio: vEnsaio, discursiva: vDiscursiva, edital: () => { S.planoAba = 'edital'; return vPlano(); }, peca: vPeca, materiais: () => { S.planoAba = 'mat'; return vPlano(); }, ajustes: vAjustes }[S.view] || vHoje;
  m.innerHTML = v();
  if (S.view === 'ensaio') posEnsaio();
  if (S.view === 'peca') posPeca();
}

// ---------- telas ----------
function telaLogin() {
  return `<section class="login"><h1>Câmara 2026</h1><p>Plano, questões, caderno de erros e ensaios, sincronizados entre celular, iPad e PC.</p>
  <button class="btn" data-act="entrar">Entrar com Google</button>
  <p class="mut">${fb.instalado ? 'No app instalado no iPad/iPhone, o login do Google costuma falhar. Use a senha do app (criada em Ajustes, no PC).' : 'Ou entre com a senha do app (criada em Ajustes).'}</p>
  <form data-act="entrarSenha" class="linha"><input type="password" name="senha" placeholder="Senha do app" autocomplete="current-password" required minlength="6"><button class="btn sec">Entrar com senha</button></form>
  <p class="mut">Só a conta ${esc(fb.DONO)} tem acesso aos dados.</p></section>`;
}

function trilha(hoje) {
  const atual = semanaDe(hoje);
  const barras = SEMANAS.map((s) => `<div class="tb ${hoje > s.fim ? 'feita' : atual && atual.n === s.n ? 'atual' : ''}" title="S${s.n} · ${esc(s.bloco)}"></div>`).join('');
  const rot = SEMANAS.map((s) => `<span class="${atual && atual.n === s.n ? 'b' : ''}">S${s.n}<i> · ${esc(s.curto)}</i></span>`).join('');
  return `<section class="trilha" aria-label="Semanas do plano"><div class="tg">${barras}</div><div class="tg rot">${rot}</div></section>`;
}

function diasSemana(hoje) {
  const s = semanaDe(hoje);
  const ini = s ? s.ini : somaDias(hoje, -new Date(hoje + 'T12:00:00').getDay());
  return `<section class="dias" aria-label="Dias da semana">${Array.from({ length: 7 }, (_, i) => {
    const d = somaDias(ini, i); const reg = S.plano.dias[d] || {};
    const cls = d === hoje ? 'hoje' : new Date(d + 'T12:00:00').getDay() === 6 ? 'desc' : '';
    return `<button class="dia ${cls}" data-act="dia" data-d="${d}"><span class="dl">${ROTULO_DIA[new Date(d + 'T12:00:00').getDay()]} ${d.slice(8)}</span><span class="dr">${reg.ok ? '✓ ' : ''}${esc(resumoDia(d))}</span></button>`;
  }).join('')}</section>`;
}

function vHoje() {
  const hoje = S.diaSel || hojeISO();
  const s = semanaDe(hoje);
  const faltam = difDias(hojeISO(), PROVA);
  const reg = S.plano.dias[hoje] || { m: [] };
  const marcas = new Set(reg.m || []);
  const tarefas = roteiro(hoje).map((t) => `<label class="tarefa ${marcas.has(t.k) ? 'feita' : ''}">
      <input type="checkbox" data-act="marca" data-k="${t.k}" ${marcas.has(t.k) ? 'checked' : ''}>
      <span><b>${esc(t.t)}</b>${t.h ? ' · ' + esc(t.h) : ''}<br><small>${esc(t.det)}</small></span>
      ${t.k === 'q' || t.k === 'port' ? `<a class="btn sm" href="#questoes" data-view="questoes">Questões</a>` : ''}
      ${t.k === 'ens' ? `<a class="btn sm" href="#" data-act="novoEnsaio">Ensaio</a>` : ''}
      ${t.k === 'corr' ? `<a class="btn sm" href="#erros" data-view="erros">Caderno</a>` : ''}
      ${t.k === 'disc' ? `<a class="btn sm" href="#" data-act="novaPeca">Peça</a>` : ''}
    </label>`).join('');
  const ult = S.leg.hist[S.leg.hist.length - 1];
  const ultE = S.ensaios.filter((e) => notaEnsaio(e)).sort((a, b) => (a.data < b.data ? 1 : -1))[0];
  const nE = ultE && notaEnsaio(ultE);
  const pend = pendentesRevisao().length;
  const painel = `<aside class="col painel">${blocoDesempenhoCurto()}</aside>`;
  return `<header class="topo"><div><p class="sub">${new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}${s ? ' · Semana ' + s.n + ' de 9 · ' + esc(s.bloco) : ''}</p>
    <h1>Hoje${S.diaSel && S.diaSel !== hojeISO() ? ' <small>(' + dm(S.diaSel) + ')</small>' : ''}</h1></div>
    <div class="dir"><p class="sub">Prova em 17/01<br><strong class="grande">${faltam} dias</strong></p>
    <button class="btn sm sec foco-btn" data-act="foco" aria-pressed="${S.foco}">${S.foco ? 'Mostrar desempenho' : 'Modo foco'}</button></div></header>
    ${trilha(hoje)}${diasSemana(hoje)}
    <div class="cols ${S.foco ? 'foco' : ''}"><section class="col">
      <h2>Roteiro · 4 h</h2>${tarefas}
      ${(() => { const w = s && CRONOGRAMA.find((x) => x.id === 's' + s.n); return w ? `<h2>Checklist da semana ${s.n}</h2><p class="mut">Marcar aqui cobre o edital automaticamente.</p>${w.it.map((it) => linhaChk(it)).join('')}` : ''; })()}
      <label class="nota"><span>Anotação do dia</span><textarea data-act="anot" rows="3" placeholder="O que foi feito, o que ficou para trás">${esc(reg.a || '')}</textarea></label>
      <label class="tarefa ${reg.ok ? 'feita' : ''}"><input type="checkbox" data-act="diaok" ${reg.ok ? 'checked' : ''}><span><b>Dia cumprido</b></span></label>
      <div class="cards3">
        <div class="card"><p class="mut">Última sessão</p><p class="num">${ult ? ult.c + ' / ' + ult.n : '—'}</p><p class="mut">${ult ? esc(ult.f) + ' · líquido ' + sinal(ult.l) : 'nenhuma ainda'}</p></div>
        <div class="card"><p class="mut">Último ensaio</p><p class="num ${nE && nE.p1 < CORTES.p1 ? 'alerta' : ''}">${nE ? 'P1 ' + nE.p1 : '—'}</p><p class="mut">${nE ? 'P2 ' + nE.p2 + ' · total ' + nE.total : ''}</p></div>
        <a class="card" href="#erros" data-view="erros"><p class="mut">Caderno de erros</p><p class="num cor">${pend}</p><p class="mut">para revisar hoje</p></a>
      </div>
    </section>${S.foco ? '' : painel}</div>`;
}

function blocoDesempenhoCurto() {
  const hs = liquidoSessoes().slice(-12);
  const vi = viesRecente();
  return `<h2>Desempenho</h2>${graficoLiquido(hs)}${vi ? `<p class="mut">Viés de Certo (últimas 10 sessões): marcou C em ${pct(vi.mc, vi.n)}; gabarito C em ${pct(vi.gc, vi.n)}. ${Math.abs(vi.dif) > 5 ? '<b class="alerta">Diferença de ' + sinal(vi.dif) + ' p.p.</b>' : 'Equilibrado.'}</p>` : ''}
  ${tabelaCalibracao(calibracaoTotal())}<p><a href="#desempenho" data-view="desempenho">Ver desempenho completo →</a></p>`;
}

function graficoLiquido(hs) {
  if (!hs.length) return '<p class="mut">Sem sessões registradas.</p>';
  const W = 500, H = 150, pad = 14;
  const vals = hs.map((h) => h.l);
  const max = Math.max(5, ...vals), min = Math.min(0, ...vals);
  const x = (i) => pad + (hs.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (hs.length - 1));
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const pts = vals.map((v, i) => x(i) + ',' + y(v)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="150" role="img" aria-label="Líquido por sessão: ${vals.join(', ')}">
    <line x1="0" y1="${y(0)}" x2="${W}" y2="${y(0)}" stroke="#d6d3d1"/>
    <polyline fill="none" stroke="var(--ac)" stroke-width="3" stroke-linejoin="round" points="${pts}"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--ac)"><title>${esc(hs[i].d)} · ${esc(hs[i].f)} · ${sinal(v)}</title></circle>`).join('')}
  </svg><p class="mut">Líquido (C − E) por sessão, últimas ${hs.length}.</p>`;
}

function tabelaCalibracao(t) {
  const linhas = Object.entries(GRAUS).map(([g, nome]) => {
    const [n, ok] = t[g] || [0, 0];
    const tx = n ? ok / n : null;
    const leitura = !n ? '—' : g === 'c' ? (tx < 0.85 ? '<b class="alerta">erros com certeza demais</b>' : 'confiável') : tx > 0.55 ? 'compensa marcar' : tx < 0.5 ? '<b class="alerta">deixar em branco</b>' : 'no limite';
    return `<tr><td>${nome}</td><td class="n">${n}</td><td class="n">${n ? pct(ok, n) : '—'}</td><td>${leitura}</td></tr>`;
  }).join('');
  return `<table class="tab"><caption>Calibração: acerto por grau de certeza</caption><thead><tr><th>Grau</th><th class="n">Itens</th><th class="n">Acerto</th><th>Leitura</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// ----- Questões -----
function fontes(b) { return [...new Set(itens(b).map((d) => d.n))]; }
function vQuestoes() {
  if (!S.banco) return `<h1>Questões</h1><p>Carregando o banco de questões… Se demorar e nada aparecer, o banco ainda não foi importado. Vá em <a href="#ajustes" data-view="ajustes">Ajustes</a> e importe o arquivo <code>banco.json</code>.</p>`;
  const f = S.filtros;
  const opF = fontes(f.banco).map((n) => `<option ${f.n === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const disp = filtrar().length;
  return `<h1>Questões</h1><form class="filtros" data-form="filtros">
    <label>Banco<select name="banco">${BK.map((b) => `<option value="${b}" ${f.banco === b ? 'selected' : ''}>${BANCOS[b]} (${itens(b).length})</option>`).join('')}</select></label>
    <label>Fonte<select name="n"><option value="">Todas</option>${opF}</select></label>
    <label>Origem<select name="o"><option value="">Todas</option>${Object.entries(ORIG).map(([k, v]) => `<option value="${k}" ${f.o === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Quais<select name="modo">${[['novos', 'Ainda não vistos'], ['erros', 'Só os que já errei'], ['todos', 'Todos']].map(([k, v]) => `<option value="${k}" ${f.modo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Quantidade<select name="qtd">${[10, 20, 40, 90].map((n) => `<option ${+f.qtd === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  </form><p class="mut">${disp} itens disponíveis com esses filtros.</p>
  <button class="btn" data-act="iniciar" ${disp ? '' : 'disabled'}>Começar</button>
  <section class="dica"><h2>Como responder</h2><p>Antes de marcar C ou E, diga o grau de certeza. É isso que mostra, com os seus números, quando o chute compensa e quando deixar em branco. Antes de marcar C, procure o erro de propósito.</p></section>`;
}
function filtrar() {
  const f = S.filtros; const st = S[f.banco];
  return itens(f.banco).filter((d) => (!f.n || d.n === f.n) && (!f.o || origem(d) === f.o) && (
    f.modo === 'todos' ? true : f.modo === 'novos' ? !st.it[d.id] : (st.it[d.id] && st.it[d.id].e > 0)));
}
function iniciarSessao(lista, rotulo, banco, revisao = false) {
  S.q = { banco, items: lista, i: 0, ans: [], grau: [], t0: Date.now(), f: rotulo, revisao, gsel: null, feito: false };
  ir('sessao');
}
function textoProva(d) {
  if (!d.x || !S.banco.TX[d.x]) return '';
  const sig = (d.a || '').match(/^(TQ|TL|CD14|PL|STJ|TRF6|FUB|PF)/); const u = sig && S.banco.TXL[sig[1]];
  return `<details class="txp" open><summary>Texto da prova${u ? ` · <a href="${esc(u)}" target="_blank" rel="noopener">caderno em PDF</a>` : ''}</summary><pre>${esc(S.banco.TX[d.x])}</pre></details>`;
}
function baseLei(d) {
  if (d.J && typeof d.J === 'string' && !d.L) return `<div class="lei"><div class="lh">Fundamento</div><div class="lt">${esc(d.J)}</div></div>`;
  if (S.q.banco === 'ti') return (d.FS ? `<p class="ref">Fonte: ${d.FU ? `<a href="${esc(d.FU)}" target="_blank" rel="noopener">${esc(d.FS)}</a>` : esc(d.FS)}</p>` : '') + (d.F ? `<div class="lei"><div class="lt">${esc(d.F)}</div></div>` : '');
  if (!d.L && !d.J) return d.k ? `<div class="lei"><b>Texto-base:</b> “…${esc(d.k)}…”</div>` : '';
  return `<div class="lei"><div class="lh">O que a lei diz${d.R ? ' — ' + esc(d.R) : ''}</div>${d.L ? `<div class="lt">${esc(d.L)}</div>` : ''}${d.N ? `<div class="lj">${esc(d.N)}</div>` : ''}</div>`;
}
function refItem(d) { if (d.o) return esc(d.s || d.t || ''); return d.a ? `${esc(d.n)}, art. ${esc(d.a)}${d.v ? ' · Vol. ' + d.v : ''}${d.p ? ', p. ' + d.p : ''}` : esc(d.n); }

function vSessao() {
  const q = S.q; if (!q) { S.view = 'questoes'; return vQuestoes(); }
  if (q.fim) return resultadoSessao();
  const d = q.items[q.i];
  const resp = q.ans[q.i];
  const grauBtns = Object.entries(GRAUS).map(([g, n]) => `<button class="pill ${q.gsel === g ? 'on' : ''}" data-act="grau" data-g="${g}" ${q.feito ? 'disabled' : ''}>${n}</button>`).join('');
  let fb = '';
  if (q.feito) {
    const ok = resp === d.g, br = resp === 'B';
    fb = `<div class="fb ${br ? '' : ok ? 'ok' : 'no'}"><b>${br ? 'Em branco' : ok ? 'Correto' : 'Incorreto'} — gabarito: ${d.g === 'C' ? 'CERTO' : 'ERRADO'}</b><p class="just">${esc(d.c)}</p>${baseLei(d)}<p class="ref">${refItem(d)}</p></div>`;
  }
  return `<div class="sessao"><div class="sbar"><span>Item ${q.i + 1} de ${q.items.length} · ${esc(d.n)}</span><button class="btn sm sec" data-act="encerrar">Encerrar</button></div>
    <div class="prog"><div style="width:${(q.i / q.items.length) * 100}%"></div></div>
    ${textoProva(d)}${d.m || d.cmd ? `<p class="cmd">${esc(d.m || d.cmd)}</p>` : ''}<p class="item">${esc(d.q)}</p>
    <p class="mut">${q.feito ? '' : q.gsel ? 'Agora responda.' : 'Primeiro, o grau de certeza:'}</p>
    <div class="graus">${grauBtns}</div>
    <div class="resp"><button class="btn ce ${resp === 'C' ? 'sel' : ''}" data-act="resp" data-a="C" ${q.feito || !q.gsel ? 'disabled' : ''}>Certo</button><button class="btn ce ${resp === 'E' ? 'sel' : ''}" data-act="resp" data-a="E" ${q.feito || !q.gsel ? 'disabled' : ''}>Errado</button><button class="btn sec" data-act="resp" data-a="B" ${q.feito ? 'disabled' : ''}>Em branco</button></div>
    ${fb}${q.feito ? `<button class="btn" data-act="prox">${q.i === q.items.length - 1 ? 'Ver resultado' : 'Próximo →'}</button>` : ''}</div>`;
}

function fecharSessao() {
  const q = S.q; const n = q.ans.length; if (!n) { S.q = null; ir('questoes'); return; }
  let c = 0, e = 0, b = 0, mc = 0, gc = 0;
  q.items.slice(0, n).forEach((d, i) => { const a = q.ans[i]; if (a === 'B') b++; else { if (a === d.g) c++; else e++; if (a === 'C') mc++; if (d.g === 'C') gc++; } });
  const h = { d: dm(hojeISO()), ts: Date.now(), f: q.f, n, c, e, b, l: c - e, mc, gc, min: Math.round((Date.now() - q.t0) / 60000) };
  S[q.banco].hist.push(h);
  salvar(q.banco); salvar('cad');
  q.fim = h;
  render();
}
function resultadoSessao() {
  const q = S.q, h = q.fim;
  const cal = { c: [0, 0], d: [0, 0], k: [0, 0] };
  q.items.slice(0, h.n).forEach((d, i) => { const a = q.ans[i], g = q.grau[i]; if (a !== 'B' && GRAUS[g]) { cal[g][0]++; if (a === d.g) cal[g][1]++; } });
  const resp = h.c + h.e;
  return `<h1>Resultado</h1><div class="cards3"><div class="card"><p class="num">${h.c}</p><p class="mut">acertos</p></div><div class="card"><p class="num">${h.e}</p><p class="mut">erros</p></div><div class="card"><p class="num cor">${sinal(h.l)}</p><p class="mut">líquido (C − E)</p></div></div>
  <p>${h.b} em branco · ${h.min} min (${h.n ? Math.round((h.min * 60) / h.n) : 0} s por item).</p>
  ${resp ? `<p>Marcou Certo em ${pct(h.mc, resp)} dos respondidos; o gabarito era Certo em ${pct(h.gc, resp)}. ${Math.abs(Math.round(((h.mc - h.gc) / resp) * 100)) > 5 ? '<b class="alerta">Viés de ' + sinal(Math.round(((h.mc - h.gc) / resp) * 100)) + ' p.p.</b>' : ''}</p>` : ''}
  ${tabelaCalibracao(cal)}
  <p><button class="btn" data-view="questoes">Nova sessão</button> <button class="btn sec" data-view="erros">Caderno de erros</button></p>`;
}

// ----- Caderno de erros -----
function pendentesRevisao() {
  const hoje = hojeISO();
  return Object.keys(S.cad.A).filter((k) => !S.cad.dom[k] && (!S.cad.rev[k] || (S.cad.rev[k].next || '') <= hoje));
}
function vErros() {
  const todos = Object.entries(S.cad.A).filter(([k]) => !S.cad.dom[k]);
  const pend = new Set(pendentesRevisao());
  const filtro = S.errFiltro || 'pend';
  // Assuntos presentes nos erros em aberto, agrupados por disciplina (banco)
  const grupos = {};
  todos.forEach(([k]) => { const d = acharItem(k); if (!d) return; const b = k.split(':')[0]; const g = grupos[b] = grupos[b] || {}; g[d.n || '—'] = (g[d.n || '—'] || 0) + 1; });
  const ass = S.errAss || '';
  const noAss = (k) => { if (!ass) return true; const [b] = k.split(':'); const [fb_, fn] = ass.split('|'); if (b !== fb_) return false; if (fn === undefined) return true; const d = acharItem(k); return d && (d.n || '—') === fn; };
  let lista = todos.filter(([k]) => (filtro === 'todos' || pend.has(k)) && noAss(k));
  if (filtro === 'semmot') lista = todos.filter(([k]) => !S.cad.mot[k] && noAss(k));
  const pendF = [...pend].filter(noAss).length;
  const NOMEB = { ...BANCOS, cad: 'Diagnóstico' };
  const opAss = `<select data-act="errAss"><option value="">Todas as disciplinas</option>${Object.entries(grupos).map(([b, g]) => `<optgroup label="${esc(NOMEB[b] || b)}"><option value="${b}" ${ass === b ? 'selected' : ''}>${esc(NOMEB[b] || b)}: tudo (${Object.values(g).reduce((x, y) => x + y, 0)})</option>${Object.entries(g).sort((x, y) => x[0].localeCompare(y[0], 'pt')).map(([n, c]) => `<option value="${esc(b + '|' + n)}" ${ass === b + '|' + n ? 'selected' : ''}>${esc(n)} (${c})</option>`).join('')}</optgroup>`).join('')}</select>`;
  lista.sort((a, b) => (b[1].last || '').localeCompare(a[1].last || ''));
  const contMot = {}; todos.forEach(([k]) => { const m = S.cad.mot[k] || 'sem'; contMot[m] = (contMot[m] || 0) + 1; });
  const linhas = lista.slice(0, 80).map(([k, a]) => {
    const d = acharItem(k);
    if (!d) return '';
    return `<article class="erro"><p class="mut">${esc(d.n)} · errou ${a.n}× · marcou ${esc(a.m)}, gabarito ${esc(d.g)}${a.gr ? ' · ' + GRAUS[a.gr] : ''}</p><p>${esc(d.q)}</p>
      <details><summary>Ver comentário</summary><p class="just">${esc(d.c)}</p></details>
      <div class="linha"><select data-act="motivo" data-k="${k}"><option value="">Motivo do erro…</option>${Object.entries(MOTIVOS).map(([m, t]) => `<option value="${m}" ${S.cad.mot[k] === m ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn sm sec" data-act="dominei" data-k="${k}">Dominei</button></div></article>`;
  }).join('');
  return `<h1>Caderno de erros</h1><p class="mut">${todos.length} itens em aberto · ${pend.size} para revisar hoje. Acerto na revisão sobe o intervalo (1, 3, 7, 15 dias); depois do quarto acerto, o item vai para dominados.</p>
  <p class="mot">${Object.entries(contMot).map(([m, n]) => `<span class="tag">${m === 'sem' ? 'Sem motivo' : MOTIVOS[m]}: ${n}</span>`).join(' ')}</p>
  <div class="linha">${opAss}</div>
  <div class="linha"><button class="btn" data-act="revisar" ${pendF ? '' : 'disabled'}>Revisar os ${pendF} de hoje${ass ? ' deste filtro' : ''}</button>
  <select data-act="errFiltro"><option value="pend" ${filtro === 'pend' ? 'selected' : ''}>Para revisar hoje</option><option value="semmot" ${filtro === 'semmot' ? 'selected' : ''}>Sem motivo marcado</option><option value="todos" ${filtro === 'todos' ? 'selected' : ''}>Todos em aberto</option></select></div>
  ${linhas || '<p class="mut">Nada aqui.</p>'}${lista.length > 80 ? `<p class="mut">Mostrando 80 de ${lista.length}.</p>` : ''}`;
}

// ----- Desempenho -----
function vDesempenho() {
  const ens = S.ensaios.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
  const resolvidos = BK.reduce((t, b) => t + Object.values(S[b].it).reduce((s, r) => s + r.s, 0), 0);
  const ultE = ens.filter((e) => notaEnsaio(e)).slice(-1)[0]; const nE = ultE && notaEnsaio(ultE);
  const fontesAc = acertoPorFonte().slice(0, 12).map((f) => `<div class="barra"><span>${esc(f.n)}</span><div class="bt"><div style="width:${Math.max(0, f.ac) * 100}%"></div></div><span class="n">${Math.round(f.ac * 100)}%</span><span class="mut n">${f.s}</span></div>`).join('');
  const linhasEns = ens.map((e) => { const n = notaEnsaio(e); return `<tr><td>${dm(e.data)}</td><td>${esc(e.nome)}</td><td class="n ${n && n.p1 < CORTES.p1 ? 'alerta' : ''}">${n ? n.p1 : '—'}</td><td class="n ${n && n.p2 < CORTES.p2 ? 'alerta' : ''}">${n ? n.p2 : '—'}</td><td class="n ${n && n.total < CORTES.total ? 'alerta' : ''}">${n ? n.total : '—'}</td><td><a href="#" data-act="abrirEnsaio" data-id="${e.id}">${e.gab || e.resumo ? 'ver' : 'continuar'}</a></td></tr>`; }).join('');
  return `<h1>Desempenho</h1>
  <div class="cards4"><div class="card"><p class="mut">Até a prova</p><p class="num cor">${difDias(hojeISO(), PROVA)} dias</p></div>
  <div class="card"><p class="mut">Último ensaio · P1</p><p class="num ${nE && nE.p1 < CORTES.p1 ? 'alerta' : ''}">${nE ? nE.p1 + ' / ' + CORTES.p1 : '—'}</p></div>
  <div class="card"><p class="mut">Último ensaio · P2</p><p class="num ${nE && nE.p2 < CORTES.p2 ? 'alerta' : ''}">${nE ? nE.p2 + ' / ' + CORTES.p2 : '—'}</p></div>
  <div class="card"><p class="mut">Itens resolvidos</p><p class="num">${resolvidos}</p></div></div>
  <section><h2>Ensaios</h2><p class="mut">Cortes: ${CORTES.p1} em P1, ${CORTES.p2} em P2, ${CORTES.total} no total. Em vermelho, abaixo do corte.</p>
  <table class="tab"><thead><tr><th>Data</th><th>Ensaio</th><th class="n">P1</th><th class="n">P2</th><th class="n">Total</th><th></th></tr></thead><tbody>${linhasEns || '<tr><td colspan="6" class="mut">Nenhum ensaio.</td></tr>'}</tbody></table>
  <button class="btn" data-act="novoEnsaio">Novo ensaio</button>${projecao(ens)}</section>
  <section><h2>Cobertura do edital</h2>${resumoEdital()}<p><button class="btn sec" data-act="abrirEdital">Abrir o edital</button></p></section>
  <section><h2>Discursiva</h2>${resumoDiscursiva()}<p><button class="btn sec" data-view="discursiva">Abrir discursiva</button></p></section>
  <section><h2>Questões</h2>${graficoLiquido(liquidoSessoes().slice(-20))}</section>
  <section><h2>Acerto por fonte</h2><p class="mut">Percentual líquido de acerto (vistas − erros) / vistas, e número de respostas.</p>${fontesAc || '<p class="mut">Sem dados.</p>'}</section>
  <section><h2>Calibração</h2>${tabelaCalibracao(calibracaoTotal())}<p class="mut">Inclui questões e ensaios. Acerto acima de 50% num grau quer dizer que marcar naquele grau soma pontos; abaixo, tira.</p></section>`;
}

// ----- Ensaio -----
function novoEnsaio() {
  const id = 'e' + Date.now();
  S.ens = { id, data: hojeISO(), nome: 'Ensaio ' + dm(hojeISO()), n: 90, corte: 90, resp: '', grau: '', gab: '', blocos: [], tempo: 0, rodando: false, etapa: 'config', blocosTxt: '1-26 Língua Portuguesa\n27-36 Língua Inglesa\n37-46 Lógica e raciocínio\n47-60 Direito Administrativo\n61-90 Conhecimentos gerais' };
  ir('ensaio');
}
function parseBlocos(txt) {
  return txt.split('\n').map((l) => l.trim().match(/^(\d+)\s*[-–]\s*(\d+)\s+(.+)$/)).filter(Boolean).map((m) => [+m[1], +m[2], m[3].trim()]);
}
function salvarEnsaio() {
  const e = S.ens; if (!e) return;
  const { rodando, etapa, ...dados } = e;
  const i = S.ensaios.findIndex((x) => x.id === e.id);
  if (i >= 0) S.ensaios[i] = dados; else S.ensaios.push(dados);
  clearTimeout(timers.ens);
  timers.ens = setTimeout(() => fb.gravar('ensaios/' + e.id, { ...dados, v: Date.now() }).catch((er) => aviso('Falha ao salvar o ensaio: ' + er.message)), 500);
}
function vEnsaio() {
  const e = S.ens; if (!e) return vDesempenho();
  if (e.resumo) return `<h1>${esc(e.nome)}</h1><p>${dm(e.data)} · registro resumido.</p><div class="cards3"><div class="card"><p class="mut">P1</p><p class="num ${e.resumo.p1 < CORTES.p1 ? 'alerta' : ''}">${e.resumo.p1}</p></div><div class="card"><p class="mut">P2</p><p class="num">${e.resumo.p2}</p></div><div class="card"><p class="mut">Total</p><p class="num">${e.resumo.total}</p></div></div><p class="just">${esc(e.obs || '')}</p><button class="btn sec" data-view="desempenho">Voltar</button>`;
  if (e.etapa === 'config') return `<h1>Novo ensaio</h1><form class="filtros" data-form="ensaio">
    <label>Nome<input name="nome" value="${esc(e.nome)}"></label>
    <label>Itens<select name="n"><option ${e.n === 90 ? 'selected' : ''}>90</option><option ${e.n === 180 ? 'selected' : ''}>180</option></select></label>
    <label>Fim da P1 no item<input name="corte" type="number" value="${e.corte}"></label>
    <label class="larga">Blocos (um por linha: início-fim nome)<textarea name="blocos" rows="6">${esc(e.blocosTxt)}</textarea></label></form>
    <p class="mut">Ensaio de 90 itens: só a P1. De 180: P1 vai até o item 90. O cronômetro alerta se você estiver indo rápido demais (piso de 2 h para 90 itens = 80 s por item).</p>
    <button class="btn" data-act="ensComecar">Abrir folha de respostas</button>`;
  const r = e.gab ? resultadoEnsaio(e) : null;
  const marc = (e.resp.match(/[CE]/g) || []).length;
  const ritmo = marc ? Math.round(e.tempo / marc) : 0;
  const folha = Array.from({ length: e.n }, (_, i) => {
    const a = e.resp[i] || '-', g = e.grau[i] || '-', gb = e.gab ? e.gab[i] : '';
    const st = gb ? (gb === 'X' ? 'anul' : a === '-' ? '' : a === gb ? 'ok' : 'no') : '';
    return `<div class="fi ${st}"><span class="fn">${i + 1}</span>${['C', 'E'].map((x) => `<button class="fx ${a === x ? 'on' : ''}" data-act="fmarca" data-i="${i}" data-a="${x}" aria-label="Item ${i + 1} ${x}">${x}</button>`).join('')}${Object.keys(GRAUS).map((x) => `<button class="fg ${g === x ? 'on' : ''}" data-act="fgrau" data-i="${i}" data-g="${x}" title="${GRAUS[x]}" aria-label="Item ${i + 1} ${GRAUS[x]}">${{ c: 'Ce', d: 'Dú', k: 'Ch' }[x]}</button>`).join('')}${gb ? `<span class="gb">${gb}</span>` : ''}</div>`;
  }).join('');
  const res = r ? `<section class="resultado"><h2>Resultado</h2><div class="cards3"><div class="card"><p class="mut">P1 (corte ${CORTES.p1})</p><p class="num ${r.p1 < CORTES.p1 ? 'alerta' : ''}">${r.p1}</p></div>${e.n > (e.corte || 90) ? `<div class="card"><p class="mut">P2 (corte ${CORTES.p2})</p><p class="num ${r.p2 < CORTES.p2 ? 'alerta' : ''}">${r.p2}</p></div>` : ''}<div class="card"><p class="mut">Total</p><p class="num">${r.total}</p></div></div>
    <p>${r.c} certos · ${r.e} errados · ${r.b} em branco · ${r.x} anulados (contam a favor). Marcou C em ${pct(r.mc, r.resp)}; gabarito C em ${pct(r.gc, r.resp)}${Math.abs(Math.round(((r.mc - r.gc) / (r.resp || 1)) * 100)) > 5 ? ' — <b class="alerta">viés de ' + sinal(Math.round(((r.mc - r.gc) / r.resp) * 100)) + ' p.p.</b>' : ''}.</p>
    <table class="tab"><thead><tr><th>Bloco</th><th class="n">C</th><th class="n">E</th><th class="n">Branco</th><th class="n">Líquido</th></tr></thead><tbody>${Object.entries(r.porBloco).map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${v.c}</td><td class="n">${v.e}</td><td class="n">${v.b}</td><td class="n ${v.c - v.e < 0 ? 'alerta' : ''}">${sinal(v.c - v.e)}</td></tr>`).join('')}</tbody></table>
    ${tabelaCalibracao(r.cal)}</section>` : '';
  return `<div class="ensaio-top"><div><h1>${esc(e.nome)}</h1><p class="mut">${dm(e.data)} · ${e.n} itens · ${marc} marcados</p></div>
    <div class="relogio"><span id="rel">${fmtTempo(e.tempo)}</span><span class="mut" id="ritmo">${ritmo ? ritmo + ' s/item' : ''}</span>
    <button class="btn sm" data-act="relogio">${e.rodando ? 'Pausar' : 'Iniciar'}</button></div></div>
    ${ritmo && ritmo < 60 && marc > 10 ? '<p class="alerta">Ritmo abaixo de 60 s por item. O piso é 80 s. Volte ao texto antes de marcar.</p>' : ''}
    <p class="mut">Para cada item: C ou E (toque de novo para desmarcar) e o grau: Ce = certeza, Dú = dúvida, Ch = chute.</p>
    <div class="folha">${folha}</div>
    <section><h2>Corrigir</h2><p class="mut">Cole o gabarito definitivo, um caractere por item: C, E ou X para anulado. Espaços e quebras de linha são ignorados.</p>
    <textarea data-act="gab" rows="3" placeholder="CEECE…">${esc(e.gab)}</textarea><button class="btn" data-act="corrigir">Corrigir</button></section>${res}
    <p><button class="btn sec" data-act="ensSair">Salvar e sair</button></p>`;
}
function fmtTempo(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; }
function posEnsaio() {
  clearInterval(timers.rel);
  const e = S.ens; if (!e || !e.rodando) return;
  timers.rel = setInterval(() => {
    e.tempo++; const el = $('#rel'); if (el) el.textContent = fmtTempo(e.tempo);
    if (e.tempo % 30 === 0) salvarEnsaio();
  }, 1000);
}


// ----- Projeção -----
function projecao(ens) {
  const pts = ens.map((e) => ({ e, n: notaEnsaio(e) })).filter((x) => x.n);
  if (pts.length < 3) return `<p class="mut">Projeção: precisa de pelo menos 3 ensaios corrigidos (hoje: ${pts.length}). Até lá, o número que importa é a P1 contra o corte de ${CORTES.p1}.</p>`;
  const x = pts.map((p) => difDias(pts[0].e.data, p.e.data)), alvo = difDias(pts[0].e.data, PROVA);
  const reg = (ys) => { const n = ys.length, mx = x.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let num = 0, den = 0; x.forEach((xi, i) => { num += (xi - mx) * (ys[i] - my); den += (xi - mx) ** 2; }); const b = den ? num / den : 0; return Math.round(my + b * (alvo - mx)); };
  const p1 = reg(pts.map((p) => p.n.p1)), p2 = reg(pts.map((p) => p.n.p2));
  return `<p>Tendência dos ${pts.length} ensaios, projetada para 17/01: <b class="${p1 < CORTES.p1 ? 'alerta' : ''}">P1 ≈ ${p1}</b> · P2 ≈ ${p2}. É só a reta dos pontos que existem: ensaios com itens já vistos inflam a tendência.</p>`;
}


// ----- Plano: cronograma, conteúdos e edital verticalizado -----
const RANK = { '': 0, e: 1, q: 2, d: 3 };
const PELO_RANK = ['', 'e', 'q', 'd'];
function cobertura() {
  const chk = S.plano.chk || {}, cob = S.plano.cob || {}, m = {};
  const add = (it, origem) => { for (const r of it.ed) { const x = m[r] = m[r] || { por: [], feitos: 0 }; x.por.push({ ...it, origem }); if (chk[it.k]) x.feitos++; } };
  CRONOGRAMA.forEach((w) => w.it.forEach((it) => add(it, w.n))); CONTEUDOS.forEach((c) => c.it.forEach((it) => add(it, c.t)));
  const out = {};
  for (const d of EDITAL) {
    for (const [c] of d.itens) { const k = d.id + '|' + c, x = m[k] || { por: [], feitos: 0 }; const auto = x.feitos ? 'e' : '', man = cob[k] || ''; out[k] = { st: RANK[man] >= RANK[auto] ? man : auto, auto, man, por: x.por, feitos: x.feitos }; }
    for (const [c] of d.itens.slice().reverse()) {
      const filhos = d.itens.filter(([o]) => o.startsWith(c + '.')); if (!filhos.length) continue;
      const k = d.id + '|' + c, minF = Math.min(...filhos.map(([o]) => RANK[out[d.id + '|' + o].st]));
      out[k].pai = true; if (minF > RANK[out[k].st]) out[k].st = PELO_RANK[minF];
    }
  }
  return out;
}
function contaDisc(d, cob) {
  const c = { '': 0, e: 0, q: 0, d: 0 }; let n = 0, semPlano = 0;
  for (const [cod] of d.itens) { const x = cob[d.id + '|' + cod]; if (x.pai) continue; n++; c[x.st]++; if (!x.por.length) semPlano++; }
  return { ...c, n, feito: n - c[''], semPlano };
}
function resumoEdital() {
  const cob = cobertura();
  return EDITAL.map((d) => { const c = contaDisc(d, cob); return `<div class="barra"><span>${esc(d.d.replace('Noções de ', ''))} <small>${d.p}</small></span><div class="bt"><div style="width:${(c.feito / c.n) * 100}%"></div></div><span class="n">${c.feito}/${c.n}</span><span class="mut n">${c.d}✓</span></div>`; }).join('') + '<p class="mut">Itens do edital já estudados / total (sem contar os itens-título). ✓ = dominados.</p>';
}
const chipsEd = (ed) => ed.length ? `<span class="chips">${ed.map((r) => { const [d, c] = r.split('|'); return `<span class="chip">${esc(({ pt: 'LP', ing: 'Ing', adm: 'DA', const: 'CF/RI', ti: 'TI', ling: 'Ling', transc: 'Transc', proc: 'PL', cpol: 'CP' })[d])} ${esc(c)}</span>`; }).join('')}</span>` : '';
function linhaChk(it, extra = '') {
  const on = !!(S.plano.chk || {})[it.k];
  return `<label class="tarefa ${on ? 'feita' : ''}"><input type="checkbox" data-act="chk" data-k="${it.k}" ${on ? 'checked' : ''}><span>${esc(it.t)}${it.q ? ` <small>· ${esc(it.q)}</small>` : ''}${extra}<br>${chipsEd(it.ed)}</span></label>`;
}
function vPlano() {
  const aba = S.planoAba || 'cron';
  const abas = [['cron', 'Cronograma'], ['cont', 'Conteúdos'], ['edital', 'Edital'], ['mat', 'Materiais']].map(([k, t]) => `<button class="pill ${aba === k ? 'on' : ''}" data-act="planoAba" data-a="${k}">${t}</button>`).join('');
  let corpo = '';
  const hoje = hojeISO(), atual = semanaDe(hoje);
  if (aba === 'cron') {
    corpo = `<p class="mut">Marque o que estudou. Cada item marcado cobre automaticamente os itens do edital indicados nas etiquetas.</p>` + CRONOGRAMA.map((w) => {
      const feitos = w.it.filter((it) => (S.plano.chk || {})[it.k]).length;
      const aberta = (S.semAberta || (atual ? 's' + atual.n : 's1')) === w.id;
      return `<section class="sem"><button class="semhead ${aberta ? 'on' : ''}" data-act="semAbre" data-s="${w.id}"><b>${w.n} · ${esc(w.tit)}</b><span class="mut">${esc(w.per)} · ${feitos}/${w.it.length}</span></button>${aberta ? w.it.map((it) => linhaChk(it)).join('') : ''}</section>`;
    }).join('');
  } else if (aba === 'cont') {
    corpo = `<p class="mut">Os mesmos itens de estudo, agrupados por matéria. Marcar aqui ou no cronograma dá no mesmo para o edital.</p>` + CONTEUDOS.map((c) => {
      const feitos = c.it.filter((it) => (S.plano.chk || {})[it.k]).length;
      return `<section><h2>${esc(c.t)} <small>${esc(c.p)} · ${feitos}/${c.it.length}</small></h2>${c.it.map((it) => linhaChk(it)).join('')}</section>`;
    }).join('');
  } else if (aba === 'edital') {
    const cob = cobertura();
    corpo = `<p class="mut">Edital nº 1/2026, cargo 11, texto integral. O status sobe sozinho quando você marca um item do plano ligado a ele; toque no status para subir à mão (com questões, dominado). Itens-título acompanham os subitens. <b class="alerta">Sem item no plano</b> = lacuna do cronograma.</p>` + EDITAL.map((d) => {
      const c = contaDisc(d, cob);
      return `<section><h2>${esc(d.d)} <small>${d.p} · ${c.feito}/${c.n}</small></h2><table class="tab ed"><tbody>${d.itens.map(([cod, t]) => {
        const k = d.id + '|' + cod, x = cob[k], st = STATUS.find((y) => y.k === x.st);
        const fonte = x.pai ? '<small class="mut">pelos subitens</small>' : x.por.length ? `<small class="mut">${x.feitos}/${x.por.length} itens do plano</small>` : '<small class="alerta">sem item no plano</small>';
        return `<tr class="${x.pai ? 'pai' : ''}"><td class="n cod">${esc(cod)}</td><td>${esc(t)}<br>${fonte}</td><td class="stc">${x.pai ? `<span class="pill st-${x.st || 'n'}">${st.t}</span>` : `<button class="pill st-${x.st || 'n'}" data-act="cob" data-k="${esc(k)}">${st.t}</button>`}</td></tr>`;
      }).join('')}</tbody></table></section>`;
    }).join('');
  } else {
    corpo = MATERIAIS.map((g) => `<section><h2>${esc(g.g)}</h2><ul class="links">${g.itens.map((i) => `<li><a href="${esc(i.u)}" target="_blank" rel="noopener">${esc(i.t)}</a></li>`).join('')}</ul></section>`).join('');
  }
  return `<h1>Plano</h1><div class="graus">${abas}</div>${corpo}`;
}

// ----- Discursiva -----
const ERROS_LINGUA = { conc: 'Concordância', reg: 'Regência', crase: 'Crase', pont: 'Pontuação', graf: 'Grafia/acentuação', col: 'Colocação pronominal', prop: 'Propriedade vocabular', out: 'Outro' };
const MODELOS_PECA = {
  peca: { nome: 'Peça técnica (até 50 linhas, 30 pontos)', lim: 50, mult: 6, comandos: [['Estrutura e apresentação', 4], ['Relatório / introdução', 3], ['Comando 1', 9], ['Comando 2', 9], ['Conclusão fundamentada', 5]] },
  questao: { nome: 'Questão discursiva (até 20 linhas, 15 pontos)', lim: 20, mult: 3, comandos: [['Aspecto 1', 5], ['Aspecto 2', 5], ['Aspecto 3', 5]] },
};
function notaPeca(p) {
  const nc = (p.comandos || []).reduce((t, c) => t + (+c.obt || 0), 0), max = (p.comandos || []).reduce((t, c) => t + (+c.max || 0), 0);
  const tl = +p.tl || 0, ne = Object.values(p.erros || {}).reduce((a, b) => a + (+b || 0), 0);
  const nota = tl ? Math.max(0, nc - ((+p.mult || 6) * ne) / tl) : nc;
  return { nc, max, ne, tl, nota: Math.round(nota * 100) / 100 };
}
function resumoDiscursiva() {
  const ps = S.pecas.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
  if (!ps.length) return '<p class="mut">Nenhuma peça registrada. São 7 até a prova; a primeira é no domingo 29/11.</p>';
  const tot = {}; ps.forEach((p) => Object.entries(p.erros || {}).forEach(([k, v]) => { tot[k] = (tot[k] || 0) + (+v || 0); }));
  const top = Object.entries(tot).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${ERROS_LINGUA[k]} (${v})`).join(', ');
  return `<table class="tab"><thead><tr><th>Data</th><th>Tema</th><th class="n">NC</th><th class="n">Erros</th><th class="n">Nota</th></tr></thead><tbody>${ps.map((p) => { const n = notaPeca(p); return `<tr><td>${dm(p.data)}</td><td><a href="#" data-act="abrirPeca" data-id="${p.id}">${esc(p.tema || '(sem tema)')}</a></td><td class="n">${n.nc}/${n.max}</td><td class="n">${n.ne}</td><td class="n ${n.max && n.nota < n.max / 2 ? 'alerta' : ''}">${n.nota}</td></tr>`; }).join('')}</tbody></table>
  ${top ? `<p>Erros de língua mais frequentes: <b>${top}</b>.</p>` : ''}<p class="mut">Mínimo na prova: 30 dos 60 pontos da discursiva. Peça: NPT = NC − 6 × NE ÷ TL (item 9.8.5.2). Cada questão: NQ = NC − 3 × NE ÷ TL (item 9.8.5.1). NFPD = NQ1 + NQ2 + NPT. Cada erro em 50 linhas custa 0,12; um comando esquecido custa muito mais.</p>`;
}
function vDiscursiva() {
  return `<h1>Discursiva</h1>${resumoDiscursiva()}<p><button class="btn" data-act="novaPeca">Nova peça</button></p>
  <p><a href="https://claude.ai/artifact/2DtjeHWPxj5hJUwnvDRupz" target="_blank" rel="noopener">Guia de treino da peça técnica</a> · <a href="https://drive.google.com/drive/folders/1EeB6nK9o6fc4_Ktt7cCoNAyOWFrtc2aT" target="_blank" rel="noopener">Provas anteriores e padrões de resposta</a></p>`;
}
function novaPeca(tipo = 'peca') {
  const m = MODELOS_PECA[tipo];
  S.peca = { id: 'p' + Date.now(), data: hojeISO(), tipo, tema: '', fonte: '', comandos: m.comandos.map(([t, max]) => ({ t, max, obt: '' })), tl: '', mult: m.mult, erros: {}, tempo: 0, rodando: false, obs: '' };
  ir('peca');
}
function salvarPeca() {
  const p = S.peca; if (!p) return;
  const { rodando, ...d } = p;
  const i = S.pecas.findIndex((x) => x.id === p.id); if (i >= 0) S.pecas[i] = d; else S.pecas.push(d);
  clearTimeout(timers.peca);
  timers.peca = setTimeout(() => fb.gravar('pecas/' + p.id, { ...d, v: Date.now() }).catch((e) => aviso('Falha ao salvar a peça: ' + e.message)), 500);
}
function vPeca() {
  const p = S.peca; if (!p) return vDiscursiva();
  const n = notaPeca(p), m = MODELOS_PECA[p.tipo] || MODELOS_PECA.peca;
  const lim = p.tipo === 'peca' ? 5400 : 3600;
  return `<div class="ensaio-top"><div><h1>Peça · ${dm(p.data)}</h1><p class="mut">${m.nome} · 1h30 na prova</p></div>
    <div class="relogio"><span id="rel">${fmtTempo(p.tempo)}</span><button class="btn sm" data-act="pecaRelogio">${p.rodando ? 'Pausar' : 'Iniciar'}</button></div></div>
    ${p.tempo > lim ? '<p class="alerta">Passou de 1h30: na prova, o tempo da peça acabou.</p>' : ''}
    <form class="filtros" data-form="peca">
      <label>Tipo<select name="tipo">${Object.entries(MODELOS_PECA).map(([k, v]) => `<option value="${k}" ${p.tipo === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
      <label>Data<input name="data" type="date" value="${esc(p.data)}"></label>
      <label class="larga">Tema<input name="tema" value="${esc(p.tema)}" placeholder="Ex.: TCDF 2026 — informação sobre agentes públicos"></label>
      <label class="larga">Fonte do enunciado e do padrão<input name="fonte" value="${esc(p.fonte)}" placeholder="Prova, página, link do padrão de resposta"></label>
    </form>
    <h2>Correção · conteúdo (NC)</h2><p class="mut">Corrija na segunda, com a peça fria. Um quesito por comando do enunciado; pontos pelo padrão de resposta, quando houver.</p>
    <table class="tab"><thead><tr><th>Quesito</th><th class="n">Vale</th><th class="n">Obtido</th></tr></thead><tbody>${p.comandos.map((c, i) => `<tr><td><input data-pc="t" data-i="${i}" value="${esc(c.t)}" placeholder="Quesito"></td><td class="n"><input data-pc="max" data-i="${i}" type="number" step="0.5" value="${esc(c.max)}" style="width:80px"></td><td class="n"><input data-pc="obt" data-i="${i}" type="number" step="0.25" value="${esc(c.obt)}" style="width:80px"></td></tr>`).join('')}</tbody></table>
    <button class="btn sm sec" data-act="pecaQuesito">+ quesito</button>
    <h2>Língua (NE) e linhas (TL)</h2>
    <div class="filtros">${Object.entries(ERROS_LINGUA).map(([k, t]) => `<label>${t}<input data-pe="${k}" type="number" min="0" value="${esc((p.erros || {})[k] || '')}"></label>`).join('')}
      <label>Linhas escritas (TL)<input data-pf="tl" type="number" min="0" max="${m.lim}" value="${esc(p.tl)}"></label>
      <label>Multiplicador do edital<input data-pf="mult" type="number" step="1" value="${esc(p.mult)}"></label></div>
    <div class="cards3"><div class="card"><p class="mut">NC</p><p class="num">${n.nc} / ${n.max}</p></div><div class="card"><p class="mut">Erros · linhas</p><p class="num">${n.ne} · ${n.tl || '—'}</p></div><div class="card"><p class="mut">Nota (NC − ${p.mult} × NE ÷ TL)</p><p class="num cor" id="notaPeca">${n.nota}</p></div></div>
    <label class="nota"><span>O que faltou (para a próxima peça)</span><textarea data-pf="obs" rows="3">${esc(p.obs)}</textarea></label>
    <p><button class="btn" data-act="pecaSair">Salvar e sair</button></p>`;
}
function posPeca() {
  clearInterval(timers.relp);
  const p = S.peca; if (!p || !p.rodando) return;
  timers.relp = setInterval(() => { p.tempo++; const el = $('#rel'); if (el) el.textContent = fmtTempo(p.tempo); if (p.tempo % 30 === 0) salvarPeca(); }, 1000);
}

// ----- Materiais e ajustes -----
function vMateriais() {
  return `<h1>Materiais</h1>${MATERIAIS.map((g) => `<section><h2>${esc(g.g)}</h2><ul class="links">${g.itens.map((i) => `<li><a href="${esc(i.u)}" target="_blank" rel="noopener">${esc(i.t)}</a></li>`).join('')}</ul></section>`).join('')}`;
}
function vAjustes() {
  const b = S.banco;
  return `<h1>Ajustes</h1><section><h2>Conta</h2><p>${esc(S.user.email)}</p><button class="btn sec" data-act="sair">Sair</button>
  <h3>Senha do app</h3><p class="mut">Para entrar no app instalado no iPad e no iPhone, onde o login do Google falha. É a mesma conta: mesmos dados. Mínimo de 6 caracteres.</p>
  <form data-act="definirSenha" class="linha"><input type="password" name="senha" placeholder="Nova senha" autocomplete="new-password" required minlength="6"><button class="btn sec">Salvar senha</button></form></section>
  <section><h2>Banco de questões</h2><p>${b ? `${b.leg.length} itens de legislação e Português, ${b.ti.length} de TI, ${b.da.length} de Direito Administrativo. Gerado em ${esc((b.gerado || '').slice(0, 10))}.` : 'Ainda não importado.'}</p>
  <label class="btn sec">Importar banco.json<input type="file" accept=".json,application/json" data-act="impBanco" hidden></label></section>
  <section><h2>Progresso</h2><p class="mut">Importa o arquivo de migração gerado a partir dos artefatos antigos. Mescla com o que já existe: não apaga nada.</p>
  <label class="btn sec">Importar progresso.json<input type="file" accept=".json,application/json" data-act="impProg" hidden></label>
  <button class="btn sec" data-act="exportar">Baixar cópia de segurança</button></section>
  <section><h2>Sobre</h2><p class="mut">Versão 6.5 (26/11). Dados no Firebase (projeto camara2026-abdb6), acessíveis só pela sua conta. Funciona offline e sincroniza quando a conexão volta.</p></section>`;
}

async function importarProgresso(p) {
  const mesclaIt = (a, b) => { for (const [k, v] of Object.entries(b || {})) { const o = a[k]; a[k] = !o ? v : { ...o, s: Math.max(o.s, v.s), e: Math.max(o.e, v.e) }; } };
  const gravacoes = [];
  for (const b of BK) if (p[b]) {
    const ja = new Set(S[b].hist.map((h) => h.ts + '|' + h.f + '|' + h.n));
    (p[b].hist || []).forEach((h) => { if (!ja.has(h.ts + '|' + h.f + '|' + h.n)) S[b].hist.push(h); });
    S[b].hist.sort((x, y) => (x.ts || 0) - (y.ts || 0));
    mesclaIt(S[b].it, p[b].it);
    S[b].v = Date.now(); gravacoes.push([DOCS[b], { ...S[b] }]);
  }
  if (p.plano) {
    Object.assign(S.plano.chk, p.plano.chk || {});
    for (const [d, v] of Object.entries(p.plano.dias || {})) S.plano.dias[d] = { ...(v || {}), ...(S.plano.dias[d] || {}) };
    Object.assign(S.plano.sim, p.plano.sim || {});
    S.plano.v = Date.now(); gravacoes.push([DOCS.plano, { ...S.plano }]);
  }
  if (p.cad) {
    for (const [k, v] of Object.entries(p.cad.A || {})) if (!S.cad.A[k]) { S.cad.A[k] = v; S.cad.rev[k] = S.cad.rev[k] || { box: 0, next: hojeISO() }; }
    Object.assign(S.cad.dom, p.cad.dom || {});
    for (const k of Object.keys(S.cad.dom)) delete S.cad.rev[k];
    S.cad.v = Date.now(); gravacoes.push([DOCS.cad, { ...S.cad }]);
  }
  for (const e of p.ensaios || []) if (!S.ensaios.find((x) => x.id === e.id)) { S.ensaios.push(e); gravacoes.push(['ensaios/' + e.id, e]); }
  await fb.gravarVarios(gravacoes);
  // confere no servidor
  const ok = await Promise.all(gravacoes.map(([c]) => fb.ler(c).then((d) => !!d)));
  return { docs: gravacoes.length, confirmados: ok.filter(Boolean).length, hist: BK.reduce((t, b) => t + S[b].hist.length, 0), erros: Object.keys(S.cad.A).length };
}

// ---------- eventos ----------
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('[data-view],[data-act]');
  if (!a) return;
  if (a.dataset.view) { ev.preventDefault(); if (a.dataset.view === 'hoje') S.diaSel = null; ir(a.dataset.view); return; }
  const act = a.dataset.act;
  const tagInput = a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA';
  if (tagInput || a.tagName === 'FORM') return; // tratados em 'change'/'input'/'submit'
  ev.preventDefault();
  const q = S.q, e = S.ens;
  switch (act) {
    case 'entrar': try { await fb.entrar(); } catch (er) { aviso('Não foi possível entrar: ' + er.message); } break;
    case 'sair': await fb.sair(); location.reload(); break;
    case 'foco': S.foco = !S.foco; local.set('foco', S.foco); render(); break;
    case 'dia': S.diaSel = a.dataset.d; render(); break;
    case 'iniciar': { const l = embaralhar(filtrar()).slice(0, +S.filtros.qtd); const f = S.filtros; iniciarSessao(l, (f.n || BANCOS[f.banco]) + (f.modo === 'erros' ? ' · meus erros' : ''), f.banco); break; }
    case 'grau': if (q && !q.feito) { q.gsel = a.dataset.g; render(); } break;
    case 'resp': if (q && !q.feito) { const r = a.dataset.a; q.ans[q.i] = r; q.grau[q.i] = r === 'B' ? '' : q.gsel; q.feito = true; registrar(q.banco, q.items[q.i], r, q.grau[q.i]); salvar(q.banco); salvar('cad'); render(); } break;
    case 'prox': if (q) { if (q.i < q.items.length - 1) { q.i++; q.feito = false; q.gsel = null; render(); window.scrollTo(0, 0); } else fecharSessao(); } break;
    case 'encerrar': if (q) { q.items = q.items.slice(0, q.ans.length); fecharSessao(); } break;
    case 'dominei': S.cad.dom[a.dataset.k] = new Date().toISOString(); delete S.cad.rev[a.dataset.k]; salvar('cad'); render(); break;
    case 'revisar': {
      const ass = S.errAss || '';
      const ks = pendentesRevisao().filter((k) => { if (!ass) return true; const [fb_, fn] = ass.split('|'); if (k.split(':')[0] !== fb_) return false; if (fn === undefined) return true; const d = acharItem(k); return d && (d.n || '—') === fn; });
      const por = BK.map((b) => [b, ks.filter((k) => k.startsWith(b + ':')).map(acharItem).filter(Boolean)]).sort((x, y) => y[1].length - x[1].length);
      const [b, l] = por[0];
      if (l.length) iniciarSessao(embaralhar(l).slice(0, 40), 'Revisão do caderno · ' + BANCOS[b], b, true);
      break;
    }
    case 'novoEnsaio': novoEnsaio(); break;
    case 'novaPeca': novaPeca(); break;
    case 'cob': { S.plano.cob = S.plano.cob || {}; const x = cobertura()[a.dataset.k]; let nx = PELO_RANK[(RANK[x.st] + 1) % 4]; if (RANK[nx] <= RANK[x.auto]) nx = ''; if (nx) S.plano.cob[a.dataset.k] = nx; else delete S.plano.cob[a.dataset.k]; salvar('plano'); render(); break; }
    case 'planoAba': S.planoAba = a.dataset.a; render(); break;
    case 'semAbre': S.semAberta = S.semAberta === a.dataset.s ? 'nenhuma' : a.dataset.s; render(); break;
    case 'abrirEdital': S.planoAba = 'edital'; ir('plano'); break;
    case 'abrirPeca': { const x = S.pecas.find((y) => y.id === a.dataset.id); if (x) { S.peca = { ...x, rodando: false }; ir('peca'); } break; }
    case 'pecaRelogio': S.peca.rodando = !S.peca.rodando; salvarPeca(); render(); break;
    case 'pecaQuesito': S.peca.comandos.push({ t: '', max: '', obt: '' }); salvarPeca(); render(); break;
    case 'pecaSair': S.peca.rodando = false; salvarPeca(); clearInterval(timers.relp); S.peca = null; ir('discursiva'); break;
    case 'abrirEnsaio': { const x = S.ensaios.find((y) => y.id === a.dataset.id); if (x) { S.ens = { ...x, rodando: false, etapa: 'folha' }; ir('ensaio'); } break; }
    case 'ensComecar': {
      const f = $('[data-form="ensaio"]'); const fd = new FormData(f);
      e.nome = fd.get('nome') || e.nome; e.n = +fd.get('n'); e.corte = +fd.get('corte') || 90; e.blocosTxt = fd.get('blocos'); e.blocos = parseBlocos(e.blocosTxt);
      e.resp = '-'.repeat(e.n); e.grau = '-'.repeat(e.n); e.etapa = 'folha'; salvarEnsaio(); render(); break;
    }
    case 'fmarca': { const i = +a.dataset.i, v = a.dataset.a; const arr = e.resp.padEnd(e.n, '-').split(''); arr[i] = arr[i] === v ? '-' : v; e.resp = arr.join(''); salvarEnsaio(); atualizaFolha(i); break; }
    case 'fgrau': { const i = +a.dataset.i, v = a.dataset.g; const arr = e.grau.padEnd(e.n, '-').split(''); arr[i] = arr[i] === v ? '-' : v; e.grau = arr.join(''); salvarEnsaio(); atualizaFolha(i); break; }
    case 'relogio': e.rodando = !e.rodando; salvarEnsaio(); render(); break;
    case 'corrigir': {
      const t = ($('[data-act="gab"]').value || '').toUpperCase().replace(/[^CEX]/g, '');
      if (t.length !== e.n) { aviso(`O gabarito tem ${t.length} itens; o ensaio tem ${e.n}.`); break; }
      e.gab = t; e.rodando = false; salvarEnsaio();
      // erros do ensaio não entram no caderno automaticamente: os itens não estão no banco.
      render(); break;
    }
    case 'ensSair': e.rodando = false; salvarEnsaio(); clearInterval(timers.rel); S.ens = null; ir('desempenho'); break;
    case 'exportar': {
      const blob = new Blob([JSON.stringify({ leg: S.leg, ti: S.ti, da: S.da, plano: S.plano, cad: S.cad, ensaios: S.ensaios, pecas: S.pecas, em: new Date().toISOString() })], { type: 'application/json' });
      const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'camara2026-copia-' + hojeISO() + '.json'; l.click(); URL.revokeObjectURL(u); break;
    }
    default: break;
  }
});

function atualizaFolha(i) {
  const e = S.ens; const linha = document.querySelectorAll('.fi')[i]; if (!linha) return;
  linha.querySelectorAll('.fx').forEach((b) => b.classList.toggle('on', e.resp[i] === b.dataset.a));
  linha.querySelectorAll('.fg').forEach((b) => b.classList.toggle('on', e.grau[i] === b.dataset.g));
}

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  const form = t.closest('[data-form="filtros"]');
  const fp = t.closest('[data-form="peca"]');
  if (fp && S.peca) {
    if (t.name === 'tipo' && t.value !== S.peca.tipo) { const m = MODELOS_PECA[t.value]; S.peca.tipo = t.value; S.peca.mult = m.mult; if (!S.peca.comandos.some((c) => c.obt !== '' && c.obt != null)) S.peca.comandos = m.comandos.map(([q, max]) => ({ t: q, max, obt: '' })); }
    else S.peca[t.name] = t.value;
    salvarPeca(); render(); return;
  }
  if (form) { S.filtros[t.name] = t.value; if (t.name === 'banco') S.filtros.n = ''; local.set('filtros', S.filtros); render(); return; }
  const act = t.dataset.act;
  const dia = S.diaSel || hojeISO();
  if (act === 'marca') {
    const r = S.plano.dias[dia] = S.plano.dias[dia] || { m: [] }; const m = new Set(r.m || []);
    if (t.checked) m.add(t.dataset.k); else m.delete(t.dataset.k);
    r.m = [...m]; salvar('plano'); render();
  } else if (act === 'chk') {
    S.plano.chk = S.plano.chk || {}; if (t.checked) S.plano.chk[t.dataset.k] = true; else delete S.plano.chk[t.dataset.k]; salvar('plano'); render();
  } else if (act === 'diaok') {
    const r = S.plano.dias[dia] = S.plano.dias[dia] || { m: [] }; r.ok = t.checked; salvar('plano'); render();
  } else if (act === 'motivo') {
    if (t.value) S.cad.mot[t.dataset.k] = t.value; else delete S.cad.mot[t.dataset.k]; salvar('cad');
  } else if (act === 'errFiltro') { S.errFiltro = t.value; render(); }
  else if (act === 'errAss') { S.errAss = t.value; local.set('errAss', t.value); render(); }
  else if (act === 'impBanco' || act === 'impProg') {
    const f = t.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (act === 'impBanco') {
        if (!j.leg || !j.ti || !j.da) throw new Error('arquivo não parece ser o banco');
        aviso('Importando o banco…'); await importarBanco(j); S.banco = await carregarBanco(); aviso(`Banco importado: ${BK.map((b) => S.banco[b].length + ' ' + b).join(', ')}.`);
      } else { aviso('Importando o progresso…'); const r = await importarProgresso(j); aviso(`Progresso importado: ${r.confirmados} de ${r.docs} documentos gravados · ${r.hist} sessões · ${r.erros} erros no caderno.`); }
      render();
    } catch (er) { aviso('Falha na importação: ' + er.message); }
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (S.peca && (t.dataset.pc || t.dataset.pe || t.dataset.pf)) {
    const p = S.peca;
    if (t.dataset.pc) p.comandos[+t.dataset.i][t.dataset.pc] = t.value;
    else if (t.dataset.pe) { p.erros = p.erros || {}; p.erros[t.dataset.pe] = t.value; }
    else p[t.dataset.pf] = t.value;
    salvarPeca();
    const n = notaPeca(p); const el = $('#notaPeca'); if (el) el.textContent = n.nota;
    return;
  }
  if (t.dataset.act === 'anot') {
    const dia = S.diaSel || hojeISO();
    const r = S.plano.dias[dia] = S.plano.dias[dia] || { m: [] }; r.a = t.value; salvar('plano');
  }
});

window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== S.view && (VIEWS[v] || v === 'ajustes')) ir(v); });

// ---------- inicialização ----------
const vazio = { leg: { hist: [], it: {}, cal: {} }, ti: { hist: [], it: {}, cal: {} }, da: { hist: [], it: {}, cal: {} }, plano: { chk: {}, dias: {}, sim: {} }, cad: { A: {}, dom: {}, mot: {}, rev: {} } };
async function carregarTudo() {
  S.pronto = false; render();
  try {
    const [leg, ti, da, plano, cad, ens, pecas] = await Promise.all([fb.ler(DOCS.leg), fb.ler(DOCS.ti), fb.ler(DOCS.da), fb.ler(DOCS.plano), fb.ler(DOCS.cad), fb.listar('ensaios'), fb.listar('pecas')]);
    S.leg = { ...vazio.leg, ...(leg || {}) }; S.ti = { ...vazio.ti, ...(ti || {}) }; S.da = { ...vazio.da, ...(da || {}) };
    S.plano = { ...vazio.plano, ...(plano || {}) }; S.cad = { ...vazio.cad, ...(cad || {}) };
    Object.assign(base, { leg: clone(leg), ti: clone(ti), da: clone(da), plano: clone(plano), cad: clone(cad) });
    S.ensaios = ens; S.pecas = pecas;
    carregarBanco().then((b) => { S.banco = b; if (!S.q && S.view !== 'ensaio' && S.view !== 'peca') render(); }).catch((e) => aviso('Erro ao carregar o banco: ' + e.message));
    S.pronto = true;
    for (const k of Object.keys(DOCS)) fb.ouvir(DOCS[k], (d, meta) => {
      // O servidor já tem a soma das duas máquinas: adota o documento inteiro, sem comparar versão.
      if (!d || meta.hasPendingWrites || timers[k]) return;
      base[k] = clone(d);
      if (JSON.stringify(d) !== JSON.stringify(S[k])) { S[k] = { ...vazio[k], ...clone(d) }; if (!S.q && S.view !== 'ensaio') render(); }
    });
  } catch (e) {
    S.pronto = true; aviso('Erro ao carregar: ' + e.message);
  }
  const h = location.hash.slice(1); if (h && (VIEWS[h] || h === 'ajustes')) S.view = h;
  render();
}

fb.observarLogin((u) => {
  if (u && u.email !== fb.DONO) { aviso('Esta conta não tem acesso. Entre com ' + fb.DONO + '.'); fb.sair(); return; }
  S.user = u;
  if (u) carregarTudo(); else render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();

// Formulários de senha (login no app instalado e criação da senha em Ajustes)
document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-act]'); if (!f) return;
  ev.preventDefault();
  const senha = f.senha.value; const bt = f.querySelector('button'); bt.disabled = true;
  const traduz = (e) => ({ 'auth/invalid-credential': 'senha incorreta (ou ainda não criada no PC)', 'auth/wrong-password': 'senha incorreta', 'auth/weak-password': 'senha fraca: use pelo menos 6 caracteres', 'auth/requires-recent-login': 'saia e entre de novo com o Google antes de trocar a senha', 'auth/operation-not-allowed': 'login por senha ainda não está ativado no Firebase', 'auth/too-many-requests': 'muitas tentativas; espere alguns minutos' }[e.code] || e.message);
  try {
    if (f.dataset.act === 'entrarSenha') await fb.entrarComSenha(senha);
    else { await fb.definirSenha(senha); f.reset(); aviso('Senha salva. No iPad, entre com ela no app instalado.'); }
  } catch (e) { aviso('Não deu certo: ' + traduz(e)); }
  bt.disabled = false;
});
