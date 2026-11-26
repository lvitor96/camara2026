// Plano de estudos — Câmara dos Deputados 2026 (cargo 11, Registro e Redação).
// Fonte: claude/plano-de-estudos-camara-2026.md (recalibrado em 23/11).

export const PROVA = '2027-01-17';
export const CORTES = { p1: 18, p2: 27, total: 54 };

export const SEMANAS = [
  { n: 1, ini: '2026-11-15', fim: '2026-11-21', curto: 'RICD I–II', bloco: 'RICD, Títulos I e II' },
  { n: 2, ini: '2026-11-22', fim: '2026-11-28', curto: 'Sessões', bloco: 'RICD: sessões e proposições' },
  { n: 3, ini: '2026-11-29', fim: '2026-12-05', curto: 'Ritos', bloco: 'RICD: apreciação, ritos e deputados' },
  { n: 4, ini: '2026-12-06', fim: '2026-12-12', curto: 'RCCN/CF', bloco: 'Regimento Comum e CF, Título IV' },
  { n: 5, ini: '2026-12-13', fim: '2026-12-19', curto: 'LC 95', bloco: 'LC 95, técnica legislativa e comunicações oficiais' },
  { n: 6, ini: '2026-12-20', fim: '2026-12-26', curto: 'Ling. 1', bloco: 'Linguística 1' },
  { n: 7, ini: '2026-12-27', fim: '2027-01-02', curto: 'Ling. 2', bloco: 'Linguística 2' },
  { n: 8, ini: '2027-01-03', fim: '2027-01-09', curto: 'Transcr.', bloco: 'Transcrição, IA e dados' },
  { n: 9, ini: '2027-01-10', fim: '2027-01-16', curto: 'Revisão', bloco: 'Revisão final' },
];

// Datas especiais
export const ESPECIAIS = {
  '2026-11-22': 'Diagnóstico (feito em 23/11)',
  '2026-12-20': 'Ensaio de dia inteiro: 180 itens + discursiva, no horário da prova',
  '2027-01-10': 'Ensaio final: 180 itens',
  '2027-01-16': 'Véspera: descanso',
  '2027-01-17': 'PROVA',
};

const par = (n) => n % 2 === 0;

// Roteiro do dia (4 h). Cada tarefa tem uma chave usada no registro diário.
export function roteiro(dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  const dow = d.getDay();
  const s = semanaDe(dataISO);
  const bloco = s ? s.bloco : 'Bloco da semana';
  const ev = ESPECIAIS[dataISO];
  if (dataISO === PROVA) return [{ k: 'prova', t: 'Dia da prova', h: '8 h', det: 'Objetiva 5 h de manhã, discursiva 3 h à tarde' }];
  if (dow === 6 || dataISO === '2027-01-16') return [{ k: 'desc', t: 'Descanso', h: '', det: 'Se estudar à noite, só revisão leve: cartões, áudio. Nada de conteúdo novo.' }];
  if (dow === 0) {
    if (dataISO === '2026-12-20') return [
      { k: 'ens', t: 'Ensaio de dia inteiro: objetiva', h: '5 h', det: '180 itens inéditos, no horário da prova, com grau de certeza' },
      { k: 'disc', t: 'Discursiva', h: '3 h', det: 'Tema inédito, à tarde' },
    ];
    return [
      { k: 'ens', t: 'Ensaio de prova: 90 itens', h: '2h30', det: 'Piso de 2 h. Marcar grau de certeza em todos.' },
      { k: 'disc', t: 'Peça discursiva', h: '1h30', det: 'Alterna: 2 questões de 20 linhas / 1 peça de 50 linhas' },
    ];
  }
  if (dow === 1) return [
    { k: 'corr', t: 'Correção do ensaio', h: '1 h', det: 'Erros para o caderno, com o motivo' },
    { k: 'bloco', t: 'Bloco: ' + bloco, h: '2 h', det: 'Leitura da lei e Vol. 1' },
    { k: 'port', t: 'Português', h: '1 h', det: 'Caderno de Português + itens reais com o protocolo' },
  ];
  const rod = {
    2: { k: 'port', t: 'Português', det: 'Segunda hora da semana' },
    3: { k: 'adm', t: 'Direito Administrativo', det: 'Vol. 2' },
    4: s && par(s.n) ? { k: 'ing', t: 'Inglês', det: 'Rodízio de quinta' } : { k: 'cpol', t: 'Ciência Política', det: 'Rodízio de quinta' },
    5: s && par(s.n) ? { k: 'adm', t: 'Direito Administrativo', det: 'Segunda hora quinzenal' } : { k: 'ti', t: 'TI e Dados', det: 'Rodízio de sexta' },
  }[dow];
  const out = [
    { k: 'bloco', t: 'Bloco: ' + bloco, h: '2 h', det: 'Leitura da lei e Vol. 1' },
    { k: 'q', t: 'Questões do bloco', h: '1 h', det: '20 itens, com grau de certeza' },
    { k: rod.k, t: rod.t, h: '1 h', det: rod.det },
  ];
  if (ev) out.unshift({ k: 'ev', t: ev, h: '', det: '' });
  return out;
}

