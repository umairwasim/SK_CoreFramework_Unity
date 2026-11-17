const MAX_BYTES = 10_000_000

export async function readMediaFile(file: File): Promise<{ name: string; type: string; dataUrl: string }> {
  if (file.size > MAX_BYTES) {
    throw new Error('Dosya çok büyük. En fazla 10 MB.')
  }
  const dataUrl = await readAsDataUrl(file)
  if (file.type === 'image/gif' || file.type.startsWith('video/')) {
    return { name: file.name || 'ek', type: file.type, dataUrl }
  }
  if (file.type.startsWith('image/')) {
    const compressed = await compressImage(dataUrl)
    return { name: file.name || 'ekran-goruntusu.jpg', type: 'image/jpeg', dataUrl: compressed }
  }
  throw new Error('Şimdilik görsel, GIF veya kısa video eklenebilir.')
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Dosya okunamadı'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function compressImage(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const max = 1600
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => reject(new Error('Görsel açılamadı'))
    image.src = dataUrl
  })
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
