function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inline(value: string) {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
}

export function renderMarkdown(source: string) {
  const lines = escapeHtml(source.replaceAll('\r\n', '\n')).split('\n')
  let html = ''
  let inCode = false
  let inList = false
  const closeList = () => {
    if (!inList) return
    html += '</ul>'
    inList = false
  }
  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList()
      html += inCode ? '</code></pre>' : '<pre><code>'
      inCode = !inCode
      continue
    }
    if (inCode) {
      html += `${line}\n`
      continue
    }
    const item = /^(?:[-*]|\d+\.)\s+(.*)/.exec(line)
    if (item) {
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      html += `<li>${inline(item[1] ?? '')}</li>`
      continue
    }
    closeList()
    if (!line.trim()) continue
    const heading = /^(#{1,3})\s+(.*)/.exec(line)
    if (heading) {
      const level = heading[1]?.length ?? 1
      html += `<h${level}>${inline(heading[2] ?? '')}</h${level}>`
      continue
    }
    if (line.startsWith('&gt; ')) {
      html += `<blockquote>${inline(line.slice(5))}</blockquote>`
      continue
    }
    html += `<p>${inline(line)}</p>`
  }
  closeList()
  if (inCode) html += '</code></pre>'
  return html
}
