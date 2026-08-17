import kuromoji from '@sglkc/kuromoji'

// 自动注音专用 Worker：词典下载、解压、初始化和分词都不占用 UI 主线程。

let tokenizerPromise = null

function getTokenizer(dicPath) {
  if (tokenizerPromise) return tokenizerPromise
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) {
        tokenizerPromise = null
        reject(err)
      } else resolve(tokenizer)
    })
  })
  return tokenizerPromise
}

// Kuromoji 对个别超长、标点稀疏的小说文本会出现严重性能退化。
// 短块独立分词不影响表层文字拼接，却能把单次计算量锁在可控范围内。
function tokenizeInChunks(tokenizer, text, chunkSize = 120) {
  const tokens = []
  for (let start = 0; start < text.length; start += chunkSize) {
    tokens.push(...tokenizer.tokenize(text.slice(start, start + chunkSize)))
  }
  return tokens
}

self.onmessage = async ({ data }) => {
  const { id, texts = [], dicPath } = data || {}
  try {
    if (!dicPath) throw new Error('缺少注音词典地址')
    const tokenizer = await getTokenizer(dicPath)
    const tokenGroups = texts.map((text) => tokenizeInChunks(tokenizer, String(text || '')).map((token) => ({
      surface: token.surface_form || '',
      reading: token.reading && token.reading !== '*' ? token.reading : ''
    })))
    self.postMessage({ id, tokenGroups })
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) })
  }
}