export function semanaDe(dataISO) {
  return SEMANAS.find((s) => dataISO >= s.ini && dataISO <= s.fim) || null;
}

export const ROTULO_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function resumoDia(dataISO) {
  const dow = new Date(dataISO + 'T12:00:00').getDay();
  if (dataISO === PROVA) return 'Prova';
  if (dow === 6) return 'Descanso';
  if (dow === 0) return dataISO === '2026-12-20' ? 'Dia inteiro' : 'Ensaio';
  if (dow === 1) return 'Correção';
  const s = semanaDe(dataISO);
  return { 2: 'Português', 3: 'Dir. Adm.', 4: s && s.n % 2 === 0 ? 'Inglês' : 'C. Política', 5: s && s.n % 2 === 0 ? 'Dir. Adm.' : 'TI e Dados' }[dow];
}

export const MATERIAIS = [
  { g: 'Apostilas e cadernos', itens: [
    { t: 'Vol. 1 — CF, LC 95, RICD e Regimento Comum', u: 'https://drive.google.com/file/d/1eaCKfuiQ7IthTIOWWl-2t5Ueu5WsAKp-/view' },
    { t: 'Vol. 2 — 8.112, 9.784, 8.429, LAI, LGPD, 9.610, Dec. 9.203, 14.133', u: 'https://drive.google.com/file/d/1Anh5PFMOsJ9d912OHQ5niXNX2dOXAcIJ/view' },
    { t: 'Pasta de material próprio (Apêndice, Cadernos de Português e de Lógica, plano)', u: 'https://drive.google.com/drive/folders/1Kwyz8x3eEedT0o9mD25-GDC5SdjINeQU' },
    { t: 'Peça técnica — guia de treino (discursiva)', u: 'https://claude.ai/artifact/2DtjeHWPxj5hJUwnvDRupz' },
    { t: 'Baralho Anki — números da lei (.apkg)', u: 'https://drive.google.com/file/d/1yaRrZ65UuB9zKj0-oPDf8L3exDWMQV3O/view' },
  ] },
  { g: 'Provas e fontes', itens: [
    { t: 'Provas anteriores do Cebraspe (com gabarito definitivo)', u: 'https://drive.google.com/drive/folders/1EeB6nK9o6fc4_Ktt7cCoNAyOWFrtc2aT' },
    { t: '05 Português e Linguística (Marcuschi, Koch, Benveniste, DETAQ, Dino…)', u: 'https://drive.google.com/drive/folders/1H-UNgDx9-BjyW0sfcBn9eXRUBTR2UnmB' },
    { t: 'Pasta geral do concurso', u: 'https://drive.google.com/drive/folders/1pp-XJYlNsr0efc4YO2biv-JHU71cXDv0' },
  ] },
  { g: 'Artefatos antigos (continuam no ar até a migração ser validada)', itens: [
    { t: 'Plano de estudos interativo', u: 'https://claude.ai/artifact/GUu4aVC5CRxFyHuQ1gUdha' },
    { t: 'Questões-base', u: 'https://claude.ai/artifact/KmKf5APott7pd5uapxH3Bz' },
    { t: 'TI e Dados', u: 'https://claude.ai/artifact/ER3xwVP6o8zM5mCiaya5eG' },
    { t: 'Dir. Administrativo · Poderes (quiz)', u: 'https://claude.ai/artifact/RGgydUwS2xgRrc5YenaUuQ' },
    { t: 'Caderno de erros', u: 'https://claude.ai/artifact/SzkHCzv5PsaUW2ohmpEFvD' },
  ] },
];
