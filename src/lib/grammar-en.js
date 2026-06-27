// 英文本地语法/短语匹配：用正则在句子里识别常见英语语法点，自带中文解释与例句（零 token）。
// 和 grammar.js（日语）一样是启发式，不追求穷尽与 100% 精确；要更准请用 API 分词。

// 常见不规则过去分词（规则的用 [A-Za-z]{2,}ed 兜底；-en 类不用通配，避免 children/women 等误伤）
const IRREG_PP = 'been|done|gone|seen|made|taken|given|known|found|told|gotten|got|written|spoken|broken|chosen|driven|eaten|fallen|forgotten|hidden|ridden|risen|shaken|stolen|thrown|worn|begun|drunk|sung|swum|come|become|brought|bought|caught|taught|thought|sought|built|sent|spent|kept|left|felt|held|heard|led|lost|met|paid|put|read|said|set|stood|understood|won|cut|hit|hurt|let|shut|cost|beaten|drawn|grown|shown|flown|frozen|proven|laid|lain|meant|dealt'
const PP = `(?:${IRREG_PP}|[A-Za-z]{2,}ed)`
// 现在分词；排除常见的非动词 -ing 名词，减少「is something / morning」类误判
const NOT_ING = '(?:thing|something|nothing|anything|everything|morning|evening|spring|king|ceiling|during|darling|sterling)'
const ING = `(?!${NOT_ING}\\b)[A-Za-z]+ing`
const BE = "(?:am|is|are|was|were|be|been|being|'m|'re|'s)"
const BE_CONT = "(?:am|is|are|'m|'re|'s)" // 进行时只用 am/is/are，避免把「have been doing」误判
const HAVE = "(?:have|has|haven't|hasn't|'ve)"
// 常作系表的 -ed 形容词：be + 这些更可能是「系表结构」而非被动，排除以减少误判
const COPULAR_ED = '(?:tired|interested|excited|bored|worried|scared|surprised|confused|pleased|satisfied|annoyed|amazed|disappointed|frightened|exhausted|relaxed|married|crowded|located|gifted|talented|involved|dressed|supposed|used|aged|advanced|complicated|experienced|determined|qualified|prepared|concerned|devoted|dedicated|excited|ashamed|delighted)'

