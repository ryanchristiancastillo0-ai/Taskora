export const IMAGE_COMPRESS_THRESHOLD_BYTES = 10 * 1024 * 1024
const IMAGE_COMPRESS_TARGET_BYTES = 4 * 1024 * 1024

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    image.src = url
  })
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      type,
      quality
    )
  })
}

// Downsizes images larger than 10 MB (webp → jpeg fallback) so huge photos can
// be attached to the AI without hitting the upload size cap. Non-images and
// images already under the threshold are returned untouched.
export async function compressImageIfNeeded(file) {
  if (!file) return file
  const type = String(file.type || '')
  if (!type.startsWith('image/') || file.size <= IMAGE_COMPRESS_THRESHOLD_BYTES) {
    return file
  }

  try {
    const image = await loadImage(file)
    const maxDimension = Math.max(image.naturalWidth, image.naturalHeight)
    if (!maxDimension) return file

    const outputName = String(file.name || 'file').replace(/\.[^.]+$/, '') + '.webp'

    for (const dimension of [2048, 1600, 1280, 1024, 800]) {
      if (dimension > maxDimension) continue
      const scale = dimension / maxDimension
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      for (const quality of [0.82, 0.65, 0.5, 0.35]) {
        let blob = await toBlob(canvas, 'image/webp', quality).catch(() => null)
        if (!blob) {
          blob = await toBlob(canvas, 'image/jpeg', quality).catch(() => null)
        }
        if (blob && blob.size <= IMAGE_COMPRESS_TARGET_BYTES) {
          return new File([blob], outputName, {
            type: blob.type || 'image/webp',
            lastModified: file.lastModified,
          })
        }
      }
    }

    return file
  } catch {
    return file
  }
}