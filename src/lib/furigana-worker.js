import kuromoji from '@sglkc/kuromoji'

// 自动注音专用 Worker：词典下载、解压、初始化和分词都不占用 UI 主线程。
const DIC_PATH = 'https://cdn.jsdelivr.net/npm/@sglkc/kuromoji@1.1.0/dict/'

let tokenizerPromise = null

function getTokenizer() {
  if (tokenizerPromise) return tokenizerPromise
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
      if (err) {
        tokenizerPromise = null
        reject(err)
      } else resolve(tokenizer)
    })
  })
  return tokenizerPromise
}

self.onmessage = async ({ data }) => {
  const { id, texts = [] } = data || {}
  try {
    const tokenizer = await getTokenizer()
    const tokenGroups = texts.map((text) => tokenizer.tokenize(String(text || '')).map((token) => ({
      surface: token.surface_form || '',
      reading: token.reading && token.reading !== '*' ? token.reading : ''
    })))
    self.postMessage({ id, tokenGroups })
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) })
  }
}