const PATTERNS = [
  // ── 时态 / 体 ──
  { point: '现在完成进行时 (have been doing)', re: new RegExp(`\\b${HAVE}\\s+been\\s+${ING}\\b`, 'i'), zh: 'have/has been + 现在分词：动作从过去持续到现在、往往仍在继续。', ex: "I've been waiting for an hour." },
  { point: '现在完成时 (have done)', re: new RegExp(`\\b${HAVE}\\s+(?:not\\s+|never\\s+|already\\s+|just\\s+|ever\\s+|recently\\s+|yet\\s+)?${PP}\\b`, 'i'), zh: 'have/has + 过去分词：过去发生、与现在相关（结果/经历/持续）。', ex: 'She has finished her homework.' },
  { point: '过去完成时 (had done)', re: new RegExp(`\\bhad\\s+(?:not\\s+|already\\s+|just\\s+|never\\s+)?${PP}\\b`, 'i'), zh: 'had + 过去分词：「过去的过去」，比另一过去动作更早发生。', ex: 'He had left before I arrived.' },
  { point: '现在进行时 (be doing)', re: new RegExp(`\\b${BE_CONT}\\s+(?:not\\s+|just\\s+|still\\s+|now\\s+|always\\s+)?${ING}\\b`, 'i'), zh: 'am/is/are + 现在分词：此刻正在进行，或已安排的近期计划。', ex: 'They are watching a movie.' },
  { point: '过去进行时 (was/were doing)', re: new RegExp(`\\b(?:was|were)\\s+(?:not\\s+|still\\s+)?${ING}\\b`, 'i'), zh: 'was/were + 现在分词：过去某一时刻正在进行。', ex: 'I was reading when he called.' },
  { point: '一般将来时 (will)', re: /\b(?:will|won't|'ll)\s+(?:not\s+|just\s+|soon\s+|never\s+)?[A-Za-z]+\b/i, zh: 'will + 动词原形：将来、意愿或预测。', ex: 'I will call you tomorrow.' },
  { point: 'be going to (将要)', re: new RegExp(`\\b(?:${BE}|was|were)\\s+going\\s+to\\s+[A-Za-z]+`, 'i'), zh: 'be going to + 动词原形：打算，或根据迹象判断的将来。', ex: "It's going to rain." },

  // ── 语态 ──
  { point: '被动语态 (be done)', re: new RegExp(`\\b${BE}\\s+(?:not\\s+|just\\s+|being\\s+|been\\s+)?(?!${COPULAR_ED}\\b)${PP}\\b(?:\\s+by\\b)?`, 'i'), zh: 'be + 过去分词（+ by…）：主语是动作的承受者。', ex: 'The book was written by him.' },

  // ── 情态 / 半助动词 ──
  { point: '情态动词 (can/should/must…)', re: /\b(?:can|cannot|can't|could|couldn't|may|might|must|mustn't|should|shouldn't|shall|ought to)\b/i, zh: '情态动词：表能力、可能、许可、义务或推测。', ex: 'You should rest.' },
  { point: 'have to (不得不)', re: /\b(?:have|has|had)\s+to\s+[A-Za-z]+/i, zh: 'have to + 动词原形：客观上必须、不得不。', ex: 'I have to go now.' },
  { point: 'used to (过去常常)', re: /\bused\s+to\s+[A-Za-z]+/i, zh: 'used to + 动词原形：过去经常做、如今不再。', ex: 'He used to smoke.' },
  { point: 'be able to (能够)', re: new RegExp(`\\b${BE}\\s+able\\s+to\\b`, 'i'), zh: 'be able to + 动词原形：有能力/设法做某事。', ex: 'She was able to solve it.' },
  { point: 'would rather (宁愿)', re: /\b(?:would|'d)\s+rather\b/i, zh: 'would rather (… than …)：宁愿…（而不愿…）。', ex: "I'd rather stay home." },
  { point: 'had better (最好)', re: /\b(?:had|'d)\s+better\b/i, zh: 'had better + 动词原形：最好…（含告诫语气）。', ex: "You'd better hurry." },

  // ── 从句 / 虚拟 ──
  { point: '定语从句 (who/which/whose…)', re: /\b(?:who|whom|whose|which)\b/i, zh: '关系代词引导定语从句，修饰前面的名词。', ex: 'The man who called is my uncle.' },
  { point: '虚拟语气 (would/could have done)', re: new RegExp(`\\b(?:would|could|might|should)\\s+have\\s+${PP}\\b`, 'i'), zh: 'would/could have + 过去分词：与过去事实相反的虚拟假设。', ex: 'I would have helped you.' },
  { point: '条件句 (if)', re: /\bif\b/i, zh: 'if 引导条件状语从句：如果…就…（注意真实条件 vs 虚拟条件）。', ex: 'If it rains, we will stay.' },
  { point: 'there be (存在句)', re: /\bthere\s+(?:is|are|was|were|will\s+be|has\s+been|have\s+been)\b/i, zh: 'there be 句型：表示「有/存在」。', ex: 'There are two books on the desk.' },

  // ── 关联连词 / 比较 ──
  { point: 'not only … but also', re: /\bnot\s+only\b/i, zh: 'not only … but also …：不但…而且…。', ex: 'Not only he but also I am tired.' },
  { point: 'either … or / neither … nor', re: /\b(?:either|neither)\b/i, zh: 'either…or…（或…或…）；neither…nor…（既不…也不…）。', ex: 'Either you or he is right.' },
  { point: 'both … and', re: /\bboth\s+\w+\s+and\b/i, zh: 'both … and …：…和…两者都。', ex: 'Both Tom and Jerry are here.' },
  { point: 'so/such … that (如此…以致)', re: /\bso\s+(?:\w+\s+){1,3}that\b|\bsuch\s+(?:\w+\s+){1,4}that\b/i, zh: 'so + 形/副 + that…；such + 名词 + that…：如此…以致于…。', ex: 'It was so cold that we left.' },
  { point: 'as … as (原级比较)', re: /\bas\s+\w+\s+as\b/i, zh: 'as + 原级 + as：和…一样…。', ex: 'He is as tall as you.' },
  { point: '比较级 (… -er/more … than)', re: /\b(?:[A-Za-z]+er|more|less|fewer|better|worse)\s+than\b/i, zh: '比较级 + than：比…更…。', ex: 'This is better than that.' },
  { point: '最高级 (the -est/most)', re: /\bthe\s+(?:[A-Za-z]+est|most|least|best|worst)\b/i, zh: 'the + 最高级：最…（三者及以上比较）。', ex: 'She is the smartest of all.' },

  // ── 常用短语 ──
  { point: 'in order to (为了)', re: /\bin\s+order\s+to\b|\bso\s+as\s+to\b/i, zh: 'in order to / so as to + 动词原形：为了…（目的）。', ex: 'He ran in order to catch the bus.' },
  { point: 'as soon as (一…就…)', re: /\bas\s+soon\s+as\b/i, zh: 'as soon as：一…就…。', ex: 'Call me as soon as you arrive.' },
  { point: 'as well as (以及)', re: /\bas\s+well\s+as\b/i, zh: 'as well as：以及；和…一样也。', ex: 'He sings as well as dances.' },
  { point: 'instead of / rather than (而不是)', re: /\binstead\s+of\b|\brather\s+than\b/i, zh: 'instead of / rather than：而不是…。', ex: 'Walk instead of driving.' },
  { point: 'because of / due to (因为)', re: /\bbecause\s+of\b|\bdue\s+to\b|\bthanks\s+to\b/i, zh: 'because of / due to + 名词：由于…。', ex: 'It closed due to the rain.' },
  { point: 'in spite of / despite (尽管)', re: /\bin\s+spite\s+of\b|\bdespite\b/i, zh: 'in spite of / despite + 名词：尽管…。', ex: 'We went despite the rain.' },
  { point: 'no matter (无论)', re: /\bno\s+matter\b/i, zh: 'no matter how/what/who…：无论…。', ex: 'No matter what, keep going.' },
  { point: 'each other (互相)', re: /\beach\s+other\b|\bone\s+another\b/i, zh: 'each other / one another：互相、彼此。', ex: 'They help each other.' }
]

// 抑制冗余：键是更「具体」的句型，命中时移除它名下那些更笼统、会重复触发的句型
const SUPPRESS = {
  '现在完成进行时 (have been doing)': ['现在完成时 (have done)'],
  '虚拟语气 (would/could have done)': ['现在完成时 (have done)'] // would/could have done 里的 have 不是现在完成时
}

// 在英文句子里识别语法点，返回 [{point, detail:{explanation, example}}]（按出现顺序，去重）
export function detectGrammarEn(sentence) {
  if (!sentence) return []
  const hit = new Map() // point -> index
  for (const p of PATTERNS) {
    if (hit.has(p.point)) continue
    const m = sentence.match(p.re)
    if (m) hit.set(p.point, { index: m.index, zh: p.zh, ex: p.ex })
  }
  // 抑制：若更具体的句型命中，移除被它包含的笼统句型
  for (const specific in SUPPRESS) {
    if (hit.has(specific)) for (const drop of SUPPRESS[specific]) hit.delete(drop)
  }
  return [...hit.entries()]
    .sort((a, b) => a[1].index - b[1].index)
    .map(([point, v]) => ({ point, detail: { explanation: v.zh, example: v.ex } }))
}
