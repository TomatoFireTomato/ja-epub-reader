import kuromoji from '@sglkc/kuromoji'

// 本地日语分词（kuromoji）：完全在浏览器跑，离线、零 token。
// 词典从 CDN 加载一次（约 12MB，浏览器缓存后不再下载）。
const DIC_PATH = 'https://cdn.jsdelivr.net/npm/@sglkc/kuromoji@1.1.0/dict/'

let tokenizerPromise = null

export function preloadTokenizer() {
  if (tokenizerPromise) return tokenizerPromise
  tokenizerPromise = new Promise((resolve, reject) => {
    try {
      kuromoji.builder({ dicPath: DIC_PATH }).build((err, tk) => {
        if (err) { tokenizerPromise = null; reject(err) } else resolve(tk)
      })
    } catch (e) {
      tokenizerPromise = null
      reject(e)
    }
  })
  return tokenizerPromise
}

// 片假名 → 平假名
function kataToHira(s) {
  return (s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

const POS_MAP = {
  名詞: '名词', 動詞: '动词', 形容詞: '形容词', 形容動詞: '形容动词',
  副詞: '副词', 助詞: '助词', 助動詞: '助动词', 連体詞: '连体词',
  接続詞: '接续词', 感動詞: '感叹词', 接頭詞: '接头词', フィラー: '填充词',
  記号: '符号', その他: '其他'
}

// 返回 { words:[{surface,reading,pos,lemma}], grammar:[{point,reading,pos}] }
// 用 kuromoji 的词性把实词归「单词」、助词/助动词归「语法成分」（去重）。
// 注意：只能按词性分类，识别不了 ～ている 这类跨多词句型（那需要 LLM/API）。
export async function segmentLocal(sentence) {
  const tk = await preloadTokenizer()
  const tokens = tk.tokenize(sentence)
  const words = []
  const grammar = []
  const seenW = new Set()
  const seenG = new Set()
  for (const t of tokens) {
    if (t.pos === '記号') continue // 跳过标点符号
    const surface = t.surface_form
    if (!surface || !surface.trim()) continue
    const reading = kataToHira(t.reading && t.reading !== '*' ? t.reading : '')
    const pos = POS_MAP[t.pos] || t.pos || ''
    if (t.pos === '助詞' || t.pos === '助動詞') {
      if (seenG.has(surface)) continue
      seenG.add(surface)
      grammar.push({ point: surface, reading, pos })
    } else {
      const key = surface + '|' + reading
      if (seenW.has(key)) continue
      seenW.add(key)
      words.push({ surface, reading, pos, lemma: t.basic_form && t.basic_form !== '*' ? t.basic_form : surface })
    }
  }
  return { words, grammar }
}
