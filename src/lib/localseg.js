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

// 返回与 API 分词同样的结构：{ words:[{surface,reading,pos,lemma}], grammar:[] }
// 注意：kuromoji 只做分词，不识别语法点，所以 grammar 为空（需要语法点请关掉本地分词用 API）。
export async function segmentLocal(sentence) {
  const tk = await preloadTokenizer()
  const tokens = tk.tokenize(sentence)
  const words = []
  for (const t of tokens) {
    if (t.pos === '記号') continue // 跳过标点符号
    const surface = t.surface_form
    if (!surface || !surface.trim()) continue
    words.push({
      surface,
      reading: kataToHira(t.reading && t.reading !== '*' ? t.reading : ''),
      pos: POS_MAP[t.pos] || t.pos || '',
      lemma: t.basic_form && t.basic_form !== '*' ? t.basic_form : surface
    })
  }
  return { words, grammar: [] }
}
